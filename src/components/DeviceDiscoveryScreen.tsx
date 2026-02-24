import { LinearGradient } from "expo-linear-gradient";
import { Lock, Wifi, WifiOff, Settings } from "lucide-react-native";
import React, { useEffect, useRef, useState } from "react";
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import type { Screen } from "../AppInner";

type DeviceDiscoveryScreenProps = {
  onNavigate: (screen: Screen) => void;
};

type Device = {
  id: string;
  name: string;
  signalStrength: number;
  status: "connected" | "available" | "connecting";
  distance: string;
};

const mockDevices: Device[] = [
  {
    id: "1",
    name: "Alex's Phone",
    signalStrength: 95,
    status: "connected",
    distance: "2m",
  },
  {
    id: "2",
    name: "Rescue Unit 7",
    signalStrength: 88,
    status: "available",
    distance: "5m",
  },
  {
    id: "3",
    name: "Field Tablet A",
    signalStrength: 72,
    status: "available",
    distance: "12m",
  },
  {
    id: "4",
    name: "Base Station",
    signalStrength: 65,
    status: "connecting",
    distance: "18m",
  },
  {
    id: "5",
    name: "Mobile Unit 3",
    signalStrength: 45,
    status: "available",
    distance: "28m",
  },
];

const CYAN = "#06b6d4";
const GREEN = "#10b981";
const YELLOW = "#f59e0b";

function signalColor(strength: number) {
  if (strength >= 80) return "#34d399";
  if (strength >= 50) return "#fbbf24";
  return "#fb923c";
}

