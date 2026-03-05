"use client";

/**
 * LensOverlay — fixed full-screen cinematic lens effects (pure CSS/SVG).
 *
 * Film grain — SVG feTurbulence fractalNoise animated at ~12fps.
 *              Very low opacity (~0.038) reads as analog noise texture.
 *
 * No canvas, no render loop cost on JS side (seed update is setInterval at 12fps).
 */

import { useEffect } from "react";

export default function LensOverlay() {
  // Animate grain seed at ~12fps — imperceptible CPU cost
  useEffect(() => {
    const el = document.getElementById("lens-grain-turb");
    if (!el) return;
    const id = setInterval(() => {
      el.setAttribute("seed", String(Math.floor(Math.random() * 1000)));
    }, 80);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      {/* ── Film grain — SVG fractalNoise, screen blend, ~4% opacity ── */}
      <svg
        aria-hidden="true"
        style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }}
      >
        <defs>
          <filter id="lens-grain-filter" x="-20%" y="-20%" width="140%" height="140%"
            colorInterpolationFilters="linearRGB">
            <feTurbulence
              id="lens-grain-turb"
              type="fractalNoise"
              baseFrequency="0.72"
              numOctaves="4"
              seed="0"
              stitchTiles="stitch"
              result="noise"
            />
            <feColorMatrix type="saturate" values="0" in="noise" result="grey" />
            <feComposite in="grey" in2="SourceGraphic" operator="in" />
          </filter>
        </defs>
      </svg>

      <div
        aria-hidden="true"
        style={{
          position:      "fixed",
          inset:         "-25%",
          zIndex:        49,
          pointerEvents: "none",
          opacity:       0.038,
          mixBlendMode:  "screen",
          filter:        "url(#lens-grain-filter)",
          background:    "#fff",
        }}
      />
    </>
  );
}
