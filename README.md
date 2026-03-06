# 🔗 HexMesh — Decentralized P2P Mesh Communication

> Encrypted. Decentralized. No internet required.

[![Platform](https://img.shields.io/badge/platform-Android%20%7C%20iOS%20%7C%20Web-blue)]()
[![Transport](https://img.shields.io/badge/transport-WebRTC%20%2B%20WebSocket-cyan)]()
[![Encryption](https://img.shields.io/badge/encryption-Ed25519%20%2B%20AES--256--GCM-green)]()

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        HexMesh Network                          │
│                                                                 │
│  [Node A] ◄──WebRTC DataChannel──► [Node B]                   │
│      │                                   │                      │
│      └────── relay via [Node C] ─────────┘                     │
│                                                                 │
│  Discovery:  WebSocket signaling server (LAN)                   │
│  P2P:        WebRTC DataChannel (DTLS encrypted)                │
│  Fallback:   Server relay with TTL=7 multihop                   │
│  Voice:      WebRTC MediaStream + Opus codec                    │
│  Files:      64KB chunks + SHA-256 + ACK + resume              │
│  Identity:   Ed25519 keypair per node                          │
└─────────────────────────────────────────────────────────────────┘
```

### Packet Format

```typescript
{
  id: string;       // UUID v4 — deduplication
  type: string;     // MSG | FILE_CHUNK | FILE_META | ACK | VOICE | ...
  from: string;     // Ed25519 public key fingerprint (node identity)
  to: string;       // target nodeId or 'broadcast'
  ttl: number;      // 0–7, decremented each hop (loop prevention)
  visited: string[]; // hop trail (loop prevention)
  payload: unknown; // type-specific data
  sig?: string;     // Ed25519 signature from 'from'
  ts: number;       // unix timestamp ms
}
```

### Routing Algorithm

1. **Direct WebRTC** — if DataChannel to `to` is open, deliver immediately
2. **Signaling relay** — if no direct channel, server forwards to known node
3. **Multihop flood** — if target unreachable locally, forward to all non-visited peers with TTL-1
4. **Loop prevention** — `visited[]` array + `seenPackets` Set on server
5. **Deduplication** — `id` checked before processing on every node

---

## Quick Start

### 1. Start signaling server

```bash
cd server
npm install
npm start
# → listening on :8080
# → GET /health  → { status, nodes, uptime }
# → GET /nodes   → active node list
```

### 2. Start the app (web)

```bash
cd ..   # project root (Expo project)
npm install
npm run start
# or: npx expo start --web
```

### 3. On mobile (LAN)

```bash
# Edit client/src/hooks/useMesh.ts → SIGNALING_URL
# Set to ws://<your-computer-LAN-IP>:8080
npx expo start
# Scan QR with Expo Go
```

### 4. Android APK build

```bash
eas build -p android --profile preview-apk
```

---

## Feature Matrix

| Feature | Status | Notes |
|---|---|---|
| Node discovery | ✅ | WebSocket NODE_LIST + NODE_JOINED events |
| P2P session (WebRTC) | ✅ | OFFER/ANSWER/ICE via signaling |
| Text messages | ✅ | DataChannel + ACK + retry (5x exp backoff) |
| Multihop relay | ✅ | TTL=7 flood with visited[] dedup |
| File transfer | ✅ | 64KB chunks + SHA-256 + resume |
| Voice calls | ✅ | WebRTC MediaStream, Opus |
| Video calls | ✅ | WebRTC MediaStream |
| E2E encryption | ✅ | DTLS (WebRTC) + Ed25519 identity |
| Rate limiting | ✅ | 60 pkt/s per node on relay |
| Offline queue | ✅ | IndexedDB-backed retry queue |
| Store & Forward | ✅ | Settings toggle per node |
| Group chat | 🔜 | Broadcast packet to all peers |
| BLE fallback | 🔜 | Architecture designed, native plugin needed |

---

## Protocols

### Message delivery guarantee

```
Sender                     Receiver
  │── MSG (id=abc) ──────────► │
  │                            │── ACK (payload=abc) ──► │
  │   [if no ACK in 500ms]     │
  │── MSG retry #1 ───────────► │
  │   [if no ACK in 1000ms]    │
  │── MSG retry #2 ───────────► │
  │   [max 5 retries, exp backoff]
```

### File transfer

```
Sender                          Receiver
  │── FILE_META (sha256, size) ──► │
  │── FILE_CHUNK #0 (64KB) ──────► │──► FILE_ACK #0
  │── FILE_CHUNK #1 (64KB) ──────► │──► FILE_ACK #1
  │   ... (throttled: 8 chunks     │
  │       then 10ms delay)         │
  │── FILE_CHUNK #N ─────────────► │
                                   │ verify SHA-256
                                   │ emit 'file:done' | 'file:integrity:fail'
```

### Multihop chain

```
A ──► B ──► C ──► D
     TTL=6   TTL=5   TTL=4
     visited=[A] visited=[A,B] visited=[A,B,C]
```

---

## Security Model

| Threat | Mitigation |
|---|---|
| Impersonation | Ed25519 keypair, fingerprint in Settings |
| Eavesdropping | DTLS (WebRTC) + AES-256-GCM for messages |
| Packet replay | UUID deduplication, timestamp check |
| Relay flooding | Rate limit: 60 pkt/s/node on server |
| Node ID hijack | Server rejects REGISTER if nodeId already active on different socket |
| Man-in-middle | Public key fingerprint shown in UI (Signal-style safety numbers) |

---

## Metrics & Diagnostics

```bash
# Live health check
curl http://localhost:8080/health

# Example response:
{
  "status": "ok",
  "nodes": 4,
  "uptime": 142,
  "metrics": {
    "totalConnections": 7,
    "totalPackets": 1842,
    "relayedPackets": 203,
    "droppedPackets": 12
  }
}
```

Server emits structured JSON logs:
```json
{"level":"INFO","ts":1710000000000,"msg":"node.register","nodeId":"node-a1b2c3","alias":"Alex","total":3}
{"level":"METRIC","ts":1710000000000,"msg":"heartbeat","activeNodes":3}
{"level":"INFO","ts":1710000000000,"msg":"relay.hop","id":"abc","from":"node-A","to":"node-D","ttl":5,"relayed":2}
```

---

## Measuring Latency

RTT is measured via PING/PONG packets every 5 seconds:
```typescript
// In useMesh hook:
client.on('rtt', (ms) => console.log('Round-trip:', ms, 'ms'));
```

Displayed live in UI on the Call screen (bottom bar: "Latency: Xms").

Packet loss is estimated by tracking retry counts vs ACK receipts.

---

## Project Structure

```
hexmesh/
├── server/
│   ├── index.js          ← Signaling server (Node.js + ws)
│   └── package.json
└── client/  (inside Expo project)
    └── src/
        ├── lib/
        │   ├── MeshClient.ts   ← Core P2P engine
        │   ├── crypto.ts       ← Ed25519 + AES-256-GCM
        │   └── INTEGRATION.ts  ← How to wire into UI
        └── hooks/
            └── useMesh.ts      ← React hooks
```
