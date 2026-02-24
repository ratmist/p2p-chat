import React, { useEffect, useMemo, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, Check, CheckCheck, FileText, Image as ImageIcon, Mic, Paperclip, Phone, SendHorizontal } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import type { Screen } from "../AppInner";

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
    timestamp: "10:23" 
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
    fileInfo: { name: "mission_briefing.pdf", size: "2.4 MB" },
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
    fileInfo: { name: "location_map.jpg", size: "1.8 MB", preview: "map" },
  },
];

const BG = "#0b1220";
const PANEL = "rgba(13,17,23,0.40)";
const PANEL_STRONG = "rgba(13,17,23,0.80)";
const CYAN = "#06b6d4";
const BLUE = "#2563eb";
const OTHER_BUBBLE = "#1a1f2e";

export default function ChatScreen({ onNavigate }: ChatScreenProps) {
  const [message, setMessage] = useState("");
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const messages = useMemo(() => mockMessages, []);

  const scrollToBottom = (animated = true) => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd?.({ animated });
    });
  };

  useEffect(() => {
    scrollToBottom(false);
  }, []);

  const onSend = () => {
    if (!message.trim()) return;
    setMessage("");
    scrollToBottom(true);
  };

  return (
    <SafeAreaView style={styles.root} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <Pressable onPress={() => onNavigate("discovery")} style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.85 }]}>
          <ArrowLeft size={20} color="#22d3ee" />
        </Pressable>

        <View style={styles.headerCenter}>
          <Text style={styles.title}>Alex&apos;s Phone</Text>
          <View style={styles.subRow}>
            <View style={styles.onlineDot} />
            <Text style={styles.subtitle}>End-to-end encrypted • Mesh routed</Text>
          </View>
        </View>

        <Pressable onPress={() => onNavigate("call")} style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.85 }]}>
          <Phone size={20} color="#22d3ee" />
        </Pressable>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={Platform.OS === "ios" ? 6 : 0}>
        <ScrollView ref={scrollRef} style={styles.messages}
          contentContainerStyle={[ styles.messagesContent, { paddingBottom: 12 + (insets.bottom ? 0 : 0) }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scrollToBottom(true)}
        >
          {messages.map((msg) => (
            <MessageBubble key={msg.id} msg={msg} onOpenFile={() => onNavigate("fileTransfer")}/>
          ))}
        </ScrollView>

        <View style={[styles.inputWrap, { paddingBottom: Math.max(12, insets.bottom + 10) }]}>
          <View style={styles.inputRow}>
            <Pressable style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.85 }]}>
              <Paperclip size={20} color="#22d3ee" />
            </Pressable>

            <View style={styles.inputBox}>
              <TextInput
                value={message}
                onChangeText={setMessage}
                placeholder="Type a message..."
                placeholderTextColor="#6b7280"
                style={styles.input}
                returnKeyType="send"
                onSubmitEditing={onSend}
              />
            </View>

            <Pressable style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.85 }]}>
              <Mic size={20} color="#22d3ee" />
            </Pressable>

            {!!message.trim() && (
              <Pressable onPress={onSend} style={({ pressed }) => [styles.sendWrap, pressed && { transform: [{ scale: 0.98 }] }]} >
                <LinearGradient colors={[CYAN, BLUE]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.sendBtn}>
                  <SendHorizontal size={20} color="white" />
                </LinearGradient>
              </Pressable>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function MessageBubble({msg, onOpenFile,}: {msg: Message; onOpenFile: () => void;}) {
  const mine = msg.sender === "me";
  const bubbleOuterStyle = mine ? styles.bubbleMineOuter : styles.bubbleOtherOuter;
  return (
    <View style={[styles.msgRow, mine ? styles.rowRight : styles.rowLeft]}>
      {mine ? (
        <LinearGradient colors={[CYAN, BLUE]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.bubbleBase, bubbleOuterStyle]}>
          <View style={[styles.bubbleInner, styles.bubbleMineInner]}>
            <BubbleContent msg={msg} onOpenFile={onOpenFile} />
          </View>
        </LinearGradient>
      ) : (
        <View style={[styles.bubbleBase, bubbleOuterStyle, styles.bubbleOtherBg]}>
          <View style={styles.bubbleInner}>
            <BubbleContent msg={msg} onOpenFile={onOpenFile} />
          </View>
        </View>
      )}
    </View>
  );
}

function BubbleContent({ msg, onOpenFile }: { msg: Message; onOpenFile: () => void }) {
  const mine = msg.sender === "me";
  return (
    <>
      {(msg.type === "text" || !msg.type) && (
        <Text style={styles.msgText}>{msg.text}</Text>
      )}

      {msg.type === "file" && msg.fileInfo && (
        <Pressable onPress={onOpenFile} style={({ pressed }) => [styles.fileRow, pressed && { opacity: 0.9 }]}>
          <View style={styles.fileIconBox}>
            <FileText size={18} color="#22d3ee" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.fileName} numberOfLines={1}>
              {msg.fileInfo.name}
            </Text>
            <Text style={styles.fileSize}>{msg.fileInfo.size}</Text>
          </View>
        </Pressable>
      )}

      {msg.type === "image" && msg.fileInfo && (
        <Pressable onPress={onOpenFile} style={({ pressed }) => [styles.imageWrap, pressed && { opacity: 0.9 }]}>
          <View style={styles.imageStub}>
            <ImageIcon size={26} color="rgba(34,211,238,0.55)" />
          </View>
          <Text style={styles.imageName} numberOfLines={1}>
            {msg.fileInfo.name}
          </Text>
        </Pressable>
      )}

      <View style={[styles.metaRow, (msg.type === "file" || msg.type === "image") && styles.metaRowPadded]}>
        <Text style={styles.timeText}>{msg.timestamp}</Text>
        {mine && (
          <>
            {msg.status === "sent" && <Check size={14} color="rgba(255,255,255,0.7)" />}
            {msg.status === "delivered" && <CheckCheck size={14} color="rgba(255,255,255,0.7)" />}
            {msg.status === "read" && <CheckCheck size={14} color="#67e8f9" />}
          </>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },

  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(6,182,212,0.12)",
    backgroundColor: PANEL,
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: "rgba(6,182,212,0.10)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: { flex: 1 },
  title: { color: "white", fontWeight: "600", fontSize: 16 },
  subRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 },
  onlineDot: { width: 8, height: 8, borderRadius: 999, backgroundColor: "#4ade80" },
  subtitle: { color: "#9ca3af", fontSize: 12 },

  messages: { flex: 1 },
  messagesContent: { paddingHorizontal: 16, paddingVertical: 14, gap: 12 },

  msgRow: { width: "100%" },
  rowRight: { alignItems: "flex-end" },
  rowLeft: { alignItems: "flex-start" },

  bubbleBase: {
    maxWidth: "78%",
    borderRadius: 18,
    overflow: "hidden",
  },
  bubbleInner: { padding: 12 },
  bubbleMineInner: { backgroundColor: "rgba(0,0,0,0.15)" },

  bubbleMineOuter: {},
  bubbleOtherOuter: {},
  bubbleOtherBg: { backgroundColor: OTHER_BUBBLE },

  msgText: { color: "white", fontSize: 14, lineHeight: 20 },

  fileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  fileIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(6,182,212,0.20)",
    alignItems: "center",
    justifyContent: "center",
  },
  fileName: { color: "white", fontSize: 13, fontWeight: "600" },
  fileSize: { color: "#9ca3af", fontSize: 12, marginTop: 2 },

  imageWrap: { gap: 8 },
  imageStub: {
    width: 192,
    height: 128,
    borderRadius: 14,
    backgroundColor: "rgba(6,182,212,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  imageName: { color: "#d1d5db", fontSize: 13, paddingHorizontal: 4 },

  metaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 },
  metaRowPadded: { paddingHorizontal: 4, paddingBottom: 2 },
  timeText: { color: "rgba(255,255,255,0.70)", fontSize: 12 },

  inputWrap: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(6,182,212,0.12)",
    backgroundColor: PANEL_STRONG,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  inputRow: { flexDirection: "row", alignItems: "center", gap: 10 },

  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: "rgba(6,182,212,0.10)",
    alignItems: "center",
    justifyContent: "center",
  },

  inputBox: {
    flex: 1,
    borderRadius: 18,
    backgroundColor: OTHER_BUBBLE,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "rgba(6,182,212,0.12)",
  },
  input: { color: "white", fontSize: 14 },

  sendWrap: { width: 40, height: 40, borderRadius: 14, overflow: "hidden" },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
});