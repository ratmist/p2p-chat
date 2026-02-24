import { Mic, MicOff, PhoneOff, Video, VideoOff, Volume2 } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { Screen } from "../AppInner";

type CallScreenProps = {
  onNavigate: (screen: Screen) => void;
};

export default function CallScreen({ onNavigate }: CallScreenProps) {
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isSoundOn, setIsSoundOn] = useState(false);
  const [signalQuality, setSignalQuality] = useState(4);

  useEffect(() => {
    const interval = setInterval(() => {
      setDuration((prev) => prev + 1);
      setSignalQuality(3 + Math.floor(Math.random() * 2));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="min-h-screen relative overflow-hidden bg-[#0b1220]">
      <div className="absolute inset-0 bg-[#0d1117]/40 backdrop-blur-sm">
        <div className="absolute inset-0 opacity-10">
          <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#06b6d4" strokeWidth="1"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>
        </div>

        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="w-32 h-32 rounded-full bg-linear-to-br from-cyan-500 to-blue-600 flex items-center justify-center mb-4 mx-auto">
              <span className="text-5xl">A</span>
            </div>
            <h3 className="text-2xl font-medium text-white">Alex's Phone</h3>
            <p className="text-gray-400 mt-2">Connected via mesh network</p>
        </div>
      </div>

      <motion.div
        className="absolute top-0 left-0 right-0 z-10 p-4 border-b border-cyan-500/10 bg-[#0d1117]/40 backdrop-blur-sm"
        initial={{ y: -100 }}
        animate={{ y: 0 }}
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2 h-2 bg-green-400 rounded-full" />
              <span className="text-xs text-gray-400">Encrypted Call</span>
            </div>
            <div className="text-xl text-white font-medium">
              {formatDuration(duration)}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex gap-1 items-end">
              {[1, 2, 3, 4].map((bar) => (
                <motion.div key={bar} className={`w-1 rounded-full ${bar <= signalQuality ? "bg-cyan-400" : "bg-gray-600"}`}
                  style={{ height: `${bar * 4 + 4}px` }}
                  animate={{ opacity: bar <= signalQuality ? [0.5, 1, 0.5] : 0.3 }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
              ))}
            </div>
            <span className="text-xs text-gray-400">
              {signalQuality === 4 ? "Excellent" : "Good"}
            </span>
          </div>
        </div>
      </motion.div>

      {isVideoOn && (
        <motion.div
          className="absolute top-30 right-4 w-28 h-40 rounded-2xl overflow-hidden border-2 border-cyan-500/50 bg-linear-to-br from-[#1a1f2e] to-[#151823] z-10"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
        >
          <div className="w-full h-full flex items-center justify-center">
            <div className="w-16 h-16 rounded-full bg-linear-to-br from-cyan-500/50 to-blue-600/50 flex items-center justify-center">
              <span className="text-2xl">Y</span>
            </div>
          </div>
          <div className="absolute text-gray-400 bottom-2 left-2 text-xs bg-black/50 px-2 py-1 rounded-full">
            You
          </div>
        </motion.div>
      )}

      <motion.div
        className="absolute bottom-0 left-0 right-0 z-10 border-t border-cyan-500/10 bg-[#0d1117]/80 backdrop-blur-sm p-4"
        initial={{ y: 100 }}
        animate={{ y: 0 }}
      >
        <div className="flex items-center justify-center gap-6">
          <motion.button
            className={`w-12 h-12 rounded-full cursor-pointer hover:bg-cyan-500/20  ${isMuted ? "bg-red-500/20 border-red-500/40": "bg-[#1a1f2e] border-cyan-500/20"} border-2 flex items-center justify-center transition-all`}
            onClick={() => setIsMuted(!isMuted)}
          >
            {isMuted ? (
              <MicOff className="w-5 h-5 text-red-400" />
            ) : (
              <Mic className="w-5 h-5 text-cyan-400" />
            )}
          </motion.button>

          <motion.button
            className="w-12 h-12 rounded-full cursor-pointer hover:bg-red-500/70 bg-red-500 flex items-center justify-center relative"
            onClick={() => onNavigate("chat")}
          >
            <PhoneOff className="w-5 h-5 text-white" />
          </motion.button>

          <motion.button
            className={`w-12 h-12 rounded-full cursor-pointer hover:bg-cyan-500/20 ${!isVideoOn ? "bg-red-500/20 border-red-500/40": "bg-[#1a1f2e] border-cyan-500/20"} border-2 flex items-center justify-center transition-all`}
            onClick={() => setIsVideoOn(!isVideoOn)}
          >
            {isVideoOn ? (
              <Video className="w-5 h-5 text-cyan-400" />
            ) : (
              <VideoOff className="w-5 h-5 text-red-400" />
            )}
          </motion.button>

          <motion.button
            className={`w-12 h-12 rounded-full cursor-pointer hover:bg-cyan-500/20 ${!isSoundOn ? "bg-cyan-500/20 border-cyan-400": "bg-[#1a1f2e] border-cyan-500/20"} border-2 flex items-center justify-center transition-all`}
            onClick={() => setIsSoundOn(!isSoundOn)}
          >
            {isSoundOn ? (
              <Volume2 className="w-5 h-5 text-cyan-400" />
            ) : (
              <Volume2 className="w-5 h-5 text-white" />
            )}
          </motion.button>

        </div>

        <div className="mt-6 text-center">
          <p className="text-xs text-gray-400">
            Mesh Route: Direct • Latency: 42ms • E2E Encrypted
          </p>
        </div>
      </motion.div>
    </div>
  );
}
