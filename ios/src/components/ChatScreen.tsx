import React, { useEffect, useRef, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, Check, CheckCheck, Download, FileText, Mic, Paperclip, Phone, SendHorizontal, Shield, ShieldAlert, Users, Video } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import type { Screen } from "../AppInner";
import { useMeshContext } from "../MeshContext";

type Props = { onNavigate: (screen: Screen) => void };

const BG = "#0b1220"; const PANEL = "rgba(13,17,23,0.40)"; const PANEL_STRONG = "rgba(13,17,23,0.80)";
const CYAN = "#06b6d4"; const BLUE = "#2563eb"; const OTHER_BUBBLE = "#1a1f2e";

export default function ChatScreen({ onNavigate }: Props) {
  const { messages, sendMessage, sendFileNative, selectedPeer, nodeId, status, rtt, p2pStatus, startCall, callState, peerTrust, myFingerprint, typingPeers, sendTyping } = useMeshContext() as any;
  const peerP2P = selectedPeer ? (p2pStatus?.get(selectedPeer.nodeId) ?? "none") : "none";
  const p2pLabel = peerP2P === "open" ? "P2P Direct" : peerP2P === "connecting" ? "P2P…" : "Relay";
  const trust = selectedPeer ? peerTrust?.get(selectedPeer.nodeId) : null;
  const isTyping = selectedPeer ? typingPeers?.has(selectedPeer.nodeId) : false;
  const [message, setMessage] = useState("");
  const [showFingerprint, setShowFingerprint] = useState(false);
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);

  const peerMessages = messages.filter((m: any) => m.from === selectedPeer?.nodeId || m.to === selectedPeer?.nodeId);

  useEffect(() => { scrollRef.current?.scrollToEnd({ animated: true }); }, [peerMessages.length]);

  const onSend = () => {
    if (!message.trim()) return;
    sendMessage(message.trim());
    setMessage("");
    scrollRef.current?.scrollToEnd({ animated: true });
  };

  const handlePickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
      if (sendFileNative) sendFileNative({ name: asset.name, size: asset.size ?? 0, base64, mimeType: asset.mimeType ?? "application/octet-stream" });
    } catch (e: any) { Alert.alert("Error", String(e?.message ?? e)); }
  };

  const handleOpenFile = async (msg: any) => {
    if (!msg.fileInfo?.data) { Alert.alert("File not available", "The file data was not received."); return; }
    try {
      const path = FileSystem.cacheDirectory + (msg.fileInfo.name ?? "file");
      await FileSystem.writeAsStringAsync(path, msg.fileInfo.data, { encoding: FileSystem.EncodingType.Base64 });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) await Sharing.shareAsync(path, { mimeType: msg.fileInfo.mimeType ?? "*/*", dialogTitle: msg.fileInfo.name });
      else Alert.alert("Saved", `File saved to: ${path}`);
    } catch (e: any) { Alert.alert("Error", `Could not open file: ${e?.message ?? String(e)}`); }
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
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text style={styles.title}>{selectedPeer?.alias ?? "Unknown"}</Text>
            {trust?.keyChanged && <ShieldAlert size={14} color="#ef4444" />}
            {trust && !trust.keyChanged && <Shield size={14} color="#4ade80" />}
          </View>
          <Pressable onPress={() => setShowFingerprint(v => !v)}>
            <View style={styles.subRow}>
              <View style={[styles.onlineDot, { backgroundColor: statusDotColor }]} />
              <Text style={styles.subtitle}>E2E encrypted • {p2pLabel}{rtt ? ` • ${rtt}ms` : ""}</Text>
            </View>
          </Pressable>
          {showFingerprint && trust && (
            <View style={styles.fpBox}>
              <Text style={styles.fpLabel}>Their fingerprint</Text>
              <Text style={styles.fpValue}>{trust.fingerprint}</Text>
              {trust.keyChanged && <Text style={styles.fpWarn}>⚠️ Key changed!</Text>}
              <Text style={styles.fpLabel}>Yours: {myFingerprint}</Text>
            </View>
          )}
        </View>
        <Pressable onPress={() => onNavigate("group")} style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.85 }]}>
          <Users size={20} color="#22d3ee" />
        </Pressable>
        <Pressable onPress={() => { if (selectedPeer && callState === "idle") startCall(selectedPeer.nodeId, false); }} disabled={callState !== "idle"}
          style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.85 }]}>
          <Phone size={20} color="#22d3ee" />
        </Pressable>
        <Pressable onPress={() => { if (selectedPeer && callState === "idle") startCall(selectedPeer.nodeId, true); }} disabled={callState !== "idle"}
          style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.85 }]}>
          <Video size={20} color="#22d3ee" />
        </Pressable>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={Platform.OS === "ios" ? 6 : 0}>
        <ScrollView ref={scrollRef} style={styles.messages} contentContainerStyle={[styles.messagesContent, { paddingBottom: 12 }]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {peerMessages.length === 0 && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>🔒</Text>
              <Text style={styles.emptyTitle}>Messages are end-to-end encrypted</Text>
              <Text style={styles.emptyDesc}>Say hello to {selectedPeer?.alias}</Text>
            </View>
          )}

          {peerMessages.map((msg: any) => {
            const isMe = msg.from === nodeId;
            const isFile = msg.type === "file" && msg.fileInfo;
            return (
              <View key={msg.id} style={[styles.msgRow, isMe ? styles.rowRight : styles.rowLeft]}>
                {isMe ? (
                  <LinearGradient colors={[CYAN, BLUE]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.bubbleBase, isFile && styles.bubbleFile]}>
                    <View style={[styles.bubbleInner, styles.bubbleMineInner]}>
                      {isFile ? (
                        <View style={styles.fileRow}>
                          <View style={styles.fileIconBox}><FileText size={18} color="#22d3ee" /></View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.fileName} numberOfLines={1}>{msg.fileInfo.name}</Text>
                            <Text style={styles.fileSize}>{(msg.fileInfo.size / 1024).toFixed(1)} KB • Sent</Text>
                          </View>
                        </View>
                      ) : <Text style={styles.msgText}>{msg.text}</Text>}
                      <View style={styles.metaRow}>
                        <Text style={styles.timeText}>{formatTime(msg.ts)}</Text>
                        {msg.status === "sending" && <Text style={styles.timeText}>⏳</Text>}
                        {msg.status === "sent" && <Check size={14} color="rgba(255,255,255,0.7)" />}
                        {msg.status === "delivered" && <CheckCheck size={14} color="#67e8f9" />}
                        {msg.status === "failed" && <Text style={{ color: "#ef4444", fontSize: 12 }}>!</Text>}
                      </View>
                    </View>
                  </LinearGradient>
                ) : (
                  <Pressable onPress={() => isFile ? handleOpenFile(msg) : undefined}
                    style={({ pressed }) => [styles.bubbleBase, styles.bubbleOtherBg, isFile && styles.bubbleFile, pressed && isFile && { opacity: 0.85 }]}>
                    <View style={styles.bubbleInner}>
                      {isFile ? (
                        <View style={styles.fileRow}>
                          <View style={styles.fileIconBox}><FileText size={18} color="#22d3ee" /></View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.fileName} numberOfLines={1}>{msg.fileInfo.name}</Text>
                            <Text style={styles.fileSize}>{(msg.fileInfo.size / 1024).toFixed(1)} KB</Text>
                          </View>
                          <View style={styles.downloadBtn}><Download size={16} color="#22d3ee" /></View>
                        </View>
                      ) : <Text style={styles.msgText}>{msg.text}</Text>}
                      <View style={styles.metaRow}>
                        <Text style={styles.timeText}>{formatTime(msg.ts)}</Text>
                        {!isMe && msg.route && msg.route.length > 2 && (
                          <Text style={{ color: "rgba(255,255,255,0.2)", fontSize: 9 }}>{msg.route.length - 1} hops</Text>
                        )}
                      </View>
                    </View>
                  </Pressable>
                )}
              </View>
            );
          })}
        </ScrollView>

        {/* Typing indicator */}
        {isTyping && (
          <View style={styles.typingRow}>
            <View style={styles.typingBubble}>
              <View style={styles.typingDots}>
                {[0, 1, 2].map(i => <View key={i} style={styles.typingDot} />)}
              </View>
              <Text style={styles.typingText}>{selectedPeer?.alias} is typing…</Text>
            </View>
          </View>
        )}

        <View style={[styles.inputWrap, { paddingBottom: Math.max(12, insets.bottom + 10) }]}>
          <View style={styles.inputRow}>
            <Pressable onPress={handlePickFile} style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.85 }]}>
              <Paperclip size={20} color="#22d3ee" />
            </Pressable>
            <View style={styles.inputBox}>
              <TextInput value={message} onChangeText={t => { setMessage(t); if (t.length > 0) sendTyping?.(); }}
                placeholder="Type a message..." placeholderTextColor="#6b7280" style={styles.input}
                returnKeyType="send" onSubmitEditing={onSend} />
            </View>
            <Pressable style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.85 }]}>
              <Mic size={20} color="#22d3ee" />
            </Pressable>
            {!!message.trim() && (
              <Pressable onPress={onSend} style={({ pressed }) => [styles.sendWrap, pressed && { transform: [{ scale: 0.98 }] }]}>
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
  header: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(6,182,212,0.12)", backgroundColor: PANEL },
  headerBtn: { width: 40, height: 40, borderRadius: 14, backgroundColor: "rgba(6,182,212,0.10)", alignItems: "center", justifyContent: "center" },
  headerCenter: { flex: 1 },
  title: { color: "white", fontWeight: "600", fontSize: 16 },
  subRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 },
  onlineDot: { width: 8, height: 8, borderRadius: 999 },
  subtitle: { color: "#9ca3af", fontSize: 12 },
  fpBox: { marginTop: 4, padding: 8, backgroundColor: "rgba(0,0,0,0.4)", borderRadius: 8, borderWidth: 1, borderColor: "rgba(6,182,212,0.2)" },
  fpLabel: { color: "#6b7280", fontSize: 9 },
  fpValue: { color: "#22d3ee", fontSize: 9, fontFamily: "Courier" },
  fpWarn: { color: "#ef4444", fontSize: 9, marginTop: 2 },
  messages: { flex: 1 },
  messagesContent: { paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  emptyState: { alignItems: "center", paddingVertical: 60 },
  emptyIcon: { fontSize: 36, marginBottom: 12 },
  emptyTitle: { color: "#9ca3af", fontSize: 15, fontWeight: "600" },
  emptyDesc: { color: "#6b7280", fontSize: 13, marginTop: 6 },
  msgRow: { width: "100%" },
  rowRight: { alignItems: "flex-end" },
  rowLeft: { alignItems: "flex-start" },
  bubbleBase: { maxWidth: "85%", borderRadius: 18, overflow: "hidden" },
  bubbleFile: { minWidth: 220, maxWidth: "90%" },
  bubbleInner: { padding: 12 },
  bubbleMineInner: { backgroundColor: "rgba(0,0,0,0.15)" },
  bubbleOtherBg: { backgroundColor: OTHER_BUBBLE },
  msgText: { color: "white", fontSize: 14, lineHeight: 20 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 },
  timeText: { color: "rgba(255,255,255,0.60)", fontSize: 12 },
  fileRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 4 },
  fileIconBox: { width: 36, height: 36, borderRadius: 10, backgroundColor: "rgba(6,182,212,0.20)", alignItems: "center", justifyContent: "center" },
  fileName: { color: "white", fontSize: 13, fontWeight: "600" },
  fileSize: { color: "rgba(255,255,255,0.55)", fontSize: 11, marginTop: 2 },
  downloadBtn: { width: 30, height: 30, borderRadius: 8, backgroundColor: "rgba(6,182,212,0.15)", alignItems: "center", justifyContent: "center" },
  typingRow: { paddingHorizontal: 16, paddingBottom: 4 },
  typingBubble: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: OTHER_BUBBLE, alignSelf: "flex-start", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, borderBottomLeftRadius: 4 },
  typingDots: { flexDirection: "row", gap: 3 },
  typingDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#22d3ee", opacity: 0.7 },
  typingText: { color: "#9ca3af", fontSize: 12 },
  inputWrap: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(6,182,212,0.12)", backgroundColor: PANEL_STRONG, paddingHorizontal: 16, paddingTop: 12 },
  inputRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  iconBtn: { width: 40, height: 40, borderRadius: 14, backgroundColor: "rgba(6,182,212,0.10)", alignItems: "center", justifyContent: "center" },
  inputBox: { flex: 1, borderRadius: 18, backgroundColor: OTHER_BUBBLE, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: "rgba(6,182,212,0.12)" },
  input: { color: "white", fontSize: 14 },
  sendWrap: { width: 40, height: 40, borderRadius: 14, overflow: "hidden" },
  sendBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
});
