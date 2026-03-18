"use client";

/**
 * HUDCorners — console-style fixed micro-labels.
 *
 * PS2/GameCube system aesthetic: bottom-left shows live cursor coordinates,
 * bottom-right shows render mode. Top-left has the console system identifier
 * with active station readout. All low-opacity monospace with phosphor tint.
 *
 * Hidden on mobile — cursor coords are meaningless on touch, and the HUD
 * elements overlap with the Nav bar on narrow screens.
 */

import { useEffect, useRef } from "react";
import { voidState } from "../lib/voidState";
import { useIsDesktop } from "../lib/useMediaQuery";

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
  const isDesktop = useIsDesktop();

  useEffect(() => {
    if (!isDesktop) return;
    const onMove = (e: MouseEvent) => {
      if (!coordRef.current) return;
      const x = String(Math.round(e.clientX)).padStart(4, "0");
      const y = String(Math.round(e.clientY)).padStart(4, "0");
      coordRef.current.textContent = `X:${x}  Y:${y}`;
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, [isDesktop]);

  // Station readout — polls at 250ms (station changes are infrequent)
  useEffect(() => {
    if (!isDesktop) return;
    const id = setInterval(() => {
      if (!stationRef.current) return;
      const idx = voidState.activeStationIndex;
      stationRef.current.textContent = idx >= 0 ? `STN:${String(idx + 1).padStart(2, "0")}` : "STN:--";
    }, 250);
    return () => clearInterval(id);
  }, [isDesktop]);

  // Don't render on mobile
  if (!isDesktop) return null;

  return (
    <>
      {/* Top-left: console system ID + active station */}
      <div
        aria-hidden="true"
        style={{
          position: "fixed", top: "0.7rem", left: "1.3rem", zIndex: 201,
          ...MON,
          color: "rgba(184,240,255,0.2)",
          display: "flex", alignItems: "center", gap: "0.5rem",
        }}
      >
        <span style={{ fontSize: "0.44rem", letterSpacing: "0.3em" }}>
          {"\u03B5"}-9 RECOVERY CONSOLE
        </span>
        <span style={{ color: "rgba(184,240,255,0.12)" }}>{"\u2502"}</span>
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
        PBR {"\u00B7"} IBL {"\u00B7"} WEBGL
      </div>
    </>
  );
}
