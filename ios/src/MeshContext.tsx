import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
// expo-av is only available on native builds — imported dynamically below

// ─── WebRTC shim for native (react-native-webrtc) ─────────────────────────────
// On web, RTCPeerConnection etc. are global browser APIs.
// On iOS/Android we import from react-native-webrtc and register globals.
let _nativeWebRTCReady = false;

if (Platform.OS !== "web") {
  try {
    const rnWebRTC = require("react-native-webrtc");
    // registerGlobals() installs RTCPeerConnection, mediaDevices, etc. as globals
    rnWebRTC.registerGlobals();
    _nativeWebRTCReady = true;
    console.log("[WebRTC] react-native-webrtc registered successfully");
  } catch (e) {
    console.warn("[WebRTC] react-native-webrtc not available:", e);
    console.warn("[WebRTC] Make sure you are using a Dev Build (not Expo Go).");
    console.warn("[WebRTC] Run: eas build --profile development --platform ios");
    _nativeWebRTCReady = false;
  }
}

// ─── Signaling URL ────────────────────────────────────────────────────────────
function getSignalingUrl(): string {
  if (Platform.OS === "ios" || Platform.OS === "android") {
    const stored = _memStore.get("hex_server_ip");
    if (stored) return `wss://${stored}:3002`;
    return "wss://192.168.1.35:3002";
  }
  try {
    const host = window?.location?.hostname ?? "localhost";
    const isHttps = window?.location?.protocol === "https:";
    if (host === "localhost" || host === "127.0.0.1") return "ws://localhost:3001";
    if (isHttps) return `wss://${host}:3002`;
    return `ws://${host}:3001`;
  } catch { return "ws://localhost:3001"; }
}
export const SIGNALING_URL = getSignalingUrl();
// Dynamic URL used at connect-time (re-reads storage each time for native)
export function getCurrentSignalingUrl(): string { return getSignalingUrl(); }

export function generateId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ─── Cross-platform KV storage ───────────────────────────────────────────────
const _memStore = new Map<string, string>();
let _fsFlushTimer: ReturnType<typeof setTimeout> | null = null;
let _FS: any = null;

async function _loadFs(): Promise<any> {
  if (_FS) return _FS;
  try { _FS = await import("expo-file-system/legacy"); } catch {}
  return _FS;
}
function _storePath(fs: any): string { return (fs?.cacheDirectory ?? "") + "mesh_kv.json"; }

async function _flushNative() {
  const fs = await _loadFs();
  if (!fs) return;
  try {
    const obj: Record<string, string> = {};
    _memStore.forEach((v, k) => { obj[k] = v; });
    await fs.writeAsStringAsync(_storePath(fs), JSON.stringify(obj));
  } catch {}
}
function _scheduleFlush() {
  if (_fsFlushTimer) return;
  _fsFlushTimer = setTimeout(async () => { _fsFlushTimer = null; await _flushNative(); }, 300);
}

export async function initNativeStore() {
  const fs = await _loadFs();
  if (fs) {
    try {
      const path = _storePath(fs);
      const info = await fs.getInfoAsync(path);
      if (info.exists) {
        const raw = await fs.readAsStringAsync(path);
        const obj = JSON.parse(raw) as Record<string, string>;
        for (const [k, v] of Object.entries(obj)) _memStore.set(k, v);
      }
    } catch {}
  }
}

const storage = {
  get(key: string): string | null {
    if (Platform.OS === "web") { try { return localStorage.getItem(key); } catch { return null; } }
    return _memStore.get(key) ?? null;
  },
  set(key: string, value: string) {
    if (Platform.OS === "web") { try { localStorage.setItem(key, value); } catch {} return; }
    _memStore.set(key, value); _scheduleFlush();
  },
  del(key: string) {
    if (Platform.OS === "web") { try { localStorage.removeItem(key); } catch {} return; }
    _memStore.delete(key); _scheduleFlush();
  },
  keys(prefix: string): string[] {
    if (Platform.OS === "web") {
      try {
        const out: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i); if (k?.startsWith(prefix)) out.push(k);
        }
        return out;
      } catch { return []; }
    }
    return [..._memStore.keys()].filter(k => k.startsWith(prefix));
  },
};

function getStoredValue(key: string, fallback: () => string): string {
  try {
    if (Platform.OS !== "web") throw new Error("native");
    let val = localStorage.getItem(key);
    if (!val) { val = fallback(); localStorage.setItem(key, val); }
    return val;
  } catch { return fallback(); }
}

// ─── SHA-256 pure-JS (identical on V8 + Hermes) ───────────────────────────────
function sha256Sync(data: Uint8Array): string {
  const K = new Uint32Array([
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2,
  ]);
  let h0=0x6a09e667,h1=0xbb67ae85,h2=0x3c6ef372,h3=0xa54ff53a;
  let h4=0x510e527f,h5=0x9b05688c,h6=0x1f83d9ab,h7=0x5be0cd19;
  const len=data.length, bitLen=len*8;
  const padLen=((len%64)<56?56-(len%64):120-(len%64));
  const msg=new Uint8Array(len+padLen+8); msg.set(data); msg[len]=0x80;
  const dv=new DataView(msg.buffer);
  dv.setUint32(msg.length-4,bitLen>>>0,false);
  dv.setUint32(msg.length-8,Math.floor(bitLen/0x100000000),false);
  const w=new Uint32Array(64);
  for(let o=0;o<msg.length;o+=64){
    for(let i=0;i<16;i++) w[i]=dv.getUint32(o+i*4,false);
    for(let i=16;i<64;i++){
      const s0=(w[i-15]>>>7|w[i-15]<<25)^(w[i-15]>>>18|w[i-15]<<14)^(w[i-15]>>>3);
      const s1=(w[i-2]>>>17|w[i-2]<<15)^(w[i-2]>>>19|w[i-2]<<13)^(w[i-2]>>>10);
      w[i]=(w[i-16]+s0+w[i-7]+s1)>>>0;
    }
    let [a,b,c,d,e,f,g,h]=[h0,h1,h2,h3,h4,h5,h6,h7];
    for(let i=0;i<64;i++){
      const S1=(e>>>6|e<<26)^(e>>>11|e<<21)^(e>>>25|e<<7);
      const ch=(e&f)^(~e&g);
      const tmp1=(h+S1+ch+K[i]+w[i])>>>0;
      const S0=(a>>>2|a<<30)^(a>>>13|a<<19)^(a>>>22|a<<10);
      const maj=(a&b)^(a&c)^(b&c);
      const tmp2=(S0+maj)>>>0;
      [h,g,f,e,d,c,b,a]=[g,f,e,(d+tmp1)>>>0,c,b,a,(tmp1+tmp2)>>>0];
    }
    h0=(h0+a)>>>0;h1=(h1+b)>>>0;h2=(h2+c)>>>0;h3=(h3+d)>>>0;
    h4=(h4+e)>>>0;h5=(h5+f)>>>0;h6=(h6+g)>>>0;h7=(h7+h)>>>0;
  }
  const out=new Uint8Array(32); const ov=new DataView(out.buffer);
  [h0,h1,h2,h3,h4,h5,h6,h7].forEach((v,i)=>ov.setUint32(i*4,v,false));
  return Array.from(out).map(b=>b.toString(16).padStart(2,'0')).join('');
}

function base64ToUint8Array(b64: string): Uint8Array {
  const bin=atob(b64); const arr=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++) arr[i]=bin.charCodeAt(i); return arr;
}
function uint8ArrayToBase64(arr: Uint8Array): string {
  let out="";
  for(let i=0;i<arr.length;i+=8192) out+=String.fromCharCode(...arr.subarray(i,i+8192));
  return btoa(out);
}

// ─── E2E Encryption: ECDH P-256 + AES-GCM 256 ────────────────────────────────
// Web only — Hermes lacks SubtleCrypto. Falls back to plaintext on native.
const _ecdhKeys = { pub: "" as string, priv: null as CryptoKey | null };
const _sharedKeys = new Map<string, CryptoKey>();   // peerId → AES-GCM key
const _ecdhSentTo = new Set<string>();              // peers we already sent ECDH_HELLO

// ─── #38 Control packet signing (HMAC-SHA256) ─────────────────────────────────
// We derive a stable signing key from the node's persistent ID using HKDF-like derivation.
// This provides message integrity and sender authenticity for control packets.
let _hmacSignKey: CryptoKey | null = null;

async function _initSignKey(nodeId: string): Promise<void> {
  if (Platform.OS !== "web" || _hmacSignKey) return;
  try {
    const raw = new TextEncoder().encode(nodeId + ":hexmesh-ctrl-sign-v1");
    const base = await crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
    _hmacSignKey = base;
  } catch {}
}

async function _signPacket(packet: object): Promise<string> {
  if (Platform.OS !== "web" || !_hmacSignKey) return "";
  try {
    const canonical = JSON.stringify(packet, Object.keys(packet as any).sort());
    const sig = await crypto.subtle.sign("HMAC", _hmacSignKey, new TextEncoder().encode(canonical));
    return uint8ArrayToBase64(new Uint8Array(sig));
  } catch { return ""; }
}

async function _verifyPacket(packet: object, sig: string): Promise<boolean> {
  if (Platform.OS !== "web" || !_hmacSignKey || !sig) return true; // allow unsigned on native
  try {
    const { sig: _s, ...rest } = packet as any;
    const canonical = JSON.stringify(rest, Object.keys(rest).sort());
    const sigBytes = base64ToUint8Array(sig);
    return await crypto.subtle.verify("HMAC", _hmacSignKey, sigBytes, new TextEncoder().encode(canonical));
  } catch { return false; }
}

// Control packet types that get signed (sender-authenticated)
const SIGNED_PACKET_TYPES = new Set([
  "ECDH_HELLO", "FILE_META", "CALL_OFFER", "CALL_ANSWER", "CALL_END", "CALL_REJECT"
]);

export async function initECDHKeys(): Promise<string> {
  if (_ecdhKeys.pub) return _ecdhKeys.pub;
  if (Platform.OS !== "web") return "";
  try {
    const kp = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveKey"]);
    const raw = await crypto.subtle.exportKey("spki", kp.publicKey);
    _ecdhKeys.pub = uint8ArrayToBase64(new Uint8Array(raw));
    _ecdhKeys.priv = kp.privateKey;
  } catch {}
  return _ecdhKeys.pub;
}

async function _deriveSharedKey(peerPubB64: string): Promise<CryptoKey | null> {
  if (Platform.OS !== "web" || !_ecdhKeys.priv) return null;
  try {
    const raw = base64ToUint8Array(peerPubB64);
    const peerKey = await crypto.subtle.importKey("spki", raw, { name: "ECDH", namedCurve: "P-256" }, false, []);
    return await crypto.subtle.deriveKey(
      { name: "ECDH", public: peerKey }, _ecdhKeys.priv,
      { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
    );
  } catch { return null; }
}

async function _e2eEncrypt(key: CryptoKey, plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext));
  const out = new Uint8Array(12 + ct.byteLength);
  out.set(iv); out.set(new Uint8Array(ct), 12);
  return uint8ArrayToBase64(out);
}

async function _e2eDecrypt(key: CryptoKey, b64: string): Promise<string | null> {
  try {
    const data = base64ToUint8Array(b64);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: data.slice(0, 12) }, key, data.slice(12));
    return new TextDecoder().decode(plain);
  } catch { return null; }
}

// ─── Types ────────────────────────────────────────────────────────────────────
export type NodeInfo = { nodeId: string; alias: string; publicKey: string; lastSeen: number };
export type P2PStatus = "none" | "connecting" | "open" | "failed";

export type FileTransferProgress = {
  transferId: string; direction: "in" | "out";
  name: string; size: number; progress: number;
  status: "transferring" | "paused" | "done" | "failed" | "integrity_fail";
  retryCount?: number;
};

export type MeshMessage = {
  id: string; from: string; to: string; text: string; ts: number;
  status: "sending" | "sent" | "delivered" | "failed";
  type?: "text" | "file";
  fileInfo?: { name: string; size: number; data?: string; mimeType?: string };
  route?: string[];  // #14 — visited path for route display (A → B → C)
};

