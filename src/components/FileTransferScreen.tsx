import React, { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Stop } from "react-native-svg";
import { ArrowLeft, CheckCircle, FileText, Pause, Play, XCircle } from "lucide-react-native";
import type { Screen } from "../AppInner";
import { useMeshContext } from "../MeshContext";

type Props = { onNavigate: (screen: Screen) => void };

const BG = "#0b1220"; const PANEL = "rgba(13,17,23,0.40)";
const CYAN = "#06b6d4"; const CYAN2 = "#22d3ee"; const BLUE = "#2563eb";
const GRAY400 = "#9ca3af"; const GRAY500 = "#6b7280"; const CARD = "#151823";
const GREEN = "#4ade80"; const RED = "#f87171";

export default function FileTransferScreen({ onNavigate }: Props) {
  const { fileProgress, selectedPeer, pauseFileTransfer, resumeFileTransfer } = useMeshContext();
  const insets = useSafeAreaInsets();
  const transfers = [...fileProgress.values()].reverse();

  return (
    <SafeAreaView style={styles.root} edges={["top", "left", "right"]}>
      <View style={[styles.header, { paddingTop: 12 }]}>
        <Pressable onPress={() => onNavigate("chat")} style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.9 }]}>
          <ArrowLeft size={20} color={CYAN2} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>File Transfers</Text>
          <Text style={styles.headerSub}>{selectedPeer ? `with ${selectedPeer.alias}` : "No peer"} · SHA-256 verified</Text>
        </View>
        <Text style={styles.countText}>{transfers.length} transfer{transfers.length !== 1 ? "s" : ""}</Text>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.content, { paddingBottom: Math.max(32, insets.bottom + 20) }]} showsVerticalScrollIndicator={false}>
        {transfers.length === 0 && (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconBox}><FileText size={32} color={CYAN2} style={{ opacity: 0.4 }} /></View>
            <Text style={styles.emptyTitle}>No active transfers</Text>
            <Text style={styles.emptyDesc}>Send a file from the chat screen using the 📎 button</Text>
          </View>
        )}

        {transfers.map(t => (
          <View key={t.transferId} style={styles.card}>
            {/* Top row: icon + name + badges */}
            <View style={styles.topRow}>
              <View style={styles.fileIconBox}><FileText size={24} color={CYAN2} /></View>
              <View style={{ flex: 1, marginHorizontal: 12 }}>
                <Text style={styles.fileName} numberOfLines={1}>{t.name || "Unknown file"}</Text>
                <View style={styles.badgeRow}>
                  <Text style={styles.sizeText}>{formatSize(t.size)}</Text>
                  <View style={[styles.dirBadge, { backgroundColor: t.direction === "out" ? "rgba(59,130,246,0.15)" : "rgba(6,182,212,0.15)" }]}>
                    <Text style={[styles.dirText, { color: t.direction === "out" ? "#60a5fa" : CYAN2 }]}>
                      {t.direction === "out" ? "↑ Sending" : "↓ Receiving"}
                    </Text>
                  </View>
                  <StatusBadge status={t.status} />
                </View>
              </View>
            </View>

            {/* Progress bar */}
            <View style={styles.progressBg}>
              <View style={[styles.progressFill, {
                width: `${t.progress}%` as any,
                backgroundColor: t.status === "done" ? GREEN : t.status === "integrity_fail" || t.status === "failed" ? RED : CYAN,
              }]} />
            </View>

            {/* Stats row */}
            <View style={styles.statsRow}>
              <Text style={styles.progressLabel}>
                {t.status === "transferring"
                  ? `${Math.round(t.progress)}% · ${formatSize(t.size * t.progress / 100)} / ${formatSize(t.size)}`
                  : t.status === "done" ? "Transfer complete"
                  : t.status === "integrity_fail" ? "⚠ SHA-256 mismatch"
                  : t.status === "failed" ? "Transfer failed" : "Paused"}
              </Text>
              <Text style={styles.progressPct}>{Math.round(t.progress)}%</Text>
            </View>

            {/* Integrity result */}
            {t.status === "done" && (
              <View style={styles.integrityRow}>
                <CheckCircle size={14} color={GREEN} />
                <Text style={[styles.integrityText, { color: GREEN }]}>SHA-256 verified · integrity OK</Text>
              </View>
            )}
            {t.status === "integrity_fail" && (
              <View style={styles.integrityRow}>
                <XCircle size={14} color={RED} />
                <Text style={[styles.integrityText, { color: RED }]}>SHA-256 mismatch — file corrupted</Text>
              </View>
            )}

            {/* #18/#19 — Pause / Resume for outbound transfers */}
            {t.direction === "out" && (t.status === "transferring" || t.status === "paused") && (
              <View style={styles.pauseRow}>
                {t.status === "transferring" ? (
                  <Pressable onPress={() => pauseFileTransfer(t.transferId)}
                    style={({ pressed }) => [styles.pauseBtn, pressed && { opacity: 0.8 }]}>
                    <Pause size={13} color="#fbbf24" />
                    <Text style={[styles.pauseBtnText, { color: "#fbbf24" }]}>Pause</Text>
                  </Pressable>
                ) : (
                  <Pressable onPress={() => resumeFileTransfer(t.transferId)}
                    style={({ pressed }) => [styles.resumeBtn, pressed && { opacity: 0.8 }]}>
                    <Play size={13} color={CYAN2} />
                    <Text style={[styles.pauseBtnText, { color: CYAN2 }]}>Resume</Text>
                  </Pressable>
                )}
                {(t as any).retryCount > 0 && (
                  <Text style={styles.retryCount}>{(t as any).retryCount} retries</Text>
                )}
              </View>
            )}

            {/* Route */}
            <View style={styles.routeSection}>
              <Text style={styles.routeLabel}>Network route</Text>
              <View style={styles.routeRow}>
                {["You", "Mesh", "Peer"].map((n, i) => (
                  <View key={i} style={{ flexDirection: "row", alignItems: "center" }}>
                    <View style={styles.routeNodeWrap}>
                      <View style={styles.routeNode}><View style={styles.routeNodeDot} /></View>
                      <Text style={styles.routeNodeLabel}>{n}</Text>
                    </View>
                    {i < 2 && <View style={styles.routeLine} />}
                  </View>
                ))}
              </View>
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string }> = {
    transferring: { label: "Transferring", color: "#fbbf24" },
    done:         { label: "✓ Done",       color: GREEN },
    failed:       { label: "Failed",       color: RED },
    integrity_fail: { label: "Corrupted",  color: RED },
    paused:       { label: "Paused",       color: GRAY400 },
  };
  const c = map[status] ?? { label: status, color: GRAY400 };
  return <Text style={[styles.statusText, { color: c.color }]}>{c.label}</Text>;
}

function formatSize(bytes: number): string {
  if (!bytes) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(6,182,212,0.12)", backgroundColor: PANEL },
  backBtn: { width: 40, height: 40, borderRadius: 14, backgroundColor: "rgba(6,182,212,0.10)", alignItems: "center", justifyContent: "center" },
  headerTitle: { color: "white", fontSize: 16, fontWeight: "600" },
  headerSub: { color: GRAY500, fontSize: 11, marginTop: 1 },
  countText: { color: GRAY500, fontSize: 12, fontFamily: "Courier" },
  content: { paddingHorizontal: 16, paddingTop: 16, gap: 12 },
  emptyState: { alignItems: "center", paddingTop: 80 },
  emptyIconBox: { width: 72, height: 72, borderRadius: 22, backgroundColor: "rgba(6,182,212,0.08)", borderWidth: 1, borderColor: "rgba(6,182,212,0.15)", alignItems: "center", justifyContent: "center", marginBottom: 16 },
  emptyTitle: { color: GRAY400, fontSize: 16, fontWeight: "600" },
  emptyDesc: { color: GRAY500, fontSize: 13, marginTop: 8, textAlign: "center", paddingHorizontal: 20 },
  card: { borderRadius: 18, padding: 14, backgroundColor: CARD, borderWidth: 1, borderColor: "rgba(6,182,212,0.12)" },
  topRow: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  fileIconBox: { width: 44, height: 44, borderRadius: 12, backgroundColor: "rgba(6,182,212,0.12)", borderWidth: 1, borderColor: "rgba(6,182,212,0.2)", alignItems: "center", justifyContent: "center" },
  fileName: { color: "white", fontSize: 14, fontWeight: "600", marginBottom: 4 },
  badgeRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  sizeText: { color: GRAY500, fontSize: 11 },
  dirBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  dirText: { fontSize: 11, fontWeight: "600" },
  statusText: { fontSize: 11, fontWeight: "600" },
  progressBg: { height: 4, backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden", marginBottom: 6 },
  progressFill: { height: "100%", borderRadius: 2 },
  statsRow: { flexDirection: "row", justifyContent: "space-between" },
  progressLabel: { color: GRAY500, fontSize: 11 },
  progressPct: { color: CYAN2, fontSize: 11, fontFamily: "Courier" },
  integrityRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 },
  integrityText: { fontSize: 12 },
  routeSection: { marginTop: 12, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(255,255,255,0.06)" },
  routeLabel: { color: GRAY500, fontSize: 11, marginBottom: 8 },
  routeRow: { flexDirection: "row", alignItems: "center" },
  routeNodeWrap: { alignItems: "center" },
  routeNode: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: "rgba(34,211,238,0.4)", backgroundColor: "rgba(6,182,212,0.10)", alignItems: "center", justifyContent: "center" },
  routeNodeDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: CYAN2 },
  routeNodeLabel: { color: GRAY500, fontSize: 10, marginTop: 4 },
  routeLine: { width: 32, height: 1, backgroundColor: "rgba(34,211,238,0.25)", marginHorizontal: 4, marginBottom: 14 },
  pauseRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8 },
  pauseBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: "rgba(251,191,36,0.10)", borderWidth: 1, borderColor: "rgba(251,191,36,0.20)" },
  resumeBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: "rgba(6,182,212,0.10)", borderWidth: 1, borderColor: "rgba(6,182,212,0.20)" },
  pauseBtnText: { fontSize: 12, fontWeight: "600" },
  retryCount: { fontSize: 11, color: GRAY500 },
});
