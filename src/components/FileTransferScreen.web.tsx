import { ArrowLeft, FileText, Pause, Play } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { Screen } from "../AppInner";

type FileTransferScreenProps = {
  onNavigate: (screen: Screen) => void;
};

export default function FileTransferScreen({onNavigate}: FileTransferScreenProps) {
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [speed, setSpeed] = useState(2.4);

  useEffect(() => {
    if (!isPaused && progress < 100) {
      const interval = setInterval(() => {
        setProgress((prev) => {
          const next = prev + 0.5;
          return next > 100 ? 100 : next;
        });
        setSpeed(2.2 + Math.random() * 0.6);
      }, 100);
      return () => clearInterval(interval);
    }
  }, [isPaused, progress]);

  const timeLeft = Math.max(0, Math.ceil((100 - progress) / 10));
  const transferred = ((2.4 * progress) / 100).toFixed(1);

  return (
    <div className="h-screen flex flex-col bg-[#0b1220]">
      <div className="flex items-center gap-4 p-4 border-b border-cyan-500/10 bg-[#0d1117]/40 backdrop-blur-sm shrink-0">
        <button
          onClick={() => onNavigate("chat")}
          className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center hover:bg-cyan-500/20 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-cyan-400" />
        </button>
        <h2 className="font-medium text-white">File Transfer</h2>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-6">
          <motion.div className="w-full" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
              <div className="bg-linear-to-t from-[#1a1f2e] to-[#151823] rounded-2xl p-6 border border-cyan-500/10 relative overflow-hidden flex flex-col h-full">
                <div className="flex flex-col h-full justify-between">
                  <div>
                    <div className="relative mb-6">
                      <div className="relative w-28 h-28 mx-auto bg-linear-to-br from-[#1a1f2e] to-[#151823] rounded-3xl border border-cyan-500/20 flex items-center justify-center">
                        <FileText className="w-14 h-14 text-cyan-400" />
                      </div>
                    </div>

                    <div className="flex flex-col items-center text-center space-y-2">
                      <h3 className="text-lg font-medium text-white">
                        mission_briefing.pdf
                      </h3>
                      <p className="text-gray-400 text-sm">2.4 MB</p>

                      <div className="flex items-center justify-center gap-2 mt-2">
                        <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse" />
                        <span className="text-xs text-cyan-400">
                          Transferring via mesh network
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-6 text-center">
                    <div className="text-xs text-gray-500">
                      Secure transfer • E2E encrypted
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-linear-to-t from-[#1a1f2e] to-[#151823] rounded-2xl p-6 border border-cyan-500/10 relative overflow-hidden flex flex-col h-full">
                <div className="flex flex-col h-full">
                  <div className="grid grid-cols-2 gap-x-6 gap-y-6">
                    <Stat label="Speed" value={`${speed.toFixed(1)} MB/s`} highlight/>
                    <Stat label="Time Left" value={`${timeLeft}s`} />
                    <Stat label="Transferred" value={`${transferred} MB`} />
                    <Stat label="Route" value="Direct" />
                  </div>                
                </div>
              </div>

              <div className="bg-linear-to-t from-[#1a1f2e] to-[#151823] rounded-2xl p-6 border border-cyan-500/10 relative overflow-hidden flex flex-col h-full">
                <div className="flex flex-col h-full justify-between">
                  <div className="relative w-40 h-40 mx-auto">
                    <svg className="w-full h-full" viewBox="0 0 192 192" preserveAspectRatio="xMidYMid meet" style={{ transform: "rotate(-90deg)" }}>
                      <defs>
                        <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                          <stop offset="0%" stopColor="#06b6d4" />
                          <stop offset="100%" stopColor="#3b82f6" />
                        </linearGradient>
                      </defs>
                      <circle cx="96" cy="96" r="88" fill="none" stroke="#1a1f2e" strokeWidth="8"/>
                      <motion.circle cx="96" cy="96" r="88" fill="none" stroke="url(#progressGradient)" strokeWidth="8" strokeLinecap="round"
                        strokeDasharray={552.9} strokeDashoffset={552.9 - (552.9 * progress) / 100} initial={{ strokeDashoffset: 552.9 }}
                        animate={{ strokeDashoffset: 552.9 - (552.9 * progress) / 100 }} transition={{ duration: 0.3 }}
                      />
                    </svg>

                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-4xl font-medium text-cyan-400">
                        {Math.round(progress)}%
                      </span>
                      <span className="text-sm text-gray-400 mt-1">
                        Complete
                      </span>
                    </div>
                  </div>

                  <div className="mt-8">
                    <div className="flex gap-3">
                      <motion.button
                        className="flex-1 bg-linear-to-r from-[#1a1f2e] to-[#151823] text-white py-3 rounded-2xl border border-cyan-500/20 hover:border-cyan-500/40 transition-all flex items-center justify-center gap-2"
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setIsPaused(!isPaused)}
                      >
                        {isPaused ? (<> <Play className="w-5 h-5" /> <span className="font-medium">Resume</span>  </>
                        ) : ( <> <Pause className="w-5 h-5" /> <span className="font-medium">Pause</span> </>)}
                      </motion.button>
                      {progress === 100 && (
                        <motion.button initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                          className="flex-1 bg-linear-to-r from-cyan-500 to-blue-600 text-white py-3 rounded-2xl shadow-lg shadow-cyan-500/30 font-medium"
                          whileTap={{ scale: 0.98 }} onClick={() => onNavigate("chat")}
                        >
                          Open File
                        </motion.button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-6 border-t border-cyan-500/10">
              <div className="max-w-xl mx-auto">
                <div className="text-xs text-gray-400 mb-3 text-center">
                  Network Route
                </div>

                <div className="flex items-center justify-center">
                  {["You", "Node A", "Alex"].map((node, i) => (
                    <div key={i} className="flex items-center">
                      <div className="flex flex-col items-center">
                        <div className={`w-10 h-10 rounded-full border-2 ${ i <= 2 ? "border-cyan-400 bg-cyan-500/20" : "border-gray-600 bg-gray-800/20"} flex items-center justify-center`}>
                          <div className={`w-3 h-3 rounded-full ${ i <= 2 ? "bg-cyan-400" : "bg-gray-600" }`} />
                        </div>
                        <span className="text-xs text-gray-400 mt-2">
                          {node}
                        </span>
                      </div>

                      {i < 2 && (
                        <div className="w-14 h-0.5 mb-4 bg-linear-to-r from-cyan-400 to-cyan-400/20 mx-2 relative overflow-hidden rounded-full">
                          <motion.div className="h-full w-2 bg-cyan-300" animate={{ x: [0, 56] }}
                            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

function Stat({label, value, highlight}: {label: string; value: string; highlight?: boolean;}) {
  return (
    <div className="space-y-1">
      <div className="text-xs text-gray-500 uppercase tracking-wide">
        {label}
      </div>
      <div className={`text-lg font-semibold ${ highlight ? "text-cyan-400" : "text-white" }`}>
        {value}
      </div>
    </div>
  );
}

function IntegrityRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="text-white font-medium">{value}</span>
    </div>
  );
}