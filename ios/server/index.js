/**
 * HexMesh Signaling Server v2.0
 * WebSocket signaling for WebRTC P2P + multihop mesh relay
 *
 * GET /health  → { status, nodes, uptime, metrics }
 * GET /nodes   → active node list
 * WS  /        → signaling + relay channel
 *
 * Packet types:
 *   REGISTER, GET_NODES
 *   OFFER, ANSWER, ICE_CANDIDATE       (WebRTC signaling)
 *   MSG, ACK                           (text messages)
 *   FILE_META, FILE_CHUNK, FILE_ACK,   (file transfer protocol)
 *   FILE_INTEGRITY_FAIL
 *   CALL_OFFER, CALL_ANSWER, CALL_ICE, (voice/video calls)
 *   CALL_END, CALL_REJECT
 *   PING, PONG, VOICE                  (utility)
 */

const WebSocket = require('ws');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ─── Config ──────────────────────────────────────────────────────────────────
const PORT                  = process.env.PORT || 3001;
const HTTPS_PORT            = process.env.HTTPS_PORT || 3002;
const MAX_TTL               = 7;

// Each FILE_CHUNK packet is ~64KB base64. Allow up to 50 MB per packet for safety.
const MAX_PACKET_SIZE       = 50 * 1024 * 1024;

// Two separate rate-limit buckets:
//   • MSG/CALL bucket — tight, protects chat responsiveness
//   • FILE bucket — relaxed, allows high-throughput chunked transfers
const MSG_RATE_WINDOW       = 1_000;   // ms
const MSG_RATE_MAX          = 60;      // non-file packets per window
const FILE_RATE_WINDOW      = 1_000;   // ms
const FILE_RATE_MAX         = 200;     // file chunks per window (4 parallel × ~50 chunk/s each)

const HEARTBEAT_INTERVAL    = 15_000;
const NODE_TIMEOUT          = 45_000;

// ─── Logger ──────────────────────────────────────────────────────────────────
const log = {
  info:   (msg, meta = {}) => console.log(JSON.stringify({ level: 'INFO',   ts: Date.now(), msg, ...meta })),
  warn:   (msg, meta = {}) => console.log(JSON.stringify({ level: 'WARN',   ts: Date.now(), msg, ...meta })),
  error:  (msg, meta = {}) => console.log(JSON.stringify({ level: 'ERROR',  ts: Date.now(), msg, ...meta })),
  metric: (msg, meta = {}) => console.log(JSON.stringify({ level: 'METRIC', ts: Date.now(), msg, ...meta })),
};

// ─── State ───────────────────────────────────────────────────────────────────
const nodes       = new Map();   // nodeId → NodeInfo
const seenPackets = new Set();   // packetId → dedupe

const metrics = {
  totalConnections:  0,
  totalPackets:      0,
  relayedPackets:    0,
  droppedPackets:    0,
  fileChunksRelayed: 0,
  startTime:         Date.now(),
};

// ─── HTTP ─────────────────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      status: 'ok', nodes: nodes.size,
      uptime: Math.floor((Date.now() - metrics.startTime) / 1000),
      metrics, ts: Date.now(),
    }));
  }

  if (req.url === '/nodes') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    const list = [...nodes.values()].map(n => ({
      nodeId: n.nodeId, alias: n.alias,
      publicKey: n.publicKey, lastSeen: n.lastSeen,
    }));
    return res.end(JSON.stringify(list));
  }

  res.writeHead(404); res.end('Not found');
});

// ─── WebSocket ────────────────────────────────────────────────────────────────
const wss = new WebSocket.Server({ server });

// Packet types that count against the file rate bucket
const FILE_PACKET_TYPES = new Set(['FILE_CHUNK', 'FILE_META', 'FILE_ACK', 'FILE_INTEGRITY_FAIL']);

