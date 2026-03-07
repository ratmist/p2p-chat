/**
 * HexMesh Client Core
 * Handles: WebSocket signaling, WebRTC P2P, multihop relay,
 *          message queue, ACK/retry, file transfer, voice calls
 */

import { EventEmitter } from 'eventemitter3';
import { generateKeyPair, sign, verify, exportKey, importKey } from './crypto';

// ─── Types ───────────────────────────────────────────────────────────────────

export type NodeInfo = {
  nodeId: string;
  alias: string;
  publicKey: string;
  lastSeen: number;
};

export type HexPacket = {
  id: string;
  type: string;
  from: string;
  to: string;
  ttl: number;
  visited: string[];
  payload: unknown;
  sig?: string;
  ts: number;
};

export type Message = {
  id: string;
  from: string;
  to: string;
  text: string;
  ts: number;
  status: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
};

export type FileTransfer = {
  transferId: string;
  fileName: string;
  fileSize: number;
  totalChunks: number;
  receivedChunks: Map<number, Uint8Array>;
  sha256: string;
  status: 'pending' | 'transferring' | 'paused' | 'done' | 'failed';
  progress: number;
};

export type CallState = 'idle' | 'calling' | 'ringing' | 'connected' | 'ended';

// ─── Constants ───────────────────────────────────────────────────────────────

const CHUNK_SIZE = 64 * 1024; // 64KB
const MAX_RETRIES = 5;
const RETRY_BASE_MS = 500;
const ACK_TIMEOUT = 10_000;
const MAX_TTL = 7;
const RECONNECT_BASE_MS = 1_000;
const MAX_RECONNECT_MS = 30_000;
const CHUNK_ACK_TIMEOUT = 8_000;   // ms to wait for FILE_ACK before retry
const CHUNK_MAX_RETRIES = 4;        // max retries per chunk
const MAX_PARALLEL_TRANSFERS = 3;   // semaphore: concurrent sendFile() calls

// ─── MeshClient ──────────────────────────────────────────────────────────────

