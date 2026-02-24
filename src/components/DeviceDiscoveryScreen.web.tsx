import { Lock, Settings, Wifi, WifiOff } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { Screen } from "../AppInner";

type DeviceDiscoveryScreenProps = {
  onNavigate: (screen: Screen) => void;
};

type Device = {
  id: string;
  name: string;
  signalStrength: number;
  status: "connected" | "available" | "connecting";
  distance: string;
};

const mockDevices: Device[] = [
  {
    id: "1",
    name: "Alex's Phone",
    signalStrength: 95,
    status: "connected",
    distance: "2m",
  },
  {
    id: "2",
    name: "Rescue Unit 7",
    signalStrength: 88,
    status: "available",
    distance: "5m",
  },
  {
    id: "3",
    name: "Field Tablet A",
    signalStrength: 72,
    status: "available",
    distance: "12m",
  },
  {
    id: "4",
    name: "Base Station",
    signalStrength: 65,
    status: "connecting",
    distance: "18m",
  },
  {
    id: "5",
    name: "Mobile Unit 3",
    signalStrength: 45,
    status: "available",
    distance: "28m",
  },
];

export default function DeviceDiscoveryScreen({
  onNavigate,
}: DeviceDiscoveryScreenProps) {
  const [scanning, setScanning] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setScanning(false), 2000);
    return () => clearTimeout(timer);
  }, []);

  const getSignalColor = (strength: number) => {
    if (strength >= 80) return "text-green-400";
    if (strength >= 50) return "text-yellow-400";
    return "text-orange-400";
  };

  const barsProfile = useMemo(() => {
  return Array.from({ length: 100 }, (_, i) => {
    const minH = 10 + Math.random() * 2;
    const amp = 20 + Math.random() * 30;
    const dur = 1.4 + Math.random() * 0.6; 
    return { minH, maxH: minH + amp, dur };
  });
}, []);

  return (
    <div className="min-h-screen pb-24 relative bg-[#0b1220]">
      <div className="p-6 pb-4 border-b border-cyan-500/10 bg-[#0d1117]/40 backdrop-blur-sm flex flex-row justify-between">
        <h1 className="text-2xl mb-1 text-white">Devices Nearby</h1>
       <button 
          onClick={() => onNavigate("settings")}
          className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center hover:bg-cyan-500/20 transition-colors cursor-pointer"
        >
          <Settings className="w-5 h-5 text-cyan-400" />
        </button>
      </div>
      <div className="p-6 pb-8">
        <div className="w-full mx-auto">
          <div className="bg-linear-to-t from-[#1a1f2e] to-[#151823] rounded-2xl p-4 border border-cyan-500/10 relative overflow-hidden">
            <div className="relative flex items-end justify-center gap-1.5 h-20 overflow-hidden">
              {barsProfile.map((b, i) => (
                <motion.div key={i} className="w-1.5 rounded-full bg-linear-to-t from-cyan-500 to-blue-400"
                  animate={{height: [b.minH, b.maxH, b.minH], opacity: [0.35, 1, 0.35],}}
                  transition={{
                    duration: scanning ? b.dur : 0.35,
                    delay: scanning ? i * 0.02 : 0,
                    repeat: scanning ? Infinity : 0,
                    ease: "easeInOut",
                  }}
                />
              ))}
            </div>

            <div className="relative mt-6 text-center">
              <div className="flex items-center justify-center gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-cyan-400" />
                  <span className="text-gray-400">
                    {mockDevices.length} Devices
                  </span>
                </div>
                <div className="w-1 h-1 rounded-full bg-gray-600" />
                <div className="flex items-center gap-2">
                  <Lock className="w-3 h-3 text-green-400" />
                  <span className="text-gray-400">Encrypted</span>
                </div>
                <div className="w-1 h-1 rounded-full bg-gray-600" />
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-orange-400" />
                  <span className="text-gray-400">Mesh Active</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="px-6 space-y-3">
        {mockDevices.map((device, i) => (
          <motion.div
            key={device.id}
            className="bg-linear-to-r from-[#1a1f2e] to-[#151823] rounded-2xl p-4 border border-cyan-500/10 hover:border-cyan-500/30 transition-all cursor-pointer"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.1 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onNavigate("chat")}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-cyan-500/10 flex items-center justify-center">
                  {device.status === "connected" ? (
                    <Wifi className="w-6 h-6 text-green-400" />
                  ) : device.status === "connecting" ? (
                    <motion.div>
                      <Wifi className="w-6 h-6 text-yellow-400" />
                    </motion.div>
                  ) : (
                    <WifiOff className="w-6 h-6 text-cyan-400" />
                  )}
                </div>

                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-white">
                      {device.name}
                    </span>
                    <Lock className="w-3 h-3 text-green-400" />
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-gray-400">
                      {device.distance}
                    </span>
                    <span className="text-xs text-gray-600">•</span>
                    <span
                      className={`text-xs ${getSignalColor(device.signalStrength)}`}
                    >
                      {device.signalStrength}% signal
                    </span>
                  </div>
                </div>
              </div>

              <div>
                {device.status === "connected" && (
                  <div className="px-3 py-1 rounded-full bg-green-500/10 text-green-400 text-xs">
                    Connected
                  </div>
                )}
                {device.status === "connecting" && (
                  <div className="px-3 py-1 rounded-full bg-yellow-500/10 text-yellow-400 text-xs">
                    Connecting...
                  </div>
                )}
                {device.status === "available" && (
                  <div className="px-3 py-1 rounded-full bg-cyan-500/10 text-cyan-400 text-xs">
                    Available
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="fixed bottom-20 left-0 right-0 max-w-md mx-auto px-6">
        <motion.button
          className="cursor-pointer w-full bg-linear-to-r from-cyan-500 to-blue-600 text-white rounded-2xl relative overflow-hidden"
          whileTap={{ scale: 0.98 }}
          onClick={() => onNavigate("chat")}
        >
          <div className="bg-black/15 py-4 ">
            <div className="absolute inset-0 bg-linear-to-r from-cyan-400/0 to-cyan-400/0 transform" />
            <span className="relative z-10 font-medium">
              Start Secure Session
            </span>
          </div>
        </motion.button>
      </div>
    </div>
  );
}