wss.on('connection', (ws, req) => {
  const ip = req.socket.remoteAddress;
  metrics.totalConnections++;
  log.info('ws.connect', { ip, totalConnections: metrics.totalConnections });

  let nodeId = null;
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (rawData) => {
    // Size guard
    if (rawData.length > MAX_PACKET_SIZE) {
      log.warn('packet.too.large', { size: rawData.length, nodeId });
      return sendErr(ws, 'PACKET_TOO_LARGE');
    }

    let packet;
    try { packet = JSON.parse(rawData); }
    catch { return sendErr(ws, 'INVALID_JSON'); }

    metrics.totalPackets++;
    const isFilePacket = FILE_PACKET_TYPES.has(packet.type);

    // Rate limiting — two separate buckets
    if (nodeId) {
      const node = nodes.get(nodeId);
      if (node) {
        const now = Date.now();

        if (isFilePacket) {
          // File bucket
          if (now - node.fileWindowStart > FILE_RATE_WINDOW) {
            node.fileWindowStart = now;
            node.filePacketCount = 0;
          }
          node.filePacketCount++;
          node.lastSeen = now;
          if (node.filePacketCount > FILE_RATE_MAX) {
            metrics.droppedPackets++;
            return sendErr(ws, 'FILE_RATE_LIMITED');
          }
        } else {
          // Message bucket
          if (now - node.windowStart > MSG_RATE_WINDOW) {
            node.windowStart = now;
            node.packetCount = 0;
          }
          node.packetCount++;
          node.lastSeen = now;
          if (node.packetCount > MSG_RATE_MAX) {
            metrics.droppedPackets++;
            return sendErr(ws, 'RATE_LIMITED');
          }
        }
      }
    }

    dispatch(ws, packet, () => nodeId, (id) => { nodeId = id; });
  });

  ws.on('close', () => {
    if (nodeId && nodes.has(nodeId)) {
      nodes.delete(nodeId);
      log.info('node.left', { nodeId, remaining: nodes.size });
      broadcast({ type: 'NODE_LEFT', nodeId, ts: Date.now() }, null);
      log.metric('nodes.count', { count: nodes.size });
    }
  });

  ws.on('error', (err) => log.error('ws.error', { err: err.message }));
});

// ─── Dispatcher ───────────────────────────────────────────────────────────────
function dispatch(ws, packet, getNodeId, setNodeId) {
  switch (packet.type) {
    case 'REGISTER':       return onRegister(ws, packet, setNodeId);
    case 'GET_NODES':      return sendNodeList(ws);
    case 'OFFER':
    case 'ANSWER':
    case 'ICE_CANDIDATE':  return onSignaling(ws, packet);

    // All relay-able packet types
    case 'MSG':
    case 'ACK':
    case 'FILE_META':
    case 'FILE_CHUNK':
    case 'FILE_ACK':
    case 'FILE_INTEGRITY_FAIL':
    // DataChannel P2P signaling (used to negotiate direct WebRTC data path)
    case 'DC_OFFER':
    case 'DC_ANSWER':
    case 'DC_ICE':
    // E2E key exchange (ECDH P-256 public keys)
    case 'ECDH_HELLO':
    case 'CALL_OFFER':
    case 'CALL_ANSWER':
    case 'CALL_ICE':
    case 'CALL_END':
    case 'CALL_REJECT':
    case 'PING':
    case 'PONG':
    case 'VOICE':
      return onRelay(ws, packet, getNodeId());

    default:
      log.warn('unknown.packet.type', { type: packet.type });
  }
}

