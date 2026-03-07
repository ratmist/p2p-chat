
const WebSocket = require('ws');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const dgram = require('dgram');

// ─── Config ──────────────────────────────────────────────────────────────────
const PORT                  = process.env.PORT || 3001;
const HTTPS_PORT            = process.env.HTTPS_PORT || 3002;
const MAX_TTL               = 7;
const MAX_PACKET_SIZE       = 50 * 1024 * 1024;
const MSG_RATE_WINDOW       = 1_000;
const MSG_RATE_MAX          = 60;
const FILE_RATE_WINDOW      = 1_000;
const FILE_RATE_MAX         = 600;
const HEARTBEAT_INTERVAL    = 15_000;
const NODE_TIMEOUT          = 45_000;

// ─── mDNS / UDP peer discovery ───────────────────────────────────────────────
// Each server instance broadcasts its presence on the local network via UDP
// multicast. Other instances on the same WiFi hear it and automatically
// connect as peer signaling servers — forming a federation of local servers.
// This means devices only need to find ONE server on the network (via mDNS
// broadcast), not a specific hardcoded IP.
//
// Multicast group: 224.0.0.251 (standard mDNS address)
// Port: 5353 clashes with system mDNS, so we use 5354 (our own service)
const MDNS_ADDR    = '224.0.0.251';
const MDNS_PORT    = 5354;
const MDNS_SERVICE = 'hexmesh-signal-v1';
const ANNOUNCE_INTERVAL = 5_000;   // broadcast every 5s
const PEER_TIMEOUT      = 30_000;  // forget peer after 30s silence

// Known peer servers: ip → { ip, port, httpsPort, lastSeen, ws }
const peerServers = new Map();

let mdnsSocket = null;
const myIPs = Object.values(os.networkInterfaces())
  .flat()
  .filter(i => i && i.family === 'IPv4' && !i.internal)
  .map(i => i.address);

function startMdns() {
  mdnsSocket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

  mdnsSocket.on('error', (err) => {
    console.warn('[mDNS] socket error:', err.message);
  });

  mdnsSocket.on('message', (msg, rinfo) => {
    // Ignore our own broadcasts
    if (myIPs.includes(rinfo.address)) return;
    try {
      const data = JSON.parse(msg.toString());
      if (data.service !== MDNS_SERVICE) return;
      const key = rinfo.address;
      const existing = peerServers.get(key);
      if (!existing) {
        console.log(`[mDNS] discovered peer server at ${rinfo.address}:${data.port}`);
        connectToPeerServer(rinfo.address, data.port, data.httpsPort);
      }
      peerServers.set(key, {
        ip: rinfo.address, port: data.port,
        httpsPort: data.httpsPort, lastSeen: Date.now(),
        ws: peerServers.get(key)?.ws ?? null,
      });
    } catch {}
  });

  mdnsSocket.bind(MDNS_PORT, () => {
    try {
      mdnsSocket.addMembership(MDNS_ADDR);
      mdnsSocket.setMulticastTTL(10);
      console.log(`[mDNS] listening on ${MDNS_ADDR}:${MDNS_PORT}`);
    } catch (e) {
      console.warn('[mDNS] multicast join failed:', e.message);
    }
  });

  // Broadcast our presence every ANNOUNCE_INTERVAL
  const announceMsg = Buffer.from(JSON.stringify({
    service: MDNS_SERVICE,
    port: PORT,
    httpsPort: HTTPS_PORT,
    ts: Date.now(),
  }));

  setInterval(() => {
    // Refresh ts
    const msg = Buffer.from(JSON.stringify({
      service: MDNS_SERVICE, port: PORT, httpsPort: HTTPS_PORT, ts: Date.now(),
    }));
    mdnsSocket.send(msg, 0, msg.length, MDNS_PORT, MDNS_ADDR, (err) => {
      if (err) console.warn('[mDNS] send error:', err.message);
    });
    // Prune stale peers
    const now = Date.now();
    for (const [ip, peer] of peerServers) {
      if (now - peer.lastSeen > PEER_TIMEOUT) {
        console.log('[mDNS] peer timed out:', ip);
        peer.ws?.terminate?.();
        peerServers.delete(ip);
      }
    }
  }, ANNOUNCE_INTERVAL);

  // Initial announce after 500ms
  setTimeout(() => {
    mdnsSocket.send(announceMsg, 0, announceMsg.length, MDNS_PORT, MDNS_ADDR);
  }, 500);
}

// ─── Peer server federation ───────────────────────────────────────────────────
// When we discover another HexMesh server on the LAN, we open a WS connection
// to it and bridge NODE_LIST / NODE_JOINED / NODE_LEFT / relay packets between
// the two servers. This means a client on server A can reach a client on server B.
function connectToPeerServer(ip, port, httpsPort) {
  const url = `ws://${ip}:${port}`;
  let ws;
  try { ws = new WebSocket(url); } catch { return; }

  ws.on('open', () => {
    console.log(`[FEDERATION] connected to peer server ${ip}:${port}`);
    const entry = peerServers.get(ip);
    if (entry) entry.ws = ws;
    // Send our full node list so remote server knows our clients
    ws.send(JSON.stringify({ type: 'FED_NODE_LIST', nodes: getNodeList(), ts: Date.now() }));
  });

  ws.on('message', (raw) => {
    try {
      const packet = JSON.parse(raw);
      handleFederationPacket(ws, packet, ip);
    } catch {}
  });

  ws.on('close', () => {
    console.log(`[FEDERATION] peer server ${ip} disconnected`);
    const entry = peerServers.get(ip);
    if (entry) entry.ws = null;
    // Remove their nodes from our view
    for (const [nId, node] of nodes) {
      if (node.federatedFrom === ip) {
        nodes.delete(nId);
        broadcast({ type: 'NODE_LEFT', nodeId: nId, ts: Date.now() }, null);
      }
    }
  });

  ws.on('error', () => {});
}

