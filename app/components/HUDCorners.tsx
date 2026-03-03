"use client";

/**
 * HUDCorners — fixed-position micro-labels that give the site a "Starship OS"
 * feel. Bottom-left shows live cursor coordinates (DOM mutation, no re-renders).
 * Bottom-right shows a static mode label. Top corners avoided to not clash nav.
 */

import { useEffect, useRef } from "react";

const MON: React.CSSProperties = {
  fontFamily: "var(--font-geist-mono), monospace",
  fontSize:   "0.48rem",
  letterSpacing: "0.22em",
  textTransform: "uppercase",
  color: "rgba(184,240,255,0.22)",
  pointerEvents: "none",
  userSelect: "none",
  lineHeight: 1,
};

export default function HUDCorners() {
  const coordRef = useRef<HTMLSpanElement>(null);

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

  return (
    <>
      {/* Bottom-left: live cursor coordinates */}
      <div
        aria-hidden="true"
        style={{ position: "fixed", bottom: "1.1rem", left: "1.3rem", zIndex: 201, ...MON }}
      >
        <span ref={coordRef}>X:0000  Y:0000</span>
      </div>

      {/* Bottom-right: render mode label */}
      <div
        aria-hidden="true"
        style={{ position: "fixed", bottom: "1.1rem", right: "1.3rem", zIndex: 201, ...MON }}
      >
        PBR · IBL · WEBGPU
      </div>
    </>
  );
}
