"use client";

/**
 * CRTOverlay — premium cinematic CRT post-effect (pure CSS/SVG).
 *
 * Layers:
 *   1. Scanlines — horizontal 2px lines at very low opacity (phosphor feel)
 *   2. Subtle vignette — radial gradient darkening edges
 *   3. Gentle barrel distortion look via radial gradient (no actual warp)
 *   4. Phosphor glow — faint color fringing at edges
 *
 * Design reference: PS2/GameCube system menus — premium and cinematic,
 * never chunky or pixelated. The effect should feel like looking through
 * a high-end CRT monitor in a dark room.
 *
 * All CSS, no canvas or shader cost. pointer-events: none throughout.
 */

export default function CRTOverlay() {
  return (
    <>
      {/* ── Scanlines — very subtle horizontal stripes ── */}
      <div
        aria-hidden="true"
        className="crt-scanlines"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 48,
          pointerEvents: "none",
          opacity: 0.04,
          background:
            "repeating-linear-gradient(0deg, transparent 0px, transparent 2px, rgba(0,0,0,0.4) 2px, rgba(0,0,0,0.4) 4px)",
          mixBlendMode: "multiply",
        }}
      />

      {/* ── Vignette — radial edge darkening ── */}
      <div
        aria-hidden="true"
        className="crt-vignette"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 47,
          pointerEvents: "none",
          background:
            "radial-gradient(ellipse 75% 75% at 50% 50%, transparent 50%, rgba(0,0,5,0.5) 100%)",
        }}
      />

      {/* ── Phosphor edge glow — warm at corners ── */}
      <div
        aria-hidden="true"
        className="crt-phosphor"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 46,
          pointerEvents: "none",
          opacity: 0.08,
          background:
            "radial-gradient(ellipse 120% 120% at 50% 50%, transparent 40%, rgba(255,140,50,0.15) 85%, rgba(255,100,30,0.08) 100%)",
          mixBlendMode: "screen",
        }}
      />

      {/* ── Subtle inner glow — warm phosphor ambience ── */}
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 45,
          pointerEvents: "none",
          opacity: 0.025,
          background:
            "radial-gradient(ellipse 80% 80% at 50% 50%, rgba(184,240,255,0.2) 0%, transparent 60%)",
          mixBlendMode: "screen",
        }}
      />

      <style jsx>{`
        /* Reduced motion: disable scanline animation, lower opacity */
        @media (prefers-reduced-motion: reduce) {
          .crt-scanlines {
            opacity: 0.015 !important;
          }
        }
      `}</style>
    </>
  );
}
