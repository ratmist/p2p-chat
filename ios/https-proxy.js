/**
 * HTTPS proxy for Expo web
 * Forwards https://192.168.0.48:8443 → http://localhost:8081
 * and wss://192.168.0.48:8443 → ws://localhost:8081
 *
 * Uses the same self-signed cert as the signaling server (.certs/)
 *
 * Run: node https-proxy.js
 * Then open on iPhone: https://192.168.0.48:8443
 */

const https = require('https');
const http  = require('http');
const net   = require('net');
const fs    = require('fs');
const path  = require('path');

const CERT_DIR   = path.join(__dirname, 'server', '.certs');
const KEY_FILE   = path.join(CERT_DIR, 'key.pem');
const CERT_FILE  = path.join(CERT_DIR, 'cert.pem');
const PROXY_PORT = 8443;          // HTTPS port iPhone will open
const TARGET_PORT = 8081;         // Expo HTTP port

if (!fs.existsSync(KEY_FILE) || !fs.existsSync(CERT_FILE)) {
  console.error('❌ Cert not found at', CERT_DIR);
  console.error('   Run this first in server/ folder:');
  console.error('   "C:\\Program Files\\Git\\usr\\bin\\openssl.exe" req -x509 -newkey rsa:2048 -keyout .certs/key.pem -out .certs/cert.pem -days 365 -nodes -subj "/CN=hexmesh-local"');
  process.exit(1);
}

const sslOptions = {
  key:  fs.readFileSync(KEY_FILE),
  cert: fs.readFileSync(CERT_FILE),
};

// ─── HTTP proxy handler ───────────────────────────────────────────────────────
const server = https.createServer(sslOptions, (req, res) => {
  const options = {
    hostname: '127.0.0.1',
    port: TARGET_PORT,
    path: req.url,
    method: req.method,
    headers: req.headers,
  };

  const proxy = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });

  proxy.on('error', (err) => {
    console.error('[proxy] HTTP error:', err.message);
    res.writeHead(502);
    res.end('Expo not running on port ' + TARGET_PORT);
  });

  req.pipe(proxy, { end: true });
});

// ─── WebSocket upgrade proxy ──────────────────────────────────────────────────
server.on('upgrade', (req, socket, head) => {
  const conn = net.connect(TARGET_PORT, '127.0.0.1', () => {
    conn.write(
      `GET ${req.url} HTTP/1.1\r\n` +
      Object.entries(req.headers).map(([k, v]) => `${k}: ${v}`).join('\r\n') +
      '\r\n\r\n'
    );
    conn.write(head);
    socket.pipe(conn);
    conn.pipe(socket);
  });

  conn.on('error', (err) => {
    console.error('[proxy] WS error:', err.message);
    socket.destroy();
  });

  socket.on('error', () => conn.destroy());
});

// ─── Start ────────────────────────────────────────────────────────────────────
server.listen(PROXY_PORT, '0.0.0.0', () => {
  const os = require('os');
  const ips = Object.values(os.networkInterfaces())
    .flat()
    .filter(i => i && i.family === 'IPv4' && !i.internal)
    .map(i => i.address);

  console.log('\n🔒 HTTPS proxy running');
  console.log(`   Forwarding: https://0.0.0.0:${PROXY_PORT} → http://localhost:${TARGET_PORT}`);
  console.log('\n📱 Open on iPhone (Safari):');
  ips.forEach(ip => console.log(`   https://${ip}:${PROXY_PORT}`));
  console.log('\n⚠️  If Safari shows cert warning → нажми "посетить этот веб-сайт"');
  console.log('   (Already trusted from server setup — should work immediately)\n');
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PROXY_PORT} already in use. Kill the process or change PROXY_PORT.`);
  } else {
    console.error('❌ Server error:', err.message);
  }
  process.exit(1);
});
