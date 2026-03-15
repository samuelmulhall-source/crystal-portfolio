"use client";

/**
 * FPSCounter — lightweight performance monitor.
 * Displays current FPS at top-center of screen.
 * Uses a rolling average over ~30 frames for stability.
 */

import { useEffect, useRef } from "react";

export default function FPSCounter() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let frames = 0;
    let fps = 0;

    const tick = () => {
      raf = requestAnimationFrame(tick);
      frames++;
      const now = performance.now();
      const elapsed = now - last;
      if (elapsed >= 500) {
        fps = Math.round((frames * 1000) / elapsed);
        frames = 0;
        last = now;
        if (ref.current) {
          ref.current.textContent = `${fps} FPS`;
          ref.current.style.color =
            fps >= 55 ? "rgba(120,255,180,0.6)" :
            fps >= 30 ? "rgba(255,200,80,0.6)" :
                        "rgba(255,90,90,0.6)";
        }
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      ref={ref}
      style={{
        position: "fixed",
        top: "0.6rem",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 201,
        fontFamily: "var(--font-geist-mono, monospace)",
        fontSize: "0.5rem",
        letterSpacing: "0.2em",
        color: "rgba(120,255,180,0.6)",
        pointerEvents: "none",
        userSelect: "none",
      }}
      aria-hidden="true"
    >
      -- FPS
    </div>
  );
}
