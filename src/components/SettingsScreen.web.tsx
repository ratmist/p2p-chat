import { ArrowLeft, Check, Copy, Fingerprint, Shield } from "lucide-react";
import { motion } from "motion/react";
import { useMemo, useState } from "react";
import type { Screen } from "../AppInner";

type SettingsScreenProps = {
  onNavigate: (screen: Screen) => void;
};

export default function SettingsScreenWeb({ onNavigate }: SettingsScreenProps) {
  const [meshRoutingEnabled, setMeshRoutingEnabled] = useState(true);
  const [storeForwardEnabled, setStoreForwardEnabled] = useState(true);
  const [copiedFingerprint, setCopiedFingerprint] = useState(false);
  const [copiedDeviceId, setCopiedDeviceId] = useState(false);

  const deviceId = "ML-7F4A-9E2B-C8D1";
  const encryptionFingerprint = "A3F8 4B2C 9E7D 1F6A 8C4E 2B9D 7A3F 6E8C";

  const canClipboard = useMemo(
    () => typeof navigator !== "undefined" && !!navigator.clipboard,
    [],
  );

  const handleCopyFingerprint = async () => {
    try {
      if (canClipboard) {
        await navigator.clipboard.writeText(encryptionFingerprint.replace(/ /g, ""));
      }
      setCopiedFingerprint(true);
      setTimeout(() => setCopiedFingerprint(false), 2000);
    } catch {}
  };

  const handleCopyDeviceId = async () => {
    try {
      if (canClipboard) {
        await navigator.clipboard.writeText(deviceId);
      }
      setCopiedDeviceId(true);
      setTimeout(() => setCopiedDeviceId(false), 2000);
    } catch {}
  };

  return (
    <div className="h-screen flex flex-col bg-[#0b1220]">
      <div className="flex items-center gap-4 p-4 border-b border-cyan-500/10 bg-[#0d1117]/40 backdrop-blur-sm shrink-0">
        <button
          onClick={() => onNavigate("discovery")}
          className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center hover:bg-cyan-500/20 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-5 h-5 text-cyan-400" />
        </button>
        <h2 className="font-medium text-white">Settings</h2>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-6 space-y-6 pb-32">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <h3 className="text-sm text-gray-400 mb-3">Device Identity</h3>
            <div className="bg-linear-to-br from-[#1a1f2e] to-[#151823] rounded-2xl p-4 border border-cyan-500/20 mb-3">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="font-medium text-white mb-1">Device ID</div>
                  <div className="font-mono text-sm text-cyan-400">{deviceId}</div>
                </div>
                <button
                  onClick={handleCopyDeviceId}
                  className="w-8 h-8 rounded-lg bg-cyan-500/10 flex items-center justify-center hover:bg-cyan-500/20 transition-colors"
                >
                  {copiedDeviceId ? (<Check className="w-4 h-4 text-green-400" />) 
                  : (<Copy className="w-4 h-4 text-cyan-400" />)}
                </button>
              </div>

              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-cyan-500/10">
                <Shield className="w-4 h-4 text-green-400" />
                <span className="text-xs text-gray-400">Verified mesh participant</span>
              </div>
            </div>

            <div className="bg-linear-to-br from-[#1a1f2e] to-[#151823] rounded-2xl p-4 border border-cyan-500/20">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <Fingerprint className="w-4 h-4 text-cyan-400" />
                    <div className="font-medium text-white">Encryption Fingerprint</div>
                  </div>
                  <div className="font-mono text-xs text-cyan-400 leading-relaxed">
                    {encryptionFingerprint}
                  </div>
                </div>

                <button
                  onClick={handleCopyFingerprint}
                  className="w-8 h-8 rounded-lg bg-cyan-500/10 flex items-center justify-center hover:bg-cyan-500/20 transition-colors ml-2"
                >
                  {copiedFingerprint ? (<Check className="w-4 h-4 text-green-400" />) 
                  : (<Copy className="w-4 h-4 text-cyan-400" />)}
                </button>
              </div>

              <div className="text-xs text-gray-500 pt-3 border-t border-cyan-500/10">
                Verify this fingerprint with your contacts to ensure secure end-to-end encryption
              </div>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <h3 className="text-sm text-gray-400 mb-3">Network Settings</h3>
            <div className="bg-linear-to-r from-[#1a1f2e] to-[#151823] rounded-2xl p-4 border border-cyan-500/20 mb-3">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="font-medium text-white mb-1">Mesh Routing</div>
                  <div className="text-xs text-gray-400">Allow your device to relay messages for other peers</div>
                </div>
                <button
                  onClick={() => setMeshRoutingEnabled((v) => !v)}
                  className={`relative w-14 h-8 rounded-full transition-all ${meshRoutingEnabled ? "bg-linear-to-r from-cyan-500 to-blue-600" : "bg-gray-700" }`}
                >
                  <motion.div
                    className="absolute top-1 left-1 w-6 h-6 bg-white rounded-full shadow-lg"
                    animate={{ x: meshRoutingEnabled ? 24 : 0 }}
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  />
                </button>
              </div>

              {meshRoutingEnabled && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className="mt-3 pt-3 border-t border-cyan-500/10"
                >
                  <div className="flex items-center gap-2 text-xs text-green-400">
                    <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                    <span>Active relay node</span>
                  </div>
                </motion.div>
              )}
            </div>

            <div className="bg-linear-to-r from-[#1a1f2e] to-[#151823] rounded-2xl p-4 border border-cyan-500/20">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="font-medium text-white mb-1">Store &amp; Forward</div>
                  <div className="text-xs text-gray-400">Store messages temporarily when recipients are offline</div>
                </div>

                <button
                  onClick={() => setStoreForwardEnabled((v) => !v)}
                  className={`relative w-14 h-8 rounded-full transition-all ${storeForwardEnabled ? "bg-linear-to-r from-cyan-500 to-blue-600" : "bg-gray-700"}`}
                >
                  <motion.div
                    className="absolute top-1 left-1 w-6 h-6 bg-white rounded-full shadow-lg"
                    animate={{ x: storeForwardEnabled ? 24 : 0 }}
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  />
                </button>
              </div>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
            <h3 className="text-sm text-gray-400 mb-3">Security</h3>
            <div className="bg-linear-to-br from-[#1a1f2e] to-[#151823] rounded-2xl p-4 border border-cyan-500/20">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center">
                  <Shield className="w-5 h-5 text-green-400" />
                </div>
                <div className="flex-1">
                  <div className="font-medium text-white">End-to-End Encryption</div>
                  <div className="text-xs text-green-400 mt-0.5">Active</div>
                </div>
              </div>

              <div className="space-y-2 pt-3 border-t border-cyan-500/10">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-400">Protocol</span>
                  <span className="text-white">Signal Protocol</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-400">Key Exchange</span>
                  <span className="text-white">X3DH</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-400">Encryption</span>
                  <span className="text-white">AES-256</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-400">Forward Secrecy</span>
                  <span className="text-green-400">Enabled</span>
                </div>
              </div>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
            <h3 className="text-sm text-gray-400 mb-3">About</h3>
            <div className="bg-linear-to-r from-[#1a1f2e] to-[#151823] rounded-2xl p-4 border border-cyan-500/20">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-2xl bg-linear-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <circle cx="12" cy="5" r="2" fill="currentColor" />
                    <circle cx="5" cy="12" r="2" fill="currentColor" />
                    <circle cx="19" cy="12" r="2" fill="currentColor" />
                    <circle cx="12" cy="19" r="2" fill="currentColor" />
                    <line x1="12" y1="7" x2="12" y2="17" />
                    <line x1="7" y1="12" x2="17" y2="12" />
                  </svg>
                </div>
                <div>
                  <div className="font-medium text-white text-lg">MeshLink</div>
                  <div className="text-xs text-gray-400">Version 1.0.0 (Beta)</div>
                </div>
              </div>

              <div className="space-y-2 pt-3 border-t border-cyan-500/10">
                <div className="text-xs text-gray-400">Decentralized. Encrypted. Local.</div>
                <div className="text-xs text-gray-500">
                  A peer-to-peer mesh communication platform for secure local networking without internet or central servers.
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}