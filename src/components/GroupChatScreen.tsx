import React, { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, Check, CheckCheck, SendHorizontal, Users } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import type { Screen } from "../AppInner";
import { useMeshContext } from "../MeshContext";

type Props = { onNavigate: (screen: Screen) => void };

const BG = "#0b1220"; const PANEL = "rgba(13,17,23,0.40)"; const PANEL_STRONG = "rgba(13,17,23,0.80)";
const CYAN = "#06b6d4"; const BLUE = "#2563eb"; const OTHER_BUBBLE = "#1a1f2e";

export default function GroupChatScreen({ onNavigate }: Props) {
  const { groupMessages, sendGroupMessage, nodeId, nodes, alias, status, typingPeers, sendTyping } = useMeshContext();
  const [message, setMessage] = useState("");
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);

  // Typing peers in group (anyone except self)
  const typingNames = nodes.filter(n => typingPeers.has(n.nodeId)).map(n => n.alias);

  useEffect(() => { scrollRef.current?.scrollToEnd({ animated: true }); }, [groupMessages.length]);

  const handleSend = () => {
    if (!message.trim()) return;
    sendGroupMessage(message.trim());
    setMessage("");
    scrollRef.current?.scrollToEnd({ animated: true });
  };

  const getName = (id: string) => {
    if (id === nodeId) return alias;
    return nodes.find(n => n.nodeId === id)?.alias ?? id.slice(0, 8);
  };

  const formatTime = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const statusDotColor = status === "connected" ? "#4ade80" : "#6b7280";

  return (
    <SafeAreaView style={styles.root} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <Pressable onPress={() => onNavigate("discovery")} style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.85 }]}>
          <ArrowLeft size={20} color="#22d3ee" />
        </Pressable>
        <View style={styles.headerCenter}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Users size={16} color="#22d3ee" />
            <Text style={styles.title}>Group Chat</Text>
          </View>
          <View style={styles.subRow}>
            <View style={[styles.dot, { backgroundColor: statusDotColor }]} />
            <Text style={styles.subtitle}>{nodes.length + 1} members · Broadcast mesh</Text>
          </View>
        </View>
        {/* Member avatars */}
        <View style={{ flexDirection: "row" }}>
          {nodes.slice(0, 3).map((n, i) => (
            <View key={n.nodeId} style={[styles.avatar, { marginLeft: i > 0 ? -6 : 0 }]}>
              <Text style={styles.avatarText}>{n.alias[0]}</Text>
            </View>
          ))}
        </View>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={Platform.OS === "ios" ? 6 : 0}>
        <ScrollView ref={scrollRef} style={styles.messages} contentContainerStyle={[styles.messagesContent, { paddingBottom: 12 }]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {groupMessages.length === 0 && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>📡</Text>
              <Text style={styles.emptyTitle}>Group broadcast channel</Text>
              <Text style={styles.emptyDesc}>Messages sent to all {nodes.length} connected nodes</Text>
            </View>
          )}

          {(groupMessages as any[]).map((msg: any) => {
            const isMe = msg.from === nodeId;
            return (
              <View key={msg.id} style={[styles.msgRow, isMe ? styles.rowRight : styles.rowLeft]}>
                {!isMe && <Text style={styles.senderName}>{getName(msg.from)}</Text>}
                {isMe ? (
                  <LinearGradient colors={[CYAN, BLUE]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.bubbleBase}>
                    <View style={[styles.bubbleInner, { backgroundColor: "rgba(0,0,0,0.15)" }]}>
                      <Text style={styles.msgText}>{msg.text}</Text>
                      <View style={styles.metaRow}>
                        <Text style={styles.timeText}>{formatTime(msg.ts)}</Text>
                        {msg.status === "sent" && <Check size={12} color="rgba(255,255,255,0.6)" />}
                        {msg.status === "delivered" && <CheckCheck size={12} color="#67e8f9" />}
                      </View>
                    </View>
                  </LinearGradient>
                ) : (
                  <View style={[styles.bubbleBase, { backgroundColor: OTHER_BUBBLE }]}>
                    <View style={styles.bubbleInner}>
                      <Text style={styles.msgText}>{msg.text}</Text>
                      <Text style={styles.timeText}>{formatTime(msg.ts)}</Text>
                    </View>
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>

        {/* Typing indicator */}
        {typingNames.length > 0 && (
          <View style={styles.typingRow}>
            <View style={styles.typingBubble}>
              <View style={styles.typingDots}>
                {[0,1,2].map(i => <View key={i} style={styles.typingDot} />)}
              </View>
              <Text style={styles.typingText}>{typingNames.join(", ")} {typingNames.length === 1 ? "is" : "are"} typing…</Text>
            </View>
          </View>
        )}

        {nodes.length === 0 && (
          <View style={styles.warnBanner}>
            <Text style={styles.warnText}>⚠ No peers connected — messages won't be delivered</Text>
          </View>
        )}

        {/* Broadcasting to hint */}
        {nodes.length > 0 && (
          <View style={styles.broadcastHint}>
            <Text style={styles.broadcastText}>Broadcasting to: <Text style={{ color: "#22d3ee" }}>{nodes.map(n => n.alias).join(", ")}</Text></Text>
          </View>
        )}

        <View style={[styles.inputWrap, { paddingBottom: Math.max(12, insets.bottom + 10) }]}>
          <View style={styles.inputRow}>
            <View style={styles.inputBox}>
              <TextInput value={message} onChangeText={t => { setMessage(t); if (t.length > 0) sendTyping?.(); }}
                placeholder="Broadcast to all nodes..." placeholderTextColor="#6b7280" style={styles.input}
                returnKeyType="send" onSubmitEditing={handleSend} />
            </View>
            {!!message.trim() && (
              <Pressable onPress={handleSend} style={({ pressed }) => [styles.sendWrap, pressed && { transform: [{ scale: 0.98 }] }]}>
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

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(6,182,212,0.12)", backgroundColor: PANEL },
  headerBtn: { width: 40, height: 40, borderRadius: 14, backgroundColor: "rgba(6,182,212,0.10)", alignItems: "center", justifyContent: "center" },
  headerCenter: { flex: 1 },
  title: { color: "white", fontWeight: "600", fontSize: 16 },
  subRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 },
  dot: { width: 8, height: 8, borderRadius: 999 },
  subtitle: { color: "#9ca3af", fontSize: 12 },
  avatar: { width: 26, height: 26, borderRadius: 13, backgroundColor: CYAN, borderWidth: 2, borderColor: BG, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "white", fontSize: 11, fontWeight: "700" },
  messages: { flex: 1 },
  messagesContent: { paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  emptyState: { alignItems: "center", paddingVertical: 60 },
  emptyIcon: { fontSize: 36, marginBottom: 12 },
  emptyTitle: { color: "#9ca3af", fontSize: 15, fontWeight: "600" },
  emptyDesc: { color: "#6b7280", fontSize: 13, marginTop: 6, textAlign: "center" },
  msgRow: { width: "100%", marginBottom: 4 },
  rowRight: { alignItems: "flex-end" },
  rowLeft: { alignItems: "flex-start" },
  senderName: { color: "#22d3ee", fontSize: 11, marginBottom: 3, paddingHorizontal: 4 },
  bubbleBase: { maxWidth: "78%", borderRadius: 18, overflow: "hidden" },
  bubbleInner: { padding: 12 },
  msgText: { color: "white", fontSize: 14, lineHeight: 20 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  timeText: { color: "rgba(255,255,255,0.5)", fontSize: 11 },
  typingRow: { paddingHorizontal: 16, paddingBottom: 4 },
  typingBubble: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: OTHER_BUBBLE, alignSelf: "flex-start", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, borderBottomLeftRadius: 4 },
  typingDots: { flexDirection: "row", gap: 3 },
  typingDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#22d3ee", opacity: 0.7 },
  typingText: { color: "#9ca3af", fontSize: 12 },
  warnBanner: { marginHorizontal: 16, marginBottom: 8, padding: 10, borderRadius: 12, backgroundColor: "rgba(234,179,8,0.08)", borderWidth: 1, borderColor: "rgba(234,179,8,0.15)" },
  warnText: { color: "#fbbf24", fontSize: 12, textAlign: "center" },
  broadcastHint: { marginHorizontal: 16, marginBottom: 6, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: "rgba(6,182,212,0.05)", borderRadius: 10, borderWidth: 1, borderColor: "rgba(6,182,212,0.10)" },
  broadcastText: { color: "#6b7280", fontSize: 11 },
  inputWrap: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(6,182,212,0.12)", backgroundColor: PANEL_STRONG, paddingHorizontal: 16, paddingTop: 12 },
  inputRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  inputBox: { flex: 1, borderRadius: 18, backgroundColor: OTHER_BUBBLE, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: "rgba(6,182,212,0.12)" },
  input: { color: "white", fontSize: 14 },
  sendWrap: { width: 40, height: 40, borderRadius: 14, overflow: "hidden" },
  sendBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
});
