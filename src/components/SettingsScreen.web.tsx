import { ArrowLeft, Check, Copy, Fingerprint, Radio, Shield, Wifi, WifiOff, Zap } from "lucide-react";
import { motion } from "motion/react";
import { useMemo, useState } from "react";
import type { Screen } from "../AppInner";
import { useMeshContext, DEFAULT_NETWORK_SETTINGS } from "../MeshContext";

type Props = { onNavigate: (screen: Screen) => void };

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!value)}
      className={`relative w-12 h-7 rounded-full transition-all ${value ? "bg-gradient-to-r from-cyan-500 to-blue-600" : "bg-gray-700"}`}>
      <motion.div className="absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full shadow"
        animate={{ x: value ? 20 : 0 }} transition={{ type: "spring", stiffness: 500, damping: 30 }} />
    </button>
  );
}

const BW_PRESETS = [
  { label: "Unlimited", value: 0 },
  { label: "500 KB/s",  value: 500 * 1024 },
  { label: "100 KB/s",  value: 100 * 1024 },
];

export default function SettingsScreenWeb({ onNavigate }: Props) {
  const { nodeId, alias, status, nodes, rtt, networkSettings, setNetworkSettings, myFingerprint, peerScores } = useMeshContext();
  const [copiedId, setCopiedId] = useState(false);
  const [copiedFp, setCopiedFp] = useState(false);

  const statusColor = status === "connected" ? "text-green-400" : status === "reconnecting" ? "text-yellow-400" : "text-red-400";

  const copy = async (text: string, setter: (v: boolean) => void) => {
    try { await navigator.clipboard.writeText(text); setter(true); setTimeout(() => setter(false), 2000); } catch {}
  };

  const bestRelay = useMemo(() => {
    let best = null as any;
    peerScores.forEach(p => { if (p.relayCapable && p.stable && (!best || p.score > best.score)) best = p; });
    return best;
  }, [peerScores]);

  return (
    <div className="h-screen flex flex-col bg-[#0b1220]">
      <div className="flex items-center gap-4 p-4 border-b border-cyan-500/10 bg-[#0d1117]/40 backdrop-blur-sm shrink-0">
        <button onClick={() => onNavigate("discovery")} className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center hover:bg-cyan-500/20 transition-colors cursor-pointer">
          <ArrowLeft className="w-5 h-5 text-cyan-400" />
        </button>
        <h2 className="font-medium text-white">Settings</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-6 pb-24">

        {/* Mesh Status */}
        <section>
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Mesh Status</p>
          <div className="bg-gradient-to-t from-[#1a1f2e] to-[#151823] rounded-2xl p-4 border border-cyan-500/10">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div><div className={`text-base font-bold ${statusColor}`}>{status}</div><div className="text-xs text-gray-500 mt-1">Status</div></div>
              <div><div className="text-base font-bold text-white">{nodes.length}</div><div className="text-xs text-gray-500 mt-1">Peers</div></div>
              <div><div className="text-base font-bold text-cyan-400">{rtt ? `${rtt}ms` : "—"}</div><div className="text-xs text-gray-500 mt-1">WS RTT</div></div>
            </div>
            {bestRelay && (
              <div className="mt-3 pt-3 border-t border-cyan-500/10 flex items-center gap-2 text-xs text-cyan-400">
                <Radio className="w-3 h-3" />
                <span>Best relay: <span className="font-mono">{bestRelay.nodeId.slice(0,12)}</span> · score {bestRelay.score}</span>
              </div>
            )}
          </div>
        </section>

        {/* Identity */}
        <section>
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Identity</p>
          <div className="bg-gradient-to-t from-[#1a1f2e] to-[#151823] rounded-2xl divide-y divide-cyan-500/10 border border-cyan-500/10 overflow-hidden">
            <div className="p-4 flex items-center justify-between">
              <div><p className="text-xs text-gray-500">Alias</p><p className="text-white font-medium mt-0.5">{alias}</p></div>
            </div>
            <div className="p-4 flex items-center justify-between">
              <div className="flex-1 min-w-0"><p className="text-xs text-gray-500">Node ID</p><p className="text-cyan-400 font-mono text-xs mt-0.5 break-all">{nodeId}</p></div>
              <button onClick={() => copy(nodeId, setCopiedId)} className="w-8 h-8 rounded-lg bg-cyan-500/10 flex items-center justify-center ml-2 flex-shrink-0">
                {copiedId ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4 text-cyan-400" />}
              </button>
            </div>
            <div className="p-4 flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5"><Fingerprint className="w-3.5 h-3.5 text-cyan-400" /><p className="text-xs text-gray-500">Key Fingerprint</p></div>
                <p className="text-cyan-400 font-mono text-xs mt-0.5 break-all">{myFingerprint || nodeId.slice(0,32)}</p>
                <p className="text-xs text-gray-600 mt-1">Share with peers to verify identity (TOFU)</p>
              </div>
              <button onClick={() => copy(myFingerprint || nodeId, setCopiedFp)} className="w-8 h-8 rounded-lg bg-cyan-500/10 flex items-center justify-center ml-2 flex-shrink-0">
                {copiedFp ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4 text-cyan-400" />}
              </button>
            </div>
          </div>
        </section>

        {/* Network settings */}
        <section>
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Network</p>
          <div className="bg-gradient-to-t from-[#1a1f2e] to-[#151823] rounded-2xl divide-y divide-cyan-500/10 border border-cyan-500/10 overflow-hidden">
            {([
              { key: "enableRelay",  icon: <Radio className="w-4 h-4 text-cyan-400" />,  label: "Enable TURN Relay",     desc: "Use TURN server when P2P fails" },
              { key: "forceP2P",     icon: <Zap className="w-4 h-4 text-yellow-400" />,  label: "Force P2P Only",        desc: "Never use WS relay fallback" },
              { key: "lowBandwidth", icon: <WifiOff className="w-4 h-4 text-orange-400" />, label: "Low Bandwidth Mode", desc: "100KB/s files, audio-only calls" },
              { key: "relayCapable", icon: <Wifi className="w-4 h-4 text-green-400" />,  label: "Relay Capable",         desc: "Advertise as mesh relay node" },
            ] as const).map(({ key, icon, label, desc }) => (
              <div key={key} className="p-4 flex items-center justify-between">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">{icon}</div>
                  <div><p className="text-white text-sm font-medium">{label}</p><p className="text-xs text-gray-500 mt-0.5">{desc}</p></div>
                </div>
                <Toggle value={networkSettings[key]} onChange={v => setNetworkSettings({ ...networkSettings, [key]: v })} />
              </div>
            ))}

            {/* BW limit picker */}
            <div className="p-4">
              <p className="text-white text-sm font-medium mb-2">File Transfer Speed</p>
              <div className="flex gap-2">
                {BW_PRESETS.map(p => (
                  <button key={p.value} onClick={() => setNetworkSettings({ ...networkSettings, fileBwLimit: p.value })}
                    className={`flex-1 py-2 rounded-xl text-xs font-medium border transition-all ${networkSettings.fileBwLimit === p.value ? "border-cyan-500 bg-cyan-500/20 text-cyan-300" : "border-cyan-500/20 bg-[#0d1117] text-gray-400"}`}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Security */}
        <section>
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Security</p>
          <div className="bg-gradient-to-t from-[#1a1f2e] to-[#151823] rounded-2xl p-4 border border-cyan-500/10">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-xl bg-green-500/10 flex items-center justify-center"><Shield className="w-5 h-5 text-green-400" /></div>
              <div><p className="text-white font-medium text-sm">End-to-End Encryption</p><p className="text-xs text-green-400 mt-0.5">Active</p></div>
            </div>
            <div className="space-y-2 pt-3 border-t border-cyan-500/10">
              {[["Protocol","WebRTC DTLS"],["Key Exchange","ECDH P-256"],["Encryption","AES-256-GCM"],["Signing","Ed25519"],["Forward Secrecy","Enabled"]].map(([k,v]) => (
                <div key={k} className="flex justify-between text-xs">
                  <span className="text-gray-400">{k}</span>
                  <span className={v === "Enabled" ? "text-green-400" : "text-white"}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Reset */}
        <button onClick={() => setNetworkSettings(DEFAULT_NETWORK_SETTINGS)}
          className="w-full py-3 rounded-2xl border border-gray-700 text-gray-400 text-sm hover:border-red-500/40 hover:text-red-400 transition-colors">
          Reset to defaults
        </button>
      </div>
    </div>
  );
}
