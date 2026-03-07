import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";
import { ArrowLeft, Check, Copy, Fingerprint, Radio, Shield, Wifi, WifiOff, Zap } from "lucide-react-native";
import type { Screen } from "../AppInner";
import { useMeshContext, DEFAULT_NETWORK_SETTINGS } from "../MeshContext";

type Props = { onNavigate: (screen: Screen) => void };

const BG = "#0b1220"; const PANEL = "rgba(13,17,23,0.40)";
const CYAN = "#06b6d4"; const BLUE = "#2563eb"; const GREEN = "#4ade80";
const GRAY400 = "#9ca3af"; const GRAY500 = "#6b7280"; const GRAY700 = "#374151";
const CARD = "#151823";

const BW_PRESETS = [
  { label: "Unlimited", value: 0 },
  { label: "500 KB/s",  value: 500 * 1024 },
  { label: "100 KB/s",  value: 100 * 1024 },
];

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Pressable onPress={() => onChange(!value)} style={[styles.switch, value ? styles.switchOn : styles.switchOff]}>
      <View style={[styles.knob, { transform: [{ translateX: value ? 22 : 0 }] }]} />
    </Pressable>
  );
}

export default function SettingsScreen({ onNavigate }: Props) {
  const insets = useSafeAreaInsets();
  const { nodeId, alias, status, nodes, rtt, networkSettings, setNetworkSettings, myFingerprint, peerScores, setServerIp, currentServerIp } = useMeshContext();
  const [copiedId, setCopiedId] = useState(false);
  const [copiedFp, setCopiedFp] = useState(false);
  const [serverIpInput, setServerIpInput] = useState(currentServerIp);
  const [ipSaved, setIpSaved] = useState(false);

  const copy = async (text: string, setter: (v: boolean) => void) => {
    await Clipboard.setStringAsync(text);
    setter(true);
    setTimeout(() => setter(false), 2000);
  };

  const statusColor = status === "connected" ? GREEN : status === "reconnecting" ? "#fbbf24" : "#ef4444";

  let bestRelay = null as any;
  peerScores.forEach(p => { if (p.relayCapable && p.stable && (!bestRelay || p.score > bestRelay.score)) bestRelay = p; });

  const fp = myFingerprint || nodeId.replace("node-","").toUpperCase().padEnd(32,"0").match(/.{1,4}/g)?.join(" ") || nodeId;

  return (
    <SafeAreaView style={styles.root} edges={["top", "left", "right"]}>
      <View style={[styles.header, { paddingTop: 12 }]}>
        <Pressable onPress={() => onNavigate("discovery")} style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.9 }]}>
          <ArrowLeft size={20} color="#22d3ee" />
        </Pressable>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.content, { paddingBottom: Math.max(140, insets.bottom + 120) }]} showsVerticalScrollIndicator={false}>

        {/* Mesh status */}
        <Text style={styles.sectionTitle}>Mesh Status</Text>
        <View style={styles.card}>
          <View style={{ flexDirection: "row", justifyContent: "space-around" }}>
            <View style={{ alignItems: "center" }}><Text style={[styles.statBig, { color: statusColor }]}>{status}</Text><Text style={styles.statLabel}>Status</Text></View>
            <View style={{ alignItems: "center" }}><Text style={styles.statBig}>{nodes.length}</Text><Text style={styles.statLabel}>Peers</Text></View>
            <View style={{ alignItems: "center" }}><Text style={[styles.statBig, { color: "#22d3ee" }]}>{rtt ? `${rtt}ms` : "—"}</Text><Text style={styles.statLabel}>WS RTT</Text></View>
          </View>
          {bestRelay && (
            <View style={[styles.inlineRow, { marginTop: 12, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(6,182,212,0.10)" }]}>
              <Radio size={13} color={CYAN} />
              <Text style={styles.smallMuted}>Best relay: {bestRelay.nodeId.slice(0,12)} · score {bestRelay.score}</Text>
            </View>
          )}
        </View>

        {/* Identity */}
        <Text style={[styles.sectionTitle, { marginTop: 18 }]}>Identity</Text>
        <View style={styles.card}>
          <Text style={styles.smallLabel}>Alias</Text>
          <Text style={styles.monoCyan}>{alias}</Text>
          <View style={styles.divider} />
          <View style={styles.rowTop}>
            <View style={{ flex: 1 }}><Text style={styles.smallLabel}>Node ID</Text><Text style={[styles.monoCyan, { fontSize: 11 }]} numberOfLines={1}>{nodeId}</Text></View>
            <Pressable onPress={() => copy(nodeId, setCopiedId)} style={({ pressed }) => [styles.copyBtn, pressed && { opacity: 0.9 }]}>
              {copiedId ? <Check size={15} color={GREEN} /> : <Copy size={15} color="#22d3ee" />}
            </Pressable>
          </View>
          <View style={styles.divider} />
          <View style={styles.rowTop}>
            <View style={{ flex: 1 }}>
              <View style={styles.inlineRow}><Fingerprint size={14} color="#22d3ee" /><Text style={styles.smallLabel}>Key Fingerprint (TOFU)</Text></View>
              <Text style={styles.monoCyanSmall}>{fp}</Text>
              <Text style={styles.helpText}>Share with peers to verify identity</Text>
            </View>
            <Pressable onPress={() => copy(fp.replace(/ /g,""), setCopiedFp)} style={({ pressed }) => [styles.copyBtn, pressed && { opacity: 0.9 }]}>
              {copiedFp ? <Check size={15} color={GREEN} /> : <Copy size={15} color="#22d3ee" />}
            </Pressable>
          </View>
        </View>

        {/* Server IP */}
        <Text style={[styles.sectionTitle, { marginTop: 18 }]}>Server Connection</Text>
        <View style={styles.card}>
          <Text style={styles.smallLabel}>Signaling Server IP</Text>
          <Text style={[styles.smallMuted, { marginBottom: 8 }]}>
            IP компьютера где запущен сервер.{"\n"}
            <Text style={{ color: "#22d3ee" }}>iPhone → wss://IP:3002</Text>{"  "}
            <Text style={{ color: "#9ca3af" }}>Веб → ws://IP:8081</Text>
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <TextInput
              style={styles.ipInput}
              value={serverIpInput}
              onChangeText={setServerIpInput}
              placeholder="192.168.x.x"
              placeholderTextColor="#4b5563"
              keyboardType="numeric"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Pressable
              onPress={() => {
                setServerIp(serverIpInput.trim());
                setIpSaved(true);
                setTimeout(() => setIpSaved(false), 2000);
              }}
              style={({ pressed }) => [styles.ipSaveBtn, pressed && { opacity: 0.8 }]}
            >
              <Text style={styles.ipSaveBtnText}>{ipSaved ? "✓ Сохранено" : "Сохранить"}</Text>
            </Pressable>
          </View>
          <Text style={[styles.smallMuted, { marginTop: 6, color: status === "connected" ? "#34d399" : "#fbbf24" }]}>
            {status === "connected" ? "✓ Подключено" : "Подключение..."} → wss://{serverIpInput}:3002
          </Text>
        </View>

        {/* iOS Certificate Trust Instructions */}
        <View style={[styles.card, { borderColor: "rgba(251,191,36,0.3)" }]}>
          <Text style={[styles.cardTitle, { color: "#fbbf24", marginBottom: 8 }]}>
            🔒 iOS: Доверие сертификату
          </Text>
          <Text style={[styles.smallMuted, { lineHeight: 18 }]}>
            Если звонки не работают — сделай один раз:{"\n\n"}
            <Text style={{ color: "white", fontWeight: "600" }}>1.</Text>{" "}Safari →{" "}
            <Text style={{ color: "#22d3ee", fontFamily: "Courier", fontSize: 11 }}>https://{serverIpInput || "192.168.1.35"}:3002/health</Text>{"\n"}
            <Text style={{ color: "white", fontWeight: "600" }}>2.</Text> "Показать детали" → "Посетить сайт"{"\n"}
            <Text style={{ color: "white", fontWeight: "600" }}>3.</Text> Настройки → Основные → VPN → Доверять
          </Text>
        </View>

        {/* Network settings */}
        <Text style={[styles.sectionTitle, { marginTop: 18 }]}>Network</Text>

        {([
          { key: "enableRelay"  as const, icon: <Radio size={16} color={CYAN} />,    label: "Enable TURN Relay",  desc: "Use TURN server when P2P fails" },
          { key: "forceP2P"     as const, icon: <Zap size={16} color="#fbbf24" />,   label: "Force P2P Only",     desc: "Never use WS relay fallback" },
          { key: "lowBandwidth" as const, icon: <WifiOff size={16} color="#fb923c" />, label: "Low Bandwidth Mode", desc: "100KB/s files, audio-only calls" },
          { key: "relayCapable" as const, icon: <Wifi size={16} color={GREEN} />,    label: "Relay Capable",      desc: "Advertise as mesh relay node" },
        ]).map(({ key, icon, label, desc }) => (
          <View key={key} style={[styles.card, { marginBottom: 8 }]}>
            <View style={styles.toggleRow}>
              <View style={[styles.inlineRow, { flex: 1, paddingRight: 12, alignItems: "flex-start" }]}>
                <View style={{ marginTop: 1 }}>{icon}</View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{label}</Text>
                  <Text style={styles.cardDesc}>{desc}</Text>
                </View>
              </View>
              <Toggle value={networkSettings[key]} onChange={v => setNetworkSettings({ ...networkSettings, [key]: v })} />
            </View>
          </View>
        ))}

        {/* BW limit */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>File Transfer Speed</Text>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
            {BW_PRESETS.map(p => (
              <Pressable key={p.value} onPress={() => setNetworkSettings({ ...networkSettings, fileBwLimit: p.value })}
                style={({ pressed }) => [styles.bwBtn, networkSettings.fileBwLimit === p.value && styles.bwBtnActive, pressed && { opacity: 0.85 }]}>
                <Text style={[styles.bwBtnText, networkSettings.fileBwLimit === p.value && { color: "#22d3ee" }]}>{p.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Security */}
        <Text style={[styles.sectionTitle, { marginTop: 18 }]}>Security</Text>
        <View style={styles.card}>
          <View style={styles.securityHeader}>
            <View style={styles.secIconBox}><Shield size={20} color={GREEN} /></View>
            <View style={{ flex: 1 }}><Text style={styles.cardTitle}>End-to-End Encryption</Text><Text style={styles.greenText}>Active</Text></View>
          </View>
          <View style={styles.divider} />
          {[["Protocol","WebRTC DTLS"],["Key Exchange","ECDH P-256"],["Encryption","AES-256-GCM"],["Signing","Ed25519"],["Forward Secrecy","Enabled"]].map(([k,v]) => (
            <View key={k} style={styles.kvRow}>
              <Text style={styles.k}>{k}</Text>
              <Text style={[styles.v, v === "Enabled" && { color: GREEN }]}>{v}</Text>
            </View>
          ))}
        </View>

        {/* Reset */}
        <Pressable onPress={() => setNetworkSettings(DEFAULT_NETWORK_SETTINGS)}
          style={({ pressed }) => [styles.resetBtn, pressed && { opacity: 0.8 }]}>
          <Text style={styles.resetText}>Reset to defaults</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(6,182,212,0.12)", backgroundColor: PANEL },
  backBtn: { width: 40, height: 40, borderRadius: 14, backgroundColor: "rgba(6,182,212,0.10)", alignItems: "center", justifyContent: "center" },
  headerTitle: { color: "white", fontSize: 16, fontWeight: "600" },
  content: { paddingHorizontal: 16, paddingTop: 16 },
  sectionTitle: { color: GRAY400, fontSize: 13, marginBottom: 10 },
  card: { borderRadius: 18, padding: 14, backgroundColor: CARD, borderWidth: 1, borderColor: "rgba(6,182,212,0.12)", marginBottom: 10 },
  statBig: { color: "white", fontSize: 16, fontWeight: "700", marginBottom: 4 },
  statLabel: { color: GRAY500, fontSize: 11 },
  rowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 },
  smallLabel: { color: GRAY400, fontSize: 12, marginBottom: 6 },
  monoCyan: { color: "#22d3ee", fontFamily: "Courier", fontSize: 13 },
  monoCyanSmall: { color: "#22d3ee", fontFamily: "Courier", fontSize: 11, lineHeight: 17 },
  copyBtn: { width: 34, height: 34, borderRadius: 12, backgroundColor: "rgba(6,182,212,0.10)", alignItems: "center", justifyContent: "center" },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: "rgba(6,182,212,0.10)", marginTop: 12, marginBottom: 4 },
  inlineRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  smallMuted: { color: GRAY400, fontSize: 12 },
  helpText: { color: GRAY500, fontSize: 11, lineHeight: 16, marginTop: 4 },
  toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardTitle: { color: "white", fontSize: 14, fontWeight: "600", marginBottom: 2 },
  cardDesc: { color: GRAY400, fontSize: 12, lineHeight: 17 },
  switch: { width: 48, height: 28, borderRadius: 999, padding: 3, justifyContent: "center" },
  switchOn: { backgroundColor: BLUE },
  switchOff: { backgroundColor: GRAY700 },
  knob: { width: 22, height: 22, borderRadius: 999, backgroundColor: "white" },
  bwBtn: { flex: 1, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: "rgba(6,182,212,0.2)", backgroundColor: "#0d1117", alignItems: "center" },
  bwBtnActive: { borderColor: CYAN, backgroundColor: "rgba(6,182,212,0.15)" },
  bwBtnText: { color: GRAY400, fontSize: 12, fontWeight: "600" },
  securityHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  secIconBox: { width: 40, height: 40, borderRadius: 14, backgroundColor: "rgba(34,197,94,0.10)", alignItems: "center", justifyContent: "center" },
  greenText: { color: GREEN, fontSize: 12, marginTop: 2 },
  kvRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 10 },
  k: { color: GRAY400, fontSize: 12 },
  v: { color: "white", fontSize: 12, fontWeight: "600" },
  resetBtn: { marginTop: 8, paddingVertical: 14, borderRadius: 18, borderWidth: 1, borderColor: GRAY700, alignItems: "center" },
  resetText: { color: GRAY400, fontSize: 14 },
  ipInput: { flex: 1, backgroundColor: "rgba(0,0,0,0.3)", borderWidth: 1, borderColor: "rgba(6,182,212,0.25)", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, color: "white", fontSize: 14, fontFamily: "monospace" },
  ipSaveBtn: { backgroundColor: "rgba(6,182,212,0.15)", borderWidth: 1, borderColor: "rgba(6,182,212,0.4)", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  ipSaveBtnText: { color: "#22d3ee", fontSize: 12, fontWeight: "700" },
});
