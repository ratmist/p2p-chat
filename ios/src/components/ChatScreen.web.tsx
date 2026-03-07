import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, Check, CheckCheck, Download, FileText, Phone, PhoneIncoming, PhoneMissed, SendHorizontal, Users, Video, Shield, ShieldAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Screen } from "../AppInner";
import { useMeshContext } from "../MeshContext";

type ChatScreenProps = { onNavigate: (screen: Screen) => void };

export default function ChatScreen({ onNavigate }: ChatScreenProps) {
  const {
    messages, sendMessage, sendFile,
    selectedPeer, nodeId, status, rtt, p2pStatus,
    callState, incomingCall, acceptCall, endCall, startCall,
    peerTrust, myFingerprint, typingPeers, sendTyping, callError,
  } = useMeshContext();

  const peerP2P = selectedPeer ? (p2pStatus?.get(selectedPeer.nodeId) ?? "none") : "none";
  const p2pLabel = peerP2P === "open" ? "P2P Direct" : peerP2P === "connecting" ? "P2P…" : "Relay";
  const trust = selectedPeer ? peerTrust?.get(selectedPeer.nodeId) : null;
  const [showFingerprint, setShowFingerprint] = useState(false);

  const [message, setMessage] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const peerMessages = messages.filter(
    (m) => m.from === selectedPeer?.nodeId || m.to === selectedPeer?.nodeId
  );

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [peerMessages.length]);

  // Navigate to call screen when outgoing call is placed or accepted
  useEffect(() => {
    if (callState === "calling" || callState === "connected") {
      onNavigate("call");
    }
  }, [callState]);

  const onSend = () => {
    if (!message.trim()) return;
    sendMessage(message.trim());
    setMessage("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend(); }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) sendFile(file);
    e.target.value = "";
  };

  const handleAcceptCall = () => {
    acceptCall();
    onNavigate("call");
  };

  const handleRejectCall = () => {
    endCall();
  };

  const formatTime = (ts: number) =>
    new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const statusDot = status === "connected" ? "bg-green-400" : "bg-gray-500"; // kept for TS

  return (
    <div className="min-h-screen flex flex-col bg-[#0b1220] relative">

      {/* Incoming call banner */}
      <AnimatePresence>
        {incomingCall && callState === "ringing" && (
          <motion.div
            initial={{ y: -80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -80, opacity: 0 }}
            className="absolute top-0 left-0 right-0 z-50 mx-4 mt-4 rounded-2xl bg-[#0d1117]/95 border border-cyan-500/30 backdrop-blur-md p-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
                  <span className="text-xl font-bold text-white">
                    {(incomingCall.alias ?? "?")[0].toUpperCase()}
                  </span>
                </div>
                <div>
                  <p className="text-white font-medium">{incomingCall.alias}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <motion.div
                      animate={{ scale: [1, 1.4, 1] }}
                      transition={{ duration: 1, repeat: Infinity }}
                      className="w-2 h-2 rounded-full bg-green-400"
                    />
                    <p className="text-xs text-green-400">
                      Incoming {incomingCall.video ? "video" : "audio"} call…
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleRejectCall}
                  className="w-11 h-11 rounded-full bg-red-500/20 border border-red-500/40 flex items-center justify-center hover:bg-red-500/40 transition-colors cursor-pointer"
                >
                  <PhoneMissed className="w-5 h-5 text-red-400" />
                </button>
                <button
                  onClick={handleAcceptCall}
                  className="w-11 h-11 rounded-full bg-green-500/20 border border-green-500/40 flex items-center justify-center hover:bg-green-500/40 transition-colors cursor-pointer"
                >
                  <PhoneIncoming className="w-5 h-5 text-green-400" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="p-4 border-b border-cyan-500/10 bg-[#0d1117]/60 backdrop-blur-sm flex items-center gap-3 flex-shrink-0">
        <button
          onClick={() => onNavigate("discovery")}
          className="w-9 h-9 rounded-xl bg-cyan-500/10 flex items-center justify-center hover:bg-cyan-500/20 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-5 h-5 text-cyan-400" />
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-white font-medium truncate">{selectedPeer?.alias ?? "Unknown"}</p>
            {trust?.keyChanged && (
              <ShieldAlert className="w-4 h-4 text-red-400 flex-shrink-0" title="Key changed!" />
            )}
            {trust && !trust.keyChanged && (
              <Shield className="w-4 h-4 text-green-400 flex-shrink-0" title="Key verified" />
            )}
          </div>
          <button
            onClick={() => setShowFingerprint(v => !v)}
            className="flex items-center gap-1.5 mt-0.5 cursor-pointer"
          >
            <div className={`w-1.5 h-1.5 rounded-full ${status === "connected" ? "bg-green-400" : "bg-gray-500"}`} />
            <p className="text-xs text-gray-400">
              E2E encrypted · {p2pLabel}{rtt ? ` · ${rtt}ms` : ""}
            </p>
          </button>
          {showFingerprint && trust && (
            <div className="mt-1 p-2 rounded-lg bg-black/40 border border-cyan-500/20">
              <p className="text-[10px] text-gray-500 mb-0.5">Their key fingerprint</p>
              <p className="text-[10px] font-mono text-cyan-400 break-all">{trust.fingerprint}</p>
              {trust.keyChanged && (
                <p className="text-[10px] text-red-400 mt-1">⚠️ Key changed since last session!</p>
              )}
              {trust.isNew && (
                <p className="text-[10px] text-yellow-400 mt-1">🔑 First time seeing this key</p>
              )}
              <p className="text-[10px] text-gray-600 mt-1">Your fingerprint: {myFingerprint}</p>
            </div>
          )}
        </div>

        <button
          onClick={() => onNavigate("group")}
          className="w-9 h-9 rounded-xl bg-cyan-500/10 flex items-center justify-center hover:bg-cyan-500/20 transition-colors cursor-pointer"
        >
          <Users className="w-5 h-5 text-cyan-400" />
        </button>

        <button
          onClick={() => selectedPeer && startCall(selectedPeer.nodeId, false)}
          disabled={callState !== "idle"}
          className="w-9 h-9 rounded-xl bg-cyan-500/10 flex items-center justify-center hover:bg-cyan-500/20 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Phone className="w-5 h-5 text-cyan-400" />
        </button>

        <button
          onClick={() => selectedPeer && startCall(selectedPeer.nodeId, true)}
          disabled={callState !== "idle"}
          className="w-9 h-9 rounded-xl bg-cyan-500/10 flex items-center justify-center hover:bg-cyan-500/20 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Video className="w-5 h-5 text-cyan-400" />
        </button>
      </div>

      {/* Call error toast */}
      {callError && (
        <div className="mx-4 mt-1 rounded-xl bg-orange-500/10 border border-orange-500/30 px-3 py-2">
          <p className="text-orange-300 text-xs whitespace-pre-line">{callError}</p>
          <p className="text-orange-400/60 text-[10px] mt-0.5">Open the app at <strong>https://YOUR_IP:8443</strong> to enable microphone.</p>
        </div>
      )}

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-3"
        style={{ minHeight: 0 }}
      >
        {peerMessages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center py-16">
            <div className="text-4xl mb-3">🔒</div>
            <p className="text-sm text-gray-500">End-to-end encrypted</p>
            <p className="text-xs text-gray-600 mt-1">Messages are only stored on your devices</p>
          </div>
        )}

        {peerMessages.map((msg) => {
          const isMine = msg.from === nodeId;
          return (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex ${isMine ? "justify-end" : "justify-start"}`}
            >
              <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
                isMine
                  ? "bg-gradient-to-br from-cyan-600 to-blue-700 text-white rounded-br-sm"
                  : "bg-[#1a1f2e] text-white rounded-bl-sm border border-cyan-500/10"
              }`}>
                {msg.type === "file" && msg.fileInfo ? (
                  <div className="flex items-center gap-2 min-w-[180px]">
                    <FileText className="w-5 h-5 flex-shrink-0 text-cyan-300" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{msg.fileInfo.name}</p>
                      <p className="text-xs opacity-70">{(msg.fileInfo.size / 1024).toFixed(1)} KB</p>
                    </div>
                    {msg.fileInfo.data && (
                      <a
                        href={`data:${msg.fileInfo.mimeType ?? "application/octet-stream"};base64,${msg.fileInfo.data}`}
                        download={msg.fileInfo.name}
                        className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
                      >
                        <Download className="w-4 h-4" />
                      </a>
                    )}
                  </div>
                ) : (
                  <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{msg.text}</p>
                )}
                <div className={`flex items-center gap-1 mt-1 flex-wrap ${isMine ? "justify-end" : "justify-start"}`}>
                  <span className="text-[10px] opacity-50">{formatTime(msg.ts)}</span>
                  {isMine && (
                    msg.status === "delivered"
                      ? <CheckCheck className="w-3 h-3 opacity-70" />
                      : msg.status === "sent"
                      ? <Check className="w-3 h-3 opacity-50" />
                      : msg.status === "failed"
                      ? <span className="text-[10px] text-red-400">!</span>
                      : null
                  )}
                  {!isMine && msg.route && msg.route.length > 2 && (
                    <span
                      className="text-[9px] opacity-40 font-mono cursor-help hover:opacity-80 transition-opacity"
                      title={`Route: ${msg.route.join(" → ")}`}>
                      ↪ {msg.route.length - 2} relay hop{msg.route.length - 2 > 1 ? "s" : ""}
                    </span>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Typing indicator */}
      <AnimatePresence>
        {selectedPeer && typingPeers.has(selectedPeer.nodeId) && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
            className="px-4 pb-1">
            <div className="inline-flex items-center gap-2 bg-[#1a1f2e] border border-cyan-500/10 rounded-2xl rounded-bl-sm px-3 py-2">
              <div className="flex gap-1">
                {[0,1,2].map(i => (
                  <motion.div key={i} className="w-1.5 h-1.5 rounded-full bg-cyan-400"
                    animate={{ y: [0, -4, 0] }} transition={{ duration: 0.6, delay: i * 0.15, repeat: Infinity }} />
                ))}
              </div>
              <span className="text-xs text-gray-500">{selectedPeer.alias} is typing</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input */}
      <div className="flex-shrink-0 p-4 border-t border-cyan-500/10 bg-[#0d1117]/60 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleFileChange}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center hover:bg-cyan-500/20 transition-colors cursor-pointer flex-shrink-0"
          >
            <FileText className="w-5 h-5 text-cyan-400" />
          </button>
          <input
            type="text"
            value={message}
            onChange={(e) => { setMessage(e.target.value); sendTyping(); }}
            onKeyDown={handleKeyDown}
            placeholder="Message…"
            className="flex-1 bg-[#1a1f2e] border border-cyan-500/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-cyan-500/40 transition-colors"
          />
          <button
            onClick={onSend}
            disabled={!message.trim()}
            className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
          >
            <SendHorizontal className="w-5 h-5 text-white" />
          </button>
        </div>
      </div>
    </div>
  );
}
