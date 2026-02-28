"use client";

/**
 * LoadingScreen — full-viewport cover that appears on first paint and fades
 * out once the Three.js canvas signals it has drawn its first frame.
 *
 * voidState.ready is set to true by VoidBackground after the first useFrame
 * tick so the star field is guaranteed to exist when this cover disappears.
 */

import { useEffect, useState } from "react";
import { voidState } from "../lib/voidState";

export default function LoadingScreen() {
  const [phase, setPhase] = useState<"show" | "fade" | "gone">("show");

  useEffect(() => {
    let rafId: number;
    let elapsed = 0;
    const MIN_MS = 1100; // minimum display even if canvas is instant
    const start  = performance.now();

    const tick = () => {
      elapsed = performance.now() - start;
      if (elapsed >= MIN_MS && voidState.ready) {
        setPhase("fade");
        setTimeout(() => setPhase("gone"), 800);
      } else {
        rafId = requestAnimationFrame(tick);
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  if (phase === "gone") return null;

  return (
    <div
      aria-hidden="true"
      style={{
        position:   "fixed",
        inset:       0,
        zIndex:      9000,
        background: "#000005",
        display:    "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap:        "2.8rem",
        opacity:    phase === "fade" ? 0 : 1,
        transition: "opacity 0.8s ease",
        pointerEvents: phase === "fade" ? "none" : "auto",
      }}
    >
      {/* Wordmark */}
      <span style={{
        fontFamily:    "var(--font-geist-mono), monospace",
        fontSize:      "0.72rem",
        letterSpacing: "0.44em",
        textTransform: "uppercase",
        color:         "rgba(184,240,255,0.55)",
      }}>
        MULTISCATTER
      </span>

      {/* Animated progress bar */}
      <div style={{
        width:      "100px",
        height:     "1px",
        background: "rgba(184,240,255,0.08)",
        position:   "relative",
        overflow:   "hidden",
      }}>
        <div style={{
          position:  "absolute",
          top:        0,
          left:       0,
          height:    "100%",
          background: "rgba(184,240,255,0.50)",
          boxShadow: "0 0 8px rgba(184,240,255,0.35)",
          animation: "ls-bar 1.1s cubic-bezier(0.4,0,0.2,1) forwards",
        }} />
      </div>

      <style>{`
        @keyframes ls-bar {
          from { width: 0%; }
          to   { width: 100%; }
        }
      `}</style>
    </div>
  );
}
