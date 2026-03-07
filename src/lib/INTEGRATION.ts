/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║          HexMesh — Integration Guide for Existing UI         ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * Replace mock data in each screen with real mesh hooks.
 * Copy the relevant snippets below into your .web.tsx files.
 */

// ─────────────────────────────────────────────────────────────────────────────
// 1. AppInner.tsx — Add global MeshContext
// ─────────────────────────────────────────────────────────────────────────────

import React, { createContext, useContext } from 'react';
import { useMesh, useCall, SIGNALING_URL } from '../hooks/useMesh';
import type { MeshClient, NodeInfo } from '../lib/MeshClient';

type MeshContextType = {
  client: MeshClient | null;
  status: string;
  nodes: NodeInfo[];
  rtt: number | null;
  selectedPeer: string | null;
  setSelectedPeer: (id: string | null) => void;
  call: ReturnType<typeof useCall>;
};

export const MeshContext = createContext<MeshContextType>({} as MeshContextType);
export const useMeshContext = () => useContext(MeshContext);

// In AppInner.tsx, wrap with:
//
// export default function App() {
//   const [alias, setAlias] = useState(() => localStorage.getItem('hex-alias') || 'User-' + Math.random().toString(36).slice(2, 6).toUpperCase());
//   const [selectedPeer, setSelectedPeer] = useState<string | null>(null);
//   const { client, status, nodes, rtt } = useMesh(SIGNALING_URL, alias);
//   const call = useCall(client);
//
//   return (
//     <MeshContext.Provider value={{ client, status, nodes, rtt, selectedPeer, setSelectedPeer, call }}>
//       <View style={styles.root}>
//         ... existing screens ...
//       </View>
//     </MeshContext.Provider>
//   );
// }


// ─────────────────────────────────────────────────────────────────────────────
// 2. DeviceDiscoveryScreen.web.tsx — Replace mockDevices
// ─────────────────────────────────────────────────────────────────────────────

// Replace the mockDevices array and add this to the component:
//
// const { nodes, status, rtt } = useMeshContext();
// const scanning = status === 'connecting' || status === 'reconnecting';
//
// const devices = nodes.map(n => ({
//   id: n.nodeId,
//   name: n.alias,
//   signalStrength: rtt ? Math.max(10, 100 - rtt) : 80,
//   status: 'available' as const,
//   distance: rtt ? `~${rtt}ms` : '?ms',
// }));
//
// On device click:
// onClick={() => { setSelectedPeer(node.nodeId); connectPeer(node.nodeId); onNavigate('chat'); }}


// ─────────────────────────────────────────────────────────────────────────────
// 3. ChatScreen.web.tsx — Real messages
// ─────────────────────────────────────────────────────────────────────────────

// Add at top of component:
//
// const { client, selectedPeer } = useMeshContext();
// const { messages, sendMessage } = useMessages(client, selectedPeer);
//
// Replace mockMessages with messages
// Replace the send button handler:
//
// const handleSend = async () => {
//   if (!message.trim()) return;
//   await sendMessage(message);
//   setMessage('');
// };
//
// Also handle Enter key:
// onKeyDown={(e) => e.key === 'Enter' && handleSend()}
//
// For file attach button:
// const { sendFile } = useFileTransfer(client, selectedPeer);
// <input type="file" onChange={(e) => e.target.files?.[0] && sendFile(e.target.files[0])} />


// ─────────────────────────────────────────────────────────────────────────────
// 4. CallScreen.web.tsx — Real WebRTC call
// ─────────────────────────────────────────────────────────────────────────────

// Add at top:
//
// const { call } = useMeshContext();
// const { callState, localStream, remoteStream, callDuration, endCall } = call;
// const localVideoRef = useRef<HTMLVideoElement>(null);
// const remoteVideoRef = useRef<HTMLVideoElement>(null);
//
// useEffect(() => {
//   if (localVideoRef.current && localStream) localVideoRef.current.srcObject = localStream;
// }, [localStream]);
//
// useEffect(() => {
//   if (remoteVideoRef.current && remoteStream) remoteVideoRef.current.srcObject = remoteStream;
// }, [remoteStream]);
//
// Replace formatDuration with callDuration from hook
// Replace the hang-up button: onClick={() => { endCall(); onNavigate('chat'); }}
//
// Add video elements:
// <video ref={remoteVideoRef} autoPlay playsInline className="absolute inset-0 w-full h-full object-cover" />
// <video ref={localVideoRef}  autoPlay playsInline muted className="absolute top-30 right-4 w-28 h-40 ..." />


// ─────────────────────────────────────────────────────────────────────────────
// 5. FileTransferScreen.web.tsx — Real transfer progress
// ─────────────────────────────────────────────────────────────────────────────

// Add at top:
//
// const { client, selectedPeer } = useMeshContext();
// const { transfers, sendFile } = useFileTransfer(client, selectedPeer);
//
// Get active transfer:
// const activeTransfer = [...transfers.values()][0];
// const progress = activeTransfer?.progress ?? 0;
// const isPaused = activeTransfer?.status === 'paused';
//
// When file is done, show download button:
// if (activeTransfer?.blob) {
//   const url = URL.createObjectURL(activeTransfer.blob);
//   const a = document.createElement('a');
//   a.href = url; a.download = activeTransfer.fileName; a.click();
// }


// ─────────────────────────────────────────────────────────────────────────────
// 6. Incoming call overlay (add to AppInner.tsx)
// ─────────────────────────────────────────────────────────────────────────────

// {call.incomingCall && (
//   <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
//     <div className="bg-[#1a1f2e] rounded-3xl p-8 text-center border border-cyan-500/30 w-72">
//       <div className="w-20 h-20 rounded-full bg-cyan-500/20 flex items-center justify-center mx-auto mb-4">
//         <Phone className="w-10 h-10 text-cyan-400" />
//       </div>
//       <h3 className="text-white text-xl font-medium mb-1">Incoming Call</h3>
//       <p className="text-gray-400 text-sm mb-6">{call.incomingCall.from}</p>
//       <div className="flex gap-3">
//         <button onClick={call.rejectCall} className="flex-1 py-3 rounded-2xl bg-red-500/20 text-red-400">Decline</button>
//         <button onClick={() => { call.acceptCall(false); onNavigate('call'); }} className="flex-1 py-3 rounded-2xl bg-green-500/20 text-green-400">Accept</button>
//       </div>
//     </div>
//   </div>
// )}
