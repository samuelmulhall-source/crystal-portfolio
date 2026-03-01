"use client";

/**
 * CosmicLoader — minimal pulsing star / cosmic spinner for Suspense fallback.
 * Matches dark cosmic aesthetic; very cheap (no Three.js).
 */

export default function CosmicLoader() {
  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 1,
        background: "#000005",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "1.5rem",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* Outer ring */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            border: "1px solid rgba(184,240,255,0.15)",
            borderRadius: "50%",
            animation: "cosmic-pulse 2.4s ease-in-out infinite",
          }}
        />
        {/* Inner star */}
        <div
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "rgba(184,240,255,0.6)",
            boxShadow: "0 0 20px rgba(184,240,255,0.4), 0 0 40px rgba(184,240,255,0.2)",
            animation: "cosmic-twinkle 1.2s ease-in-out infinite alternate",
          }}
        />
      </div>
      <span
        style={{
          fontFamily: "var(--font-geist-mono), monospace",
          fontSize: "0.52rem",
          letterSpacing: "0.36em",
          textTransform: "uppercase",
          color: "rgba(184,240,255,0.38)",
        }}
      >
        loading
      </span>
      <style>{`
        @keyframes cosmic-pulse {
          0%, 100% { opacity: 0.4; transform: scale(0.95); }
          50% { opacity: 0.9; transform: scale(1.02); }
        }
        @keyframes cosmic-twinkle {
          from { opacity: 0.6; box-shadow: 0 0 12px rgba(184,240,255,0.3); }
          to { opacity: 1; box-shadow: 0 0 24px rgba(184,240,255,0.5), 0 0 48px rgba(184,240,255,0.2); }
        }
      `}</style>
    </div>
  );
}