export type CallState = "idle" | "calling" | "ringing" | "connected";
export type IncomingCall = { from: string; alias: string; callId: string; video: boolean };

// ─── Offline message queue ────────────────────────────────────────────────────
type QueuedMsg = {
  packet: object; to: string; msgId: string;
  attempt: number; timer: ReturnType<typeof setTimeout> | null;
};
const MSG_RETRY_DELAYS = [2000, 4000, 8000, 16000, 32000];
// Add ±20% jitter to avoid thundering herd when multiple peers reconnect simultaneously
function retryDelayWithJitter(base: number): number {
  return Math.round(base * (0.8 + Math.random() * 0.4));
}

// ─── File transfer sessions ───────────────────────────────────────────────────
type OutboundTransfer = {
  transferId: string; to: string; totalChunks: number; sha256: string;
  getChunk: (i: number) => string; pendingAcks: Set<number>;
  retryTimers: Map<number, ReturnType<typeof setTimeout>>; msgId: string; done: boolean;
  paused: boolean; totalRetries: number;
};
type InboundTransfer = {
  transferId: string; from: string; name: string; size: number;
  mimeType: string; totalChunks: number; sha256: string;
  receivedChunks: Map<number, string>;
};

const IB_META_KEY  = (id: string) => `ib_meta_${id}`;
const IB_CHUNK_KEY = (id: string, i: number) => `ib_chunk_${id}_${i}`;

function persistInboundMeta(s: InboundTransfer) {
  storage.set(IB_META_KEY(s.transferId), JSON.stringify({
    transferId: s.transferId, from: s.from, name: s.name,
    size: s.size, mimeType: s.mimeType, totalChunks: s.totalChunks, sha256: s.sha256,
  }));
}
function persistInboundChunk(id: string, index: number, data: string) {
  storage.set(IB_CHUNK_KEY(id, index), data);
}
function dropInboundSession(id: string, total: number) {
  storage.del(IB_META_KEY(id));
  for (let i = 0; i < total; i++) storage.del(IB_CHUNK_KEY(id, i));
}
function loadPersistedInbound(): Map<string, InboundTransfer> {
  const result = new Map<string, InboundTransfer>();
  try {
    for (const key of storage.keys("ib_meta_")) {
      const raw = storage.get(key); if (!raw) continue;
      const meta = JSON.parse(raw) as Omit<InboundTransfer, "receivedChunks">;
      const chunks = new Map<number, string>();
      for (let i = 0; i < meta.totalChunks; i++) {
        const c = storage.get(IB_CHUNK_KEY(meta.transferId, i));
        if (c) chunks.set(i, c);
      }
      result.set(meta.transferId, { ...meta, receivedChunks: chunks });
    }
  } catch {}
  return result;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const CHUNK_SIZE_BYTES    = 48 * 1024;
const MAX_PARALLEL_CHUNKS = 4;
const CHUNK_RETRY_MS      = 4_000;
const MAX_CHUNK_RETRIES   = 8;
const INTER_CHUNK_DELAY   = 10;
const DC_LABEL            = "hexmesh-data";
const ICE_TIMEOUT_MS      = 15_000;  // ИСПРАВЛЕНИЕ: 7с слишком мало для мобильных сетей, ставим 15с
const PEER_PING_INTERVAL  = 5_000;
const PEER_UNSTABLE_MS    = 12_000;

// ─── Anti-spam & size limits ──────────────────────────────────────────────────
const MAX_MSG_PER_SEC     = 10;
const MAX_MSG_SIZE_BYTES  = 64 * 1024;       // 64 KB per text message
const MAX_FILE_SIZE_BYTES = 256 * 1024 * 1024; // 256 MB per file

export const QOS_PRIORITY = { VOICE: 1, TEXT: 2, SIGNALING: 3, FILE: 4 } as const;

export type NetworkSettings = {
  enableRelay:  boolean;
  forceP2P:     boolean;
  lowBandwidth: boolean;
  relayCapable: boolean;
  fileBwLimit:  number;
};
export const DEFAULT_NETWORK_SETTINGS: NetworkSettings = {
  enableRelay: true, forceP2P: false, lowBandwidth: false, relayCapable: true, fileBwLimit: 0,
};

export type PeerScore = {
  nodeId: string; latency: number | null; uptime: number;
  relayCapable: boolean; stable: boolean; lastPong: number; score: number;
};
const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    // Google STUN — для определения публичного IP (нужен даже на LAN для srflx кандидатов)
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    // Cloudflare STUN
    { urls: "stun:stun.cloudflare.com:3478" },
    // Open Relay TURN (UDP + TCP + TLS) — fallback если P2P не работает
    {
      urls: [
        "turn:openrelay.metered.ca:80",
        "turn:openrelay.metered.ca:443",
        "turns:openrelay.metered.ca:443",
      ],
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    // Metered free TURN
    {
      urls: [
        "turn:a.relay.metered.ca:80",
        "turn:a.relay.metered.ca:443",
        "turns:a.relay.metered.ca:443",
      ],
      username: "83c0f17a46c07b9a9e5527c7",
      credential: "vLAbhELv5y6MFDO0",
    },
  ],
  iceCandidatePoolSize: 10,
  // ИСПРАВЛЕНИЕ: max-bundle объединяет медиа и данные в один ICE компонент —
  // критично для iOS Safari где отдельные ICE компоненты могут зависать
  bundlePolicy: "max-bundle" as any,
  rtcpMuxPolicy: "require" as any,
};

// ─── Context ──────────────────────────────────────────────────────────────────
// ─── Call quality metrics (from WebRTC getStats) ──────────────────────────────
export type CallMetrics = {
  rttMs:        number | null;  // round-trip time for media (ms)
  jitterMs:     number | null;  // jitter on inbound audio (ms)
  packetsLost:  number | null;  // cumulative inbound packets lost
  lossPercent:  number | null;  // packet loss % (0-100)
  audioLevel:   number | null;  // inbound audio energy (0-1)
  quality:      'good' | 'fair' | 'poor' | 'unknown';
};

export type PeerTrust = {
  fingerprint: string;
  keyChanged: boolean;
  isNew: boolean;
};

type MeshContextType = {
  nodeId: string; alias: string;
  status: "connecting" | "connected" | "disconnected" | "reconnecting";
  nodes: NodeInfo[]; rtt: number | null;
  selectedPeer: NodeInfo | null; setSelectedPeer: (p: NodeInfo | null) => void;
  messages: MeshMessage[]; sendMessage: (text: string) => void;
  sendFile: (file: any) => void;
  sendFileNative: (file: { name: string; size: number; base64: string; mimeType: string }) => void;
  fileProgress: Map<string, FileTransferProgress>;
  groupMessages: MeshMessage[]; sendGroupMessage: (text: string) => void;
  callState: CallState; incomingCall: IncomingCall | null;
  callError: string | null;
  localStream: MediaStream | null; remoteStream: MediaStream | null;
  startCall: (peerId: string, video: boolean) => void;
  acceptCall: () => void; endCall: () => void;
  p2pStatus: Map<string, P2PStatus>;
  callMetrics: CallMetrics;
  activeCandidateType: string | null;
  peerTrust: Map<string, PeerTrust>;
  myFingerprint: string;
  networkSettings: NetworkSettings;
  setNetworkSettings: (s: NetworkSettings) => void;
  peerScores: Map<string, PeerScore>;
  typingPeers: Set<string>;
  sendTyping: () => void;
  connectionMode: "direct" | "turn" | "ws_relay";
  pauseFileTransfer: (transferId: string) => void;
  resumeFileTransfer: (transferId: string) => void;
  // Mesh route map: nodeId → hop path through which we last routed to them
  meshRoutes: Map<string, string[]>;
  // Per-peer latency history for sparkline (last 20 samples)
  peerLatencyHistory: Map<string, number[]>;
  // Relay fallback: re-route all traffic when a relay node goes offline
  relayFallbackActive: boolean;
  setServerIp: (ip: string) => void;
  currentServerIp: string;
};

const MeshContext = createContext<MeshContextType>({
  nodeId: "", alias: "", status: "connecting", nodes: [], rtt: null,
  selectedPeer: null, setSelectedPeer: () => {},
  messages: [], sendMessage: () => {}, sendFile: () => {}, sendFileNative: () => {},
  fileProgress: new Map(), groupMessages: [], sendGroupMessage: () => {},
  callState: "idle", incomingCall: null, localStream: null, remoteStream: null,
  callError: null,
  startCall: () => {}, acceptCall: () => {}, endCall: () => {},
  p2pStatus: new Map(),
  callMetrics: { rttMs: null, jitterMs: null, packetsLost: null, lossPercent: null, audioLevel: null, quality: "unknown" },
  activeCandidateType: null,
  peerTrust: new Map(),
  myFingerprint: "",
  networkSettings: DEFAULT_NETWORK_SETTINGS,
  setNetworkSettings: () => {},
  peerScores: new Map(),
  typingPeers: new Set(),
  sendTyping: () => {},
  connectionMode: "ws_relay",
  pauseFileTransfer: () => {},
  resumeFileTransfer: () => {},
  meshRoutes: new Map(),
  peerLatencyHistory: new Map(),
  relayFallbackActive: false,
  setServerIp: () => {},
  currentServerIp: "192.168.0.48",
});

export const useMeshContext = () => useContext(MeshContext);

