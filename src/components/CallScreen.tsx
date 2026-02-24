import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Mic, MicOff, PhoneOff, Video, VideoOff, Volume2 } from "lucide-react-native";
import type { Screen } from "../AppInner";

type CallScreenProps = {
  onNavigate: (screen: Screen) => void;
};

const BG = "#0b1220";
const PANEL = "rgba(13,17,23,0.40)";
const PANEL_STRONG = "rgba(13,17,23,0.80)";
const CYAN = "#06b6d4";
const BLUE = "#2563eb";
const GREEN = "#4ade80";
const GRAY400 = "#9ca3af";
const GRAY600 = "#4b5563";
const CARD1 = "#1a1f2e";
const CARD2 = "#151823";
const RED = "#ef4444";

export default function CallScreen({ onNavigate }: CallScreenProps) {
  const insets = useSafeAreaInsets();
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [signalQuality, setSignalQuality] = useState(4);

  const topSlide = useRef(new Animated.Value(0)).current; 
  const bottomSlide = useRef(new Animated.Value(0)).current; 
  const pulse = useRef(new Animated.Value(0)).current;
  const previewPop = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(topSlide, {toValue: 1, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: true}),
      Animated.timing(bottomSlide, {toValue: 1, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: true}),
    ]).start();

    const p = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 900, useNativeDriver: true }),
      ]),
    );
    p.start();
    return () => p.stop();
  }, [topSlide, bottomSlide, pulse]);

  useEffect(() => {
    const interval = setInterval(() => {
      setDuration((prev) => prev + 1);
      setSignalQuality(3 + Math.floor(Math.random() * 2));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    Animated.sequence([
      Animated.timing(previewPop, { toValue: 0.92, duration: 120, useNativeDriver: true }),
      Animated.timing(previewPop, { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start();
  }, [isVideoOn, previewPop]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const signalLabel = signalQuality === 4 ? "Excellent" : "Good";

  const barOpacities = useMemo(() => {
    const active = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] });
    return [0, 1, 2, 3].map((i) => (i < signalQuality ? active : 0.3));
  }, [pulse, signalQuality]);

  const topY = topSlide.interpolate({ inputRange: [0, 1], outputRange: [-120, 0] });
  const bottomY = bottomSlide.interpolate({ inputRange: [0, 1], outputRange: [160, 0] });

  return (
    <SafeAreaView style={styles.root} edges={["top", "left", "right"]}>
      <View style={styles.bg}>
        <View pointerEvents="none" style={styles.bgOverlay} />
        <View pointerEvents="none" style={styles.gridLayer}>
          {Array.from({ length: 10 }).map((_, i) => (
            <View key={`v-${i}`} style={[styles.gridV, { left: `${i * 10}%` }]}/>
          ))}
          {Array.from({ length: 16 }).map((_, i) => (
            <View key={`h-${i}`} style={[styles.gridH, { top: `${i * 6.25}%` }]}/>
          ))}
        </View>

        <View style={styles.center}>
          <LinearGradient colors={[CYAN, BLUE]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.avatar}>
            <Text style={styles.avatarText}>A</Text>
          </LinearGradient>
          <Text style={styles.name}>Alex&apos;s Phone</Text>
          <Text style={styles.desc}>Connected via mesh network</Text>
        </View>
      </View>

      <Animated.View style={[styles.topBar, { paddingTop: insets.top + 12 }, { transform: [{ translateY: topY }] },]}>
        <View style={styles.topRow}>
          <View>
            <View style={styles.encryptedRow}>
              <View style={styles.greenDot} />
              <Text style={styles.encryptedText}>Encrypted Call</Text>
            </View>
            <Text style={styles.timer}>{formatDuration(duration)}</Text>
          </View>

          <View style={styles.signalWrap}>
            <View style={styles.bars}>
              {[1, 2, 3, 4].map((bar, idx) => (
                <Animated.View key={bar} style={[styles.bar,
                  {
                    height: bar * 4 + 4,
                    backgroundColor: bar <= signalQuality ? "#22d3ee" : GRAY600,
                    opacity: barOpacities[idx] as any,
                  },
                ]}/>
              ))}
            </View>
            <Text style={styles.signalLabel}>{signalLabel}</Text>
          </View>
        </View>
      </Animated.View>

      {isVideoOn && (
        <Animated.View style={[styles.previewWrap, { top: insets.top + 92 }]}>
          <LinearGradient colors={[CARD1, CARD2]} start={{ x: 0.2, y: 1 }} end={{ x: 0.8, y: 0 }} style={styles.preview}>
            <LinearGradient colors={["rgba(6,182,212,0.45)", "rgba(37,99,235,0.45)"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.previewAvatar}>
              <Text style={styles.previewAvatarText}>Y</Text>
            </LinearGradient>
            <View style={styles.youTag}>
              <Text style={styles.youTagText}>You</Text>
            </View>
          </LinearGradient>
        </Animated.View>
      )}

      <Animated.View style={[styles.bottomBar, { paddingBottom: Math.max(16, insets.bottom + 12) }, { transform: [{ translateY: bottomY }] },]}>
        <View style={styles.controls}>
          <Pressable onPress={() => setIsMuted((v) => !v)}
            style={({ pressed }) => [styles.ctrlBtn, isMuted ? styles.ctrlBtnDanger : styles.ctrlBtnNormal, pressed && { transform: [{ scale: 0.94 }] },]}>
            {isMuted ? (<MicOff size={20} color="#f87171" />) 
            : (<Mic size={20} color="#22d3ee" />)}
          </Pressable>

          <Pressable onPress={() => onNavigate("chat")}
            style={({ pressed }) => [styles.endBtn, pressed && { transform: [{ scale: 0.94 }] },]}>
            <PhoneOff size={20} color="white" />
          </Pressable>

          <Pressable onPress={() => setIsVideoOn((v) => !v)}
            style={({ pressed }) => [styles.ctrlBtn, !isVideoOn ? styles.ctrlBtnDanger : styles.ctrlBtnNormal, pressed && { transform: [{ scale: 0.94 }] },]}>
            {isVideoOn ? (<Video size={20} color="#22d3ee" />) 
            : (<VideoOff size={20} color="#f87171" />)}
          </Pressable>

          <Pressable onPress={() => {}}
            style={({ pressed }) => [styles.ctrlBtn, styles.ctrlBtnNormal, pressed && { transform: [{ scale: 0.94 }] },]}>
            <Volume2 size={20} color="#22d3ee" />
          </Pressable>
        </View>

        <Text style={styles.conn}>
          Mesh Route: Direct • Latency: 42ms • E2E Encrypted
        </Text>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },

  bg: { ...StyleSheet.absoluteFillObject, backgroundColor: BG },
  bgOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: PANEL },

  gridLayer: { ...StyleSheet.absoluteFillObject, opacity: 0.10 },
  gridV: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: CYAN,
  },
  gridH: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: CYAN,
  },

  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  avatar: {
    width: 128,
    height: 128,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  avatarText: { fontSize: 48, fontWeight: "800", color: "white" },
  name: { fontSize: 22, fontWeight: "700", color: "white" },
  desc: { marginTop: 6, color: GRAY400 },

  topBar: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    paddingHorizontal: 16,
    paddingTop: 0,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(6,182,212,0.12)",
    backgroundColor: PANEL,
  },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  encryptedRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  greenDot: { width: 8, height: 8, borderRadius: 999, backgroundColor: GREEN },
  encryptedText: { color: GRAY400, fontSize: 12 },
  timer: { color: "white", fontSize: 24, fontWeight: "700" },

  signalWrap: { alignItems: "flex-end", gap: 6 },
  bars: { flexDirection: "row", alignItems: "flex-end", gap: 4 },
  bar: { width: 4, borderRadius: 999 },
  signalLabel: { fontSize: 12, color: GRAY400 },

  previewWrap: { position: "absolute", top: 92, right: 16 },
  preview: {
    width: 112,
    height: 160,
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "rgba(6,182,212,0.50)",
    alignItems: "center",
    justifyContent: "center",
  },
  previewAvatar: {
    width: 64,
    height: 64,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  previewAvatarText: { color: "white", fontSize: 22, fontWeight: "800" },
  youTag: {
    position: "absolute",
    left: 8,
    bottom: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.50)",
  },
  youTagText: { color: GRAY400, fontSize: 12 },

  bottomBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(6,182,212,0.12)",
    backgroundColor: PANEL_STRONG,
  },
  controls: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 18 },

  ctrlBtn: {
    width: 56,
    height: 56,
    borderRadius: 999,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  ctrlBtnNormal: { backgroundColor: CARD1, borderColor: "rgba(6,182,212,0.20)" },
  ctrlBtnDanger: { backgroundColor: "rgba(239,68,68,0.16)", borderColor: "rgba(239,68,68,0.40)" },

  endBtn: {
    width: 56,
    height: 56,
    borderRadius: 999,
    backgroundColor: RED,
    alignItems: "center",
    justifyContent: "center",
  },

  conn: { marginTop: 14, textAlign: "center", fontSize: 12, color: GRAY400 },
});