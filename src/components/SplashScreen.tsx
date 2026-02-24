import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Line } from "react-native-svg";

export default function SplashScreen() {
  return (
    <View style={styles.root}>
      <View style={styles.iconWrap}>
        <View style={styles.glow} />
        <View style={styles.icon}>
          <Svg width={40} height={40} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth={2}>
            <Circle cx={12} cy={5} r={2} fill="#ffffff" />
            <Circle cx={5} cy={12} r={2} fill="#ffffff" />
            <Circle cx={19} cy={12} r={2} fill="#ffffff" />
            <Circle cx={12} cy={19} r={2} fill="#ffffff" />
            <Line x1={12} y1={7} x2={12} y2={17} />
            <Line x1={7} y1={12} x2={17} y2={12} />
          </Svg>
        </View>
      </View>

      <Text style={styles.title}>MeshLink</Text>
      <Text style={styles.subtitle}>Decentralized. Encrypted. Local.</Text>
    </View>
  );
}

const CYAN = "#06b6d4";

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#0b1220",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },

  iconWrap: {
    marginBottom: 24,
    alignItems: "center",
    justifyContent: "center",
  },

  glow: {
    position: "absolute",
    width: 170,
    height: 170,
    borderRadius: 999,
    backgroundColor: CYAN,
    opacity: 0.18,
    transform: [{ scale: 1.15 }],
  },

  icon: {
    width: 96,
    height: 96,
    borderRadius: 28,
    backgroundColor: "#0ea5e9",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: CYAN,
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },

  title: {
    fontSize: 44,
    fontWeight: "800",
    color: "white",
    marginBottom: 8,
  },

  subtitle: {
    color: "#9ca3af",
    letterSpacing: 1.2,
  },
});