function handleFederationPacket(peerWs, packet, fromIp) {
  switch (packet.type) {
    case 'FED_NODE_LIST':
      // Register remote nodes as "federated" virtual nodes
      for (const n of (packet.nodes || [])) {
        if (!nodes.has(n.nodeId)) {
          nodes.set(n.nodeId, {
            ...n, ws: peerWs, federatedFrom: fromIp,
            packetCount: 0, windowStart: Date.now(),
            filePacketCount: 0, fileWindowStart: Date.now(),
          });
          broadcast({ type: 'NODE_JOINED', nodeId: n.nodeId, alias: n.alias, publicKey: n.publicKey || '', sigPub: n.sigPub || '', ts: Date.now() }, n.nodeId);
        }
      }
      // Send back our nodes
      peerWs.send(JSON.stringify({ type: 'FED_NODE_LIST', nodes: getNodeList(), ts: Date.now() }));
      break;
    case 'FED_RELAY':
      // Relay a packet from a remote client to one of our local clients
      relayToLocal(packet.payload);
      break;
    case 'FED_NODE_JOINED':
      if (!nodes.has(packet.nodeId)) {
        nodes.set(packet.nodeId, {
          ws: peerWs, nodeId: packet.nodeId, alias: packet.alias,
          publicKey: packet.publicKey || '', sigPub: packet.sigPub || '',
          federatedFrom: fromIp, lastSeen: Date.now(),
          packetCount: 0, windowStart: Date.now(),
          filePacketCount: 0, fileWindowStart: Date.now(),
        });
        broadcast({ type: 'NODE_JOINED', nodeId: packet.nodeId, alias: packet.alias, publicKey: packet.publicKey || '', sigPub: packet.sigPub || '', ts: Date.now() }, packet.nodeId);
      }
      break;
    case 'FED_NODE_LEFT':
      if (nodes.get(packet.nodeId)?.federatedFrom === fromIp) {
        nodes.delete(packet.nodeId);
        broadcast({ type: 'NODE_LEFT', nodeId: packet.nodeId, ts: Date.now() }, null);
      }
      break;
  }
}

function relayToLocal(packet) {
  if (!packet || !packet.to) return;
  const target = nodes.get(packet.to);
  if (target && !target.federatedFrom) {
    safeSend(target.ws, packet);
  }
}

// Forward packet to federated peer servers if target is remote
function forwardToFederation(packet) {
  const target = nodes.get(packet.to);
  if (!target || !target.federatedFrom) return false;
  const peer = peerServers.get(target.federatedFrom);
  if (peer?.ws?.readyState === WebSocket.OPEN) {
    peer.ws.send(JSON.stringify({ type: 'FED_RELAY', payload: packet }));
    return true;
  }
  return false;
}

function getNodeList() {
  return [...nodes.values()]
    .filter(n => !n.federatedFrom)
    .map(n => ({ nodeId: n.nodeId, alias: n.alias, publicKey: n.publicKey, sigPub: n.sigPub || '', lastSeen: n.lastSeen }));
}

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
const FILE_PACKET_TYPES = new Set(['FILE_CHUNK', 'FILE_META', 'FILE_META_REQ', 'FILE_ACK', 'FILE_INTEGRITY_FAIL']);

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
      // Tell federated peer servers
      for (const [, peer] of peerServers) {
        if (peer.ws?.readyState === WebSocket.OPEN) {
          peer.ws.send(JSON.stringify({ type: 'FED_NODE_LEFT', nodeId, ts: Date.now() }));
        }
      }
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
    case 'FILE_META_REQ':
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
    sigPub: packet.sigPub || '',
    lastSeen: Date.now(),
    packetCount: 0, windowStart: Date.now(),
    filePacketCount: 0, fileWindowStart: Date.now(),
  });

  log.info('node.register', { nodeId, alias, total: nodes.size });
  safeSend(ws, { type: 'REGISTERED', nodeId, ts: Date.now() });
  sendNodeList(ws);
  broadcast({ type: 'NODE_JOINED', nodeId, alias, publicKey: publicKey || '', sigPub: packet.sigPub || '', ts: Date.now() }, nodeId);
  // Tell federated peer servers about the new node
  for (const [, peer] of peerServers) {
    if (peer.ws?.readyState === WebSocket.OPEN) {
      peer.ws.send(JSON.stringify({ type: 'FED_NODE_JOINED', nodeId, alias, publicKey: publicKey || '', sigPub: packet.sigPub || '', ts: Date.now() }));
    }
  }
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
    if (target) {
      // Federated node — forward to peer server
      if (target.federatedFrom) {
        forwardToFederation(packet);
        return;
      }
      safeSend(target.ws, packet);
      return;
    }

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

  // Auto-discover other HexMesh servers on the same WiFi via UDP multicast
  startMdns();
  console.log(`🔍 mDNS auto-discovery active (${MDNS_ADDR}:${MDNS_PORT})\n`);
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
