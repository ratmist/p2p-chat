import React, { useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { MeshProvider, useMeshContext } from "./MeshContext";
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

    if (
      (callState === "ringing" || callState === "calling" || callState === "connected") &&
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

  // PRIMARY incoming call trigger — fires as soon as incomingCall is set,
  // regardless of callState batching. This is the most reliable path for
  // phone→web and web→phone incoming call navigation.
  useEffect(() => {
    if (incomingCall && currentScreenRef.current !== "call") {
      setCurrentScreen("call");
    }
  }, [incomingCall]);

  // SAFETY NET: CallScreen renders as absolute overlay if callState/incomingCall
  // is active but screen hasn't switched yet (fixes React setState race condition)
  const showCallOverlay =
    (callState === "ringing" || callState === "calling" || callState === "connected" || !!incomingCall) &&
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
        {/* Overlay: show CallScreen on top of any screen the moment a call arrives,
            before setCurrentScreen("call") has re-rendered (eliminates race condition) */}
        {showCallOverlay && (
          <View style={StyleSheet.absoluteFill}>
            <CallScreen onNavigate={setCurrentScreen} />
          </View>
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