// ─── REGISTER ─────────────────────────────────────────────────────────────────
function onRegister(ws, packet, setNodeId) {
  const { nodeId, alias, publicKey } = packet;
  if (!nodeId || !alias) return sendErr(ws, 'MISSING_FIELDS');

  if (nodes.has(nodeId) && nodes.get(nodeId).ws !== ws) {
    return sendErr(ws, 'NODE_ID_TAKEN');
  }

  setNodeId(nodeId);
  nodes.set(nodeId, {
    ws, nodeId, alias,
    publicKey: publicKey || '',
    lastSeen: Date.now(),
    // Message rate bucket
    packetCount: 0, windowStart: Date.now(),
    // File rate bucket
    filePacketCount: 0, fileWindowStart: Date.now(),
  });

  log.info('node.register', { nodeId, alias, total: nodes.size });
  safeSend(ws, { type: 'REGISTERED', nodeId, ts: Date.now() });
  sendNodeList(ws);
  broadcast({ type: 'NODE_JOINED', nodeId, alias, publicKey: publicKey || '', ts: Date.now() }, nodeId);
  log.metric('nodes.count', { count: nodes.size });
}

// ─── SIGNALING ────────────────────────────────────────────────────────────────
function onSignaling(ws, packet) {
  const { to, from } = packet;
  if (!to || !from) return sendErr(ws, 'MISSING_FIELDS');
  const target = nodes.get(to);
  if (!target) return safeSend(ws, { type: 'ERROR', code: 'TARGET_NOT_FOUND', to, ts: Date.now() });
  log.info('signaling', { type: packet.type, from, to });
  safeSend(target.ws, packet);
}

