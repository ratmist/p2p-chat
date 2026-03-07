import { ArrowLeft, Check, CheckCheck, SendHorizontal, Users } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Screen } from "../AppInner";
import { useMeshContext } from "../MeshContext";

type Props = { onNavigate: (screen: Screen) => void };

export default function GroupChatScreen({ onNavigate }: Props) {
  const { groupMessages, sendGroupMessage, nodeId, nodes, alias, status, typingPeers, sendTyping } = useMeshContext();
  const [message, setMessage] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [groupMessages.length]);

  const handleSend = () => {
    if (!message.trim()) return;
    sendGroupMessage(message.trim());
    setMessage("");
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const formatTime = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  // Build display name for a nodeId
  const getName = (id: string) => {
    if (id === nodeId) return alias;
    return nodes.find(n => n.nodeId === id)?.alias ?? id.slice(0, 8);
  };

  return (
    <div className="h-screen flex flex-col bg-[#0b1220]">
      {/* Header */}
      <div className="flex items-center gap-4 p-4 border-b border-cyan-500/10 bg-[#0d1117]/40 backdrop-blur-sm">
        <button onClick={() => onNavigate("discovery")} className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center hover:bg-cyan-500/20 transition-colors cursor-pointer">
          <ArrowLeft className="w-5 h-5 text-cyan-400" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-cyan-400" />
            <h2 className="font-medium text-white">Group Chat</h2>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <div className={`w-2 h-2 rounded-full ${status === "connected" ? "bg-green-400 animate-pulse" : "bg-gray-500"}`} />
            <span className="text-xs text-gray-400">{nodes.length + 1} members • Broadcast mesh</span>
          </div>
        </div>
        {/* Members avatars */}
        <div className="flex -space-x-2">
          {[...nodes.slice(0, 3)].map((n, i) => (
            <div key={n.nodeId} className="w-7 h-7 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 border-2 border-[#0b1220] flex items-center justify-center text-xs font-bold text-white">
              {n.alias[0]}
            </div>
          ))}
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {groupMessages.length === 0 && (
          <div className="text-center text-gray-600 text-sm mt-16">
            <div className="text-4xl mb-3">📡</div>
            <p className="font-medium text-gray-500">Group broadcast channel</p>
            <p className="text-xs mt-2">Messages sent to all {nodes.length} connected nodes</p>
          </div>
        )}

        {groupMessages.map((msg, i) => {
          const isMe = msg.from === nodeId;
          return (
            <motion.div
              key={msg.id}
              className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
            >
              {!isMe && (
                <span className="text-xs text-cyan-400 mb-1 px-1">{getName(msg.from)}</span>
              )}
              <div className={`max-w-[75%] rounded-2xl text-white ${isMe ? "bg-gradient-to-br from-cyan-500 to-blue-600" : "bg-[#1a1f2e]"}`}>
                <div className={`${isMe ? "bg-black/15" : ""} p-3`}>
                  <p className="text-sm">{msg.text}</p>
                  <div className="flex items-center gap-1 mt-1">
                    <span className="text-xs opacity-60">{formatTime(msg.ts)}</span>
                    {isMe && msg.status === "sent" && <Check className="w-3 h-3 opacity-60" />}
                    {isMe && msg.status === "delivered" && <CheckCheck className="w-3 h-3 text-cyan-300" />}
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Members sidebar hint */}
      {nodes.length > 0 && (
        <div className="mx-4 mb-2 px-3 py-2 bg-cyan-500/5 border border-cyan-500/10 rounded-xl">
          <p className="text-xs text-gray-500">
            Broadcasting to: <span className="text-cyan-400">{nodes.map(n => n.alias).join(", ")}</span>
          </p>
        </div>
      )}

      {nodes.length === 0 && (
        <div className="mx-4 mb-2 px-3 py-2 bg-yellow-500/5 border border-yellow-500/10 rounded-xl">
          <p className="text-xs text-yellow-500">⚠ No peers connected — messages won't be delivered</p>
        </div>
      )}

      {/* Input */}
      <div className="border-t border-cyan-500/10 bg-[#0d1117]/80 backdrop-blur-sm p-4">
        <div className="flex items-center gap-2">
          <div className="flex-1 bg-[#1a1f2e] rounded-2xl px-4 py-3 border border-cyan-500/10 focus-within:border-cyan-500/30 transition-colors">
            <input
              type="text"
              placeholder="Broadcast to all nodes..."
              value={message}
              onChange={e => { setMessage(e.target.value); sendTyping(); }}
              onKeyDown={handleKey}
              className="w-full bg-transparent outline-none text-sm placeholder:text-gray-500 text-white"
            />
          </div>
          {message && (
            <motion.button
              initial={{ scale: 0 }} animate={{ scale: 1 }}
              onClick={handleSend}
              className="w-10 h-10 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 flex items-center justify-center cursor-pointer"
            >
              <SendHorizontal className="w-5 h-5 text-white" />
            </motion.button>
          )}
        </div>
      </div>
    </div>
  );
}
