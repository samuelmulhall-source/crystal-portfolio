"use client";

/**
 * FpsMeter — tiny top-right debug readout.
 *
 * Shows a smoothed instantaneous FPS plus the worst (lowest) FPS seen over a
 * rolling ~2s window, which is the number that actually exposes hitches. Pure
 * rAF + direct DOM text writes (no React re-render per frame) so the meter
 * itself adds no measurable overhead.
 */

import { useEffect, useRef } from "react";

export default function FpsMeter() {
  const fpsRef = useRef<HTMLSpanElement>(null);
  const lowRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let raf = 0;
    let frames = 0;
    let acc = 0; // seconds accumulated in the current sample window
    let last = performance.now();

    // Rolling worst-FPS over ~2s = 10 sample windows of ~200ms.
    const recent: number[] = [];
    const WINDOW = 0.2;
    const HISTORY = 10;

    const tint = (el: HTMLElement | null, fps: number) => {
      if (!el) return;
      el.style.color = fps >= 55 ? "#8ef0c0" : fps >= 30 ? "#f0d68e" : "#f08e8e";
    };

    const loop = () => {
      raf = requestAnimationFrame(loop);
      const now = performance.now();
      const dt = (now - last) * 0.001;
      last = now;
      frames += 1;
      acc += dt;

      if (acc >= WINDOW) {
        const fps = frames / acc;
        frames = 0;
        acc = 0;

        recent.push(fps);
        if (recent.length > HISTORY) recent.shift();
        let low = Infinity;
        for (let i = 0; i < recent.length; i++) if (recent[i] < low) low = recent[i];

        if (fpsRef.current) {
          fpsRef.current.textContent = String(Math.round(fps));
          tint(fpsRef.current, fps);
        }
        if (lowRef.current) {
          lowRef.current.textContent = String(Math.round(low));
          tint(lowRef.current, low);
        }
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      role="presentation"
      aria-hidden="true"
      style={{
        position: "fixed",
        top: "8px",
        right: "8px",
        zIndex: 9999,
        pointerEvents: "none",
        display: "flex",
        gap: "10px",
        alignItems: "baseline",
        padding: "4px 8px",
        borderRadius: "6px",
        background: "rgba(2,4,10,0.62)",
        border: "1px solid rgba(184,240,255,0.16)",
        font: "500 12px var(--font-plex-mono, monospace)",
        letterSpacing: "0.06em",
        lineHeight: 1,
        color: "#b8f0ff",
        userSelect: "none",
      }}
    >
      <span style={{ opacity: 0.55, fontSize: "9px", letterSpacing: "0.18em" }}>FPS</span>
      <span ref={fpsRef} style={{ minWidth: "24px", textAlign: "right" }}>—</span>
      <span style={{ opacity: 0.55, fontSize: "9px", letterSpacing: "0.18em" }}>LOW</span>
      <span ref={lowRef} style={{ minWidth: "24px", textAlign: "right", opacity: 0.85 }}>—</span>
    </div>
  );
}
