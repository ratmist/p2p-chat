/**
 * HexMesh React Hooks
 * Drop these into your existing components to wire up real P2P logic
 *
 * Usage:
 *   const { nodes, isConnected, rtt } = useMesh(SIGNALING_URL, 'MyAlias');
 *   const { messages, sendMessage } = useMessages(client, peerId);
 *   const { sendFile, transfers } = useFileTransfer(client, peerId);
 *   const { callState, startCall, acceptCall, endCall } = useCall(client);
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { MeshClient, type NodeInfo, type Message, type CallState } from './MeshClient';

// ─── Config ──────────────────────────────────────────────────────────────────

// Change this to your signaling server IP when running on LAN
// e.g. 'ws://192.168.1.100:8080'
export const SIGNALING_URL =
  typeof window !== 'undefined' && window.location.hostname !== 'localhost'
    ? `ws://${window.location.hostname}:8080`
    : 'ws://localhost:8080';

// ─── useMesh ─────────────────────────────────────────────────────────────────

export type MeshStatus = 'connecting' | 'connected' | 'disconnected' | 'reconnecting';

export function useMesh(signalingUrl = SIGNALING_URL, alias: string) {
  const clientRef = useRef<MeshClient | null>(null);
  const [status, setStatus] = useState<MeshStatus>('connecting');
  const [nodes, setNodes] = useState<NodeInfo[]>([]);
  const [rtt, setRtt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const client = new MeshClient(signalingUrl, alias);
    clientRef.current = client;

    client.on('connecting',    () => setStatus('connecting'));
    client.on('connected',     () => { setStatus('connected'); setError(null); });
    client.on('disconnected',  () => setStatus('disconnected'));
    client.on('reconnecting',  () => setStatus('reconnecting'));
    client.on('nodes',         (list: NodeInfo[]) => setNodes(list));
    client.on('rtt',           (ms: number) => setRtt(ms));
    client.on('error',         (code: string) => setError(code));

    client.init().catch(err => setError(err.message));

    return () => { client.destroy(); };
  }, [signalingUrl, alias]);

  const connectPeer = useCallback((nodeId: string) => {
    clientRef.current?.connectPeer(nodeId);
  }, []);

  return {
    client: clientRef.current,
    status,
    nodes,
    rtt,
    error,
    isConnected: status === 'connected',
    connectPeer,
    getMetrics: () => clientRef.current?.getMetrics() ?? null,
  };
}

// ─── useMessages ─────────────────────────────────────────────────────────────

export function useMessages(client: MeshClient | null, peerId: string | null) {
  const [messages, setMessages] = useState<Message[]>([]);

  useEffect(() => {
    if (!client) return;

    const onMessage = (packet: any) => {
      if (peerId && packet.from !== peerId && packet.to !== peerId) return;
      setMessages(prev => {
        if (prev.some(m => m.id === packet.id)) return prev;
        return [...prev, {
          id: packet.id,
          from: packet.from,
          to: packet.to,
          text: (packet.payload as any)?.text ?? '',
          ts: packet.ts,
          status: 'delivered',
        }];
      });
    };

    const onAck = (packetId: string) => {
      setMessages(prev => prev.map(m =>
        m.id === packetId ? { ...m, status: 'delivered' } : m,
      ));
    };

    const onFailed = (packetId: string) => {
      setMessages(prev => prev.map(m =>
        m.id === packetId ? { ...m, status: 'failed' } : m,
      ));
    };

    client.on('message', onMessage);
    client.on('ack', onAck);
    client.on('message:failed', onFailed);

    return () => {
      client.off('message', onMessage);
      client.off('ack', onAck);
      client.off('message:failed', onFailed);
    };
  }, [client, peerId]);

  const sendMessage = useCallback(async (text: string) => {
    if (!client || !peerId || !text.trim()) return null;

    const optimisticId = crypto.randomUUID();

    // Optimistic add
    setMessages(prev => [...prev, {
      id: optimisticId,
      from: client.getNodeId(),
      to: peerId,
      text,
      ts: Date.now(),
      status: 'sending',
    }]);

    const actualId = await client.sendMessage(peerId, text);

    // Replace optimistic with real ID
    setMessages(prev => prev.map(m =>
      m.id === optimisticId ? { ...m, id: actualId, status: 'sent' } : m,
    ));

    return actualId;
  }, [client, peerId]);

  return { messages, sendMessage };
}

// ─── useFileTransfer ─────────────────────────────────────────────────────────

export type TransferInfo = {
  transferId: string;
  fileName: string;
  fileSize: number;
  progress: number;
  direction: 'sending' | 'receiving';
  status: 'transferring' | 'done' | 'failed' | 'paused';
  blob?: Blob;
};

export function useFileTransfer(client: MeshClient | null, peerId: string | null) {
  const [transfers, setTransfers] = useState<Map<string, TransferInfo>>(new Map());

  useEffect(() => {
    if (!client) return;

    const update = (id: string, patch: Partial<TransferInfo>) => {
      setTransfers(prev => {
        const next = new Map(prev);
        const existing = next.get(id);
        if (existing) next.set(id, { ...existing, ...patch });
        return next;
      });
    };

    const onIncoming = ({ transferId, fileName, fileSize }: any) => {
      setTransfers(prev => {
        const next = new Map(prev);
        next.set(transferId, { transferId, fileName, fileSize, progress: 0, direction: 'receiving', status: 'transferring' });
        return next;
      });
    };

    const onReceiveProgress = ({ transferId, progress }: any) => update(transferId, { progress });
    const onSendProgress    = ({ transferId, progress }: any) => update(transferId, { progress });
    const onDone = ({ transferId, blob, fileName }: any) => update(transferId, { status: 'done', blob, progress: 100 });
    const onFail = (transferId: string) => update(transferId, { status: 'failed' });
    const onPaused = (transferId: string) => update(transferId, { status: 'paused' });
    const onResumed = (transferId: string) => update(transferId, { status: 'transferring' });

    client.on('file:incoming',        onIncoming);
    client.on('file:receive:progress', onReceiveProgress);
    client.on('file:send:progress',    onSendProgress);
    client.on('file:done',             onDone);
    client.on('file:integrity:fail',   onFail);
    client.on('file:paused',           onPaused);
    client.on('file:resumed',          onResumed);

    return () => {
      client.off('file:incoming',        onIncoming);
      client.off('file:receive:progress', onReceiveProgress);
      client.off('file:send:progress',    onSendProgress);
      client.off('file:done',             onDone);
      client.off('file:integrity:fail',   onFail);
      client.off('file:paused',           onPaused);
      client.off('file:resumed',          onResumed);
    };
  }, [client]);

  const sendFile = useCallback(async (file: File) => {
    if (!client || !peerId) return;
    const transferId = await client.sendFile(peerId, file);
    setTransfers(prev => {
      const next = new Map(prev);
      next.set(transferId, {
        transferId,
        fileName: file.name,
        fileSize: file.size,
        progress: 0,
        direction: 'sending',
        status: 'transferring',
      });
      return next;
    });
    return transferId;
  }, [client, peerId]);

  const pauseFile = useCallback((transferId: string) => {
    client?.pauseFile(transferId);
  }, [client]);

  const resumeFile = useCallback((transferId: string) => {
    client?.resumeFile(transferId);
  }, [client]);

  return { transfers, sendFile, pauseFile, resumeFile };
}

// ─── useCall ─────────────────────────────────────────────────────────────────

export type IncomingCall = { from: string; peerId: string; video: boolean };

export function useCall(client: MeshClient | null) {
  const [callState, setCallState] = useState<CallState>('idle');
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [activePeer, setActivePeer] = useState<string | null>(null);
  const [callDuration, setCallDuration] = useState(0);
  const durationTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!client) return;

    const onState = (state: CallState) => {
      setCallState(state);
      if (state === 'connected') {
        durationTimer.current = setInterval(() => setCallDuration(d => d + 1), 1000);
      } else if (state === 'idle' || state === 'ended') {
        if (durationTimer.current) clearInterval(durationTimer.current);
        setCallDuration(0);
      }
    };

    const onInvite = (packet: any) => {
      setIncomingCall({ from: packet.from, peerId: packet.from, video: packet.payload?.video ?? false });
    };

    const onStream = ({ peerId, stream }: any) => {
      setRemoteStream(stream);
      setActivePeer(peerId);
    };

    const onEnded = () => {
      setLocalStream(null);
      setRemoteStream(null);
      setActivePeer(null);
      setIncomingCall(null);
      if (durationTimer.current) clearInterval(durationTimer.current);
      setCallDuration(0);
    };

    client.on('call:state',   onState);
    client.on('call:invite',  onInvite);
    client.on('call:stream',  onStream);
    client.on('call:ended',   onEnded);

    return () => {
      client.off('call:state',  onState);
      client.off('call:invite', onInvite);
      client.off('call:stream', onStream);
      client.off('call:ended',  onEnded);
      if (durationTimer.current) clearInterval(durationTimer.current);
    };
  }, [client]);

  const startCall = useCallback(async (peerId: string, video = false) => {
    if (!client) return;
    await client.startCall(peerId, video);
    setActivePeer(peerId);
    setLocalStream(client.getLocalStream());
  }, [client]);

  const acceptCall = useCallback(async (video = false) => {
    if (!client || !incomingCall) return;
    const stream = await client.acceptCall(incomingCall.peerId, video);
    setLocalStream(stream);
    setActivePeer(incomingCall.peerId);
    setIncomingCall(null);
  }, [client, incomingCall]);

  const endCall = useCallback(() => {
    client?.endCall();
  }, [client]);

  const rejectCall = useCallback(() => {
    setIncomingCall(null);
    // Optionally send reject packet
  }, []);

  return {
    callState,
    localStream,
    remoteStream,
    incomingCall,
    activePeer,
    callDuration,
    startCall,
    acceptCall,
    endCall,
    rejectCall,
  };
}

// ─── usePeerConnection ────────────────────────────────────────────────────────

export function usePeerConnection(client: MeshClient | null) {
  const [peerStates, setPeerStates] = useState<Map<string, RTCPeerConnectionState>>(new Map());
  const [connectedPeers, setConnectedPeers] = useState<string[]>([]);

  useEffect(() => {
    if (!client) return;

    const onPeerState = ({ peerId, state }: { peerId: string; state: RTCPeerConnectionState }) => {
      setPeerStates(prev => { const n = new Map(prev); n.set(peerId, state); return n; });
    };

    const onConnected = (peerId: string) => {
      setConnectedPeers(prev => [...new Set([...prev, peerId])]);
    };

    client.on('peer:state',     onPeerState);
    client.on('peer:connected', onConnected);

    return () => {
      client.off('peer:state',     onPeerState);
      client.off('peer:connected', onConnected);
    };
  }, [client]);

  return { peerStates, connectedPeers };
}