export class MeshClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private nodeId: string;
  private alias: string;
  private publicKey: CryptoKey | null = null;
  private privateKey: CryptoKey | null = null;
  private publicKeyB64 = '';

  private signalingUrl: string;
  private peers: Map<string, RTCPeerConnection> = new Map();
  private dataChannels: Map<string, RTCDataChannel> = new Map();
  private pendingCandidates: Map<string, RTCIceCandidateInit[]> = new Map();

  private nodes: Map<string, NodeInfo> = new Map();
  private messageQueue: Map<string, { packet: HexPacket; retries: number; timer: ReturnType<typeof setTimeout> }> = new Map();

  private fileTransfers: Map<string, FileTransfer> = new Map();

  // Tracks pending chunk ACKs for retry: key = `${transferId}:${index}`
  private pendingChunks: Map<string, {
    packet: HexPacket; retries: number; timer: ReturnType<typeof setTimeout>;
  }> = new Map();

  // Outbound file bytes keyed by transferId (needed for resume/retry)
  private outboundFiles: Map<string, { to: string; bytes: Uint8Array; sha256: string; fileName: string; fileSize: number; mimeType: string }> = new Map();

  // Semaphore for parallel sendFile() calls
  private activeTransfers = 0;

  private localStream: MediaStream | null = null;
  private peerStreams: Map<string, MediaStream> = new Map();
  private callState: CallState = 'idle';
  private activeCallPeer: string | null = null;

  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;

  // Metrics
  private metrics = {
    messagesSent: 0,
    messagesReceived: 0,
    bytesSent: 0,
    bytesReceived: 0,
    packetsDropped: 0,
    rtt: 0,
    lastPingTs: 0,
  };

  constructor(signalingUrl: string, alias: string) {
    super();
    this.signalingUrl = signalingUrl;
    this.alias = alias;
    this.nodeId = this.generateNodeId();
  }

  // ─── Init ───────────────────────────────────────────────────────────────

  async init() {
    // Generate Ed25519 keypair for identity
    const { publicKey, privateKey, publicKeyB64 } = await generateKeyPair();
    this.publicKey = publicKey;
    this.privateKey = privateKey;
    this.publicKeyB64 = publicKeyB64;

    this.connect();
  }

  // ─── WebSocket ──────────────────────────────────────────────────────────

  private connect() {
    if (this.destroyed) return;
    this.emit('connecting');

    try {
      this.ws = new WebSocket(this.signalingUrl);
    } catch (e) {
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.register();
      this.startPing();
      this.emit('connected');
    };

    this.ws.onmessage = (event) => {
      try {
        const packet = JSON.parse(event.data);
        this.handleServerMessage(packet);
      } catch (e) {
        console.error('[MeshClient] parse error', e);
      }
    };

    this.ws.onclose = () => {
      this.emit('disconnected');
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      // onclose fires after onerror, no need to double-handle
    };
  }

  private register() {
    this.wsSend({
      type: 'REGISTER',
      nodeId: this.nodeId,
      alias: this.alias,
      publicKey: this.publicKeyB64,
    });
  }

  private wsSend(data: object) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  private scheduleReconnect() {
    if (this.destroyed || this.reconnectTimer) return;
    const delay = Math.min(
      RECONNECT_BASE_MS * Math.pow(2, this.reconnectAttempts),
      MAX_RECONNECT_MS,
    );
    this.reconnectAttempts++;
    this.emit('reconnecting', { attempt: this.reconnectAttempts, delay });
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  // ─── Server message handler ─────────────────────────────────────────────

  private handleServerMessage(packet: Record<string, any>) {
    switch (packet.type) {
      case 'REGISTERED':
        this.wsSend({ type: 'GET_NODES' });
        break;

      case 'NODE_LIST':
        packet.nodes?.forEach((n: NodeInfo) => this.nodes.set(n.nodeId, n));
        this.emit('nodes', [...this.nodes.values()]);
        break;

      case 'NODE_JOINED':
        this.nodes.set(packet.nodeId, packet as NodeInfo);
        this.emit('node:joined', packet as NodeInfo);
        this.emit('nodes', [...this.nodes.values()]);
        break;

      case 'NODE_LEFT':
        this.nodes.delete(packet.nodeId);
        this.handlePeerDisconnect(packet.nodeId);
        this.emit('node:left', packet.nodeId);
        this.emit('nodes', [...this.nodes.values()]);
        break;

      case 'OFFER':
        this.handleOffer(packet);
        break;

      case 'ANSWER':
        this.handleAnswer(packet);
        break;

      case 'ICE_CANDIDATE':
        this.handleIceCandidate(packet);
        break;

      // Relayed app packets from server (fallback / multihop)
      case 'MSG':
      case 'FILE_CHUNK':
      case 'FILE_META':
      case 'FILE_ACK':
      case 'ACK':
      case 'CALL_INVITE':
      case 'CALL_ACCEPT':
      case 'CALL_REJECT':
      case 'CALL_END':
        this.handleAppPacket(packet as HexPacket);
        break;

      case 'PONG':
        this.metrics.rtt = Date.now() - this.metrics.lastPingTs;
        this.emit('rtt', this.metrics.rtt);
        break;

      case 'ERROR':
        this.emit('error', packet.code);
        break;
    }
  }

  // ─── WebRTC ──────────────────────────────────────────────────────────────

  async connectPeer(targetNodeId: string): Promise<void> {
    if (this.peers.has(targetNodeId)) return;

    const pc = this.createPeerConnection(targetNodeId);
    const dc = pc.createDataChannel('hex', { ordered: true });
    this.setupDataChannel(dc, targetNodeId);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    this.wsSend({
      type: 'OFFER',
      from: this.nodeId,
      to: targetNodeId,
      sdp: offer.sdp,
    });
  }

  private createPeerConnection(peerId: string): RTCPeerConnection {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    });

    this.peers.set(peerId, pc);

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        this.wsSend({
          type: 'ICE_CANDIDATE',
          from: this.nodeId,
          to: peerId,
          candidate: candidate.toJSON(),
        });
      }
    };

    pc.onconnectionstatechange = () => {
      this.emit('peer:state', { peerId, state: pc.connectionState });
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        this.handlePeerDisconnect(peerId);
      }
      if (pc.connectionState === 'connected') {
        this.emit('peer:connected', peerId);
      }
    };

    pc.ondatachannel = (event) => {
      this.setupDataChannel(event.channel, peerId);
    };

    pc.ontrack = (event) => {
      this.peerStreams.set(peerId, event.streams[0]);
      this.emit('call:stream', { peerId, stream: event.streams[0] });
    };

    return pc;
  }

  private setupDataChannel(dc: RTCDataChannel, peerId: string) {
    this.dataChannels.set(peerId, dc);

    dc.onopen = () => {
      this.emit('datachannel:open', peerId);
      // Flush queued messages
      for (const [id, item] of this.messageQueue) {
        if (item.packet.to === peerId) this.deliverViaDC(peerId, item.packet);
      }
    };

    dc.onmessage = async (event) => {
      try {
        const packet = JSON.parse(event.data) as HexPacket;
        // Verify signature if present
        if (packet.sig && packet.from) {
          const senderInfo = this.nodes.get(packet.from);
          if (senderInfo?.publicKey) {
            const { verify, importKey } = await import('./crypto');
            try {
              const pubKey = await importKey(senderInfo.publicKey);
              const payload = JSON.stringify({ id: packet.id, type: packet.type, from: packet.from, to: packet.to, ts: packet.ts, payload: packet.payload });
              const valid = await verify(pubKey, payload, packet.sig);
              if (!valid) {
                console.warn('[MeshClient] Signature verification failed, dropping packet', packet.id);
                this.metrics.packetsDropped++;
                return;
              }
            } catch {
              // importKey fails for unknown keys — allow through (no key pinning yet)
            }
          }
        }
        this.handleAppPacket(packet);
      } catch (e) {
        console.error('[DataChannel] parse error', e);
      }
    };

    dc.onclose = () => {
      this.dataChannels.delete(peerId);
    };
  }

  private async handleOffer(packet: Record<string, any>) {
    const { from, sdp } = packet;
    const pc = this.createPeerConnection(from);

    await pc.setRemoteDescription({ type: 'offer', sdp });
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    // Apply buffered candidates
    const buffered = this.pendingCandidates.get(from) || [];
    for (const c of buffered) await pc.addIceCandidate(c);
    this.pendingCandidates.delete(from);

    this.wsSend({ type: 'ANSWER', from: this.nodeId, to: from, sdp: answer.sdp });
  }

  private async handleAnswer(packet: Record<string, any>) {
    const pc = this.peers.get(packet.from);
    if (!pc) return;
    await pc.setRemoteDescription({ type: 'answer', sdp: packet.sdp });

    const buffered = this.pendingCandidates.get(packet.from) || [];
    for (const c of buffered) await pc.addIceCandidate(c);
    this.pendingCandidates.delete(packet.from);
  }

  private async handleIceCandidate(packet: Record<string, any>) {
    const pc = this.peers.get(packet.from);
    if (!pc || !pc.remoteDescription) {
      const buf = this.pendingCandidates.get(packet.from) || [];
      buf.push(packet.candidate);
      this.pendingCandidates.set(packet.from, buf);
      return;
    }
    await pc.addIceCandidate(packet.candidate);
  }

  private handlePeerDisconnect(peerId: string) {
    this.peers.get(peerId)?.close();
    this.peers.delete(peerId);
    this.dataChannels.delete(peerId);
    this.peerStreams.delete(peerId);
    if (this.activeCallPeer === peerId) {
      this.callState = 'ended';
      this.activeCallPeer = null;
      this.emit('call:ended', peerId);
    }
  }

  // ─── Multihop forwarding ────────────────────────────────────────────────

  /**
   * If a packet is not addressed to us, forward it to the next reachable peer
   * that is not already in the visited list. Returns true if forwarded (and the
   * caller should NOT process the packet locally).
   */
  private forwardPacket(packet: HexPacket): boolean {
    if (packet.to === this.nodeId || packet.to === 'broadcast') return false;
    if (packet.ttl <= 0) {
      this.metrics.packetsDropped++;
      return true; // drop, but don't process
    }

    const forwarded: HexPacket = {
      ...packet,
      ttl: packet.ttl - 1,
      visited: [...packet.visited, this.nodeId],
    };

    // Try direct DataChannel to recipient first
    if (this.deliverViaDC(packet.to as string, forwarded)) return true;

    // Otherwise spray to all connected peers not in visited
    let relayed = 0;
    for (const [peerId] of this.dataChannels) {
      if (!forwarded.visited.includes(peerId)) {
        this.deliverViaDC(peerId, forwarded);
        relayed++;
      }
    }

    // If no DataChannel available, fall back to signaling server relay
    if (relayed === 0) this.wsSend(forwarded);

    return true;
  }

  // ─── App packet handler ─────────────────────────────────────────────────

  private handleAppPacket(packet: HexPacket) {
    // Multihop: if this packet is not for us, forward it and stop
    if (packet.to && packet.to !== this.nodeId && packet.to !== 'broadcast') {
      this.forwardPacket(packet);
      return;
    }

    switch (packet.type) {
      case 'MSG':
        this.metrics.messagesReceived++;
        this.emit('message', packet);
        // Send ACK
        this.sendAck(packet.from, packet.id);
        break;

      case 'ACK':
        this.clearAckTimer(packet.payload as string);
        this.emit('ack', packet.payload);
        break;

      case 'FILE_META':
        this.initFileReceive(packet);
        break;

      case 'FILE_CHUNK':
        this.receiveChunk(packet);
        break;

      case 'FILE_ACK':
        this.clearChunkRetry((packet.payload as any)?.transferId, (packet.payload as any)?.index);
        this.emit('file:chunk:acked', packet.payload);
        break;

      case 'CALL_INVITE':
        this.emit('call:invite', packet);
        break;

      case 'CALL_ACCEPT':
        this.handleCallAccept(packet);
        break;

      case 'CALL_REJECT':
        this.callState = 'idle';
        this.emit('call:rejected', packet.from);
        break;

      case 'CALL_END':
        this.endCall();
        break;
    }
  }

  // ─── Messaging ──────────────────────────────────────────────────────────

  async sendMessage(to: string, text: string): Promise<string> {
    const packet: HexPacket = {
      id: crypto.randomUUID(),
      type: 'MSG',
      from: this.nodeId,
      to,
      ttl: MAX_TTL,
      visited: [],
      payload: { text },
      ts: Date.now(),
    };

    this.metrics.messagesSent++;
    await this.deliverPacket(to, packet);
    this.scheduleRetry(packet);
    return packet.id;
  }

  private async deliverPacket(to: string, packet: HexPacket) {
    // Sign the packet payload with our Ed25519 private key
    const signed = await this.signPacket(packet);
    // Try direct DataChannel first
    if (this.deliverViaDC(to, signed)) return;
    // Fall back to signaling relay
    this.wsSend(signed);
  }

  private async signPacket(packet: HexPacket): Promise<HexPacket> {
    if (!this.privateKey) return packet;
    try {
      const { sign } = await import('./crypto');
      const payload = JSON.stringify({ id: packet.id, type: packet.type, from: packet.from, to: packet.to, ts: packet.ts, payload: packet.payload });
      const sig = await sign(this.privateKey, payload);
      return { ...packet, sig };
    } catch {
      return packet; // non-fatal: deliver unsigned rather than drop
    }
  }

  private deliverViaDC(peerId: string, packet: HexPacket): boolean {
    const dc = this.dataChannels.get(peerId);
    if (dc?.readyState === 'open') {
      dc.send(JSON.stringify(packet));
      this.metrics.bytesSent += JSON.stringify(packet).length;
      return true;
    }
    return false;
  }

  private sendAck(to: string, packetId: string) {
    const ack: HexPacket = {
      id: crypto.randomUUID(),
      type: 'ACK',
      from: this.nodeId,
      to,
      ttl: MAX_TTL,
      visited: [],
      payload: packetId,
      ts: Date.now(),
    };
    this.deliverPacket(to, ack);
  }

  private scheduleRetry(packet: HexPacket, attempt = 0) {
    if (attempt >= MAX_RETRIES) {
      this.emit('message:failed', packet.id);
      this.messageQueue.delete(packet.id);
      return;
    }

    const delay = RETRY_BASE_MS * Math.pow(2, attempt);
    const timer = setTimeout(() => {
      if (!this.messageQueue.has(packet.id)) return; // ACK received
      this.deliverPacket(packet.to as string, packet);
      this.scheduleRetry(packet, attempt + 1);
    }, delay);

    this.messageQueue.set(packet.id, { packet, retries: attempt, timer });
  }

  private clearAckTimer(packetId: string) {
    const item = this.messageQueue.get(packetId);
    if (item) {
      clearTimeout(item.timer);
      this.messageQueue.delete(packetId);
    }
  }

  // ─── File Transfer ──────────────────────────────────────────────────────

  async sendFile(to: string, file: File): Promise<string> {
    // Semaphore: limit parallel transfers
    while (this.activeTransfers >= MAX_PARALLEL_TRANSFERS) {
      await new Promise(r => setTimeout(r, 200));
    }
    this.activeTransfers++;

    const transferId = crypto.randomUUID();
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    const sha256 = await this.sha256(bytes);
    const totalChunks = Math.ceil(bytes.length / CHUNK_SIZE);

    // Store outbound data for chunk retry
    this.outboundFiles.set(transferId, {
      to, bytes, sha256,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type,
    });

    try {
      // Send metadata
      await this.deliverPacket(to, {
        id: crypto.randomUUID(),
        type: 'FILE_META',
        from: this.nodeId,
        to,
        ttl: MAX_TTL,
        visited: [],
        payload: { transferId, fileName: file.name, fileSize: file.size, totalChunks, sha256, mimeType: file.type },
        ts: Date.now(),
      });

      // Send chunks with flow control + per-chunk retry
      for (let i = 0; i < totalChunks; i++) {
        const chunk = bytes.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
        const b64 = btoa(String.fromCharCode(...chunk));

        await this.sendChunkWithRetry(to, transferId, i, b64, totalChunks);

        const progress = ((i + 1) / totalChunks) * 100;
        this.emit('file:send:progress', { transferId, progress, index: i });

        // Throttle: small delay every 8 chunks to avoid flooding
        if (i % 8 === 0) await new Promise(r => setTimeout(r, 10));
      }
    } finally {
      this.activeTransfers--;
      // Keep outboundFiles entry briefly in case late retries need it, then clean up
      setTimeout(() => this.outboundFiles.delete(transferId), 60_000);
    }

    return transferId;
  }

  /**
   * Send a single chunk and arm a retry timer. Resolves once FILE_ACK received
   * or max retries exhausted.
   */
  private sendChunkWithRetry(
    to: string, transferId: string, index: number,
    b64: string, totalChunks: number, attempt = 0,
  ): Promise<void> {
    return new Promise((resolve) => {
      const key = `${transferId}:${index}`;

      const send = (retryAttempt: number) => {
        const packet: HexPacket = {
          id: crypto.randomUUID(),
          type: 'FILE_CHUNK',
          from: this.nodeId,
          to,
          ttl: MAX_TTL,
          visited: [],
          payload: { transferId, index, data: b64, totalChunks },
          ts: Date.now(),
        };

        this.deliverPacket(to, packet);

        const timer = setTimeout(() => {
          if (!this.pendingChunks.has(key)) return; // already acked
          if (retryAttempt >= CHUNK_MAX_RETRIES) {
            this.pendingChunks.delete(key);
            this.emit('file:chunk:failed', { transferId, index });
            resolve(); // give up on this chunk, continue transfer
            return;
          }
          send(retryAttempt + 1);
        }, CHUNK_ACK_TIMEOUT);

        // If there was a previous timer for this chunk, clear it first
        const existing = this.pendingChunks.get(key);
        if (existing) clearTimeout(existing.timer);

        this.pendingChunks.set(key, { packet, retries: retryAttempt, timer });
      };

      // Listen for ACK for this specific chunk
      const onAcked = (payload: any) => {
        if (payload?.transferId === transferId && payload?.index === index) {
          this.off('file:chunk:acked', onAcked);
          resolve();
        }
      };
      this.on('file:chunk:acked', onAcked);

      send(attempt);
    });
  }

  private clearChunkRetry(transferId: string, index: number) {
    const key = `${transferId}:${index}`;
    const item = this.pendingChunks.get(key);
    if (item) {
      clearTimeout(item.timer);
      this.pendingChunks.delete(key);
    }
  }

  private initFileReceive(packet: HexPacket) {
    const { transferId, fileName, fileSize, totalChunks, sha256 } = packet.payload as any;
    this.fileTransfers.set(transferId, {
      transferId, fileName, fileSize, totalChunks,
      receivedChunks: new Map(),
      sha256,
      status: 'transferring',
      progress: 0,
    });
    this.emit('file:incoming', { transferId, fileName, fileSize, from: packet.from });
  }

  private async receiveChunk(packet: HexPacket) {
    const { transferId, index, data, totalChunks } = packet.payload as any;
    const transfer = this.fileTransfers.get(transferId);
    if (!transfer) return;

    const bytes = Uint8Array.from(atob(data), c => c.charCodeAt(0));
    transfer.receivedChunks.set(index, bytes);

    const progress = (transfer.receivedChunks.size / totalChunks) * 100;
    transfer.progress = progress;
    this.metrics.bytesReceived += bytes.length;

    this.emit('file:receive:progress', { transferId, progress });

    // Send chunk ACK
    this.deliverPacket(packet.from, {
      id: crypto.randomUUID(),
      type: 'FILE_ACK',
      from: this.nodeId,
      to: packet.from,
      ttl: MAX_TTL,
      visited: [],
      payload: { transferId, index },
      ts: Date.now(),
    });

    // All chunks received → assemble & verify
    if (transfer.receivedChunks.size === totalChunks) {
      await this.assembleFile(transferId);
    }
  }

  private async assembleFile(transferId: string) {
    const transfer = this.fileTransfers.get(transferId);
    if (!transfer) return;

    const sorted = [...transfer.receivedChunks.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, v]) => v);

    const total = sorted.reduce((acc, c) => acc + c.length, 0);
    const assembled = new Uint8Array(total);
    let offset = 0;
    for (const chunk of sorted) {
      assembled.set(chunk, offset);
      offset += chunk.length;
    }

    const actualHash = await this.sha256(assembled);
    if (actualHash !== transfer.sha256) {
      transfer.status = 'failed';
      this.emit('file:integrity:fail', transferId);
      return;
    }

    transfer.status = 'done';
    const blob = new Blob([assembled]);
    this.emit('file:done', { transferId, blob, fileName: transfer.fileName });
  }

  private async sha256(data: Uint8Array): Promise<string> {
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  // ─── Voice Calls ────────────────────────────────────────────────────────

  async startCall(to: string, video = false): Promise<void> {
    if (this.callState !== 'idle') throw new Error('Already in a call');

    this.callState = 'calling';
    this.activeCallPeer = to;

    // 1. Create (or reuse) peer connection BEFORE getting media
    const pc = this.peers.get(to) || this.createPeerConnection(to);

    // 2. Get local stream
    this.localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video,
    });

    // 3. Add tracks so they are included in the offer SDP
    this.localStream.getTracks().forEach(track => pc.addTrack(track, this.localStream!));

    // 4. Create offer WITH tracks already added (fixes web→web call, no race condition)
    if (!this.dataChannels.has(to)) {
      const dc = pc.createDataChannel('hex', { ordered: true });
      this.setupDataChannel(dc, to);
    }
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    this.wsSend({ type: 'OFFER', from: this.nodeId, to, sdp: offer.sdp });

    await this.deliverPacket(to, {
      id: crypto.randomUUID(),
      type: 'CALL_INVITE',
      from: this.nodeId,
      to,
      ttl: MAX_TTL,
      visited: [],
      payload: { video },
      ts: Date.now(),
    });

    this.emit('call:state', this.callState);
  }

  async acceptCall(from: string, video = false): Promise<MediaStream> {
    this.callState = 'connected';
    this.activeCallPeer = from;

    // Get local stream
    this.localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video,
    });

    // Reuse existing PC (should already have remote description set from the offer)
    const pc = this.peers.get(from) || this.createPeerConnection(from);

    // Add tracks BEFORE creating answer so our media is included
    this.localStream.getTracks().forEach(track => pc.addTrack(track, this.localStream!));

    await this.deliverPacket(from, {
      id: crypto.randomUUID(),
      type: 'CALL_ACCEPT',
      from: this.nodeId,
      to: from,
      ttl: MAX_TTL,
      visited: [],
      payload: { video },
      ts: Date.now(),
    });

    this.emit('call:state', this.callState);
    return this.localStream;
  }

  private handleCallAccept(packet: HexPacket) {
    this.callState = 'connected';
    this.emit('call:accepted', packet.from);
    this.emit('call:state', this.callState);
  }

  endCall() {
    if (this.activeCallPeer) {
      this.deliverPacket(this.activeCallPeer, {
        id: crypto.randomUUID(),
        type: 'CALL_END',
        from: this.nodeId,
        to: this.activeCallPeer,
        ttl: MAX_TTL,
        visited: [],
        payload: null,
        ts: Date.now(),
      });
    }

    this.localStream?.getTracks().forEach(t => t.stop());
    this.localStream = null;
    this.callState = 'idle';
    this.activeCallPeer = null;
    this.emit('call:state', this.callState);
    this.emit('call:ended', null);
  }

  // ─── Ping / RTT ─────────────────────────────────────────────────────────

  private pingTimer: ReturnType<typeof setInterval> | null = null;

  private startPing() {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = setInterval(() => {
      this.metrics.lastPingTs = Date.now();
      this.wsSend({ type: 'PING', ts: this.metrics.lastPingTs });
    }, 5_000);
  }

  // ─── Public getters ─────────────────────────────────────────────────────

  getNodeId() { return this.nodeId; }
  getNodes() { return [...this.nodes.values()]; }
  getMetrics() { return { ...this.metrics }; }
  getCallState() { return this.callState; }
  getLocalStream() { return this.localStream; }
  getPeerStream(peerId: string) { return this.peerStreams.get(peerId) ?? null; }
  isConnected() { return this.ws?.readyState === WebSocket.OPEN; }
  getFileTransfer(transferId: string) { return this.fileTransfers.get(transferId) ?? null; }

  /**
   * Pause an outgoing file transfer. Stops pending chunk retries.
   * The transfer can be resumed with resumeFile().
   */
  pauseFile(transferId: string) {
    const outbound = this.outboundFiles.get(transferId);
    if (!outbound) return;
    // Cancel all pending chunk timers for this transfer
    for (const [key, item] of this.pendingChunks) {
      if (key.startsWith(transferId + ':')) {
        clearTimeout(item.timer);
        this.pendingChunks.delete(key);
      }
    }
    const ft = this.fileTransfers.get(transferId);
    if (ft) ft.status = 'paused';
    this.emit('file:paused', transferId);
  }

  /**
   * Resume a paused outgoing transfer by re-sending all missing chunks.
   * "Missing" = chunks for which we never received a FILE_ACK.
   */
  async resumeFile(transferId: string) {
    const outbound = this.outboundFiles.get(transferId);
    const ft = this.fileTransfers.get(transferId);
    if (!outbound || !ft || ft.status !== 'paused') return;

    ft.status = 'transferring';
    this.emit('file:resumed', transferId);

    const totalChunks = Math.ceil(outbound.bytes.length / CHUNK_SIZE);

    for (let i = 0; i < totalChunks; i++) {
      // Skip chunks already acknowledged (present in receivedChunks on receiver side;
      // on sender side we track by absence of pendingChunks key after ACK cleared it)
      const key = `${transferId}:${i}`;
      if (!this.pendingChunks.has(key)) continue; // already acked at some point

      const chunk = outbound.bytes.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
      const b64 = btoa(String.fromCharCode(...chunk));
      await this.sendChunkWithRetry(outbound.to, transferId, i, b64, totalChunks);

      const progress = ((i + 1) / totalChunks) * 100;
      this.emit('file:send:progress', { transferId, progress, index: i });
      if (i % 8 === 0) await new Promise(r => setTimeout(r, 10));
    }
  }

  // ─── Destroy ────────────────────────────────────────────────────────────

  destroy() {
    this.destroyed = true;
    if (this.pingTimer) clearInterval(this.pingTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.messageQueue.forEach(item => clearTimeout(item.timer));
    this.pendingChunks.forEach(item => clearTimeout(item.timer));
    this.outboundFiles.clear();
    this.peers.forEach(pc => pc.close());
    this.ws?.close();
    this.removeAllListeners();
  }

  // ─── Private helpers ────────────────────────────────────────────────────

  private generateNodeId(): string {
    const arr = new Uint8Array(8);
    crypto.getRandomValues(arr);
    return 'node-' + Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
  }
}