// ─── Provider ─────────────────────────────────────────────────────────────────
export function MeshProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus]         = useState<MeshContextType["status"]>("connecting");
  const [nodes, setNodes]           = useState<NodeInfo[]>([]);
  const nodesRef = useRef<NodeInfo[]>([]); // always-current ref for use inside callbacks
  const [rtt, setRtt]               = useState<number | null>(null);
  const [selectedPeer, setSelectedPeer] = useState<NodeInfo | null>(null);
  const [messages, setMessages]     = useState<MeshMessage[]>([]);
  const [groupMessages, setGroupMessages] = useState<MeshMessage[]>([]);
  const [callState, setCallState]   = useState<CallState>("idle");
  const callStateRef = useRef<CallState>("idle");
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [callError, setCallError] = useState<string | null>(null);
  const [localStream, setLocalStream]   = useState<MediaStream | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null); // always-current ref for cleanup
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [fileProgress, setFileProgress] = useState<Map<string, FileTransferProgress>>(new Map());
  const [p2pStatus, setP2pStatus]   = useState<Map<string, P2PStatus>>(new Map());
  const [callMetrics, setCallMetrics] = useState<CallMetrics>({
    rttMs: null, jitterMs: null, packetsLost: null, lossPercent: null, audioLevel: null, quality: "unknown",
  });
  const [activeCandidateType, setActiveCandidateType] = useState<string | null>(null);
  const [peerTrust, setPeerTrust] = useState<Map<string, PeerTrust>>(new Map());
  const [myFingerprint, setMyFingerprint] = useState<string>("");
  const [networkSettings, setNetworkSettings] = useState<NetworkSettings>(DEFAULT_NETWORK_SETTINGS);
  const [peerScores, setPeerScores] = useState<Map<string, PeerScore>>(new Map());
  const peerScoresRef = useRef<Map<string, PeerScore>>(new Map());
  const [typingPeers, setTypingPeers] = useState<Set<string>>(new Set());
  const [connectionMode, setConnectionMode] = useState<"direct" | "turn" | "ws_relay">("ws_relay");
  const peerJoinedAt = useRef<Map<string, number>>(new Map());
  const peerPingTimers = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());
  const peerLastPong = useRef<Map<string, number>>(new Map());
  const peerPingStart = useRef<Map<string, number>>(new Map());
  const networkSettingsRef = useRef<NetworkSettings>(DEFAULT_NETWORK_SETTINGS);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Anti-spam: sliding window per peer
  const msgSendLog = useRef<number[]>([]);  // timestamps of own outgoing messages
  const statsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Tracks previous inbound stats to compute deltas (loss %)
  const prevStatsRef = useRef<{ packetsReceived: number; packetsLost: number } | null>(null);

  // ── Mesh routing map (nodeId → last known hop path) ────────────────────────
  const [meshRoutes, setMeshRoutes] = useState<Map<string, string[]>>(new Map());
  const meshRoutesRef = useRef<Map<string, string[]>>(new Map());

  // ── Per-peer latency history (last 20 samples) ─────────────────────────────
  const [peerLatencyHistory, setPeerLatencyHistory] = useState<Map<string, number[]>>(new Map());

  // ── Relay fallback state ───────────────────────────────────────────────────
  const [relayFallbackActive, setRelayFallbackActive] = useState(false);
  const relayFallbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const nodeId = useRef(getStoredValue("hex-node-id", () => "node-" + generateId())).current;
  const alias  = useRef(getStoredValue("hex-alias",   () => "Node-" + Math.random().toString(36).slice(2,6).toUpperCase())).current;

  const wsRef             = useRef<WebSocket | null>(null);
  const pingTs            = useRef(0);
  const reconnectTimer    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttempts = useRef(0);
  const seenMessages      = useRef(new Set<string>());

  // ── WebRTC DataChannel (per peer, data only) ───────────────────────────────
  const dataPCs      = useRef<Map<string, RTCPeerConnection>>(new Map());
  const dataChannels = useRef<Map<string, RTCDataChannel>>(new Map());
  const pendingDCIce = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());

  // ── Offline message queue ──────────────────────────────────────────────────
  const msgQueue = useRef<Map<string, QueuedMsg>>(new Map());

  // ── File transfer sessions ─────────────────────────────────────────────────
  const outbound = useRef<Map<string, OutboundTransfer>>(new Map());
  const peerMsgLog = useRef<Map<string, number[]>>(new Map());  // anti-spam per inbound peer

  // ─── File pause/resume ────────────────────────────────────────────────────
  const pauseFileTransfer = (transferId: string) => {
    const t = outbound.current.get(transferId);
    if (!t || t.done) return;
    t.paused = true;
    t.retryTimers.forEach(clearTimeout);
    t.retryTimers.clear();
    updateProgress(transferId, { status: "paused" });
  };

  const resumeFileTransfer = (transferId: string) => {
    const t = outbound.current.get(transferId);
    if (!t || t.done || !t.paused) return;
    t.paused = false;
    updateProgress(transferId, { status: "transferring" });
    // Re-send only chunks that are still in pendingAcks (not yet acknowledged)
    const pendingList = [...t.pendingAcks];
    for (const index of pendingList) {
      // Cancel any stale timer for this chunk first
      const old = t.retryTimers.get(index);
      if (old) clearTimeout(old);

      // E2E encrypt chunk data if shared key available
      const rawData = t.getChunk(index);
      const e2eKey = _sharedKeys.get(t.to);
      const sendChunk = async (attempt: number) => {
        let chunkData = rawData;
        if (e2eKey) {
          try { chunkData = await _e2eEncrypt(e2eKey, rawData); } catch {}
        }
        sendPacket(t.to, {
          id: generateId(), type: "FILE_CHUNK", from: nodeId, to: t.to,
          ttl: 7, visited: [], ts: Date.now(), priority: QOS_PRIORITY.FILE,
          payload: { transferId, index, data: chunkData, totalChunks: t.totalChunks, encrypted: !!e2eKey },
        });
        if (!t.pendingAcks.has(index) || t.paused || t.done) return;
        const retry = setTimeout(() => {
          if (!t.pendingAcks.has(index) || t.paused || t.done) return;
          if (attempt < MAX_CHUNK_RETRIES) sendChunk(attempt + 1);
        }, CHUNK_RETRY_MS * Math.pow(1.5, attempt));
        t.retryTimers.set(index, retry);
      };
      sendChunk(0);
    }
  };
  const inbound  = useRef<Map<string, InboundTransfer>>(
    Platform.OS === "web" ? loadPersistedInbound() : new Map()
  );

  // ── Call (voice/video) ─────────────────────────────────────────────────────
  const pcRef             = useRef<RTCPeerConnection | null>(null);
  const currentCallPeer   = useRef("");
  const currentCallId     = useRef("");
  const pendingOffer      = useRef<RTCSessionDescriptionInit | null>(null);
  const iceBuffer         = useRef<RTCIceCandidateInit[]>([]);

  // Keep callStateRef in sync — used inside handlePacket to avoid stale closures
  useEffect(() => { callStateRef.current = callState; }, [callState]);

  // Keep nodesRef in sync with nodes state
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);

  const handlePacketRef = useRef<(p: any) => void>(() => {});

  const updateNetworkSettings = (s: NetworkSettings) => {
    networkSettingsRef.current = s;
    setNetworkSettings(s);
  };
  useEffect(() => {
    initECDHKeys().then(pub => {
      if (pub) {
        const fp = pub.slice(0, 8) + ":" + pub.slice(8, 16) + ":" + pub.slice(16, 24) + ":" + pub.slice(24, 32);
        setMyFingerprint(fp);
      }
    });
    // #38 - init HMAC signing key from stable nodeId
    _initSignKey(nodeId);
    if (Platform.OS !== "web") {
      initNativeStore().then(() => {
        loadPersistedInbound().forEach((s, id) => inbound.current.set(id, s));
      });
    }
  }, []);

  // ─── Key pinning ──────────────────────────────────────────────────────────
  // First-seen public key is pinned per nodeId. If it changes → warn in UI.
  const KEY_PIN_PREFIX = "hexpin-";
  const checkAndPinKey = (peerId: string, publicKey: string, peerAlias: string) => {
    if (!publicKey) return;
    const fp = publicKey.slice(0, 8) + ":" + publicKey.slice(8, 16) + ":" + publicKey.slice(16, 24) + ":" + publicKey.slice(24, 32);
    const stored = storage.get(KEY_PIN_PREFIX + peerId);
    if (!stored) {
      storage.set(KEY_PIN_PREFIX + peerId, publicKey);
      setPeerTrust(prev => { const m = new Map(prev); m.set(peerId, { fingerprint: fp, keyChanged: false, isNew: true }); return m; });
    } else if (stored !== publicKey) {
      console.warn(`[SECURITY] Key mismatch for ${peerAlias} (${peerId})! Possible impersonation.`);
      setPeerTrust(prev => { const m = new Map(prev); m.set(peerId, { fingerprint: fp, keyChanged: true, isNew: false }); return m; });
    } else {
      setPeerTrust(prev => { const m = new Map(prev); m.set(peerId, { fingerprint: fp, keyChanged: false, isNew: false }); return m; });
    }
  };

  // ─── Peer scoring ─────────────────────────────────────────────────────────
  const updatePeerScore = (peerId: string, patch: Partial<PeerScore>) => {
    // Update latency history if latency changed
    if (patch.latency != null) {
      setPeerLatencyHistory(prev => {
        const next = new Map(prev);
        const hist = next.get(peerId) ?? [];
        const updated = [...hist, patch.latency!].slice(-20); // keep last 20
        next.set(peerId, updated);
        return next;
      });
    }
    setPeerScores(prev => {
      const m = new Map(prev);
      const joined = peerJoinedAt.current.get(peerId) ?? Date.now();
      const cur = m.get(peerId) ?? { nodeId: peerId, latency: null, uptime: 0, relayCapable: false, stable: true, lastPong: Date.now(), score: 50 };
      const next = { ...cur, ...patch, uptime: Date.now() - joined };
      const latScore = next.latency == null ? 40 : Math.max(0, 100 - next.latency / 2);
      next.score = Math.round(latScore * 0.4 + (next.stable ? 30 : 0) + (next.relayCapable ? 30 : 0));
      m.set(peerId, next);
      peerScoresRef.current = m;  // keep ref in sync for use in sendPacket
      return m;
    });
  };

  // ─── DC Ping/Pong ─────────────────────────────────────────────────────────
  const startPeerPing = (peerId: string) => {
    stopPeerPing(peerId);
    peerJoinedAt.current.set(peerId, peerJoinedAt.current.get(peerId) ?? Date.now());
    const timer = setInterval(() => {
      const dc = dataChannels.current.get(peerId);
      if (!dc || dc.readyState !== "open") { stopPeerPing(peerId); return; }
      const now = Date.now();
      peerPingStart.current.set(peerId, now);
      try { dc.send(JSON.stringify({ type: "PING", from: nodeId, ts: now })); } catch {}
      const lastPong = peerLastPong.current.get(peerId) ?? now;
      if (now - lastPong > PEER_UNSTABLE_MS) updatePeerScore(peerId, { stable: false });
    }, PEER_PING_INTERVAL);
    peerPingTimers.current.set(peerId, timer);
  };

  const stopPeerPing = (peerId: string) => {
    const t = peerPingTimers.current.get(peerId);
    if (t) { clearInterval(t); peerPingTimers.current.delete(peerId); }
  };

  // ─── Typing indicator ─────────────────────────────────────────────────────
  const sendTyping = () => {
    if (!selectedPeer) return;
    if (typingTimer.current) return;
    sendPacket(selectedPeer.nodeId, { id: generateId(), type: "TYPING", from: nodeId, to: selectedPeer.nodeId, ttl: 3, visited: [], ts: Date.now() });
    typingTimer.current = setTimeout(() => { typingTimer.current = null; }, 2000);
  };

  // ─── Helpers ──────────────────────────────────────────────────────────────
  const wsSend = (obj: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify(obj));
  };

  const updateProgress = (id: string, patch: Partial<FileTransferProgress>) => {
    setFileProgress(prev => {
      const next = new Map(prev);
      const cur = next.get(id);
      next.set(id, cur ? { ...cur, ...patch } : patch as FileTransferProgress);
      return next;
    });
  };

  const setP2p = (peerId: string, s: P2PStatus) =>
    setP2pStatus(prev => { const m = new Map(prev); m.set(peerId, s); return m; });

  // ─── Mesh-first routing ────────────────────────────────────────────────────
  // Priority: 1) direct DataChannel  2) multihop via peer DCs  3) WS last-resort
  // DC backpressure threshold: pause sending if buffer > 256KB to avoid congestion
  const DC_BACKPRESSURE_BYTES = 256 * 1024;

  const _dcSend = (dc: RTCDataChannel, data: string): boolean => {
    if (dc.readyState !== "open") return false;
    if (dc.bufferedAmount > DC_BACKPRESSURE_BYTES) return false; // backpressure
    try { dc.send(data); return true; } catch { return false; }
  };

  const _meshForward = (packet: any): boolean => {
    const visited: string[] = packet.visited ?? [];
    const stamped = { ...packet, ttl: (packet.ttl ?? 7) - 1, visited: [...visited, nodeId] };
    if (stamped.ttl <= 0) return false;
    const serialized = JSON.stringify(stamped);
    // Direct DC to destination
    const directDC = dataChannels.current.get(packet.to);
    if (directDC?.readyState === "open") {
      if (_dcSend(directDC, serialized)) return true;
    }
    // Flood to all open DCs not in visited path
    let forwarded = false;
    for (const [pid, dc] of dataChannels.current) {
      if (visited.includes(pid) || pid === packet.from) continue;
      if (_dcSend(dc, serialized)) forwarded = true;
    }
    return forwarded;
  };

  const sendPacket = (peerId: string, obj: object): boolean => {
    const pkt = obj as any;
    const settings = networkSettingsRef.current;
    const serialized = JSON.stringify(pkt);
    // 1. Direct DC
    const dc = dataChannels.current.get(peerId);
    if (dc?.readyState === "open") {
      if (_dcSend(dc, serialized)) {
        setConnectionMode("direct");
        // Update mesh route: direct (no hops)
        const directRoute = [nodeId, peerId];
        meshRoutesRef.current.set(peerId, directRoute);
        setMeshRoutes(new Map(meshRoutesRef.current));
        return true;
      }
    }
    // 2. Multihop through mesh (flood via open DCs)
    if (pkt.to && (pkt.ttl ?? 7) > 1) {
      if (_meshForward(pkt)) { setConnectionMode("direct"); return true; }
    }
    // 3. Best-relay routing: find highest-score relay-capable peer and route through them
    if (!settings.forceP2P || pkt.priority === QOS_PRIORITY.SIGNALING) {
      let bestRelayDC: RTCDataChannel | null = null;
      let bestRelayScore = -1;
      let bestRelayId = "";
      const scores = peerScoresRef.current;
      for (const [pid, score] of scores) {
        if (!score.relayCapable || !score.stable) continue;
        if (pid === peerId || pid === pkt.from) continue;
        const dc = dataChannels.current.get(pid);
        if (dc?.readyState === "open" && score.score > bestRelayScore) {
          bestRelayScore = score.score;
          bestRelayDC = dc;
          bestRelayId = pid;
        }
      }
      if (bestRelayDC) {
        const relayPkt = { ...pkt, ttl: (pkt.ttl ?? 7) - 1 };
        if (_dcSend(bestRelayDC, JSON.stringify(relayPkt))) {
          setConnectionMode("turn");
          // Update mesh route: via relay
          const relayRoute = [nodeId, bestRelayId, peerId];
          meshRoutesRef.current.set(peerId, relayRoute);
          setMeshRoutes(new Map(meshRoutesRef.current));
          return true;
        }
      }
    }
    // 4. WS relay — skip if forceP2P is on (except SIGNALING priority packets)
    if (settings.forceP2P && pkt.priority !== QOS_PRIORITY.SIGNALING) return false;
    wsSend(pkt);
    setConnectionMode("ws_relay");
    // Update mesh route: via WS server
    meshRoutesRef.current.set(peerId, [nodeId, "server", peerId]);
    setMeshRoutes(new Map(meshRoutesRef.current));
    return false;
  };

  // meshSend: mesh-first for any packet with a .to field; signs control packets
  const meshSend = async (obj: object) => {
    const pkt = obj as any;
    let signed = pkt;
    if (SIGNED_PACKET_TYPES.has(pkt.type)) {
      const sig = await _signPacket(pkt);
      if (sig) signed = { ...pkt, sig };
    }
    if (!signed.to) { wsSend(signed); return; }
    sendPacket(signed.to, signed);
  };

  // ─── Offline message queue ─────────────────────────────────────────────────
  // Retry sending until ACK received, exponential backoff
  const _scheduleRetry = (qm: QueuedMsg) => {
    if (qm.attempt >= MSG_RETRY_DELAYS.length) {
      setMessages(prev => prev.map(m => m.id === qm.msgId ? { ...m, status: "failed" } : m));
      msgQueue.current.delete(qm.msgId);
      return;
    }
    qm.timer = setTimeout(() => {
      if (!msgQueue.current.has(qm.msgId)) return;
      qm.attempt++;
      const viaDC = sendPacket(qm.to, qm.packet);
      if (viaDC) setMessages(prev => prev.map(m => m.id === qm.msgId ? { ...m, status: "sent" } : m));
      _scheduleRetry(qm);
    }, retryDelayWithJitter(MSG_RETRY_DELAYS[qm.attempt]));
    msgQueue.current.set(qm.msgId, qm);
  };

  const enqueueMsg = (to: string, packet: object, msgId: string) => {
    const qm: QueuedMsg = { packet, to, msgId, attempt: 1, timer: null };
    _scheduleRetry(qm);
  };

  const ackMsg = (packetId: string) => {
    const qm = msgQueue.current.get(packetId);
    if (qm) { if (qm.timer) clearTimeout(qm.timer); msgQueue.current.delete(packetId); }
    setMessages(prev => prev.map(m => m.id === packetId ? { ...m, status: "delivered" } : m));
  };

  // ─── E2E helpers ──────────────────────────────────────────────────────────
  const _sendECDHHello = (peerId: string) => {
    if (_ecdhSentTo.has(peerId) || !_ecdhKeys.pub) return;
    _ecdhSentTo.add(peerId);
    sendPacket(peerId, {
      id: generateId(), type: "ECDH_HELLO",
      from: nodeId, to: peerId, ttl: 7, visited: [],
      payload: { pub: _ecdhKeys.pub }, ts: Date.now(),
    });
  };

  const _handleECDHHello = async (packet: any) => {
    const peerPub = packet.payload?.pub;
    if (!peerPub) return;
    const key = await _deriveSharedKey(peerPub);
    if (key) _sharedKeys.set(packet.from, key);
    _sendECDHHello(packet.from); // reply if not yet sent
  };

  const _encryptText = async (peerId: string, text: string): Promise<{ text?: string; enc?: string }> => {
    const key = _sharedKeys.get(peerId);
    if (!key) return { text };
    try { return { enc: await _e2eEncrypt(key, text) }; } catch { return { text }; }
  };

  const _decryptText = async (peerId: string, payload: any): Promise<string> => {
    if (payload?.enc) {
      const key = _sharedKeys.get(peerId);
      if (key) { const p = await _e2eDecrypt(key, payload.enc); if (p !== null) return p; }
    }
    return payload?.text ?? "";
  };

  // ─── WebRTC DataChannel ────────────────────────────────────────────────────
  const _setupDC = (dc: RTCDataChannel, peerId: string) => {
    dataChannels.current.set(peerId, dc);
    setP2p(peerId, "connecting");

    dc.onopen = () => {
      setP2p(peerId, "open");
      setConnectionMode("direct");
      startPeerPing(peerId);
      _sendECDHHello(peerId);
      // Flush queued messages for this peer
      for (const [, qm] of msgQueue.current) {
        if (qm.to !== peerId) continue;
        if (qm.timer) clearTimeout(qm.timer);
        dc.send(JSON.stringify(qm.packet));
        setMessages(prev => prev.map(m => m.id === qm.msgId ? { ...m, status: "sent" } : m));
        qm.attempt = 1;
        _scheduleRetry(qm);
      }
      // Re-announce active file transfers to this peer
      for (const [, t] of outbound.current) {
        if (!t.done && t.to === peerId) {
          dc.send(JSON.stringify({
            id: generateId(), type: "FILE_META", from: nodeId, to: peerId, ttl: 7, visited: [],
            payload: { transferId: t.transferId, name: "", size: 0,
              mimeType: "application/octet-stream", totalChunks: t.totalChunks, sha256: t.sha256 },
            ts: Date.now(),
          }));
        }
      }
    };

    dc.onmessage = (e) => {
      try { handlePacketRef.current(JSON.parse(e.data)); } catch {}
    };

    dc.onclose = () => {
      dataChannels.current.delete(peerId);
      setP2p(peerId, "failed");
      stopPeerPing(peerId);
      // #7 — auto-reconnect DC after brief delay (if peer still in node list)
      setTimeout(() => {
        if (nodesRef.current.some(n => n.nodeId === peerId) &&
            dataChannels.current.get(peerId)?.readyState !== "open") {
          console.log("[DC] auto-reconnecting to", peerId);
          _initiateDataChannel(peerId);
        }
      }, 2000);
    };
  };

  const _createDataPC = (peerId: string): RTCPeerConnection => {
    dataPCs.current.get(peerId)?.close();
    const pc = new RTCPeerConnection(RTC_CONFIG);
    dataPCs.current.set(peerId, pc);
    setP2p(peerId, "connecting");

    pc.onicecandidate = (e) => {
      if (e.candidate) wsSend({ type: "DC_ICE", from: nodeId, to: peerId, candidate: e.candidate.toJSON(), ts: Date.now() });
    };
    pc.ondatachannel = (e) => { if (e.channel.label === DC_LABEL) _setupDC(e.channel, peerId); };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "closed") {
        dataPCs.current.delete(peerId);
        dataChannels.current.delete(peerId);
        setP2p(peerId, "failed");
        // #7 — try to re-establish DC if peer is still present
        setTimeout(() => {
          if (nodesRef.current.some(n => n.nodeId === peerId) &&
              dataChannels.current.get(peerId)?.readyState !== "open") {
            _initiateDataChannel(peerId);
          }
        }, 3000);
      }
      if (pc.connectionState === "connected") {
        setConnectionMode("direct");
      }
    };

    // ICE timeout: if not connected in ICE_TIMEOUT_MS, force TURN-only restart
    const iceTimer = setTimeout(() => {
      if (pc.iceConnectionState !== "connected" && pc.iceConnectionState !== "completed") {
        console.warn("[ICE] timeout — restarting with TURN only for", peerId);
        setConnectionMode("turn");
        try { pc.restartIce?.(); } catch {}
      }
    }, ICE_TIMEOUT_MS);
    pc.addEventListener("iceconnectionstatechange", () => {
      if (pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed") {
        clearTimeout(iceTimer);
      }
    });

    return pc;
  };

  // Initiate (caller side) — web only, native uses WS relay
  const _initiateDataChannel = async (peerId: string) => {
    if (Platform.OS !== "web") return;
    if (dataChannels.current.get(peerId)?.readyState === "open") return;
    try {
      const pc = _createDataPC(peerId);
      const dc = pc.createDataChannel(DC_LABEL, { ordered: true });
      _setupDC(dc, peerId);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      wsSend({ type: "DC_OFFER", from: nodeId, to: peerId, sdp: offer.sdp, ts: Date.now() });
    } catch {}
  };

  const _handleDCOffer = async (packet: any) => {
    if (Platform.OS !== "web") return;
    try {
      const pc = _createDataPC(packet.from);
      await pc.setRemoteDescription({ type: "offer", sdp: packet.sdp });
      const buf = pendingDCIce.current.get(packet.from) ?? [];
      for (const c of buf) { try { await pc.addIceCandidate(c); } catch {} }
      pendingDCIce.current.delete(packet.from);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      wsSend({ type: "DC_ANSWER", from: nodeId, to: packet.from, sdp: answer.sdp, ts: Date.now() });
    } catch {}
  };

  const _handleDCAnswer = async (packet: any) => {
    try {
      const pc = dataPCs.current.get(packet.from); if (!pc) return;
      await pc.setRemoteDescription({ type: "answer", sdp: packet.sdp });
      const buf = pendingDCIce.current.get(packet.from) ?? [];
      for (const c of buf) { try { await pc.addIceCandidate(c); } catch {} }
      pendingDCIce.current.delete(packet.from);
    } catch {}
  };

  const _handleDCIce = async (packet: any) => {
    const pc = dataPCs.current.get(packet.from);
    if (!pc?.remoteDescription) {
      const buf = pendingDCIce.current.get(packet.from) ?? [];
      buf.push(packet.candidate);
      pendingDCIce.current.set(packet.from, buf);
      return;
    }
    try { await pc.addIceCandidate(packet.candidate); } catch {}
  };

  // ─── Text messaging ────────────────────────────────────────────────────────
  const sendMessage = async (text: string) => {
    if (!text.trim() || !selectedPeer) return;

    // Anti-spam: sliding window — max MAX_MSG_PER_SEC messages/sec
    const now = Date.now();
    msgSendLog.current = msgSendLog.current.filter(t => now - t < 1000);
    if (msgSendLog.current.length >= MAX_MSG_PER_SEC) {
      console.warn("[SPAM] rate limit — dropping message");
      return;
    }
    msgSendLog.current.push(now);

    // Size guard
    if (text.length > MAX_MSG_SIZE_BYTES) {
      console.warn("[SIZE] message too large, truncating to", MAX_MSG_SIZE_BYTES, "chars");
      text = text.slice(0, MAX_MSG_SIZE_BYTES);
    }
    const id = generateId();
    const peer = selectedPeer;
    setMessages(prev => [...prev, { id, from: nodeId, to: peer.nodeId, text, ts: Date.now(), status: "sending", type: "text" }]);
    seenMessages.current.add(id);

    const encPayload = await _encryptText(peer.nodeId, text);
    const packet = { id, type: "MSG", from: nodeId, to: peer.nodeId, ttl: 7, visited: [], payload: encPayload, ts: Date.now(), priority: QOS_PRIORITY.TEXT };
    const viaDC = sendPacket(peer.nodeId, packet);
    setMessages(prev => prev.map(m => m.id === id ? { ...m, status: viaDC ? "sent" : "sending" } : m));
    enqueueMsg(peer.nodeId, packet, id);
  };

  const sendGroupMessage = (text: string) => {
    if (!text.trim()) return;
    const id = generateId();
    nodes.forEach(node => {
      const gPkt = { id: generateId(), type: "MSG", from: nodeId, to: node.nodeId, ttl: 7, visited: [], payload: { text, groupMsg: true }, ts: Date.now() };
      sendPacket(node.nodeId, gPkt);
    });
    setGroupMessages(prev => [...prev, { id, from: nodeId, to: "group", text, ts: Date.now(), status: "sent", type: "text" }]);
  };

  // ─── File transfer — outbound ──────────────────────────────────────────────
  const startFileTransfer = async (
    to: string, base64: string,
    meta: { name: string; size: number; mimeType: string }, msgId: string,
  ) => {
    const bytes = base64ToUint8Array(base64);
    const sha256 = sha256Sync(bytes);
    const B64_CHUNK = Math.floor((CHUNK_SIZE_BYTES * 4 / 3) / 4) * 4;
    const totalChunks = Math.ceil(base64.length / B64_CHUNK);
    const getChunk = (i: number) => base64.slice(i * B64_CHUNK, (i + 1) * B64_CHUNK);

    const transferId = generateId();
    const t: OutboundTransfer = {
      transferId, to, totalChunks, sha256, getChunk,
      pendingAcks: new Set(Array.from({ length: totalChunks }, (_, i) => i)),
      retryTimers: new Map(), msgId, done: false, paused: false, totalRetries: 0,
    };
    outbound.current.set(transferId, t);
    updateProgress(transferId, { transferId, direction: "out", name: meta.name, size: meta.size, progress: 0, status: "transferring" });

    const sendChunk = (index: number, attempt = 0) => {
      if (t.done || t.paused) return;
      if (attempt >= MAX_CHUNK_RETRIES) {
        t.done = true; t.retryTimers.forEach(clearTimeout); outbound.current.delete(transferId);
        setMessages(prev => prev.map(m => m.id === msgId ? { ...m, status: "failed" } : m));
        updateProgress(transferId, { status: "failed" }); return;
      }
      t.totalRetries += attempt > 0 ? 1 : 0;
      updateProgress(transferId, { retryCount: t.totalRetries });

      // E2E encrypt chunk data if shared key available
      const rawData = getChunk(index);
      const e2eKey = _sharedKeys.get(to);
      const sendEncryptedChunk = async () => {
        let chunkData = rawData;
        if (e2eKey) {
          try { chunkData = await _e2eEncrypt(e2eKey, rawData); } catch {}
        }
        sendPacket(to, { id: generateId(), type: "FILE_CHUNK", from: nodeId, to, ttl: 7, visited: [], payload: { transferId, index, data: chunkData, totalChunks, encrypted: !!e2eKey }, ts: Date.now(), priority: QOS_PRIORITY.FILE });
      };
      sendEncryptedChunk();

      const timer = setTimeout(() => { if (!t.pendingAcks.has(index) || t.paused) return; sendChunk(index, attempt + 1); }, CHUNK_RETRY_MS * Math.pow(1.5, attempt));
      t.retryTimers.set(index, timer);
    };

    sendPacket(to, { id: generateId(), type: "FILE_META", from: nodeId, to, ttl: 7, visited: [], payload: { transferId, name: meta.name, size: meta.size, mimeType: meta.mimeType, totalChunks, sha256 }, ts: Date.now() });

    // Bandwidth throttle: cap based on settings (lowBandwidth=100KB/s, custom, or 2MB/s default)
    const settings = networkSettingsRef.current;
    const BW_LIMIT_BYTES = settings.fileBwLimit > 0
      ? settings.fileBwLimit
      : settings.lowBandwidth
      ? 100 * 1024
      : 2 * 1024 * 1024;
    let bwWindowBytes = 0;
    let bwWindowStart = Date.now();

    let inFlight = 0;
    for (let i = 0; i < totalChunks; i++) {
      // Wait while paused
      while (t.paused) { await new Promise(r => setTimeout(r, 200)); }
      while (inFlight >= MAX_PARALLEL_CHUNKS) { await new Promise(r => setTimeout(r, INTER_CHUNK_DELAY)); inFlight = t.retryTimers.size; }
      if (t.done) return;
      sendChunk(i); inFlight++;

      // Bandwidth accounting
      const chunkBytes = Math.ceil(B64_CHUNK * 3 / 4);
      bwWindowBytes += chunkBytes;
      const now = Date.now();
      if (now - bwWindowStart >= 1000) {
        bwWindowBytes = chunkBytes;
        bwWindowStart = now;
      } else if (bwWindowBytes > BW_LIMIT_BYTES) {
        const waitMs = 1000 - (now - bwWindowStart);
        if (waitMs > 0) await new Promise(r => setTimeout(r, waitMs));
        bwWindowBytes = 0;
        bwWindowStart = Date.now();
      } else if (i % 4 === 3) {
        await new Promise(r => setTimeout(r, INTER_CHUNK_DELAY));
      }
    }
  };

  const handleFileChunkAck = (transferId: string, index: number) => {
    const t = outbound.current.get(transferId); if (!t) return;
    const timer = t.retryTimers.get(index);
    if (timer) { clearTimeout(timer); t.retryTimers.delete(index); }
    t.pendingAcks.delete(index);
    updateProgress(transferId, { progress: Math.round(((t.totalChunks - t.pendingAcks.size) / t.totalChunks) * 100) });
    if (t.pendingAcks.size === 0 && t.retryTimers.size === 0) {
      t.done = true; outbound.current.delete(transferId);
      setMessages(prev => prev.map(m => m.id === t.msgId ? { ...m, status: "delivered" } : m));
      updateProgress(transferId, { progress: 100, status: "done" });
    }
  };

  const sendFile = (file: any) => {
    if (!selectedPeer || Platform.OS !== "web" || !file?.name) return;
    if (file.size > MAX_FILE_SIZE_BYTES) {
      console.warn("[SIZE] file too large:", file.size, "> max", MAX_FILE_SIZE_BYTES);
      return;
    }
    const msgId = generateId();
    setMessages(prev => [...prev, { id: msgId, from: nodeId, to: selectedPeer.nodeId, text: "", ts: Date.now(), status: "sending", type: "file", fileInfo: { name: file.name, size: file.size, mimeType: file.type ?? "application/octet-stream" } }]);
    seenMessages.current.add(msgId);
    const peer = selectedPeer;
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = (reader.result as string).split(",")[1];
      await startFileTransfer(peer.nodeId, base64, { name: file.name, size: file.size, mimeType: file.type ?? "application/octet-stream" }, msgId);
    };
    reader.readAsDataURL(file);
  };

  const sendFileNative = (file: { name: string; size: number; base64: string; mimeType: string }) => {
    if (!selectedPeer) return;
    const msgId = generateId();
    setMessages(prev => [...prev, { id: msgId, from: nodeId, to: selectedPeer.nodeId, text: "", ts: Date.now(), status: "sending", type: "file", fileInfo: { name: file.name, size: file.size, mimeType: file.mimeType } }]);
    seenMessages.current.add(msgId);
    const peer = selectedPeer;
    startFileTransfer(peer.nodeId, file.base64, { name: file.name, size: file.size, mimeType: file.mimeType }, msgId);
  };

  // ─── File transfer — inbound ───────────────────────────────────────────────
  const handleFileMeta = (packet: any) => {
    const { transferId, name, size, mimeType, totalChunks, sha256 } = packet.payload;
    const existing = inbound.current.get(transferId);
    if (!existing) {
      const session: InboundTransfer = { transferId, from: packet.from, name, size, mimeType, totalChunks, sha256, receivedChunks: new Map() };
      inbound.current.set(transferId, session);
      persistInboundMeta(session);
    } else {
      existing.sha256 = sha256; existing.name = name; existing.size = size; existing.mimeType = mimeType;
      persistInboundMeta(existing);
    }
    const already = inbound.current.get(transferId)!.receivedChunks.size;
    updateProgress(transferId, { transferId, direction: "in", name, size, progress: Math.round((already / totalChunks) * 100), status: "transferring" });
  };

  const handleFileChunk = async (packet: any) => {
    const { transferId, index, data, totalChunks, encrypted } = packet.payload;
    // ACK immediately (even duplicates)
    sendPacket(packet.from, { id: generateId(), type: "FILE_ACK", from: nodeId, to: packet.from, ttl: 7, visited: [], payload: { transferId, index }, ts: Date.now() });

    let session = inbound.current.get(transferId);
    if (!session) {
      session = { transferId, from: packet.from, name: "file", size: 0, mimeType: "application/octet-stream", totalChunks, sha256: "", receivedChunks: new Map() };
      inbound.current.set(transferId, session); persistInboundMeta(session);
    }
    if (session.receivedChunks.has(index)) return;

    // Decrypt chunk if encrypted flag is set
    let chunkData = data;
    if (encrypted) {
      const e2eKey = _sharedKeys.get(packet.from);
      if (e2eKey) {
        try { const dec = await _e2eDecrypt(e2eKey, data); if (dec !== null) chunkData = dec; } catch {}
      }
    }

    session.receivedChunks.set(index, chunkData); persistInboundChunk(transferId, index, chunkData);
    updateProgress(transferId, { progress: Math.round((session.receivedChunks.size / totalChunks) * 100) });

    if (session.receivedChunks.size === totalChunks) {
      const assembled = Array.from({ length: totalChunks }, (_, i) => session!.receivedChunks.get(i) ?? "").join("");
      if (session.sha256) {
        const actual = sha256Sync(base64ToUint8Array(assembled));
        if (actual !== session.sha256) {
          dropInboundSession(transferId, totalChunks); inbound.current.delete(transferId);
          sendPacket(session.from, { id: generateId(), type: "FILE_INTEGRITY_FAIL", from: nodeId, to: session.from, ttl: 7, visited: [], payload: { transferId }, ts: Date.now() });
          updateProgress(transferId, { status: "integrity_fail", progress: 0 }); return;
        }
      }
      dropInboundSession(transferId, totalChunks); inbound.current.delete(transferId);
      updateProgress(transferId, { progress: 100, status: "done" });
      const msgId = generateId();
      setMessages(p => [...p, { id: msgId, from: session!.from, to: nodeId, text: "", ts: Date.now(), status: "delivered", type: "file", fileInfo: { name: session!.name, size: session!.size, data: assembled, mimeType: session!.mimeType } }]);
      seenMessages.current.add(msgId);
    }
  };

  const reannounceActiveTransfers = () => {
    for (const [, t] of outbound.current) {
      if (!t.done) sendPacket(t.to, { id: generateId(), type: "FILE_META", from: nodeId, to: t.to, ttl: 7, visited: [], payload: { transferId: t.transferId, name: "", size: 0, mimeType: "application/octet-stream", totalChunks: t.totalChunks, sha256: t.sha256 }, ts: Date.now() });
    }
  };

  // ─── Calls ─────────────────────────────────────────────────────────────────
  const cleanupCall = () => {
    stopStatsPolling();
    setActiveCandidateType(null);
    pcRef.current?.close(); pcRef.current = null;
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    setLocalStream(null); setRemoteStream(null); setCallState("idle"); setIncomingCall(null); setCallError(null);
    pendingOffer.current = null; currentCallPeer.current = ""; iceBuffer.current = [];
  };

  const createCallPC = (peerId: string) => {
    pcRef.current?.close();
    const pc = new RTCPeerConnection(RTC_CONFIG);
    pcRef.current = pc; currentCallPeer.current = peerId;
    console.log("[CALL] createCallPC for", peerId, "iceServers:", RTC_CONFIG.iceServers?.length);

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        console.log("[ICE] local candidate:", e.candidate.type, e.candidate.protocol, e.candidate.address);
        meshSend({ id: generateId(), type: "CALL_ICE", from: nodeId, to: peerId, ttl: 7, visited: [], payload: { candidate: e.candidate }, ts: Date.now() });
      } else {
        console.log("[ICE] gathering complete");
      }
    };

    pc.onicegatheringstatechange = () => {
      console.log("[ICE] gatheringState:", pc.iceGatheringState);
    };

    pc.ontrack = (e) => {
      console.log("[CALL] *** ontrack ***", "kind:", e.track.kind, "enabled:", e.track.enabled, "readyState:", e.track.readyState);
      // Ensure the incoming track is enabled (some browsers deliver it disabled)
      e.track.enabled = true;
      e.track.onunmute = () => { console.log("[CALL] track unmuted:", e.track.kind); e.track.enabled = true; };
      e.track.onended  = () => console.log("[CALL] track ended:", e.track.kind);

      // Configure jitter buffer for audio — target 100ms to absorb network jitter
      // while keeping latency acceptable. Higher = more resilient to bursts.
      if (e.track.kind === "audio") {
        try {
          const receiver = pc.getReceivers().find(r => r.track === e.track);
          if (receiver && "jitterBufferTarget" in receiver) {
            (receiver as any).jitterBufferTarget = 100; // ms
          }
        } catch {}
      }

      if (e.streams && e.streams[0]) {
        console.log("[CALL] remoteStream set, tracks:", e.streams[0].getTracks().length);
        // Enable all tracks in the stream
        e.streams[0].getTracks().forEach(t => { t.enabled = true; });
        setRemoteStream(e.streams[0]);
      } else {
        console.log("[CALL] wrapping lone track into stream");
        const stream = new MediaStream([e.track]);
        setRemoteStream(stream);
      }
    };

    pc.oniceconnectionstatechange = () => {
      const s = pc.iceConnectionState;
      console.log("[ICE] connectionState:", s);
      if (s === "connected" || s === "completed") {
        setCallState("connected");
        startStatsPolling(pc);
      }
      if (s === "failed") {
        console.warn("[ICE] failed — trying restartIce");
        if (pc.localDescription?.type === "offer") {
          pc.restartIce?.();
        } else {
          cleanupCall();
        }
      }
      if (s === "disconnected") {
        setTimeout(() => {
          if (pc.iceConnectionState === "disconnected" || pc.iceConnectionState === "failed") {
            cleanupCall();
          }
        }, 5000);
      }
    };

    pc.onconnectionstatechange = () => {
      console.log("[PC] connectionState:", pc.connectionState);
      if (pc.connectionState === "failed") cleanupCall();
    };

    pc.onsignalingstatechange = () => {
      console.log("[PC] signalingState:", pc.signalingState);
    };

    return pc;
  };

  // ─── WebRTC getStats polling ───────────────────────────────────────────────
  const startStatsPolling = (pc: RTCPeerConnection) => {
    stopStatsPolling();
    prevStatsRef.current = null;
    statsIntervalRef.current = setInterval(async () => {
      if (!pc || pc.connectionState !== "connected") { stopStatsPolling(); return; }
      try {
        const stats = await pc.getStats();
        let rttMs: number | null = null;
        let jitterMs: number | null = null;
        let packetsLost: number | null = null;
        let lossPercent: number | null = null;
        let audioLevel: number | null = null;

        stats.forEach((report) => {
          // Outbound RTT (from candidate-pair or remote-inbound-rtp)
          if (report.type === "remote-inbound-rtp" && report.kind === "audio") {
            if (report.roundTripTime != null) rttMs = Math.round(report.roundTripTime * 1000);
            if (report.jitter != null) jitterMs = Math.round(report.jitter * 1000);
          }

          // Inbound audio: packet loss and audio level
          if (report.type === "inbound-rtp" && report.kind === "audio") {
            const recv = report.packetsReceived ?? 0;
            const lost = report.packetsLost ?? 0;
            packetsLost = lost;

            const prev = prevStatsRef.current;
            if (prev) {
              const deltaRecv = recv - prev.packetsReceived;
              const deltaLost = lost - prev.packetsLost;
              const total = deltaRecv + deltaLost;
              lossPercent = total > 0 ? Math.round((deltaLost / total) * 100) : 0;
            }
            prevStatsRef.current = { packetsReceived: recv, packetsLost: lost };
          }

          // Audio energy level (inbound)
          if (report.type === "media-source" && report.kind === "audio") {
            if (report.audioLevel != null) audioLevel = report.audioLevel;
          }
          // Also try track stats for inbound audio level
          if (report.type === "track" && report.kind === "audio" && report.remoteSource) {
            if (report.audioLevel != null) audioLevel = report.audioLevel;
          }

          // Active ICE candidate type (host / srflx / relay)
          if (report.type === "candidate-pair" && report.state === "succeeded" && report.nominated) {
            const localId = report.localCandidateId;
            stats.forEach((r2: any) => {
              if (r2.type === "local-candidate" && r2.id === localId && r2.candidateType) {
                setActiveCandidateType(r2.candidateType);
              }
            });
          }
        });

        // Derive quality: good < 150ms RTT, < 1% loss, < 20ms jitter
        const quality: CallMetrics["quality"] =
          rttMs == null ? "unknown" :
          (rttMs < 150 && (lossPercent ?? 0) < 1 && (jitterMs ?? 0) < 20) ? "good" :
          (rttMs < 300 && (lossPercent ?? 0) < 5 && (jitterMs ?? 0) < 50) ? "fair" : "poor";

        setCallMetrics({ rttMs, jitterMs, packetsLost, lossPercent, audioLevel, quality });

        // Adaptive bitrate: adjust video sender encoding based on quality
        if (pcRef.current) {
          const senders = pcRef.current.getSenders();
          for (const sender of senders) {
            if (sender.track?.kind !== "video") continue;
            try {
              const params = sender.getParameters();
              if (!params.encodings?.length) continue;
              const targetBps =
                quality === "good" ? 800_000 :
                quality === "fair" ? 400_000 : 150_000;
              params.encodings.forEach(enc => { enc.maxBitrate = targetBps; });
              await sender.setParameters(params);
            } catch {}
          }
        }

        // Audio-only fallback: if quality poor for 3s, disable video tracks
        if (quality === "poor" && localStreamRef.current) {
          const videoTracks = localStreamRef.current.getVideoTracks();
          if (videoTracks.some(t => t.enabled)) {
            console.warn("[QoS] poor network — disabling video to save bandwidth");
            videoTracks.forEach(t => { t.enabled = false; });
          }
        }
      } catch { /* getStats can throw if PC is closed */ }
    }, 1000);
  };

  const stopStatsPolling = () => {
    if (statsIntervalRef.current) { clearInterval(statsIntervalRef.current); statsIntervalRef.current = null; }
    prevStatsRef.current = null;
    setCallMetrics({ rttMs: null, jitterMs: null, packetsLost: null, lossPercent: null, audioLevel: null, quality: "unknown" });
  };

  const getMedia = async (video: boolean): Promise<MediaStream | null> => {
    try {
      // On web use navigator.mediaDevices.
      // On native, react-native-webrtc registers mediaDevices on global.navigator via registerGlobals().
      // Fall back to (global as any).mediaDevices in case navigator shim isn't present.
      let mediaDevices: MediaDevices;
      if (Platform.OS === "web") {
        mediaDevices = navigator.mediaDevices;
      } else {
        mediaDevices = (global as any).navigator?.mediaDevices
          ?? (global as any).mediaDevices
          ?? null;
      }

      if (!mediaDevices) {
        console.error("[getMedia] mediaDevices not available");
        return null;
      }

      // On iOS: configure audio session for VoIP — must be done before getUserMedia
      if (Platform.OS !== "web") {
        try {
          const { Audio } = require("expo-av");
          await Audio.setAudioModeAsync({
            allowsRecordingIOS: true,
            playsInSilentModeIOS: true,
            staysActiveInBackground: true,
            shouldDuckAndroid: false,
            playThroughEarpieceAndroid: false,
          });
        } catch (e) {
          console.warn("[getMedia] setAudioModeAsync failed:", e);
        }
      }

      // Explicit audio constraints to maximise compatibility
      const audioConstraints: MediaTrackConstraints = {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      };

      const attempts: MediaStreamConstraints[] = video
        ? [
            { audio: audioConstraints, video: true },
            { audio: audioConstraints, video: false },
            { audio: true },
          ]
        : [{ audio: audioConstraints }, { audio: true }];

      for (const constraints of attempts) {
        try {
          const stream = await mediaDevices.getUserMedia(constraints);
          if (stream) return stream as MediaStream;
        } catch (e) {
          console.warn("[getMedia] failed with", JSON.stringify(constraints), e);
        }
      }
    } catch (e) {
      console.error("[getMedia] unexpected error:", e);
    }
    return null;
  };

  // Both platforms support WebRTC now (web: native browser, native: react-native-webrtc)
  const _canWebRTC = (): boolean => {
    if (Platform.OS === "web") {
      try { return typeof RTCPeerConnection !== "undefined"; } catch { return false; }
    }
    // On native: only available if react-native-webrtc loaded successfully
    return _nativeWebRTCReady;
  };

  // Patch SDP to enable Opus FEC (useinbandfec=1) and packet loss concealment
  // This makes audio more resilient at the cost of ~10% extra bandwidth
  const _patchSdpForResilience = (sdp: string): string => {
    // Enable in-band FEC and set minimum packet loss at 5% threshold
    return sdp
      .replace(/a=fmtp:(\d+) (.*useinbandfec=0.*)/g, (_m, pt, rest) => `a=fmtp:${pt} ${rest.replace("useinbandfec=0", "useinbandfec=1")}`)
      .replace(/(a=fmtp:(\d+) (?!.*useinbandfec).*opus.*)/g, "$1;useinbandfec=1;usedtx=1")
      // Also enable red redundancy codec if present
      .replace(/a=fmtp:(\d+) (.*useinbandfec.*)/g, (_m, pt, rest) => {
        if (!rest.includes("useinbandfec=1")) return `a=fmtp:${pt} ${rest};useinbandfec=1`;
        return _m;
      });
  };

  const startCall = async (peerId: string, video: boolean) => {
    if (callState !== "idle") return;
    console.log("[CALL] startCall →", peerId, "video:", video);
    setCallError(null);

    // ── Secure-context check (Safari blocks getUserMedia on HTTP) ──────────────
    // If not secure, we still place the call but without local audio/video.
    const insecureContext = Platform.OS === "web"
      && typeof window !== "undefined"
      && !window.isSecureContext;

    if (insecureContext) {
      console.warn("[CALL] insecure context — mic unavailable, calling anyway (no local audio)");
      setCallError("⚠️ Microphone unavailable: page must be opened via HTTPS (use port 8443).\nCall placed without local audio.");
    }

    if (!_canWebRTC() || insecureContext) {
      // nativeOnly path: no SDP offer — callee will still ring and can accept
      const callId = generateId(); currentCallId.current = callId; currentCallPeer.current = peerId;
      setCallState("calling");
      meshSend({ id: generateId(), type: "CALL_OFFER", from: nodeId, to: peerId, ttl: 7, visited: [],
        payload: { callId, offer: null, video, alias, nativeOnly: true }, ts: Date.now() });
      return;
    }

    // Try to get local media — if it fails, fall back to nativeOnly so the call still goes through
    const stream = await getMedia(video);
    if (!stream) {
      console.warn("[CALL] getMedia failed — falling back to nativeOnly (no local audio)");
      setCallError("⚠️ Could not access microphone. Check browser permissions.\nCall placed without local audio.");
      const callId = generateId(); currentCallId.current = callId; currentCallPeer.current = peerId;
      setCallState("calling");
      meshSend({ id: generateId(), type: "CALL_OFFER", from: nodeId, to: peerId, ttl: 7, visited: [],
        payload: { callId, offer: null, video, alias, nativeOnly: true }, ts: Date.now() });
      return;
    }

    console.log("[CALL] got local stream, tracks:", stream.getTracks().map(t => t.kind + ":" + t.enabled));
    localStreamRef.current = stream;
    setLocalStream(stream); setCallState("calling");

    const pc = createCallPC(peerId);
    stream.getTracks().forEach(t => { pc.addTrack(t, stream); console.log("[CALL] addTrack", t.kind); });

    const callId = generateId(); currentCallId.current = callId;
    const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: video });
    const patchedOffer = { ...offer, sdp: _patchSdpForResilience(offer.sdp ?? "") };
    console.log("[CALL] offer SDP (first 300 chars):", patchedOffer.sdp?.slice(0, 300));
    await pc.setLocalDescription(patchedOffer);
    meshSend({ id: generateId(), type: "CALL_OFFER", from: nodeId, to: peerId, ttl: 7, visited: [],
      payload: { callId, offer: patchedOffer, video, alias }, ts: Date.now() });
    console.log("[CALL] CALL_OFFER sent");
  };

  const acceptCall = async () => {
    if (!currentCallPeer.current) return;
    const video = incomingCall?.video ?? false;
    const peer  = currentCallPeer.current;
    console.log("[CALL] acceptCall from", peer, "video:", video);
    setIncomingCall(null);
    setCallError(null);

    const insecureContext = Platform.OS === "web"
      && typeof window !== "undefined"
      && !window.isSecureContext;

    if (!_canWebRTC() || insecureContext) {
      if (insecureContext) {
        setCallError("⚠️ Microphone unavailable: page must be opened via HTTPS (use port 8443).\nCall accepted without local audio.");
      }
      setCallState("connected");
      meshSend({ id: generateId(), type: "CALL_ANSWER", from: nodeId, to: peer, ttl: 7, visited: [],
        payload: { callId: currentCallId.current, answer: null, nativeOnly: true }, ts: Date.now() });
      return;
    }

    setCallState("calling");

    // ИСПРАВЛЕНИЕ: создаём PC и получаем медиа ПАРАЛЛЕЛЬНО, добавляем треки
    // ДО setRemoteDescription — иначе SDP answer не содержит медиа секцию
    // и ICE не может согласовать аудио/видео треки.
    const [stream, pc] = await Promise.all([
      getMedia(video),
      Promise.resolve(createCallPC(peer)),
    ]);

    if (stream) {
      console.log("[CALL] got local stream, tracks:", stream.getTracks().map(t => t.kind + ":" + t.enabled));
      localStreamRef.current = stream;
      setLocalStream(stream);
      // КРИТИЧНО: добавляем треки ДО createAnswer/setRemoteDescription
      stream.getTracks().forEach(t => { pc.addTrack(t, stream); console.log("[CALL] addTrack", t.kind); });
    } else {
      console.warn("[CALL] getMedia failed — accepting without local audio");
      setCallError("⚠️ Could not access microphone. Check browser permissions.");
    }

    // nativeOnly path: no SDP offer from caller — we create offer, caller answers it
    if (!pendingOffer.current) {
      console.log("[CALL] nativeOnly: web creates offer, waiting for caller to answer");
      try {
        const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: video } as any);
        await pc.setLocalDescription(offer);
        meshSend({ id: generateId(), type: "CALL_ANSWER", from: nodeId, to: peer, ttl: 7, visited: [],
          payload: { callId: currentCallId.current, answer: offer, webInitiated: true }, ts: Date.now() });
        console.log("[CALL] webInitiated offer sent");
      } catch (err) {
        console.error("[CALL] nativeOnly offer failed:", err);
        cleanupCall();
      }
      return;
    }

    console.log("[CALL] pendingOffer SDP (first 300 chars):", (pendingOffer.current as any)?.sdp?.slice(0, 300));
    try {
      // ИСПРАВЛЕНИЕ: сначала setRemoteDescription, потом flush ICE буфера,
      // потом createAnswer — треки уже добавлены выше до этого блока
      await pc.setRemoteDescription(pendingOffer.current!);
      console.log("[CALL] setRemoteDescription done, signalingState:", pc.signalingState);
      
      // ИСПРАВЛЕНИЕ: flush ICE буфера сразу после setRemoteDescription, до createAnswer
      const buffered = [...iceBuffer.current]; iceBuffer.current = [];
      console.log("[CALL] flushing", buffered.length, "buffered ICE candidates");
      for (const c of buffered) { try { await pc.addIceCandidate(c); } catch (e) { console.warn("[ICE] addIceCandidate failed:", e); } }
      
      const answer = await pc.createAnswer({ offerToReceiveAudio: true, offerToReceiveVideo: video } as any);
      const patchedAnswer = { ...answer, sdp: _patchSdpForResilience(answer.sdp ?? "") };
      console.log("[CALL] answer SDP (first 300 chars):", patchedAnswer.sdp?.slice(0, 300));
      await pc.setLocalDescription(patchedAnswer);
      meshSend({ id: generateId(), type: "CALL_ANSWER", from: nodeId, to: peer, ttl: 7, visited: [],
        payload: { callId: currentCallId.current, answer: patchedAnswer }, ts: Date.now() });
      console.log("[CALL] CALL_ANSWER sent");
    } catch (err) {
      console.error("[CALL] acceptCall failed:", err);
      cleanupCall();
    }
  };

  const endCall = () => {
    if (currentCallPeer.current) meshSend({ id: generateId(), type: "CALL_END", from: nodeId, to: currentCallPeer.current, ttl: 7, visited: [], payload: {}, ts: Date.now() });
    cleanupCall();
  };

  // ─── Packet router ─────────────────────────────────────────────────────────
  const ROUTABLE_TYPES = new Set(["MSG","ACK","FILE_META","FILE_CHUNK","FILE_ACK",
    "FILE_INTEGRITY_FAIL","CALL_OFFER","CALL_ANSWER","CALL_ICE","CALL_END","CALL_REJECT","ECDH_HELLO"]);

  const handlePacket = async (packet: any) => {
    // #38 — verify signature on signed control packets
    if (SIGNED_PACKET_TYPES.has(packet.type) && packet.sig) {
      const ok = await _verifyPacket(packet, packet.sig);
      if (!ok) {
        console.warn("[SECURITY] signature verification failed for", packet.type, "from", packet.from);
        return; // drop packet
      }
    }

    // ── True client multihop relay ──────────────────────────────────────────
    // If this packet arrived via WS or a DC and is NOT destined for us,
    // forward it through our own DataChannels. This is the mesh relay logic.
    if (packet.to && packet.to !== nodeId && ROUTABLE_TYPES.has(packet.type)) {
      _meshForward(packet);
      return; // don't process packets not addressed to us
    }

    switch (packet.type) {
      // WS control
      case "REGISTERED":
        wsSend({ type: "GET_NODES" });
        reannounceActiveTransfers();
        // Re-initiate DCs for all known peers after reconnect
        nodesRef.current.forEach(n => _initiateDataChannel(n.nodeId));
        // Retry all pending queued messages immediately after reconnect
        for (const [, qm] of msgQueue.current) {
          if (qm.timer) clearTimeout(qm.timer);
          qm.attempt = 0;
          _scheduleRetry(qm);
        }
        break;
      case "NODE_LIST":
        setNodes((packet.nodes || []).filter((n: NodeInfo) => n.nodeId !== nodeId).map((n: NodeInfo) => ({ ...n, lastSeen: Date.now() })));
        (packet.nodes || []).forEach((n: NodeInfo) => {
          if (n.nodeId !== nodeId) {
            _initiateDataChannel(n.nodeId);
            if (n.publicKey) checkAndPinKey(n.nodeId, n.publicKey, n.alias);
          }
        });
        break;
      case "NODE_JOINED":
        if (packet.nodeId !== nodeId) {
          setNodes(p => p.some(n => n.nodeId === packet.nodeId) ? p.map(n => n.nodeId === packet.nodeId ? { ...n, lastSeen: Date.now() } : n) : [...p, { ...packet, lastSeen: Date.now() }]);
          _initiateDataChannel(packet.nodeId);
          if (packet.publicKey) checkAndPinKey(packet.nodeId, packet.publicKey, packet.alias ?? packet.nodeId);
        }
        break;
      case "NODE_LEFT":
        setNodes(p => p.filter(n => n.nodeId !== packet.nodeId));
        dataPCs.current.get(packet.nodeId)?.close();
        dataPCs.current.delete(packet.nodeId);
        dataChannels.current.delete(packet.nodeId);
        setP2p(packet.nodeId, "failed");
        stopPeerPing(packet.nodeId);
        {
          // ── Relay fallback: check if departing node was a relay in any active route ──
          const lostNodeId = packet.nodeId;
          let routesBroken = 0;
          for (const [dest, route] of meshRoutesRef.current) {
            if (route.includes(lostNodeId)) {
              // This route is broken — clear it so next sendPacket finds a new path
              meshRoutesRef.current.delete(dest);
              routesBroken++;
              // Immediately retry queued messages for this destination via alternative path
              for (const [, qm] of msgQueue.current) {
                if (qm.to !== dest) continue;
                if (qm.timer) clearTimeout(qm.timer);
                qm.attempt = 0;
                // Small delay to let ICE/DC settle before retrying
                qm.timer = setTimeout(() => {
                  qm.attempt++;
                  sendPacket(qm.to, qm.packet);
                  _scheduleRetry(qm);
                }, 500);
                msgQueue.current.set(qm.msgId, qm);
              }
            }
          }
          if (routesBroken > 0) {
            console.log(`[RELAY] node ${lostNodeId} left — ${routesBroken} route(s) broken, rerouting`);
            setRelayFallbackActive(true);
            setMeshRoutes(new Map(meshRoutesRef.current));
            // Clear relay fallback indicator after 5s
            if (relayFallbackTimer.current) clearTimeout(relayFallbackTimer.current);
            relayFallbackTimer.current = setTimeout(() => setRelayFallbackActive(false), 5000);
          }
        }
        break;

      // DataChannel signaling (relayed via WS)
      case "DC_OFFER":  await _handleDCOffer(packet); break;
      case "DC_ANSWER": await _handleDCAnswer(packet); break;
      case "DC_ICE":    await _handleDCIce(packet); break;

      // E2E key exchange
      case "ECDH_HELLO": await _handleECDHHello(packet); break;

      // Messages
      case "MSG": {
        if (seenMessages.current.has(packet.id)) break;
        seenMessages.current.add(packet.id);
        // Inbound anti-spam: max MAX_MSG_PER_SEC from any single peer
        const now = Date.now();
        const peerLog = peerMsgLog.current.get(packet.from) ?? [];
        const recentPeerLog = peerLog.filter(t => now - t < 1000);
        if (recentPeerLog.length >= MAX_MSG_PER_SEC) {
          console.warn("[SPAM] dropping inbound message from", packet.from);
          break;
        }
        recentPeerLog.push(now);
        peerMsgLog.current.set(packet.from, recentPeerLog);

        const text = await _decryptText(packet.from, packet.payload);
        const route: string[] = packet.visited?.length ? [...packet.visited, nodeId] : [];
        const msg: MeshMessage = { id: packet.id, from: packet.from, to: packet.to, text, ts: packet.ts, status: "delivered", type: "text", route };
        if (packet.payload?.groupMsg) setGroupMessages(p => [...p, msg]);
        else setMessages(p => [...p, msg]);
        sendPacket(packet.from, { id: generateId(), type: "ACK", from: nodeId, to: packet.from, ttl: 7, visited: [], payload: packet.id, ts: Date.now() });
        break;
      }
      case "ACK": ackMsg(packet.payload); break;

      // Files
      case "FILE_META":        handleFileMeta(packet); break;
      case "FILE_CHUNK":       await handleFileChunk(packet); break;
      case "FILE_ACK":         handleFileChunkAck(packet.payload?.transferId, packet.payload?.index); break;
      case "FILE_INTEGRITY_FAIL": {
        const t = outbound.current.get(packet.payload?.transferId);
        if (t) { t.done = true; t.retryTimers.forEach(clearTimeout); outbound.current.delete(t.transferId); setMessages(prev => prev.map(m => m.id === t.msgId ? { ...m, status: "failed" } : m)); updateProgress(t.transferId, { status: "failed" }); }
        break;
      }

      // Calls
      case "CALL_OFFER":
        console.log("[CALL] CALL_OFFER from", packet.from, "nativeOnly:", !packet.payload?.offer, "myState:", callStateRef.current);
        if (callStateRef.current !== "idle") { meshSend({ id: generateId(), type: "CALL_REJECT", from: nodeId, to: packet.from, ttl: 7, visited: [], payload: {}, ts: Date.now() }); break; }
        if (packet.payload?.offer) pendingOffer.current = packet.payload.offer;
        else pendingOffer.current = null;
        currentCallId.current = packet.payload?.callId; currentCallPeer.current = packet.from;
        {
          // Resolve caller alias: prefer payload.alias, then nodes list (via ref), then nodeId as fallback
          const callerNode = nodesRef.current.find((n: any) => n.nodeId === packet.from);
          const callerAlias = packet.payload?.alias || callerNode?.alias || packet.from;
          setIncomingCall({ from: packet.from, alias: callerAlias, callId: packet.payload?.callId, video: packet.payload?.video ?? false });
          // Auto-select the calling peer so CallScreen shows correct name/info
          if (callerNode) setSelectedPeer(callerNode);
          else setSelectedPeer({ nodeId: packet.from, alias: callerAlias, lastSeen: Date.now() } as NodeInfo);
        }
        setCallState("ringing"); break;
      case "CALL_ANSWER":
        console.log("[CALL] CALL_ANSWER from", packet.from, "nativeOnly:", !!packet.payload?.nativeOnly, "webInitiated:", !!packet.payload?.webInitiated, "hasAnswer:", !!packet.payload?.answer, "pcRef:", !!pcRef.current);

        // webInitiated: the accepting side sent an offer (because caller was nativeOnly/no-SDP).
        // We need to figure out which role WE are:
        //   - If WE are the original caller (currentCallPeer === packet.from) → we receive the offer and set remote desc, then do nothing more (ICE will connect)
        //   - If WE are the callee/acceptor who sent this webInitiated offer → this is our own packet bouncing back, ignore
        //   - If WE are a third party → ignore (packet.to !== nodeId, already filtered above)
        //
        // The key distinction: the CALLER has currentCallPeer set to packet.from.
        // The ACCEPTOR sent this packet, so they won't receive it (it's addressed to the caller).
        if (packet.payload?.webInitiated && packet.payload?.answer) {
          // WE are the original caller — accept the offer from the acceptor
          if (currentCallPeer.current === packet.from) {
            console.log("[CALL] webInitiated: we are caller, setting remote description from acceptor's offer");
            (async () => {
              try {
                // Create PC if not already created (caller may not have PC if they sent nativeOnly)
                const pc = pcRef.current ?? createCallPC(packet.from);
                if (!pcRef.current) pcRef.current = pc;

                // Add local tracks before setRemoteDescription so our answer includes media
                if (!localStreamRef.current) {
                  const stream = await getMedia(incomingCall?.video ?? false);
                  if (stream) {
                    localStreamRef.current = stream;
                    setLocalStream(stream);
                    stream.getTracks().forEach(t => { pc.addTrack(t, stream); console.log("[CALL] caller addTrack", t.kind); });
                  }
                }

                await pc.setRemoteDescription(packet.payload.answer);
                console.log("[CALL] webInitiated caller setRemoteDescription ok, signalingState:", pc.signalingState);

                // Flush buffered ICE candidates
                const buffered = [...iceBuffer.current]; iceBuffer.current = [];
                console.log("[CALL] webInitiated flushing", buffered.length, "buffered ICE");
                for (const c of buffered) { try { await pc.addIceCandidate(c); } catch {} }

                // Now create our answer to the acceptor's offer
                const callerAnswer = await pc.createAnswer({ offerToReceiveAudio: true, offerToReceiveVideo: false } as any);
                const patchedAnswer = { ...callerAnswer, sdp: _patchSdpForResilience(callerAnswer.sdp ?? "") };
                await pc.setLocalDescription(patchedAnswer);
                meshSend({ id: generateId(), type: "CALL_ANSWER", from: nodeId, to: packet.from, ttl: 7, visited: [],
                  payload: { callId: currentCallId.current, answer: patchedAnswer }, ts: Date.now() });
                console.log("[CALL] webInitiated caller answer sent back");
              } catch (err) {
                console.error("[CALL] webInitiated caller answer failed:", err);
                cleanupCall();
              }
            })();
          } else {
            // WE are the acceptor receiving our own reflected packet — or something unexpected.
            // If pcRef exists and signalingState is have-local-offer, this is the final answer from caller.
            if (pcRef.current && pcRef.current.signalingState === "have-local-offer") {
              console.log("[CALL] webInitiated: receiving final answer from caller");
              pcRef.current.setRemoteDescription(packet.payload.answer)
                .then(async () => {
                  const candidates = [...iceBuffer.current]; iceBuffer.current = [];
                  for (const c of candidates) { try { await pcRef.current?.addIceCandidate(c); } catch {} }
                })
                .catch((e) => console.error("[CALL_ANSWER] final answer setRemoteDescription failed:", e));
            } else {
              console.log("[CALL] webInitiated: unexpected state, ignoring. signalingState:", pcRef.current?.signalingState);
            }
          }
          break;
        }

        if (packet.payload?.nativeOnly || !packet.payload?.answer) {
          setCallState("connected");
          break;
        }
        if (pcRef.current) {
          pcRef.current.setRemoteDescription(packet.payload.answer)
            .then(async () => {
              console.log("[CALL] setRemoteDescription(answer) ok, signalingState:", pcRef.current?.signalingState);
              const candidates = [...iceBuffer.current];
              iceBuffer.current = [];
              console.log("[CALL] flushing", candidates.length, "buffered ICE candidates");
              for (const c of candidates) {
                try { await pcRef.current?.addIceCandidate(c); } catch (e) { console.warn("[ICE] flush failed:", e); }
              }
            })
            .catch((e) => console.error("[CALL_ANSWER] setRemoteDescription failed:", e));
        } else {
          console.error("[CALL_ANSWER] pcRef is null!");
        }
        break;
      case "CALL_ICE": {
        const candidate = packet.payload?.candidate;
        if (!candidate) break;
        console.log("[ICE] remote candidate, type:", candidate.type, "hasRemoteDesc:", !!pcRef.current?.remoteDescription);
        if (pcRef.current?.remoteDescription) {
          try { await pcRef.current.addIceCandidate(candidate); } catch (e) { console.warn("[ICE] addCandidate failed:", e); }
        } else {
          iceBuffer.current.push(candidate);
          console.log("[ICE] buffered, total:", iceBuffer.current.length);
        }
        break;
      }
      case "CALL_REJECT": case "CALL_END": cleanupCall(); break;

      case "PING":
        // WS ping from server
        if (packet.from && packet.from !== nodeId) {
          // DC ping from peer — respond with PONG
          sendPacket(packet.from, { type: "PONG", from: nodeId, to: packet.from, ts: packet.ts, ttl: 2, visited: [], id: generateId() });
        } else {
          wsSend({ type: "PONG", ts: Date.now() });
        }
        break;
      case "PONG":
        if (packet.from && packet.from !== nodeId) {
          // DC pong from peer — measure latency and update lastSeen
          const pingStart = peerPingStart.current.get(packet.from);
          if (pingStart) {
            const latency = Date.now() - pingStart;
            peerLastPong.current.set(packet.from, Date.now());
            updatePeerScore(packet.from, { latency, stable: true, lastPong: Date.now() });
          }
          // #31 - update lastSeen on pong
          setNodes(prev => prev.map(n => n.nodeId === packet.from ? { ...n, lastSeen: Date.now() } : n));
        } else {
          setRtt(Date.now() - pingTs.current);
        }
        break;
      case "TYPING":
        if (packet.from && packet.from !== nodeId) {
          setTypingPeers(prev => { const s = new Set(prev); s.add(packet.from); return s; });
          setTimeout(() => setTypingPeers(prev => { const s = new Set(prev); s.delete(packet.from); return s; }), 3000);
        }
        break;
    }
  };

  handlePacketRef.current = handlePacket;

  // ─── WebSocket ─────────────────────────────────────────────────────────────
  const connect = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    setStatus("connecting");
    let socket: WebSocket;
    try { socket = new WebSocket(getCurrentSignalingUrl()); } catch { scheduleReconnect(); return; }
    wsRef.current = socket;
    socket.onopen = () => {
      reconnectAttempts.current = 0; setStatus("connected");
      socket.send(JSON.stringify({ type: "REGISTER", nodeId, alias, publicKey: _ecdhKeys.pub || "" }));
      const iv = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) { pingTs.current = Date.now(); socket.send(JSON.stringify({ type: "PING", ts: Date.now() })); }
        else clearInterval(iv);
      }, 5000);
    };
    socket.onmessage = (e) => { try { handlePacketRef.current(JSON.parse(e.data)); } catch {} };
    socket.onclose   = () => { setStatus("disconnected"); scheduleReconnect(); };
    socket.onerror   = () => {};
  };

  const scheduleReconnect = () => {
    if (reconnectTimer.current) return;
    const d = Math.min(1000 * Math.pow(2, reconnectAttempts.current++), 30000);
    setStatus("reconnecting");
    reconnectTimer.current = setTimeout(() => { reconnectTimer.current = null; connect(); }, d);
  };

  useEffect(() => {
    connect();

    // Reconnect immediately on network change (handles Wi-Fi→cellular, etc.)
    const handleOnline  = () => {
      if (wsRef.current?.readyState !== WebSocket.OPEN) {
        if (reconnectTimer.current) { clearTimeout(reconnectTimer.current); reconnectTimer.current = null; }
        reconnectAttempts.current = 0; connect();
      }
      // Restart ICE on all active DataChannel PCs (handles WiFi → LTE switch)
      dataPCs.current.forEach(pc => {
        if (pc.connectionState === "connected" || pc.connectionState === "connecting") {
          try { pc.restartIce?.(); } catch {}
        }
      });
      // Restart call PC if active
      if (pcRef.current) {
        try { pcRef.current.restartIce?.(); } catch {}
      }
    };
    const handleOffline = () => { setStatus("disconnected"); };
    if (typeof window !== "undefined") {
      window.addEventListener("online",  handleOnline);
      window.addEventListener("offline", handleOffline);
    }

    return () => {
      wsRef.current?.close();
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (statsIntervalRef.current) clearInterval(statsIntervalRef.current);
      outbound.current.forEach(t => t.retryTimers.forEach(clearTimeout));
      msgQueue.current.forEach(qm => { if (qm.timer) clearTimeout(qm.timer); });
      dataPCs.current.forEach(pc => pc.close());
      if (typeof window !== "undefined") {
        window.removeEventListener("online",  handleOnline);
        window.removeEventListener("offline", handleOffline);
      }
    };
  }, []);

  return (
    <MeshContext.Provider value={{
      nodeId, alias, status, nodes, rtt,
      selectedPeer, setSelectedPeer,
      messages, sendMessage, sendFile, sendFileNative,
      fileProgress, groupMessages, sendGroupMessage,
      callState, incomingCall, localStream, remoteStream,
      startCall, acceptCall, endCall,
      callError,
      p2pStatus,
      callMetrics,
      activeCandidateType,
      peerTrust,
      myFingerprint,
      networkSettings,
      setNetworkSettings: updateNetworkSettings,
      peerScores,
      typingPeers,
      sendTyping,
      connectionMode,
      pauseFileTransfer,
      resumeFileTransfer,
      meshRoutes,
      peerLatencyHistory,
      relayFallbackActive,
      setServerIp: (ip: string) => {
        _memStore.set("hex_server_ip", ip);
        // Force reconnect with new IP
        wsRef.current?.close();
        if (reconnectTimer.current) { clearTimeout(reconnectTimer.current); reconnectTimer.current = null; }
        reconnectAttempts.current = 0;
        setTimeout(() => connect(), 300);
      },
      currentServerIp: _memStore.get("hex_server_ip") ?? "192.168.1.35",
    }}>
      {children}
    </MeshContext.Provider>
  );
}
