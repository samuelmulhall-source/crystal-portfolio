"use client";

/**
 * Hero — full-height text section. Sits directly over the VoidBackground
 * canvas with background: transparent so the void is completely seamless.
 *
 * Entrance animation: GSAP on wrapper divs (y + opacity + filter).
 * No parallax — clean, static composition.
 *
 * HUD element: live cursor coordinate readout in bottom-left (igloo-style
 * technical annotation). Reads voidState without adding any jitter.
 */

import { useRef, useEffect } from "react";
import { gsap } from "gsap";
import { voidState } from "../lib/voidState";

export default function Hero() {
  // GSAP entrance wrappers
  const subWrapRef = useRef<HTMLDivElement>(null);
  const titWrapRef = useRef<HTMLDivElement>(null);
  const hanWrapRef = useRef<HTMLDivElement>(null);
  const ctaWrapRef = useRef<HTMLDivElement>(null);

  // Coordinate HUD
  const coordRef = useRef<HTMLSpanElement>(null);

  // Live coordinate readout — reads voidState, no DOM event overhead
  useEffect(() => {
    let raf: number;
    function tick() {
      raf = requestAnimationFrame(tick);
      const el = coordRef.current;
      if (!el) return;
      const x  = voidState.mouseNX;
      const y  = voidState.mouseNY;
      const sx = (x >= 0 ? "+" : "") + x.toFixed(3);
      const sy = (y >= 0 ? "+" : "") + y.toFixed(3);
      el.textContent = `${sx}  ${sy}`;
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Entrance animation — staggered reveal
  useEffect(() => {
    const tl = gsap.timeline({ delay: 0.85 });
    tl.fromTo(subWrapRef.current,
        { opacity: 0, y: 16 },
        { opacity: 1, y: 0, duration: 1.05, ease: "power2.out" }
      )
      .fromTo(titWrapRef.current,
        { opacity: 0, y: 26, filter: "blur(16px)" },
        { opacity: 1, y: 0, filter: "blur(0px)", duration: 1.5, ease: "power2.out" },
        "-=0.55"
      )
      .fromTo(hanWrapRef.current,
        { opacity: 0, y: 10 },
        { opacity: 1, y: 0, duration: 0.9, ease: "power2.out" },
        "-=0.65"
      )
      .fromTo(ctaWrapRef.current,
        { opacity: 0 },
        { opacity: 1, duration: 0.8, ease: "power2.out" },
        "-=0.5"
      );
  }, []);

  return (
    <section
      id="hero"
      style={{
        position:       "relative",
        height:         "100vh",
        display:        "flex",
        flexDirection:  "column",
        alignItems:     "center",
        justifyContent: "center",
        background:     "transparent",
        overflow:       "hidden",
        userSelect:     "none",
        pointerEvents:  "none",
      }}
    >
      {/* Subtitle */}
      <div ref={subWrapRef} style={{ opacity: 0, marginBottom: "2.2rem" }}>
        <p className="label" style={{ letterSpacing: "0.44em", color: "rgba(184,240,255,0.40)", margin: 0 }}>
          3D Computer Graphics &amp; Art Design
        </p>
      </div>

      {/* Wordmark */}
      <div ref={titWrapRef} style={{ opacity: 0 }}>
        <h1 className="hero-title">MULTISCATTER</h1>
      </div>

      {/* Handle */}
      <div ref={hanWrapRef} style={{ opacity: 0, marginTop: "2rem" }}>
        <span className="label" style={{ letterSpacing: "0.44em", color: "rgba(184,240,255,0.32)" }}>
          @multiscatter
        </span>
      </div>

      {/* Scroll CTA */}
      <div ref={ctaWrapRef} style={{ opacity: 0, marginTop: "3.6rem" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.75rem" }}>
          <div style={{
            width:      "1px",
            height:     "48px",
            background: "linear-gradient(to bottom, rgba(184,240,255,0.50), transparent)",
            boxShadow:  "0 0 6px rgba(184,240,255,0.20)",
          }} />
          <span
            className="label scroll-indicator"
            style={{
              color:         "rgba(184,240,255,0.58)",
              letterSpacing: "0.42em",
              fontSize:      "0.62rem",
              textShadow:    "0 0 14px rgba(184,240,255,0.35)",
            }}
          >
            scroll ↓
          </span>
        </div>
      </div>

      {/* ── HUD: live cursor coordinates — bottom-left, igloo-style ── */}
      <div style={{
        position:  "absolute",
        bottom:    "clamp(1.5rem, 3vh, 2.5rem)",
        left:      "clamp(1rem, 4vw, 2.5rem)",
        display:   "flex",
        flexDirection: "column",
        gap:       "0.25rem",
      }}>
        <span style={{
          fontFamily:    "var(--font-geist-mono), monospace",
          fontSize:      "0.50rem",
          letterSpacing: "0.20em",
          color:         "rgba(184,240,255,0.18)",
          textTransform: "uppercase",
        }}>// cursor</span>
        <span
          ref={coordRef}
          style={{
            fontFamily:    "var(--font-geist-mono), monospace",
            fontSize:      "0.52rem",
            letterSpacing: "0.16em",
            color:         "rgba(184,240,255,0.28)",
          }}
        >
          +0.000  +0.000
        </span>
      </div>
    </section>
  );
}