export default function DeviceDiscoveryScreen({onNavigate}: DeviceDiscoveryScreenProps) {
  const [scanning, setScanning] = useState(true);
  const insets = useSafeAreaInsets();
  const bars = useRef(Array.from({ length: 20 }, () => new Animated.Value(20))).current;

  useEffect(() => {
    const timer = setTimeout(() => setScanning(false), 2000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const loops = bars.map((v, i) => {
      const minH = 10 + Math.random() * 20;
      const maxH = 20 + Math.random() * 60;
      const dur = 1400 + Math.random() * 600;

      return Animated.loop(
        Animated.sequence([
          Animated.timing(v, {toValue: maxH, duration: dur / 2, useNativeDriver: false}),
          Animated.timing(v, {toValue: minH, duration: dur / 2, useNativeDriver: false}),
        ]),
      );
    });

    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [bars, scanning]);

  return (
    <SafeAreaView style={styles.root} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <Text style={styles.h1}>Devices Nearby</Text>
         <Pressable onPress={() => onNavigate("settings")} style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.85 }]}>
          <Settings size={20} color="#22d3ee" />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.blockPad}>
          <LinearGradient colors={["#1a1f2e", "#151823"]} start={{ x: 0.2, y: 1 }} end={{ x: 0.2, y: 0 }} style={styles.scannerCard}>
            <View style={styles.barsRow}>
              {bars.map((h, i) => (
                <LinearGradient key={i} colors={["#06b6d4", "#60a5fa"]} start={{ x: 0.5, y: 1 }} end={{ x: 0.5, y: 0 }} style={styles.bar}>
                  <Animated.View style={[styles.barInner, { height: h, opacity: scanning ? 1 : 0.3 },]}/>
                </LinearGradient>
              ))}
            </View>

            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <View style={[styles.dot, { backgroundColor: "#22d3ee" }]} />
                <Text style={styles.statText}>
                  {mockDevices.length} Devices
                </Text>
              </View>

              <View style={styles.sepDot} />

              <View style={styles.statItem}>
                <Lock size={14} color="#34d399" />
                <Text style={styles.statText}>Encrypted</Text>
              </View>

              <View style={styles.sepDot} />

              <View style={styles.statItem}>
                <View style={[styles.dot, { backgroundColor: "#fb923c" }]} />
                <Text style={styles.statText}>Mesh Active</Text>
              </View>
            </View>
          </LinearGradient>
        </View>

        <View style={styles.list}>
          {mockDevices.map((device) => {
            const badge = device.status === "connected" ? { bg: "rgba(16,185,129,0.12)", fg: GREEN, text: "Connected" }
            : device.status === "connecting" ? {bg: "rgba(245,158,11,0.12)", fg: YELLOW, text: "Connecting...",}
            : { bg: "rgba(6,182,212,0.12)", fg: CYAN, text: "Available" };
            return (
              <Pressable
                key={device.id}
                onPress={() => onNavigate("chat")}
                style={({ pressed }) => [styles.card, {opacity: pressed ? 0.92 : 1, transform: [{ scale: pressed ? 0.99 : 1 }],}]}>
                <View style={styles.cardRow}>
                  <View style={styles.left}>
                    <View style={styles.iconBox}>
                      {device.status === "connected" && (<Wifi size={22} color={GREEN} />)}
                      {device.status === "available" && (<WifiOff size={22} color={CYAN} />)}
                      {device.status === "connecting" && (<Wifi size={22} color={YELLOW} />)}
                    </View>

                    <View style={styles.info}>
                      <View style={styles.nameRow}>
                        <Text style={styles.name}>{device.name}</Text>
                        <Lock size={14} color="#34d399" />
                      </View>

                      <View style={styles.metaRow}>
                        <Text style={styles.meta}>{device.distance}</Text>
                        <Text style={styles.dotSep}>•</Text>
                        <Text style={[styles.meta, { color: signalColor(device.signalStrength) }]}>
                          {device.signalStrength}% signal
                        </Text>
                      </View>
                    </View>
                  </View>

                  <View style={[styles.badge, { backgroundColor: badge.bg }]}>
                    <Text style={[styles.badgeText, { color: badge.fg }]}>
                      {badge.text}
                    </Text>
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>

      <View style={[styles.ctaWrap, { bottom: Math.max(12, insets.bottom + 8) }]}>
        <Pressable
          onPress={() => onNavigate("chat")}
          style={({ pressed }) => [styles.cta, {opacity: pressed ? 0.92 : 1, transform: [{ scale: pressed ? 0.99 : 1 }],},]}>
          <LinearGradient
            colors={["#06b6d4", "#2563eb"]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.ctaGradient}
          >
            <Text style={styles.ctaText}>Start Secure Session</Text>
          </LinearGradient>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0b1220" },

  header: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(6,182,212,0.12)",
    backgroundColor: "rgba(13,17,23,0.35)",
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: "rgba(6,182,212,0.10)",
    alignItems: "center",
    justifyContent: "center",
  },

  h1: { fontSize: 22, color: "white", fontWeight: "700" },

  scrollContent: { paddingBottom: 0 },

  blockPad: { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 8 },

  scannerCard: {
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(6,182,212,0.12)",
    overflow: "hidden",
  },

  barsRow: {
    height: 80,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "center",
  },

  bar: {
    width: 6,
    borderRadius: 999,
    marginHorizontal: 2,
    overflow: "hidden",
    opacity: 0.9,
  },

  barInner: {
    width: "100%",
    borderRadius: 999,
    backgroundColor: "transparent",
  },

  statsRow: {
    marginTop: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: 12,
  },

  statItem: { flexDirection: "row", alignItems: "center", gap: 8 },

  statText: { fontSize: 13, color: "#9ca3af" },

  dot: { width: 8, height: 8, borderRadius: 999 },

  sepDot: {
    width: 4,
    height: 4,
    borderRadius: 999,
    backgroundColor: "#4b5563",
  },

  list: { paddingHorizontal: 24, paddingTop: 10, gap: 10 },

  card: {
    borderRadius: 18,
    padding: 14,
    backgroundColor: "#151823",
    borderWidth: 1,
    borderColor: "rgba(6,182,212,0.12)",
  },

  cardRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  left: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
    paddingRight: 12,
  },

  iconBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: "rgba(6,182,212,0.10)",
    alignItems: "center",
    justifyContent: "center",
  },

  info: { flex: 1 },

  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },

  name: { color: "white", fontWeight: "600" },

  metaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },

  meta: { fontSize: 12, color: "#9ca3af" },

  dotSep: { fontSize: 12, color: "#4b5563" },

  badge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },

  badgeText: { fontSize: 12, fontWeight: "600" },

  ctaWrap: { position: "absolute", left: 0, right: 0, paddingHorizontal: 24 },

  cta: { borderRadius: 18, overflow: "hidden" },

  ctaGradient: {
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: "center",
    shadowColor: CYAN,
    shadowOpacity: 0.25,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
  },
  
  ctaText: { color: "white", fontWeight: "700" },
});