// ─── RELAY ────────────────────────────────────────────────────────────────────
function onRelay(ws, packet, senderNodeId) {
  const { id, to, ttl = MAX_TTL, visited = [] } = packet;

  // Deduplicate
  if (id) {
    if (seenPackets.has(id)) { metrics.droppedPackets++; return; }
    seenPackets.add(id);
    if (seenPackets.size > 50_000) {
      const iter = seenPackets.values();
      for (let i = 0; i < 10_000; i++) seenPackets.delete(iter.next().value);
    }
  }

  const from = senderNodeId || packet.from;
  if (FILE_PACKET_TYPES.has(packet.type)) metrics.fileChunksRelayed++;

  // Unicast
  if (to && to !== 'broadcast') {
    const target = nodes.get(to);
    if (target) { safeSend(target.ws, packet); return; }

    // Multihop
    if (ttl <= 0) { log.warn('relay.ttl.expired', { id, from, to }); return; }
    const newVisited = [...visited, from];
    const forwarded = { ...packet, ttl: ttl - 1, visited: newVisited };
    let relayed = 0;
    for (const [nId, node] of nodes) {
      if (nId !== from && !newVisited.includes(nId)) { safeSend(node.ws, forwarded); relayed++; }
    }
    if (relayed > 0) { metrics.relayedPackets++; log.info('relay.hop', { id, from, to, ttl: ttl - 1, relayed }); }
    return;
  }

  // Broadcast
  if (ttl <= 0) return;
  const newVisited = [...visited, from];
  const forwarded = { ...packet, ttl: ttl - 1, visited: newVisited };
  for (const [nId, node] of nodes) {
    if (nId !== from && !newVisited.includes(nId)) safeSend(node.ws, forwarded);
  }
  metrics.relayedPackets++;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function sendNodeList(ws) {
  const list = [...nodes.values()].map(n => ({
    nodeId: n.nodeId, alias: n.alias, publicKey: n.publicKey, lastSeen: n.lastSeen,
  }));
  safeSend(ws, { type: 'NODE_LIST', nodes: list, ts: Date.now() });
}

function broadcast(packet, excludeId) {
  for (const [nId, node] of nodes) {
    if (nId !== excludeId) safeSend(node.ws, packet);
  }
}

function safeSend(ws, data) {
  try {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
  } catch (e) { log.error('safeSend', { err: e.message }); }
}

function sendErr(ws, code) {
  safeSend(ws, { type: 'ERROR', code, ts: Date.now() });
}

// ─── Heartbeat ────────────────────────────────────────────────────────────────
const hbInterval = setInterval(() => {
  const now = Date.now();
  for (const [nId, node] of nodes) {
    if (now - node.lastSeen > NODE_TIMEOUT) {
      log.warn('node.timeout', { nodeId: nId });
      node.ws.terminate();
      nodes.delete(nId);
      broadcast({ type: 'NODE_LEFT', nodeId: nId, ts: now }, null);
      continue;
    }
    if (!node.ws.isAlive) { node.ws.terminate(); continue; }
    node.ws.isAlive = false;
    node.ws.ping();
  }
  log.metric('heartbeat', { activeNodes: nodes.size, fileChunksRelayed: metrics.fileChunksRelayed });
}, HEARTBEAT_INTERVAL);

// ─── Start ────────────────────────────────────────────────────────────────────
server.listen(PORT, '0.0.0.0', () => {
  const localIPs = Object.values(os.networkInterfaces())
    .flat()
    .filter(i => i && i.family === 'IPv4' && !i.internal)
    .map(i => i.address);

  log.info('server.start', { port: PORT, localIPs });
  console.log(`\n🔗 HexMesh Signaling Server v2.0`);
  console.log(`   HTTP  Port: ${PORT}`);
  console.log(`   IPs:        ${localIPs.join(', ')}`);
  console.log(`   Health:     http://localhost:${PORT}/health`);
  console.log(`   Nodes:      http://localhost:${PORT}/nodes\n`);
});

// ─── HTTPS (self-signed) for Safari/iOS getUserMedia ─────────────────────────
// Safari requires a secure context (HTTPS/WSS) for getUserMedia on non-localhost.
// We generate a self-signed cert at startup so phones on LAN can use WSS.
function startHttpsServer() {
  const certDir  = path.join(__dirname, '.certs');
  const keyFile  = path.join(certDir, 'key.pem');
  const certFile = path.join(certDir, 'cert.pem');

  if (!fs.existsSync(certDir)) fs.mkdirSync(certDir, { recursive: true });

  // Generate self-signed cert if not already present
  if (!fs.existsSync(keyFile) || !fs.existsSync(certFile)) {
    try {
      execSync(
        `openssl req -x509 -newkey rsa:2048 -keyout "${keyFile}" -out "${certFile}"` +
        ` -days 365 -nodes -subj "/CN=hexmesh-local"`,
        { stdio: 'pipe' }
      );
      console.log(`🔒 Self-signed cert generated at ${certDir}`);
    } catch (e) {
      console.warn('⚠️  openssl not found — HTTPS server skipped. Install openssl to enable WSS for Safari.');
      return;
    }
  }

  try {
    const sslOptions = {
      key:  fs.readFileSync(keyFile),
      cert: fs.readFileSync(certFile),
    };

    const httpsServer = https.createServer(sslOptions, server.listeners('request')[0]);
    const wssSecure   = new WebSocket.Server({ server: httpsServer });
    wssSecure.on('connection', (ws, req) => wss.emit('connection', ws, req));

    httpsServer.listen(HTTPS_PORT, '0.0.0.0', () => {
      const localIPs = Object.values(os.networkInterfaces())
        .flat()
        .filter(i => i && i.family === 'IPv4' && !i.internal)
        .map(i => i.address);

      console.log(`🔒 HTTPS/WSS running on port ${HTTPS_PORT}`);
      console.log(`   For Safari on iPhone, use: wss://<your-ip>:${HTTPS_PORT}`);
      console.log(`   IPs: ${localIPs.map(ip => `wss://${ip}:${HTTPS_PORT}`).join(', ')}`);
      console.log(`   ⚠️  You must accept the self-signed cert in Safari first:`);
      localIPs.forEach(ip => console.log(`      https://${ip}:${HTTPS_PORT}/health`));
      console.log('');
    });
  } catch (e) {
    console.warn('⚠️  HTTPS server failed to start:', e.message);
  }
}

startHttpsServer();

server.on('error', (err) => { log.error('server.error', { err: err.message }); process.exit(1); });
process.on('SIGINT', () => { clearInterval(hbInterval); wss.close(() => server.close(() => process.exit(0))); });
