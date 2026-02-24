import React, { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import CallScreen from "./components/CallScreen";
import ChatScreen from "./components/ChatScreen";
import DeviceDiscoveryScreen from "./components/DeviceDiscoveryScreen";
import FileTransferScreen from "./components/FileTransferScreen";
import SettingsScreen from "./components/SettingsScreen";
import SplashScreen from "./components/SplashScreen";

export type Screen =
  | "splash"
  | "discovery"
  | "chat"
  | "fileTransfer"
  | "call"
  | "group"
  | "settings";

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<Screen>("splash");

  useEffect(() => {
    if (currentScreen === "splash") {
      const timer = setTimeout(() => setCurrentScreen("discovery"), 3000);
      return () => clearTimeout(timer);
    }
  }, [currentScreen]);

  return (
    <View style={styles.root}>
      <View style={styles.container}>
        {currentScreen === "splash" && <SplashScreen />}
        {currentScreen === "discovery" && (
          <DeviceDiscoveryScreen onNavigate={setCurrentScreen} />
        )}
        {currentScreen === "chat" && (
          <ChatScreen onNavigate={setCurrentScreen} />
        )}
        {currentScreen === "fileTransfer" && (
          <FileTransferScreen onNavigate={setCurrentScreen} />
        )}
        {currentScreen === "call" && (
          <CallScreen onNavigate={setCurrentScreen} />
        )}
        {currentScreen === "settings" && (
          <SettingsScreen onNavigate={setCurrentScreen} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#0a0e27",
  },
  container: {
    flex: 1,
  },
});
