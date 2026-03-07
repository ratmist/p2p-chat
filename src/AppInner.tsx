import React, { useEffect, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { MeshProvider, useMeshContext } from "./MeshContext";
import type { IncomingCall } from "./MeshContext";
import CallScreen from "./components/CallScreen";
import ChatScreen from "./components/ChatScreen";
import DeviceDiscoveryScreen from "./components/DeviceDiscoveryScreen";
import FileTransferScreen from "./components/FileTransferScreen";
import GroupChatScreen from "./components/GroupChatScreen";
import SettingsScreen from "./components/SettingsScreen";
import SplashScreen from "./components/SplashScreen";

export type Screen =
  | "splash" | "discovery" | "chat"
  | "fileTransfer" | "call" | "group" | "settings";

// ─── Global incoming call banner ──────────────────────────────────────────────
function IncomingCallBanner({
  incomingCall,
  onAccept,
  onReject,
}: {
  incomingCall: IncomingCall;
  onAccept: () => void;
  onReject: () => void;
}) {
  const { acceptCall, endCall } = useMeshContext();
  return (
    <View style={bannerStyles.wrap}>
      <View style={bannerStyles.left}>
        <View style={bannerStyles.avatar}>
          <Text style={bannerStyles.avatarText}>
            {(incomingCall.alias ?? "?")[0].toUpperCase()}
          </Text>
        </View>
        <View>
          <Text style={bannerStyles.name}>{incomingCall.alias}</Text>
          <Text style={bannerStyles.subtitle}>
            Incoming {incomingCall.video ? "video" : "audio"} call…
          </Text>
        </View>
      </View>
      <View style={bannerStyles.buttons}>
        <Pressable
          onPress={() => { endCall(); onReject(); }}
          style={[bannerStyles.btn, bannerStyles.btnDecline]}
        >
          <Text style={bannerStyles.btnText}>✕</Text>
        </Pressable>
        <Pressable
          onPress={() => { acceptCall(); onAccept(); }}
          style={[bannerStyles.btn, bannerStyles.btnAccept]}
        >
          <Text style={bannerStyles.btnText}>✓</Text>
        </Pressable>
      </View>
    </View>
  );
}

const bannerStyles = StyleSheet.create({
  wrap: {
    position: "absolute", top: 12, left: 12, right: 12, zIndex: 9999,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: "rgba(13,17,23,0.97)",
    borderRadius: 18, borderWidth: 1, borderColor: "rgba(6,182,212,0.3)",
    paddingHorizontal: 14, paddingVertical: 12,
    shadowColor: "#000", shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
  },
  left: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: "#0891b2", alignItems: "center", justifyContent: "center",
  },
  avatarText: { color: "white", fontSize: 18, fontWeight: "700" },
  name: { color: "white", fontWeight: "600", fontSize: 15 },
  subtitle: { color: "#4ade80", fontSize: 12, marginTop: 2 },
  buttons: { flexDirection: "row", gap: 8 },
  btn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  btnDecline: { backgroundColor: "rgba(239,68,68,0.2)", borderWidth: 1, borderColor: "rgba(239,68,68,0.4)" },
  btnAccept:  { backgroundColor: "rgba(34,197,94,0.2)",  borderWidth: 1, borderColor: "rgba(34,197,94,0.4)"  },
  btnText: { color: "white", fontSize: 16, fontWeight: "700" },
});

// ─── Inner navigator — has access to MeshContext ──────────────────────────────
function AppNavigator() {
  const [currentScreen, setCurrentScreen] = useState<Screen>("splash");
  const currentScreenRef = useRef<Screen>("splash");
  const { callState, incomingCall } = useMeshContext();

  // Keep ref in sync so useEffect callbacks never read stale currentScreen
  useEffect(() => { currentScreenRef.current = currentScreen; }, [currentScreen]);

  // Splash → discovery
  useEffect(() => {
    if (currentScreen === "splash") {
      const t = setTimeout(() => setCurrentScreen("discovery"), 3000);
      return () => clearTimeout(t);
    }
  }, [currentScreen]);

  const prevCallState = useRef(callState);
  useEffect(() => {
    const prev = prevCallState.current;
    prevCallState.current = callState;

    // Navigate to call screen only for outgoing calls or when connected
    // Incoming calls (ringing) stay on the current screen — the banner handles them
    if (
      (callState === "calling" || callState === "connected") &&
      currentScreenRef.current !== "call"
    ) {
      setCurrentScreen("call");
    }

    if (
      callState === "idle" &&
      (prev === "calling" || prev === "ringing" || prev === "connected") &&
      currentScreenRef.current === "call"
    ) {
      setCurrentScreen("chat");
    }
  }, [callState]);

  // When call is accepted (ringing → connected), navigate to call screen
  // Don't navigate on incomingCall set — that's handled by the banner only
  useEffect(() => {
    if (callState === "connected" && currentScreenRef.current !== "call") {
      setCurrentScreen("call");
    }
  }, [callState]);

  // SAFETY NET overlay: show CallScreen on top only for outgoing/connected, NOT ringing
  const showCallOverlay =
    (callState === "calling" || callState === "connected") &&
    currentScreen !== "call";

  return (
    <View style={styles.root}>
      <View style={styles.container}>
        {currentScreen === "splash"       && <SplashScreen />}
        {currentScreen === "discovery"    && <DeviceDiscoveryScreen onNavigate={setCurrentScreen} />}
        {currentScreen === "chat"         && <ChatScreen onNavigate={setCurrentScreen} />}
        {currentScreen === "group"        && <GroupChatScreen onNavigate={setCurrentScreen} />}
        {currentScreen === "fileTransfer" && <FileTransferScreen onNavigate={setCurrentScreen} />}
        {currentScreen === "call"         && <CallScreen onNavigate={setCurrentScreen} />}
        {currentScreen === "settings"     && <SettingsScreen onNavigate={setCurrentScreen} />}
        {/* Outgoing/connected call overlay */}
        {showCallOverlay && (
          <View style={StyleSheet.absoluteFill}>
            <CallScreen onNavigate={setCurrentScreen} />
          </View>
        )}
        {/* Global incoming call banner — shown on ANY screen when ringing */}
        {incomingCall && callState === "ringing" && currentScreen !== "call" && (
          <IncomingCallBanner
            incomingCall={incomingCall}
            onAccept={() => { setCurrentScreen("call"); }}
            onReject={() => { /* endCall is called inside CallScreen/context */ setCurrentScreen("discovery"); }}
          />
        )}
      </View>
    </View>
  );
}

// ─── Root — MeshProvider wraps the navigator so context is available ──────────
export default function App() {
  return (
    <MeshProvider>
      <AppNavigator />
    </MeshProvider>
  );
}

const styles = StyleSheet.create({
  root:      { flex: 1, backgroundColor: "#0a0e27" },
  container: { flex: 1 },
});
