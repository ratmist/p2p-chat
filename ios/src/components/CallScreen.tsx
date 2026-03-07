import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Audio } from "expo-av";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Mic, MicOff, Phone, PhoneOff, Video, VideoOff, Volume2 } from "lucide-react-native";
import type { Screen } from "../AppInner";
import { useMeshContext } from "../MeshContext";

// RTCView for rendering video streams on native
let RTCView: any = null;
if (Platform.OS !== "web") {
  try { RTCView = require("react-native-webrtc").RTCView; } catch {}
}

type CallScreenProps = { onNavigate: (screen: Screen) => void };

const BG           = "#0b1220";
const PANEL        = "rgba(13,17,23,0.40)";
const PANEL_STRONG = "rgba(13,17,23,0.80)";
const CYAN         = "#06b6d4";
const BLUE         = "#2563eb";
const GREEN        = "#4ade80";
const YELLOW       = "#facc15";
const RED_COLOR    = "#ef4444";
const GRAY400      = "#9ca3af";
const GRAY600      = "#4b5563";
const CARD1        = "#1a1f2e";
const CARD2        = "#151823";

export default function CallScreen({ onNavigate }: CallScreenProps) {
  const insets = useSafeAreaInsets();
  const { callState, incomingCall, localStream, remoteStream, acceptCall, endCall, selectedPeer, callMetrics, activeCandidateType } = useMeshContext();

  const [duration, setDuration]   = useState(0);
  const [isMuted, setIsMuted]     = useState(false);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isSpeaker, setIsSpeaker] = useState(true);

  const toggleSpeaker = async () => {
    const next = !isSpeaker;
    setIsSpeaker(next);
    try {
      // On iOS: INTERRUPTION_MODE_IOS_DO_NOT_MIX keeps audio session alive during call
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: false,
        playThroughEarpieceAndroid: !next,
      });
    } catch (e) {
      console.warn("[Speaker] setAudioModeAsync failed:", e);
    }
  };

  // On call connect: ensure audio routes to speaker by default
  useEffect(() => {
    if (callState === "connected" && Platform.OS !== "web") {
      Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: false,
        playThroughEarpieceAndroid: false, // speaker = true
      }).catch(() => {});
    }
  }, [callState]);

  const topSlide   = useRef(new Animated.Value(0)).current;
  const bottomSlide = useRef(new Animated.Value(0)).current;
  const pulse      = useRef(new Animated.Value(0)).current;

  // Entrance animation
  useEffect(() => {
    Animated.parallel([
      Animated.timing(topSlide,    { toValue: 1, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(bottomSlide, { toValue: 1, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
    const p = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 900, useNativeDriver: true }),
    ]));
    p.start();
    return () => p.stop();
  }, []);

  // Call timer
  useEffect(() => {
    if (callState !== "connected") return;
    const iv = setInterval(() => setDuration(d => d + 1), 1000);
    return () => clearInterval(iv);
  }, [callState]);

  // Navigate away only when call transitions FROM active → idle
  // (not on initial mount where callState might briefly be idle)
  const prevCallStateRef = useRef(callState);
  useEffect(() => {
    const prev = prevCallStateRef.current;
    prevCallStateRef.current = callState;
    if (callState === "idle" && (prev === "calling" || prev === "ringing" || prev === "connected")) {
      onNavigate("chat");
    }
  }, [callState]);

  const handleEnd = () => { endCall(); onNavigate("chat"); };

  const toggleMute = () => {
    const newMuted = !isMuted;
    localStream?.getAudioTracks().forEach(t => { t.enabled = !newMuted; });
    setIsMuted(newMuted);
  };
  const toggleVideo = () => {
    const newVideoOn = !isVideoOn;
    localStream?.getVideoTracks().forEach(t => { t.enabled = newVideoOn; });
    setIsVideoOn(newVideoOn);
  };

  const fmt = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  const statusLabel =
    callState === "calling"   ? "Calling..." :
    callState === "ringing"   ? "Incoming..." :
    callState === "connected" ? fmt(duration) : "Connecting...";

  // Derive signal bars (0-4) from callMetrics
  const { rttMs, jitterMs, lossPercent, quality } = callMetrics;

  const signalBars =
    quality === "good"    ? 4 :
    quality === "fair"    ? 2 :
    quality === "poor"    ? 1 : 3; // unknown → show 3 bars (measuring)

  const signalColor =
    quality === "good"    ? "#22d3ee" :
    quality === "fair"    ? YELLOW :
    quality === "poor"    ? RED_COLOR : GRAY400;

  const signalLabel =
    quality === "good"    ? "Good" :
    quality === "fair"    ? "Fair" :
    quality === "poor"    ? "Poor" :
    callState === "connected" ? "Measuring…" : "—";

  const dotColor =
    quality === "good"    ? GREEN :
    quality === "fair"    ? YELLOW :
    quality === "poor"    ? RED_COLOR : GREEN;

  const barOpacities = useMemo(() => {
    const active = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] });
    return [1, 2, 3, 4].map(i => (i <= signalBars ? active : 0.2));
  }, [pulse, signalBars]);

  const topY    = topSlide.interpolate({ inputRange: [0, 1], outputRange: [-120, 0] });
  const bottomY = bottomSlide.interpolate({ inputRange: [0, 1], outputRange: [160, 0] });

  // For incoming calls selectedPeer may be null — fall back to incomingCall.alias
  const peerName    = selectedPeer?.alias ?? incomingCall?.alias ?? "Unknown";
  const peerInitial = peerName[0].toUpperCase();

  // Format a metric value for display
  const fmt_ms  = (v: number | null) => v != null ? `${v}ms` : "—";
  const fmt_pct = (v: number | null) => v != null ? `${v}%` : "—";

  const iceLabel = activeCandidateType === "host" ? "LAN"
    : activeCandidateType === "srflx" ? "STUN"
    : activeCandidateType === "relay" ? "TURN"
    : activeCandidateType ?? "—";
  const iceColor = activeCandidateType === "host" ? GREEN
    : activeCandidateType === "srflx" ? CYAN
    : activeCandidateType === "relay" ? YELLOW
    : GRAY400;
  const iceWarn  = activeCandidateType === "relay";

  return (
    <SafeAreaView style={styles.root} edges={["top", "left", "right"]}>
      {/* Background */}
      <View style={styles.bg}>
        {/* Remote video fullscreen (when available) */}
        {RTCView && remoteStream && (remoteStream as any).toURL && (
          <RTCView
            streamURL={(remoteStream as any).toURL()}
            style={StyleSheet.absoluteFill}
            objectFit="cover"
            mirror={false}
          />
        )}
        <View pointerEvents="none" style={styles.bgOverlay} />
        <View pointerEvents="none" style={styles.gridLayer}>
          {Array.from({ length: 10 }).map((_, i) => (
            <View key={`v-${i}`} style={[styles.gridV, { left: `${i * 10}%` as any }]} />
          ))}
          {Array.from({ length: 16 }).map((_, i) => (
            <View key={`h-${i}`} style={[styles.gridH, { top: `${i * 6.25}%` as any }]} />
          ))}
        </View>

        {/* Centre: avatar + name */}
        <View style={styles.center}>
          <LinearGradient colors={[CYAN, BLUE]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.avatar}>
            <Text style={styles.avatarText}>{peerInitial}</Text>
          </LinearGradient>
          <Text style={styles.name}>{peerName}</Text>
          <Text style={styles.desc}>
            {callState === "connected" ? "Connected via mesh network" : statusLabel}
          </Text>

          {/* Live metrics row — visible when connected */}
          {callState === "connected" && (
            <View style={styles.metricsRow}>
              <View style={styles.metricPill}>
                <Text style={[styles.metricVal, rttMs != null && rttMs > 300 ? styles.metricWarn : null]}>
                  {fmt_ms(rttMs)}
                </Text>
                <Text style={styles.metricLabel}>RTT</Text>
              </View>
              <View style={styles.metricDivider} />
              <View style={styles.metricPill}>
                <Text style={[styles.metricVal, jitterMs != null && jitterMs > 50 ? styles.metricWarn : null]}>
                  {fmt_ms(jitterMs)}
                </Text>
                <Text style={styles.metricLabel}>Jitter</Text>
              </View>
              <View style={styles.metricDivider} />
              <View style={styles.metricPill}>
                <Text style={[styles.metricVal, lossPercent != null && lossPercent > 5 ? styles.metricWarn : null]}>
                  {fmt_pct(lossPercent)}
                </Text>
                <Text style={styles.metricLabel}>Loss</Text>
              </View>
              <View style={styles.metricDivider} />
              <View style={styles.metricPill}>
                <Text style={[styles.metricVal, iceWarn ? styles.metricWarn : { color: iceColor }]}>
                  {iceLabel}
                </Text>
                <Text style={styles.metricLabel}>ICE</Text>
              </View>
            </View>
          )}
        </View>
      </View>

      {/* Top bar */}
      <Animated.View style={[styles.topBar, { paddingTop: insets.top + 12 }, { transform: [{ translateY: topY }] }]}>
        <View style={styles.topRow}>
          <View>
            <View style={styles.encryptedRow}>
              <View style={[styles.dot, { backgroundColor: dotColor }]} />
              <Text style={styles.encryptedText}>
                {callState === "connected" ? "E2E Encrypted" : callState === "calling" ? "Calling…" : "Incoming call"}
              </Text>
            </View>
            <Text style={styles.timer}>{statusLabel}</Text>
          </View>

          {/* Signal bars */}
          <View style={styles.signalWrap}>
            <View style={styles.bars}>
              {[1, 2, 3, 4].map((bar, idx) => (
                <Animated.View key={bar} style={[
                  styles.bar,
                  { height: bar * 4 + 4, backgroundColor: bar <= signalBars ? signalColor : GRAY600, opacity: barOpacities[idx] as any },
                ]} />
              ))}
            </View>
            <Text style={[styles.signalLabel, { color: signalColor }]}>{signalLabel}</Text>
          </View>
        </View>
      </Animated.View>

      {/* Local video PiP */}
      {isVideoOn && (
        <View style={[styles.previewWrap, { top: insets.top + 92 }]}>
          {RTCView && localStream && (localStream as any).toURL ? (
            <RTCView
              streamURL={(localStream as any).toURL()}
              style={styles.preview}
              objectFit="cover"
              mirror={true}
            />
          ) : (
          <LinearGradient colors={[CARD1, CARD2]} start={{ x: 0.2, y: 1 }} end={{ x: 0.8, y: 0 }} style={styles.preview}>
            <LinearGradient
              colors={["rgba(6,182,212,0.45)", "rgba(37,99,235,0.45)"]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={styles.previewAvatar}
            >
              <Text style={styles.previewAvatarText}>Y</Text>
            </LinearGradient>
            <View style={styles.youTag}>
              <Text style={styles.youTagText}>You</Text>
            </View>
          </LinearGradient>
          )}
        </View>
      )}

      {/* Bottom controls — ringing vs active call */}
      <Animated.View style={[styles.bottomBar, { paddingBottom: Math.max(16, insets.bottom + 12) }, { transform: [{ translateY: bottomY }] }]}>
        {callState === "ringing" ? (
          // ── Incoming call: Accept / Decline ──
          <View>
            <Text style={styles.incomingLabel}>
              {incomingCall?.video ? "📹  Incoming video call" : "📞  Incoming audio call"}
            </Text>
            <View style={styles.incomingControls}>
              {/* Decline */}
              <View style={styles.incomingBtnWrap}>
                <Pressable onPress={handleEnd}
                  style={({ pressed }) => [styles.incomingBtn, styles.incomingDecline, pressed && styles.pressed]}>
                  <PhoneOff size={26} color="white" />
                </Pressable>
                <Text style={styles.incomingBtnLabel}>Decline</Text>
              </View>
              {/* Accept */}
              <View style={styles.incomingBtnWrap}>
                <Pressable onPress={() => acceptCall()}
                  style={({ pressed }) => [styles.incomingBtn, styles.incomingAccept, pressed && styles.pressed]}>
                  <Phone size={26} color="white" />
                </Pressable>
                <Text style={styles.incomingBtnLabel}>Accept</Text>
              </View>
            </View>
          </View>
        ) : (
          // ── Active call controls ──
          <View>
            <View style={styles.controls}>
              <Pressable onPress={toggleMute}
                style={({ pressed }) => [styles.ctrlBtn, isMuted ? styles.ctrlBtnDanger : styles.ctrlBtnNormal, pressed && styles.pressed]}>
                {isMuted ? <MicOff size={20} color="#f87171" /> : <Mic size={20} color="#22d3ee" />}
              </Pressable>

              <Pressable onPress={handleEnd}
                style={({ pressed }) => [styles.endBtn, pressed && styles.pressed]}>
                <PhoneOff size={20} color="white" />
              </Pressable>

              <Pressable onPress={toggleVideo}
                style={({ pressed }) => [styles.ctrlBtn, !isVideoOn ? styles.ctrlBtnDanger : styles.ctrlBtnNormal, pressed && styles.pressed]}>
                {isVideoOn ? <Video size={20} color="#22d3ee" /> : <VideoOff size={20} color="#f87171" />}
              </Pressable>

              <Pressable onPress={toggleSpeaker}
                style={({ pressed }) => [styles.ctrlBtn, isSpeaker ? styles.ctrlBtnNormal : styles.ctrlBtnDanger, pressed && styles.pressed]}>
                <Volume2 size={20} color={isSpeaker ? "#22d3ee" : "#f87171"} />
              </Pressable>
            </View>
            <Text style={styles.conn}>
              WebRTC DTLS · OPUS · ICE: {iceLabel} ·{" "}
              {quality !== "unknown" ? `Quality: ${signalLabel}` : "Measuring quality…"}
            </Text>
          </View>
        )}
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  bg: { ...StyleSheet.absoluteFillObject, backgroundColor: BG },
  bgOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: PANEL },
  gridLayer: { ...StyleSheet.absoluteFillObject, opacity: 0.10 },
  gridV: { position: "absolute", top: 0, bottom: 0, width: 1, backgroundColor: CYAN },
  gridH: { position: "absolute", left: 0, right: 0, height: 1, backgroundColor: CYAN },

  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
  avatar: { width: 128, height: 128, borderRadius: 999, alignItems: "center", justifyContent: "center", marginBottom: 14 },
  avatarText: { fontSize: 48, fontWeight: "800", color: "white" },
  name: { fontSize: 22, fontWeight: "700", color: "white" },
  desc: { marginTop: 6, color: GRAY400, fontSize: 14 },

  metricsRow: {
    flexDirection: "row", alignItems: "center",
    marginTop: 20, paddingHorizontal: 20, paddingVertical: 12,
    backgroundColor: "rgba(0,0,0,0.45)", borderRadius: 16,
    borderWidth: 1, borderColor: "rgba(6,182,212,0.12)",
  },
  metricPill: { alignItems: "center", paddingHorizontal: 14 },
  metricVal: { fontSize: 14, fontWeight: "700", color: "#22d3ee", fontVariant: ["tabular-nums"] },
  metricWarn: { color: RED_COLOR },
  metricLabel: { fontSize: 10, color: GRAY600, marginTop: 2 },
  metricDivider: { width: 1, height: 28, backgroundColor: "rgba(255,255,255,0.07)" },

  topBar: {
    position: "absolute", left: 0, right: 0, top: 0,
    paddingHorizontal: 16, paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(6,182,212,0.12)",
    backgroundColor: PANEL,
  },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  encryptedRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  dot: { width: 8, height: 8, borderRadius: 999 },
  encryptedText: { color: GRAY400, fontSize: 12 },
  timer: { color: "white", fontSize: 24, fontWeight: "700" },

  signalWrap: { alignItems: "flex-end", gap: 6 },
  bars: { flexDirection: "row", alignItems: "flex-end", gap: 4 },
  bar: { width: 4, borderRadius: 999 },
  signalLabel: { fontSize: 12 },

  previewWrap: { position: "absolute", right: 16 },
  preview: {
    width: 112, height: 160, borderRadius: 18, overflow: "hidden",
    borderWidth: 2, borderColor: "rgba(6,182,212,0.50)",
    alignItems: "center", justifyContent: "center",
  },
  previewAvatar: { width: 64, height: 64, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  previewAvatarText: { color: "white", fontSize: 22, fontWeight: "800" },
  youTag: { position: "absolute", left: 8, bottom: 8, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: "rgba(0,0,0,0.50)" },
  youTagText: { color: GRAY400, fontSize: 12 },

  bottomBar: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    paddingHorizontal: 16, paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(6,182,212,0.12)",
    backgroundColor: PANEL_STRONG,
  },
  controls: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 18 },

  ctrlBtn: { width: 56, height: 56, borderRadius: 999, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  ctrlBtnNormal: { backgroundColor: CARD1, borderColor: "rgba(6,182,212,0.20)" },
  ctrlBtnActive: { backgroundColor: "rgba(6,182,212,0.15)", borderColor: "rgba(6,182,212,0.50)" },
  ctrlBtnDanger: { backgroundColor: "rgba(239,68,68,0.16)", borderColor: "rgba(239,68,68,0.40)" },
  endBtn: { width: 56, height: 56, borderRadius: 999, backgroundColor: RED_COLOR, alignItems: "center", justifyContent: "center" },
  pressed: { transform: [{ scale: 0.94 }] },

  conn: { marginTop: 14, textAlign: "center", fontSize: 12, color: GRAY400 },

  // Incoming call styles
  incomingLabel: { textAlign: "center", color: GRAY400, fontSize: 14, marginBottom: 20 },
  incomingControls: { flexDirection: "row", justifyContent: "center", gap: 56, alignItems: "center" },
  incomingBtnWrap: { alignItems: "center", gap: 8 },
  incomingBtn: { width: 72, height: 72, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  incomingDecline: { backgroundColor: RED_COLOR },
  incomingAccept:  { backgroundColor: "#22c55e" },
  incomingBtnLabel: { color: GRAY400, fontSize: 12 },
});
