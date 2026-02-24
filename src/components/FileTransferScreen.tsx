import React, { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Defs, LinearGradient, Stop } from "react-native-svg";
import { ArrowLeft, FileText, Pause, Play } from "lucide-react-native";
import type { Screen } from "../AppInner";

type FileTransferScreenProps = {
  onNavigate: (screen: Screen) => void;
};

const BG = "#0b1220";
const PANEL = "rgba(13,17,23,0.40)";
const CYAN = "#06b6d4";
const CYAN2 = "#22d3ee";
const BLUE = "#2563eb";
const GRAY400 = "#9ca3af";
const GRAY500 = "#6b7280";
const CARD = "#151823";

export default function FileTransferScreen({ onNavigate }: FileTransferScreenProps) {
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [speed, setSpeed] = useState(2.4);

  useEffect(() => {
    if (!isPaused && progress < 100) {
      const interval = setInterval(() => {
        setProgress((prev) => {
          const next = prev + 0.5;
          return next > 100 ? 100 : next;
        });
        setSpeed(2.2 + Math.random() * 0.6);
      }, 100);

      return () => clearInterval(interval);
    }
  }, [isPaused, progress]);

  const timeLeft = Math.max(0, Math.ceil((100 - progress) / 10));
  const transferred = ((2.4 * progress) / 100).toFixed(1);

  return (
    <SafeAreaView style={styles.root} edges={["top", "left", "right"]}>
      <View style={[styles.header, { paddingTop: 12 }]}>
        <Pressable
          onPress={() => onNavigate("chat")}
          style={({ pressed }) => [
            styles.backBtn,
            pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
          ]}
        >
          <ArrowLeft size={20} color={CYAN2} />
        </Pressable>

        <Text style={styles.headerTitle}>File Transfer</Text>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.card, styles.cardStrongBorder]}>
          <View style={styles.fileIconWrap}>
            <View style={styles.fileIconBox}>
              <FileText size={28} color={CYAN2} />
            </View>
          </View>

          <View style={{ alignItems: "center" }}>
            <Text style={styles.fileName}>mission_briefing.pdf</Text>
            <Text style={styles.fileSize}>2.4 MB</Text>
            <View style={styles.transferRow}>
              <View style={styles.pulseDot} />
              <Text style={styles.cyanSmall}>Transferring via mesh network</Text>
            </View>
          </View>

          <Text style={styles.footerMuted}>Secure transfer • E2E encrypted</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.statsRow}>
            <View style={styles.col}>
              <Stat label="Speed" value={`${speed.toFixed(1)} MB/s`} highlight />
              <View style={{ height: 14 }} />
              <Stat label="Transferred" value={`${transferred} MB`} />
            </View>
            <View style={styles.col}>
              <Stat label="Time Left" value={`${timeLeft}s`} />
              <View style={{ height: 14 }} />
              <Stat label="Route" value="Direct" />
            </View>
          </View>
        </View>

        <View style={[styles.card, styles.cardStrongBorder, { overflow: "hidden" }]}>
          <View style={styles.ringZone}>
            <ProgressRing progress={progress} size={170} />
            <View pointerEvents="none" style={styles.ringCenterText}>
              <Text style={styles.progressBig}>{Math.round(progress)}%</Text>
              <Text style={styles.progressSmall}>Complete</Text>
            </View>
          </View>
          <View style={styles.actionsZone}>
            <Pressable onPress={() => setIsPaused((v) => !v)} style={({ pressed }) => [ styles.btnGhost, pressed && { opacity: 0.9, transform: [{ scale: 0.99 }] },]}>
             {isPaused ? (
                <View style={styles.btnRow}>
                  <Play size={18} color="white" />
                  <Text style={styles.btnText}>Resume</Text>
                </View>
              ) : (
                <View style={styles.btnRow}>
                  <Pause size={18} color="white" />
                  <Text style={styles.btnText}>Pause</Text>
                </View>
              )}
            </Pressable>
            {progress === 100 && (
              <Pressable onPress={() => onNavigate("chat")} style={({ pressed }) => [styles.btnPrimary, pressed && { opacity: 0.92, transform: [{ scale: 0.99 }] },]}>
                <Text style={styles.btnText}>Open File</Text>
              </Pressable>
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({label, value, highlight}: {label: string; value: string; highlight?: boolean}) {
  return (
    <View>
      <Text style={styles.smallLabel}>{label}</Text>
      <Text style={[styles.statValue, highlight && { color: CYAN2 }]}>
        {value}
      </Text>
    </View>
  );
}

function ProgressRing({ progress, size }: { progress: number; size: number }) {
  const stroke = 8;
  const cx = 96;
  const cy = 96;
  const r = 88;
  const C = useMemo(() => 2 * Math.PI * r, [r]);
  const dashOffset = useMemo(() => C - (C * progress) / 100, [C, progress]);

  return (
    <View style={{ width: size, height: size }}>
      <Svg width="100%" height="100%" viewBox="0 0 192 192" style={{ transform: [{ rotate: "-90deg" }] }}>
        <Defs>
          <LinearGradient id="progressGradient" x1="0" y1="0" x2="192" y2="0">
            <Stop offset="0" stopColor={CYAN} stopOpacity="1" />
            <Stop offset="1" stopColor={BLUE} stopOpacity="1" />
          </LinearGradient>
        </Defs>
        <Circle cx={cx} cy={cy} r={r} stroke="#1a1f2e" strokeWidth={stroke} fill="none"/>
        <Circle cx={cx} cy={cy} r={r} stroke="url(#progressGradient)" strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={`${C}`} strokeDashoffset={dashOffset} fill="none" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },

  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(6,182,212,0.12)",
    backgroundColor: PANEL,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: "rgba(6,182,212,0.10)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { color: "white", fontSize: 16, fontWeight: "600" },

  content: { paddingHorizontal: 16, paddingTop: 16 },

  sectionTitle: { color: GRAY400, fontSize: 13, marginBottom: 10 },

  card: {
    borderRadius: 18,
    padding: 14,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: "rgba(6,182,212,0.12)",
    marginBottom: 10,
  },
  cardStrongBorder: { borderColor: "rgba(6,182,212,0.20)" },

  fileIconWrap: { alignItems: "center", marginBottom: 12 },
  fileIconBox: {
    width: 72,
    height: 72,
    borderRadius: 22,
    backgroundColor: "#121826",
    borderWidth: 1,
    borderColor: "rgba(6,182,212,0.20)",
    alignItems: "center",
    justifyContent: "center",
  },

  fileName: { color: "white", fontSize: 16, fontWeight: "600" },
  fileSize: { color: GRAY400, fontSize: 12, marginTop: 4 },

  transferRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
    paddingHorizontal: 6,
  },
  pulseDot: { width: 8, height: 8, borderRadius: 99, backgroundColor: CYAN },
  cyanSmall: { color: CYAN2, fontSize: 12, lineHeight: 16 },

  footerMuted: {
    color: GRAY500,
    fontSize: 12,
    marginTop: 14,
    textAlign: "center",
  },

  statsRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 18,
  },
  col: { flex: 1 },

  smallLabel: {
    color: GRAY400,
    fontSize: 12,
    marginBottom: 6,
  },
  statValue: { color: "white", fontSize: 18, fontWeight: "700" },

  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(6,182,212,0.10)",
    marginTop: 14,
    marginBottom: 12,
  },

  sectionLabel: {
    color: GRAY400,
    fontSize: 12,
    letterSpacing: 1.2,
    marginBottom: 8,
  },

  kvRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 10,
  },
  k: { color: GRAY400, fontSize: 13 },
  v: { color: "white", fontSize: 13, fontWeight: "700" },

  ringZone: {
    height: 210,
    alignItems: "center",
    justifyContent: "center",
  },
  ringCenterText: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  progressBig: { color: CYAN2, fontSize: 40, fontWeight: "700" },
  progressSmall: { color: GRAY400, fontSize: 14, marginTop: 2 },

  actionsZone: {
    paddingTop: 6,
    gap: 10,
  },

  btnGhost: {
    height: 52,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(6,182,212,0.20)",
    backgroundColor: "rgba(6,182,212,0.06)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  btnPrimary: {
    height: 52,
    borderRadius: 18,
    backgroundColor: BLUE,
    alignItems: "center",
    justifyContent: "center",
  },
  btnText: { color: "white", fontSize: 16, fontWeight: "700" },
  btnRow: { flexDirection: "row", alignItems: "center", gap: 10 },

  routeCard: {
    borderRadius: 18,
    padding: 14,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: "rgba(6,182,212,0.12)",
    marginBottom: 10,
  },

  routeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  routeItem: { flexDirection: "row", alignItems: "center" },
  nodeWrap: { alignItems: "center" },
  nodeOuter: {
    width: 44,
    height: 44,
    borderRadius: 99,
    borderWidth: 2,
    borderColor: CYAN2,
    backgroundColor: "rgba(6,182,212,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  nodeInner: {
    width: 12,
    height: 12,
    borderRadius: 99,
    backgroundColor: CYAN2,
  },
  nodeLabel: { color: GRAY400, fontSize: 12, marginTop: 8 },

  routeLine: {
    width: 44,
    height: 2,
    borderRadius: 99,
    backgroundColor: "rgba(34,211,238,0.35)",
    marginHorizontal: 10,
    marginTop: -18,
  },
});