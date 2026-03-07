import React from "react";

export default function SplashScreen() {
  return (
    <div style={{
      flex: 1,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#0b1220",
      minHeight: "100vh",
      padding: "0 24px",
    }}>
      {/* Icon */}
      <div style={{ marginBottom: 24, position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {/* Glow */}
        <div style={{
          position: "absolute",
          width: 170,
          height: 170,
          borderRadius: 999,
          backgroundColor: "#06b6d4",
          opacity: 0.18,
        }} />
        {/* Icon box */}
        <div style={{
          width: 96,
          height: 96,
          borderRadius: 28,
          backgroundColor: "#0ea5e9",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 8px 32px rgba(6,182,212,0.35)",
          position: "relative",
          zIndex: 1,
        }}>
          <svg width={40} height={40} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth={2}>
            <circle cx={12} cy={5} r={2} fill="#ffffff" />
            <circle cx={5} cy={12} r={2} fill="#ffffff" />
            <circle cx={19} cy={12} r={2} fill="#ffffff" />
            <circle cx={12} cy={19} r={2} fill="#ffffff" />
            <line x1={12} y1={7} x2={12} y2={17} />
            <line x1={7} y1={12} x2={17} y2={12} />
          </svg>
        </div>
      </div>

      <h1 style={{
        fontSize: 44,
        fontWeight: 800,
        color: "white",
        marginBottom: 8,
        margin: "0 0 8px 0",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}>
        MeshLink
      </h1>
      <p style={{
        color: "#9ca3af",
        letterSpacing: "1.2px",
        margin: 0,
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}>
        Decentralized. Encrypted. Local.
      </p>
    </div>
  );
}
