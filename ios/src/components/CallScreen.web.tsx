import { Mic, MicOff, PhoneOff, Video, VideoOff } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Screen } from "../AppInner";
import { useMeshContext } from "../MeshContext";

type CallScreenProps = { onNavigate: (screen: Screen) => void };

const qualityColor = (q: string) =>
  q === "good" ? "text-green-400" : q === "fair" ? "text-yellow-400" : q === "poor" ? "text-red-400" : "text-gray-500";
const qualityDot = (q: string) =>
  q === "good" ? "bg-green-400" : q === "fair" ? "bg-yellow-400" : q === "poor" ? "bg-red-400" : "bg-gray-500";

function MetricPill({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className={`flex flex-col items-center px-3 py-1.5 rounded-xl bg-black/40 border ${warn ? "border-red-500/40" : "border-cyan-500/10"}`}>
      <span className={`text-xs font-mono font-semibold ${warn ? "text-red-400" : "text-cyan-300"}`}>{value}</span>
      <span className="text-[10px] text-gray-500 mt-0.5">{label}</span>
    </div>
  );
}

export default function CallScreen({ onNavigate }: CallScreenProps) {
  const { callState, localStream, remoteStream, endCall, selectedPeer, rtt, callMetrics, incomingCall, acceptCall, activeCandidateType, callError } = useMeshContext();
  // Resolve peer display name: selectedPeer (outgoing) or incomingCall.alias (incoming)
  const peerDisplayName = selectedPeer?.alias ?? incomingCall?.alias ?? "Unknown";
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [showMetrics, setShowMetrics] = useState(true);

  const localVideoRef  = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (localVideoRef.current && localStream) localVideoRef.current.srcObject = localStream;
  }, [localStream]);
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      const el = remoteVideoRef.current;
      el.srcObject = remoteStream;
      // Safari requires muted=true for autoplay; we unmute inside .then()
      el.muted = true;
      el.volume = 1.0;
      el.play()
        .then(() => { el.muted = false; })
        .catch(() => {});
    }
  }, [remoteStream]);

  // Callback ref: fires as soon as <video> mounts, ensures srcObject is set even
  // when remoteStream arrived before the element rendered
  const remoteVideoCallbackRef = (el: HTMLVideoElement | null) => {
    (remoteVideoRef as React.MutableRefObject<HTMLVideoElement | null>).current = el;
    if (el && remoteStream) {
      el.srcObject = remoteStream;
      // Safari: must start muted for autoplay policy, then unmute after play() resolves
      el.muted = true;
      el.volume = 1.0;
      el.play()
        .then(() => { el.muted = false; })
        .catch(() => {
          // Autoplay fully blocked — unlock on first user gesture
          const unlock = () => {
            el.muted = false;
            el.play().catch(() => {});
            document.removeEventListener('click', unlock);
          };
          document.addEventListener('click', unlock, { once: true });
        });
    }
  };

  useEffect(() => {
    if (callState !== "connected") return;
    const iv = setInterval(() => setDuration(d => d + 1), 1000);
    return () => clearInterval(iv);
  }, [callState]);

  // Navigate back to chat only after an active call ends
  const prevCallStateWeb = useRef<string | null>(null);
  useEffect(() => {
    const prev = prevCallStateWeb.current;
    prevCallStateWeb.current = callState;
    // On first render prev is null — don't navigate
    if (prev === null) return;
    if (callState === "idle" && (prev === "calling" || prev === "ringing" || prev === "connected")) {
      onNavigate("chat");
    }
  }, [callState]);

  const handleEnd = () => { endCall(); onNavigate("chat"); };
  const handleAcceptIncoming = () => { acceptCall(); };
  const handleRejectIncoming = () => { endCall(); onNavigate("chat"); };
  const toggleMute = () => {
    const newMuted = !isMuted;
    localStream?.getAudioTracks().forEach(t => { t.enabled = !newMuted; });
    setIsMuted(newMuted);
  };
  const toggleVideo = () => {
    const newVideoOn = !isVideoOn;
    localStream?.getVideoTracks().forEach(t => { t.enabled = newVideoOn; });
    setIsVideoOn(newVideoOn);
  };
  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  const statusLabel =
    callState === "calling" ? "Calling..." :
    callState === "ringing" ? "Incoming..." :
    callState === "connected" ? fmt(duration) : "Connecting...";

  const { rttMs, jitterMs, packetsLost, lossPercent, audioLevel, quality } = callMetrics;
  const audioBarWidth = audioLevel != null ? Math.min(Math.round(audioLevel * 400), 100) : 0;

  const iceLabel = activeCandidateType === "host" ? "LAN"
    : activeCandidateType === "srflx" ? "STUN"
    : activeCandidateType === "relay" ? "TURN"
    : activeCandidateType ?? "—";
  const iceWarn = activeCandidateType === "relay";

  return (
    <div className="min-h-screen relative overflow-hidden bg-[#0b1220]">
      <div className="absolute inset-0 opacity-10">
        <svg className="w-full h-full"><defs><pattern id="g" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M 40 0 L 0 0 0 40" fill="none" stroke="#06b6d4" strokeWidth="1"/></pattern></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>
      </div>

      {/* HTTPS/microphone error banner */}
      {callError && (
        <div className="absolute top-4 left-4 right-4 z-50 rounded-2xl bg-orange-500/10 border border-orange-500/40 backdrop-blur-md p-3 shadow-xl">
          <p className="text-orange-300 text-xs font-medium whitespace-pre-line">{callError}</p>
          <p className="text-orange-400/70 text-[10px] mt-1">Open the app at <strong>https://YOUR_IP:8443</strong> and accept the self-signed cert, then retry.</p>
        </div>
      )}

      {/* Incoming call banner — shown when ringing (e.g. phone → web) */}
      <AnimatePresence>
        {incomingCall && callState === "ringing" && (
          <motion.div
            initial={{ y: -80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -80, opacity: 0 }}
            className="absolute top-4 left-4 right-4 z-50 rounded-2xl bg-[#0d1117]/97 border border-cyan-500/30 backdrop-blur-md p-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
                  <span className="text-xl font-bold text-white">{(incomingCall.alias ?? "?")[0].toUpperCase()}</span>
                </div>
                <div>
                  <p className="text-white font-medium">{incomingCall.alias}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <motion.div animate={{ scale: [1, 1.4, 1] }} transition={{ duration: 1, repeat: Infinity }} className="w-2 h-2 rounded-full bg-green-400" />
                    <p className="text-xs text-green-400">Incoming {incomingCall.video ? "video" : "audio"} call…</p>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={handleRejectIncoming} className="w-11 h-11 rounded-full bg-red-500/20 border border-red-500/40 flex items-center justify-center hover:bg-red-500/40 transition-colors cursor-pointer">
                  <PhoneOff className="w-5 h-5 text-red-400" />
                </button>
                <button onClick={handleAcceptIncoming} className="w-11 h-11 rounded-full bg-green-500/20 border border-green-500/40 flex items-center justify-center hover:bg-green-500/40 transition-colors cursor-pointer">
                  <Mic className="w-5 h-5 text-green-400" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {remoteStream ? (
        <video ref={remoteVideoCallbackRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="w-32 h-32 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center mb-4">
            <span className="text-5xl font-bold text-white">{peerDisplayName[0].toUpperCase()}</span>
          </div>
          <h3 className="text-2xl font-medium text-white">{peerDisplayName}</h3>
          <motion.p className="text-gray-400 mt-2" animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 1.5, repeat: Infinity }}>
            {statusLabel}
          </motion.p>
        </div>
      )}

      {/* Top bar with metrics */}
      <motion.div className="absolute top-0 left-0 right-0 z-10 p-4 border-b border-cyan-500/10 bg-[#0d1117]/70 backdrop-blur-sm" initial={{ y: -80 }} animate={{ y: 0 }}>
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <div className={`w-2 h-2 rounded-full animate-pulse ${qualityDot(quality)}`} />
              <span className={`text-xs font-medium ${qualityColor(quality)}`}>
                {quality === "unknown" ? (callState === "connected" ? "Measuring…" : "—") : quality.charAt(0).toUpperCase() + quality.slice(1)}
              </span>
              <span className="text-gray-600 text-xs">•</span>
              <span className="text-xs text-gray-400">E2E Encrypted</span>
            </div>
            <div className="text-xl text-white font-medium">{statusLabel}</div>
          </div>
          <button
            onClick={() => setShowMetrics(v => !v)}
            className="text-xs text-gray-500 hover:text-cyan-400 transition-colors px-2 py-1 rounded-lg bg-black/20 cursor-pointer"
          >
            {showMetrics ? "Hide stats" : "Show stats"}
          </button>
        </div>

        <AnimatePresence>
          {showMetrics && callState === "connected" && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <div className="flex flex-wrap gap-2 mt-3">
                <MetricPill label="RTT media" value={rttMs != null ? `${rttMs}ms` : "—"} warn={rttMs != null && rttMs > 300} />
                <MetricPill label="Jitter" value={jitterMs != null ? `${jitterMs}ms` : "—"} warn={jitterMs != null && jitterMs > 50} />
                <MetricPill label="Loss" value={lossPercent != null ? `${lossPercent}%` : "—"} warn={lossPercent != null && lossPercent > 5} />
                <MetricPill label="Pkts lost" value={packetsLost != null ? String(packetsLost) : "—"} />
                <MetricPill label="WS RTT" value={rtt != null ? `${rtt}ms` : "—"} />
                <MetricPill label="ICE path" value={iceLabel} warn={iceWarn} />
                <MetricPill label="JitterBuf" value="100ms" />
                <MetricPill label="FEC" value="ON" />
              </div>
              <div className="mt-2 flex items-center gap-2">
                <span className="text-[10px] text-gray-500 w-16 shrink-0">Audio in</span>
                <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-cyan-500 to-green-400 rounded-full"
                    animate={{ width: `${audioBarWidth}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
                <span className="text-[10px] text-gray-600 w-8 text-right">
                  {audioLevel != null ? `${Math.round(audioLevel * 100)}%` : "—"}
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Local PiP */}
      <motion.div className="absolute top-48 right-4 w-28 h-40 rounded-2xl overflow-hidden border-2 border-cyan-500/50 bg-[#1a1f2e] z-10" initial={{ scale: 0 }} animate={{ scale: 1 }}>
        {localStream && isVideoOn ? (
          <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-cyan-500/50 to-blue-600/50 flex items-center justify-center">
              <span className="text-lg font-bold text-white">Y</span>
            </div>
          </div>
        )}
        <div className="absolute bottom-2 left-2 text-xs text-gray-400 bg-black/50 px-2 py-0.5 rounded-full">You</div>
      </motion.div>

      {/* Controls */}
      <motion.div className="absolute bottom-0 left-0 right-0 z-10 border-t border-cyan-500/10 bg-[#0d1117]/80 backdrop-blur-sm p-6" initial={{ y: 100 }} animate={{ y: 0 }}>
        <div className="flex items-center justify-center gap-6">
          <motion.button whileTap={{ scale: 0.9 }}
            className={`w-14 h-14 rounded-full border-2 flex items-center justify-center transition-all cursor-pointer ${isMuted ? "bg-red-500/20 border-red-500/40" : "bg-[#1a1f2e] border-cyan-500/20"}`}
            onClick={toggleMute}>
            {isMuted ? <MicOff className="w-6 h-6 text-red-400" /> : <Mic className="w-6 h-6 text-cyan-400" />}
          </motion.button>
          <motion.button whileTap={{ scale: 0.9 }}
            className="w-16 h-16 rounded-full bg-red-500 flex items-center justify-center cursor-pointer hover:bg-red-600 transition-colors"
            onClick={handleEnd}>
            <PhoneOff className="w-7 h-7 text-white" />
          </motion.button>
          <motion.button whileTap={{ scale: 0.9 }}
            className={`w-14 h-14 rounded-full border-2 flex items-center justify-center transition-all cursor-pointer ${!isVideoOn ? "bg-red-500/20 border-red-500/40" : "bg-[#1a1f2e] border-cyan-500/20"}`}
            onClick={toggleVideo}>
            {isVideoOn ? <Video className="w-6 h-6 text-cyan-400" /> : <VideoOff className="w-6 h-6 text-red-400" />}
          </motion.button>
        </div>
        <div className="mt-3 text-center">
          <p className="text-xs text-gray-500">
            WebRTC DTLS · OPUS audio · ICE: {iceLabel} · {quality !== "unknown" ? `Quality: ${quality}` : "Measuring quality…"}
          </p>
        </div>
      </motion.div>
    </div>
  );
}
