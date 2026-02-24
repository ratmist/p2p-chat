import { ArrowLeft, Check, CheckCheck, FileText, Image as ImageIcon, Mic, Paperclip, Phone, SendHorizontal } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { Screen } from "../AppInner";

type ChatScreenProps = {
  onNavigate: (screen: Screen) => void;
};

type Message = {
  id: string;
  text: string;
  sender: "me" | "other";
  timestamp: string;
  status?: "sent" | "delivered" | "read";
  type?: "text" | "file" | "image";
  fileInfo?: {
    name: string;
    size: string;
    preview?: string;
  };
};

const mockMessages: Message[] = [
  {
    id: "1",
    text: "Hey, are you in range?",
    sender: "other",
    timestamp: "10:23",
  },
  {
    id: "2",
    text: "Yes, connected via mesh. Signal is strong.",
    sender: "me",
    timestamp: "10:24",
    status: "read",
  },
  {
    id: "3",
    text: "Perfect. I'll send you the mission briefing document.",
    sender: "other",
    timestamp: "10:24",
  },
  {
    id: "4",
    text: "",
    sender: "other",
    timestamp: "10:25",
    type: "file",
    fileInfo: {
      name: "mission_briefing.pdf",
      size: "2.4 MB",
    },
  },
  {
    id: "5",
    text: "Got it. Reviewing now.",
    sender: "me",
    timestamp: "10:26",
    status: "delivered",
  },
  {
    id: "6",
    text: "",
    sender: "me",
    timestamp: "10:27",
    type: "image",
    status: "sent",
    fileInfo: {
      name: "location_map.jpg",
      size: "1.8 MB",
      preview: "map",
    },
  },
];

export default function ChatScreen({ onNavigate }: ChatScreenProps) {
  const [message, setMessage] = useState("");
  return (
    <div className="h-screen flex flex-col bg-[#0b1220]">
      <div className="flex items-center gap-4 p-4 border-b border-cyan-500/10 bg-[#0d1117]/40 backdrop-blur-sm">
        <button 
          onClick={() => onNavigate("discovery")}
          className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center hover:bg-cyan-500/20 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-5 h-5 text-cyan-400" />
        </button>

        <div className="flex-1">
          <h2 className="font-medium text-white">Alex's Phone</h2>
          <div className="flex items-center gap-2 mt-0.5">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            <span className="text-xs text-gray-400">
              End-to-end encrypted • Mesh routed
            </span>
          </div>
        </div>

        <button
          onClick={() => onNavigate("call")}
          className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center hover:bg-cyan-500/20 transition-colors cursor-pointer"
        >
          <Phone className="w-5 h-5 text-cyan-400" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {mockMessages.map((msg, i) => (
          <motion.div
            key={msg.id}
            className={`flex ${msg.sender === "me" ? "justify-end" : "justify-start"}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
          >
            <div className={`max-w-[75%] ${msg.sender === "me"? "bg-linear-to-br from-cyan-500 to-blue-600": "bg-[#1a1f2e]"} rounded-2xl  text-white`}>
              <div className={`${msg.sender === "me"? "bg-black/15": ""} p-3`}>
                {msg.type === "text" || !msg.type ? (<p className="text-sm">{msg.text}</p>) : null}
                {msg.type === "file" && msg.fileInfo && (
                  <div className="flex items-center gap-3 p-2 cursor-pointer" onClick={() => onNavigate("fileTransfer")}>
                    <div className="w-10 h-10 rounded-lg bg-cyan-500/20 flex items-center justify-center">
                      <FileText className="w-5 h-5 text-cyan-400" />
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-medium">
                        {msg.fileInfo.name}
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {msg.fileInfo.size}
                      </div>
                    </div>
                  </div>
                )}
                {msg.type === "image" && msg.fileInfo && (
                  <div className="cursor-pointer" onClick={() => onNavigate("fileTransfer")}>
                    <div className="w-48 h-32 flex items-center justify-center">
                      <ImageIcon className="w-8 h-8 text-cyan-400/50" />
                    </div>
                    <div className="text-sm text-gray-300 px-2">
                      {msg.fileInfo.name}
                    </div>
                  </div>
                )}

                <div className={`flex items-center gap-1 mt-1 ${msg.type === "file" || msg.type === "image" ? "px-2 pb-1" : ""}`}>
                  <span className="text-xs opacity-70">{msg.timestamp}</span>
                  {msg.sender === "me" && (
                    <>
                      {msg.status === "sent" && (
                        <Check className="w-3 h-3 opacity-70" />
                      )}
                      {msg.status === "delivered" && (
                        <CheckCheck className="w-3 h-3 opacity-70" />
                      )}
                      {msg.status === "read" && (
                        <CheckCheck className="w-3 h-3 text-cyan-300" />
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="border-t border-cyan-500/10 bg-[#0d1117]/80 backdrop-blur-sm p-4">
        <div className="flex items-center gap-2">
          <button className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center hover:bg-cyan-500/20 transition-colors cursor-pointer">
            <Paperclip className="w-5 h-5 text-cyan-400" />
          </button>

          <div className="flex-1 bg-[#1a1f2e] rounded-2xl px-4 py-3 border border-cyan-500/10 focus-within:border-cyan-500/30 transition-colors">
            <input type="text" placeholder="Type a message..." value={message} onChange={(e) => setMessage(e.target.value)} className="w-full bg-transparent outline-none text-sm placeholder:text-gray-500 text-white"/>
          </div>

          <button className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center hover:bg-cyan-500/20 transition-colors cursor-pointer">
            <Mic className="w-5 h-5 text-cyan-400" />
          </button>

          {message && (
            <motion.button initial={{ scale: 0 }} animate={{ scale: 1 }}
              className="w-10 h-10 rounded-xl bg-linear-to-r from-cyan-500 to-blue-600 flex items-center justify-center">
              <SendHorizontal className="w-5 h-5 text-white" />
            </motion.button>
          )}
        </div>
      </div>
    </div>
  );
}
