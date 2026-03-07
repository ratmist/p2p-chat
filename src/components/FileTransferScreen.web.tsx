import { ArrowLeft, CheckCircle, Download, FileText, Pause, Play, XCircle } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useMeshContext } from "../MeshContext";
import { Screen } from "../AppInner";

type Props = { onNavigate: (screen: Screen) => void };

export default function FileTransferScreen({ onNavigate }: Props) {
  const { fileProgress, selectedPeer, pauseFileTransfer, resumeFileTransfer } = useMeshContext();
  const transfers = [...fileProgress.values()].reverse();

  return (
    <div className="h-screen flex flex-col bg-[#0b1220]">
      <div className="flex items-center gap-4 p-4 border-b border-cyan-500/10 bg-[#0d1117]/40 backdrop-blur-sm shrink-0">
        <button onClick={() => onNavigate("chat")} className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center hover:bg-cyan-500/20 transition-colors">
          <ArrowLeft className="w-5 h-5 text-cyan-400" />
        </button>
        <div className="flex-1">
          <h2 className="font-medium text-white">File Transfers</h2>
          <p className="text-xs text-gray-500 mt-0.5">{selectedPeer ? `with ${selectedPeer.alias}` : "No peer selected"} · E2E encrypted · SHA-256 verified</p>
        </div>
        <div className="text-xs text-gray-600 font-mono">{transfers.length} transfer{transfers.length !== 1 ? "s" : ""}</div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {transfers.length === 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center h-full text-center py-20">
            <div className="w-20 h-20 rounded-3xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center mb-4">
              <FileText className="w-10 h-10 text-cyan-500/50" />
            </div>
            <p className="text-gray-400 font-medium">No active transfers</p>
            <p className="text-xs text-gray-600 mt-2">Send a file from the chat screen using the 📎 button</p>
          </motion.div>
        )}

        <AnimatePresence initial={false}>
          {transfers.map((t) => (
            <motion.div key={t.transferId} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }}
              className="bg-gradient-to-t from-[#1a1f2e] to-[#151823] rounded-2xl border border-cyan-500/10 overflow-hidden">
              <div className="p-4 pb-3">
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center flex-shrink-0">
                    <FileText className="w-6 h-6 text-cyan-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-medium truncate text-sm">{t.name || "Unknown file"}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-xs text-gray-500">{formatSize(t.size)}</span>
                      <span className="text-gray-700">·</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded-md font-medium ${t.direction === "out" ? "bg-blue-500/15 text-blue-400" : "bg-cyan-500/15 text-cyan-400"}`}>
                        {t.direction === "out" ? "↑ Sending" : "↓ Receiving"}
                      </span>
                      <span className="text-gray-700">·</span>
                      <StatusBadge status={t.status} />
                    </div>
                  </div>
                  {t.status === "done" && t.direction === "in" && (t as any).data && (
                    <a href={`data:application/octet-stream;base64,${(t as any).data}`} download={t.name}
                      className="w-9 h-9 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center hover:bg-cyan-500/30 transition-colors flex-shrink-0">
                      <Download className="w-4 h-4 text-cyan-400" />
                    </a>
                  )}
                </div>
              </div>

              <div className="px-4 pb-4">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-gray-500">
                    {t.status === "transferring" ? `${Math.round(t.progress)}% · ${formatSize(t.size * t.progress / 100)} of ${formatSize(t.size)}`
                      : t.status === "done" ? "Transfer complete"
                      : t.status === "integrity_fail" ? "⚠ SHA-256 mismatch — file corrupted"
                      : t.status === "failed" ? "Transfer failed" : "Paused"}
                  </span>
                  <span className="text-xs font-mono text-cyan-400">{Math.round(t.progress)}%</span>
                </div>

                <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <motion.div
                    className={`h-full rounded-full ${t.status === "done" ? "bg-green-400" : t.status === "integrity_fail" || t.status === "failed" ? "bg-red-400" : "bg-gradient-to-r from-cyan-500 to-blue-500"}`}
                    animate={{ width: `${t.progress}%` }} transition={{ duration: 0.3 }}
                  />
                </div>

                {t.status === "done" && (
                  <div className="flex items-center gap-1.5 mt-2">
                    <CheckCircle className="w-3 h-3 text-green-400" />
                    <span className="text-xs text-green-400">SHA-256 verified · integrity OK</span>
                  </div>
                )}
                {t.status === "integrity_fail" && (
                  <div className="flex items-center gap-1.5 mt-2">
                    <XCircle className="w-3 h-3 text-red-400" />
                    <span className="text-xs text-red-400">SHA-256 mismatch — file corrupted</span>
                  </div>
                )}

                {/* #18/#19 — Pause / Resume for outbound transfers */}
                {t.direction === "out" && (t.status === "transferring" || t.status === "paused") && (
                  <div className="flex items-center gap-2 mt-2">
                    {t.status === "transferring" ? (
                      <button onClick={() => pauseFileTransfer(t.transferId)}
                        className="flex items-center gap-1 px-3 py-1 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-xs hover:bg-yellow-500/20 transition-colors">
                        <Pause className="w-3 h-3" /> Pause
                      </button>
                    ) : (
                      <button onClick={() => resumeFileTransfer(t.transferId)}
                        className="flex items-center gap-1 px-3 py-1 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs hover:bg-cyan-500/20 transition-colors">
                        <Play className="w-3 h-3" /> Resume
                      </button>
                    )}
                    {(t as any).retryCount > 0 && (
                      <span className="text-[10px] text-gray-600">{(t as any).retryCount} retries</span>
                    )}
                  </div>
                )}

                <div className="mt-3 pt-3 border-t border-white/5">
                  <div className="text-xs text-gray-600 mb-2">Network route</div>
                  <div className="flex items-center justify-start">
                    {["You", "Mesh", "Peer"].map((label, i) => (
                      <div key={i} className="flex items-center">
                        <div className="flex flex-col items-center">
                          <div className="w-7 h-7 rounded-full border border-cyan-500/40 bg-cyan-500/10 flex items-center justify-center">
                            <div className="w-2 h-2 rounded-full bg-cyan-400" />
                          </div>
                          <span className="text-[10px] text-gray-600 mt-1">{label}</span>
                        </div>
                        {i < 2 && (
                          <div className="w-10 h-px bg-gradient-to-r from-cyan-500/50 to-cyan-500/20 mx-1 mb-4 relative overflow-hidden">
                            <motion.div className="absolute h-px w-3 bg-cyan-400/80" animate={{ x: [0, 40] }} transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }} />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    transferring: { label: "Transferring", cls: "text-yellow-400" },
    done:         { label: "✓ Done",       cls: "text-green-400" },
    failed:       { label: "Failed",       cls: "text-red-400" },
    integrity_fail: { label: "Corrupted",  cls: "text-red-400" },
    paused:       { label: "Paused",       cls: "text-gray-400" },
  };
  const c = map[status] ?? { label: status, cls: "text-gray-400" };
  return <span className={`text-xs ${c.cls}`}>{c.label}</span>;
}

function formatSize(bytes: number): string {
  if (!bytes) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
