import { LinearGradient } from "expo-linear-gradient";
import { Lock, Radio, Settings, Wifi } from "lucide-react-native";
import React, { useEffect, useRef } from "react";
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import type { Screen } from "../AppInner";
import { useMeshContext } from "../MeshContext";

type Props = { onNavigate: (screen: Screen) => void };

const CYAN = "#06b6d4"; const GREEN = "#10b981"; const YELLOW = "#f59e0b";

function formatLastSeen(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 10) return "now";
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

export default function DeviceDiscoveryScreen({ onNavigate }: Props) {
  const { nodes, status, rtt, setSelectedPeer, alias, peerScores, connectionMode, p2pStatus, activeCandidateType, meshRoutes, currentServerIp } = useMeshContext();
  const scanning = status === "connecting" || status === "reconnecting";
  const insets = useSafeAreaInsets();
  const bars = useRef(Array.from({ length: 20 }, () => new Animated.Value(20))).current;

  useEffect(() => {
    const loops = bars.map(v => {
      const minH = 10 + Math.random() * 20, maxH = 20 + Math.random() * 60, dur = 1400 + Math.random() * 600;
      return Animated.loop(Animated.sequence([
        Animated.timing(v, { toValue: maxH, duration: dur / 2, useNativeDriver: false }),
        Animated.timing(v, { toValue: minH, duration: dur / 2, useNativeDriver: false }),
      ]));
    });
    loops.forEach(l => l.start());
    return () => loops.forEach(l => l.stop());
  }, [bars]);

  const statusDotColor = status === "connected" ? "#34d399" : status === "reconnecting" ? "#fbbf24" : "#ef4444";

  const connModeIcon = connectionMode === "direct" ? "🟢" : connectionMode === "turn" ? "🟡" : "🔴";
  const connModeLabel = connectionMode === "direct" ? "Direct P2P" : connectionMode === "turn" ? "TURN Relay" : "Server Relay";

  const iceLabel = activeCandidateType === "host" ? "LAN"
    : activeCandidateType === "srflx" ? "STUN"
    : activeCandidateType === "relay" ? "TURN"
    : activeCandidateType ?? null;
  const iceColor = activeCandidateType === "host" ? "#34d399"
    : activeCandidateType === "srflx" ? "#22d3ee"
    : activeCandidateType === "relay" ? "#fb923c"
    : "#9ca3af";

  const routeLabel = (nodeId: string) => {
    const route = meshRoutes.get(nodeId);
    if (!route || route.length === 0) return null;
    if (route.length === 2) return { label: "⚡ Direct", color: "#34d399" };
    if (route.includes("server")) return { label: "☁ Server", color: "#fbbf24" };
    const hops = route.length - 2;
    return { label: `↪ ${hops} hop${hops > 1 ? "s" : ""}`, color: "#22d3ee" };
  };

  const peerConnLabel = (nodeId: string) => {
    const p2p = p2pStatus?.get(nodeId);
    if (p2p === "open") return { label: "Direct P2P", color: "#34d399" };
    const score = peerScores.get(nodeId);
    if (score?.relayCapable) return { label: "Relay Node", color: CYAN };
    return { label: "WS Relay", color: YELLOW };
  };

  return (
    <SafeAreaView style={styles.root} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.h1}>Devices Nearby</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
            <View style={[styles.dot, { backgroundColor: statusDotColor }]} />
            <Text style={styles.aliasText}>You: <Text style={{ color: "#22d3ee" }}>{alias}</Text></Text>
            {rtt ? <Text style={styles.aliasText}>• {rtt}ms</Text> : null}
            <Text style={styles.aliasText}>• {connModeIcon} {connModeLabel}</Text>
            {iceLabel ? (
              <Text style={[styles.iceBadge, { color: iceColor, borderColor: iceColor + "33" }]}>ICE: {iceLabel}</Text>
            ) : null}
          </View>
        </View>
        <Pressable onPress={() => onNavigate("settings")} style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.85 }]}>
          <Settings size={20} color="#22d3ee" />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Предупреждение если IP не задан */}
        {!currentServerIp && (
          <View style={{ marginHorizontal: 24, marginTop: 16, padding: 14, borderRadius: 14, backgroundColor: "rgba(239,68,68,0.12)", borderWidth: 1, borderColor: "rgba(239,68,68,0.3)" }}>
            <Text style={{ color: "#fca5a5", fontSize: 13, fontWeight: "600", marginBottom: 4 }}>
              ⚠️ IP сервера не задан
            </Text>
            <Text style={{ color: "#9ca3af", fontSize: 12, lineHeight: 18 }}>
              Устройства не могут найти друг друга без сервера.{"\n"}
              Перейди в <Text style={{ color: "#22d3ee" }}>Settings</Text> и укажи IP компьютера с сервером.
            </Text>
          </View>
        )}

        {/* Scanner card */}
        <View style={styles.blockPad}>
          <LinearGradient colors={["#1a1f2e", "#151823"]} start={{ x: 0.2, y: 1 }} end={{ x: 0.2, y: 0 }} style={styles.scannerCard}>
            <View style={styles.barsRow}>
              {bars.map((h, i) => (
                <LinearGradient key={i} colors={["#06b6d4", "#60a5fa"]} start={{ x: 0.5, y: 1 }} end={{ x: 0.5, y: 0 }} style={styles.bar}>
                  <Animated.View style={[styles.barInner, { height: h, opacity: scanning ? 1 : 0.3 }]} />
                </LinearGradient>
              ))}
            </View>
            <View style={styles.statsRow}>
              <View style={styles.statItem}><View style={[styles.dot, { backgroundColor: "#22d3ee" }]} /><Text style={styles.statText}>{nodes.length} Devices</Text></View>
              <View style={styles.sepDot} />
              <View style={styles.statItem}><Lock size={14} color="#34d399" /><Text style={styles.statText}>Encrypted</Text></View>
              <View style={styles.sepDot} />
              <View style={styles.statItem}>
                <View style={[styles.dot, { backgroundColor: status === "connected" ? "#fb923c" : "#6b7280" }]} />
                <Text style={styles.statText}>{status === "connected" ? "Mesh Active" : status}</Text>
              </View>
            </View>
            {/* Connection Stats */}
            <View style={styles.connStatsRow}>
              <View style={styles.connStatCell}>
                <Text style={[styles.connStatVal, { color: connectionMode === "direct" ? "#34d399" : connectionMode === "turn" ? "#fbbf24" : "#fb923c" }]}>
                  {connModeIcon} {connModeLabel}
                </Text>
                <Text style={styles.connStatLabel}>Transport</Text>
              </View>
              <View style={styles.connStatDivider} />
              <View style={styles.connStatCell}>
                <Text style={[styles.connStatVal, { color: iceColor }]}>{iceLabel ?? "—"}</Text>
                <Text style={styles.connStatLabel}>ICE path</Text>
              </View>
              <View style={styles.connStatDivider} />
              <View style={styles.connStatCell}>
                <Text style={[styles.connStatVal, {
                  color: rtt == null ? "#6b7280" : rtt < 80 ? "#34d399" : rtt < 200 ? "#fbbf24" : "#ef4444"
                }]}>{rtt != null ? `${rtt}ms` : "—"}</Text>
                <Text style={styles.connStatLabel}>WS latency</Text>
              </View>
            </View>
          </LinearGradient>
        </View>

        {/* Peer list */}
        <View style={styles.list}>
          {nodes.length === 0 && status === "connected" && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>📡</Text>
              <Text style={styles.emptyTitle}>No devices found</Text>
              <Text style={styles.emptyDesc}>Open the app on another device in the same network</Text>
            </View>
          )}

          {nodes.map((node) => {
            const score = peerScores.get(node.nodeId);
            const conn  = peerConnLabel(node.nodeId);
            const route = routeLabel(node.nodeId);
            return (
              <Pressable key={node.nodeId} onPress={() => { setSelectedPeer(node); onNavigate("chat"); }}
                style={({ pressed }) => [styles.card, { opacity: pressed ? 0.92 : 1, transform: [{ scale: pressed ? 0.99 : 1 }] }]}>
                <View style={styles.cardRow}>
                  <View style={styles.left}>
                    <View style={styles.iconBox}>
                      <Wifi size={22} color={GREEN} />
                      {score && !score.stable && (
                        <View style={styles.unstableBadge} />
                      )}
                    </View>
                    <View style={styles.info}>
                      <View style={styles.nameRow}>
                        <Text style={styles.name}>{node.alias}</Text>
                        <Lock size={13} color="#34d399" />
                        {score?.relayCapable && <Radio size={13} color={CYAN} />}
                        {route && (
                          <Text style={[styles.routeTag, { color: route.color, borderColor: route.color + "33" }]}>{route.label}</Text>
                        )}
                      </View>
                      <View style={styles.metaRow}>
                        <Text style={styles.meta} numberOfLines={1}>{node.nodeId.slice(0, 12)}…</Text>
                        <Text style={styles.dotSep}>•</Text>
                        <Text style={[styles.meta, { color: conn.color }]}>{conn.label}</Text>
                        {score?.latency != null && <Text style={styles.dotSep}>•</Text>}
                        {score?.latency != null && <Text style={[styles.meta, { color: "#9ca3af" }]}>{score.latency}ms</Text>}
                        {node.lastSeen && <Text style={styles.dotSep}>•</Text>}
                        {node.lastSeen && <Text style={[styles.meta, { color: "#4b5563" }]}>{formatLastSeen(node.lastSeen)}</Text>}
                      </View>
                    </View>
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 4 }}>
                    <View style={[styles.badge, { backgroundColor: "rgba(16,185,129,0.12)" }]}>
                      <Text style={[styles.badgeText, { color: GREEN }]}>Available</Text>
                    </View>
                    {score && <Text style={styles.scoreText}>score {score.score}</Text>}
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>
        <View style={{ height: 120 }} />
      </ScrollView>

      {nodes.length > 0 && (
        <View style={[styles.ctaWrap, { bottom: Math.max(12, insets.bottom + 8) }]}>
          <Pressable onPress={() => { if (nodes[0]) setSelectedPeer(nodes[0]); onNavigate("chat"); }}
            style={({ pressed }) => [styles.cta, { opacity: pressed ? 0.92 : 1, transform: [{ scale: pressed ? 0.99 : 1 }] }]}>
            <LinearGradient colors={["#06b6d4", "#2563eb"]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.ctaGradient}>
              <Text style={styles.ctaText}>Start Secure Session</Text>
            </LinearGradient>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0b1220" },
  header: { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(6,182,212,0.12)", backgroundColor: "rgba(13,17,23,0.35)", flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerBtn: { width: 40, height: 40, borderRadius: 14, backgroundColor: "rgba(6,182,212,0.10)", alignItems: "center", justifyContent: "center" },
  h1: { fontSize: 22, color: "white", fontWeight: "700" },
  aliasText: { fontSize: 12, color: "#9ca3af" },
  scrollContent: { paddingBottom: 0 },
  blockPad: { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 8 },
  scannerCard: { borderRadius: 18, padding: 14, borderWidth: 1, borderColor: "rgba(6,182,212,0.12)", overflow: "hidden" },
  barsRow: { height: 80, flexDirection: "row", alignItems: "flex-end", justifyContent: "center" },
  bar: { width: 6, borderRadius: 999, marginHorizontal: 2, overflow: "hidden", opacity: 0.9 },
  barInner: { width: "100%", borderRadius: 999, backgroundColor: "transparent" },
  statsRow: { marginTop: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", flexWrap: "wrap", gap: 12 },
  statItem: { flexDirection: "row", alignItems: "center", gap: 8 },
  statText: { fontSize: 13, color: "#9ca3af" },
  dot: { width: 8, height: 8, borderRadius: 999 },
  sepDot: { width: 4, height: 4, borderRadius: 999, backgroundColor: "#4b5563" },
  list: { paddingHorizontal: 24, paddingTop: 10, gap: 10 },
  emptyState: { alignItems: "center", paddingVertical: 40 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyTitle: { color: "#9ca3af", fontSize: 16, fontWeight: "600" },
  emptyDesc: { color: "#6b7280", fontSize: 13, textAlign: "center", marginTop: 6, paddingHorizontal: 20 },
  card: { borderRadius: 18, padding: 14, backgroundColor: "#151823", borderWidth: 1, borderColor: "rgba(6,182,212,0.12)" },
  cardRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  left: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1, paddingRight: 12 },
  iconBox: { width: 48, height: 48, borderRadius: 14, backgroundColor: "rgba(6,182,212,0.10)", alignItems: "center", justifyContent: "center" },
  unstableBadge: { position: "absolute", top: -2, right: -2, width: 10, height: 10, borderRadius: 5, backgroundColor: "#fbbf24", borderWidth: 2, borderColor: "#0b1220" },
  info: { flex: 1 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  name: { color: "white", fontWeight: "600" },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4, flexWrap: "wrap" },
  meta: { fontSize: 12, color: "#9ca3af" },
  dotSep: { fontSize: 12, color: "#4b5563" },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  badgeText: { fontSize: 12, fontWeight: "600" },
  scoreText: { fontSize: 10, color: "#4b5563" },
  ctaWrap: { position: "absolute", left: 0, right: 0, paddingHorizontal: 24 },
  cta: { borderRadius: 18, overflow: "hidden" },
  ctaGradient: { borderRadius: 18, paddingVertical: 14, alignItems: "center" },
  ctaText: { color: "white", fontWeight: "700" },
  iceBadge: { fontSize: 10, fontFamily: "monospace", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999, borderWidth: 1, overflow: "hidden" },
  routeTag: { fontSize: 10, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999, borderWidth: 1, overflow: "hidden" },
  connStatsRow: { marginTop: 12, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(6,182,212,0.12)", flexDirection: "row", alignItems: "center" },
  connStatCell: { flex: 1, alignItems: "center" },
  connStatVal: { fontSize: 11, fontWeight: "700" },
  connStatLabel: { fontSize: 10, color: "#4b5563", marginTop: 2 },
  connStatDivider: { width: 1, height: 28, backgroundColor: "rgba(255,255,255,0.07)" },
});
