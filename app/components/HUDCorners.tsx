"use client";

/**
 * HUDCorners — console-style fixed micro-labels.
 *
 * PS2/GameCube system aesthetic: bottom-left shows live cursor coordinates,
 * bottom-right shows render mode. Top-left has the console system identifier
 * with active station readout. All low-opacity monospace with phosphor tint.
 */

import { useEffect, useRef } from "react";
import { voidState } from "../lib/voidState";

const MON: React.CSSProperties = {
  fontFamily: "var(--font-geist-mono), monospace",
  fontSize:   "0.46rem",
  letterSpacing: "0.22em",
  textTransform: "uppercase",
  pointerEvents: "none",
  userSelect: "none",
  lineHeight: 1,
};

export default function HUDCorners() {
  const coordRef = useRef<HTMLSpanElement>(null);
  const stationRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!coordRef.current) return;
      const x = String(Math.round(e.clientX)).padStart(4, "0");
      const y = String(Math.round(e.clientY)).padStart(4, "0");
      coordRef.current.textContent = `X:${x}  Y:${y}`;
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  // Station readout — updates via rAF (no re-renders)
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (!stationRef.current) return;
      const idx = voidState.activeStationIndex;
      stationRef.current.textContent = idx >= 0 ? `STN:${String(idx + 1).padStart(2, "0")}` : "STN:--";
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <>
      {/* Top-left: console system ID + active station */}
      <div
        aria-hidden="true"
        style={{
          position: "fixed", top: "0.7rem", left: "1.3rem", zIndex: 201,
          ...MON,
          color: "rgba(255,160,60,0.2)",
          display: "flex", alignItems: "center", gap: "0.5rem",
        }}
      >
        <span style={{ fontSize: "0.44rem", letterSpacing: "0.3em" }}>
          ε-9 RECOVERY CONSOLE
        </span>
        <span style={{ color: "rgba(184,240,255,0.12)" }}>│</span>
        <span ref={stationRef} style={{ color: "rgba(184,240,255,0.18)" }}>
          STN:--
        </span>
      </div>

      {/* Bottom-left: live cursor coordinates */}
      <div
        aria-hidden="true"
        style={{
          position: "fixed", bottom: "1.1rem", left: "1.3rem", zIndex: 201,
          ...MON,
          color: "rgba(184,240,255,0.18)",
        }}
      >
        <span ref={coordRef}>X:0000  Y:0000</span>
      </div>

      {/* Bottom-right: render mode label */}
      <div
        aria-hidden="true"
        style={{
          position: "fixed", bottom: "1.1rem", right: "1.3rem", zIndex: 201,
          ...MON,
          color: "rgba(184,240,255,0.18)",
        }}
      >
        PBR · IBL · WEBGL
      </div>
    </>
  );
}
