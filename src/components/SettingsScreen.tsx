import React, { useState } from "react";
import {Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";
import { ArrowLeft, Check, Copy, Fingerprint, Shield } from "lucide-react-native";
import type { Screen } from "../AppInner";

type SettingsScreenProps = {
  onNavigate: (screen: Screen) => void;
};

const BG = "#0b1220";
const PANEL = "rgba(13,17,23,0.40)";
const CYAN = "#06b6d4";
const BLUE = "#2563eb";
const GREEN = "#4ade80";
const GRAY400 = "#9ca3af";
const GRAY500 = "#6b7280";
const GRAY700 = "#374151";
const CARD2 = "#151823";

export default function SettingsScreen({ onNavigate }: SettingsScreenProps) {
  const insets = useSafeAreaInsets();

  const [meshRoutingEnabled, setMeshRoutingEnabled] = useState(true);
  const [storeForwardEnabled, setStoreForwardEnabled] = useState(true);
  const [copiedFingerprint, setCopiedFingerprint] = useState(false);
  const [copiedDeviceId, setCopiedDeviceId] = useState(false);

  const deviceId = "ML-7F4A-9E2B-C8D1";
  const encryptionFingerprint = "A3F8 4B2C 9E7D 1F6A 8C4E 2B9D 7A3F 6E8C";

  const copyWithToast = async (value: string, which: "fp" | "id") => {
    await Clipboard.setStringAsync(value);
    if (which === "fp") {
      setCopiedFingerprint(true);
      setTimeout(() => setCopiedFingerprint(false), 2000);
    } else {
      setCopiedDeviceId(true);
      setTimeout(() => setCopiedDeviceId(false), 2000);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={["top", "left", "right"]}>
      <View style={[styles.header, { paddingTop: 12 }]}>
        <Pressable onPress={() => onNavigate("discovery")}
          style={({ pressed }) => [ styles.backBtn, pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },]}>
          <ArrowLeft size={20} color="#22d3ee" />
        </Pressable>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(140, insets.bottom + 120) },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionTitle}>Device Identity</Text>

        <View style={[styles.card, styles.cardStrongBorder]}>
          <View style={styles.rowTop}>
            <View>
              <Text style={styles.smallLabel}>Device ID</Text>
              <Text style={styles.monoCyan}>{deviceId}</Text>
            </View>
            <Pressable onPress={() => copyWithToast(deviceId, "id")}
              style={({ pressed }) => [styles.copyBtn, pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },]}
            >
              {copiedDeviceId ? (<Check size={16} color={GREEN} /> ) : (<Copy size={16} color="#22d3ee" />)}
            </Pressable>
          </View>

          <View style={styles.divider} />

          <View style={styles.inlineRow}>
            <Shield size={16} color={GREEN} />
            <Text style={styles.smallMuted}>Verified mesh participant</Text>
          </View>
        </View>

        <View style={[styles.card, styles.cardStrongBorder]}>
          <View style={styles.rowTop}>
            <View style={{ flex: 1 }}>
              <View style={styles.inlineRow}>
                <Fingerprint size={16} color="#22d3ee" />
                <Text style={styles.smallLabel}>Encryption Fingerprint</Text>
              </View>
              <Text style={styles.monoCyanSmall}>{encryptionFingerprint}</Text>
            </View>

            <Pressable onPress={() => copyWithToast(encryptionFingerprint.replace(/ /g, ""), "fp")}
              style={({ pressed }) => [styles.copyBtn, pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] }]}
            >
              {copiedFingerprint ? (<Check size={16} color={GREEN} />) : (<Copy size={16} color="#22d3ee" /> )}
            </Pressable>
          </View>

          <View style={styles.divider} />

          <Text style={styles.helpText}>
            Verify this fingerprint with your contacts to ensure secure end-to-end encryption
          </Text>
        </View>

        <Text style={[styles.sectionTitle, { marginTop: 18 }]}>Network Settings</Text>

        <View style={styles.card}>
          <View style={styles.toggleRow}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={styles.cardTitle}>Mesh Routing</Text>
              <Text style={styles.cardDesc}>
                Allow your device to relay messages for other peers
              </Text>
            </View>

            <Pressable onPress={() => setMeshRoutingEnabled((v) => !v)}
              style={({ pressed }) => [styles.switch, meshRoutingEnabled ? styles.switchOn : styles.switchOff,pressed && { opacity: 0.95 },]}
            >
              <View style={[styles.knob, { transform: [{ translateX: meshRoutingEnabled ? 22 : 0 }] }]}/>
            </Pressable>
          </View>

          {meshRoutingEnabled && (
            <View style={[styles.divider, { marginTop: 12 }]} />
          )}

          {meshRoutingEnabled && (
            <View style={[styles.inlineRow, { marginTop: 12 }]}>
              <View style={styles.pulseDot} />
              <Text style={styles.greenText}>Active relay node</Text>
            </View>
          )}
        </View>

        <View style={styles.card}>
          <View style={styles.toggleRow}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={styles.cardTitle}>Store &amp; Forward</Text>
              <Text style={styles.cardDesc}>
                Store messages temporarily when recipients are offline
              </Text>
            </View>

            <Pressable onPress={() => setStoreForwardEnabled((v) => !v)}
              style={({ pressed }) => [styles.switch, storeForwardEnabled ? styles.switchOn : styles.switchOff, pressed && { opacity: 0.95 },]}
            >
              <View style={[styles.knob, { transform: [{ translateX: storeForwardEnabled ? 22 : 0 }] }]} />
            </Pressable>
          </View>
        </View>

        <Text style={[styles.sectionTitle, { marginTop: 18 }]}>Security</Text>

        <View style={[styles.card, styles.cardStrongBorder]}>
          <View style={styles.securityHeader}>
            <View style={styles.secIconBox}>
              <Shield size={20} color={GREEN} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>End-to-End Encryption</Text>
              <Text style={styles.greenTextSmall}>Active</Text>
            </View>
          </View>

          <View style={styles.divider} />

          {[["Protocol", "Signal Protocol"], ["Key Exchange", "X3DH"], ["Encryption", "AES-256"], ["Forward Secrecy", "Enabled"]].map(([k, v], idx) => (
            <View key={`${k}-${idx}`} style={styles.kvRow}>
              <Text style={styles.k}>{k}</Text>
              <Text style={[styles.v, v === "Enabled" && { color: GREEN }]}>
                {v}
              </Text>
            </View>
          ))}
        </View>

        <Text style={[styles.sectionTitle, { marginTop: 18 }]}>About</Text>

        <View style={styles.card}>
          <View style={styles.aboutHeader}>
            <View style={styles.aboutLogo}>
              <Text style={styles.aboutLogoText}>ML</Text>
            </View>
            <View>
              <Text style={styles.aboutTitle}>MeshLink</Text>
              <Text style={styles.aboutSub}>Version 1.0.0 (Beta)</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <Text style={styles.smallMuted}>Decentralized. Encrypted. Local.</Text>
          <Text style={[styles.helpText, { marginTop: 6 }]}>
            A peer-to-peer mesh communication platform for secure local networking without internet or central servers.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
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
    backgroundColor: CARD2,
    borderWidth: 1,
    borderColor: "rgba(6,182,212,0.12)",
    marginBottom: 10,
  },
  cardStrongBorder: { borderColor: "rgba(6,182,212,0.20)" },

  rowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 },
  smallLabel: { color: GRAY400, fontSize: 12, marginBottom: 6 },
  monoCyan: { color: "#22d3ee", fontFamily: "Courier", fontSize: 13 },
  monoCyanSmall: { color: "#22d3ee", fontFamily: "Courier", fontSize: 12, lineHeight: 18 },

  copyBtn: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: "rgba(6,182,212,0.10)",
    alignItems: "center",
    justifyContent: "center",
  },

  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(6,182,212,0.10)",
    marginTop: 12,
  },

  inlineRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 },
  smallMuted: { color: GRAY400, fontSize: 12 },
  helpText: { color: GRAY500, fontSize: 12, lineHeight: 18, marginTop: 12 },

  toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardTitle: { color: "white", fontSize: 14, fontWeight: "600", marginBottom: 4 },
  cardDesc: { color: GRAY400, fontSize: 12, lineHeight: 17 },

  switch: {
    width: 56,
    height: 32,
    borderRadius: 999,
    padding: 4,
    justifyContent: "center",
  },
  switchOn: {
    backgroundColor: BLUE,
  },
  switchOff: {
    backgroundColor: GRAY700,
  },
  knob: {
    width: 24,
    height: 24,
    borderRadius: 999,
    backgroundColor: "white",
  },

  pulseDot: { width: 8, height: 8, borderRadius: 99, backgroundColor: GREEN },
  greenText: { color: GREEN, fontSize: 12, fontWeight: "600" },
  greenTextSmall: { color: GREEN, fontSize: 12, marginTop: 2 },

  securityHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  secIconBox: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: "rgba(34,197,94,0.10)",
    alignItems: "center",
    justifyContent: "center",
  },
  kvRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 10 },
  k: { color: GRAY400, fontSize: 12 },
  v: { color: "white", fontSize: 12, fontWeight: "600" },

  aboutHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  aboutLogo: {
    width: 48,
    height: 48,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: CYAN,
  },
  aboutLogoText: { color: "white", fontWeight: "800" },
  aboutTitle: { color: "white", fontSize: 16, fontWeight: "700" },
  aboutSub: { color: GRAY400, fontSize: 12, marginTop: 2 },
});