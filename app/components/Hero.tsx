"use client";

/**
 * Hero — full-height text section. Sits directly over the VoidBackground
 * canvas with background: transparent so the void is completely seamless.
 *
 * Entrance animation: GSAP on wrapper divs (y + opacity + filter).
 * Directional scroll blur: SVG feGaussianBlur stdDeviation="0 N" reacts
 * to voidState.scrollVel — vertical-only, so it reads as true motion blur.
 *
 * Coordinate HUD is in HUDCorners.tsx (fixed, persistent) — not here.
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

  // Directional scroll blur
  const contentRef  = useRef<HTMLDivElement>(null);
  const feBlurRef   = useRef<SVGFEGaussianBlurElement>(null);

  // Directional motion blur driven by scroll velocity
  useEffect(() => {
    let raf: number;
    let curBlur = 0;
    function tick() {
      raf = requestAnimationFrame(tick);
      const vel    = Math.abs(voidState.scrollVel);
      const target = Math.min(vel * 6, 5);
      curBlur += (target - curBlur) * 0.14;
      const b = curBlur.toFixed(2);
      if (feBlurRef.current) feBlurRef.current.setAttribute("stdDeviation", `0 ${b}`);
      if (contentRef.current) {
        contentRef.current.style.filter = curBlur > 0.08 ? "url(#hero-scroll-blur)" : "";
      }
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
      {/* SVG directional blur filter — vertical only = motion blur feel */}
      <svg
        style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }}
        aria-hidden="true"
      >
        <defs>
          <filter id="hero-scroll-blur" x="-50%" y="-100%" width="200%" height="300%">
            <feGaussianBlur ref={feBlurRef} in="SourceGraphic" stdDeviation="0 0" />
          </filter>
        </defs>
      </svg>

      {/* Content — all text receives directional blur during scroll */}
      <div ref={contentRef} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        {/* Subtitle */}
        <div ref={subWrapRef} style={{ opacity: 0, marginBottom: "2.2rem" }}>
          <p className="label" style={{ letterSpacing: "0.44em", margin: 0 }}>
            3D Computer Graphics &amp; Art Design
          </p>
        </div>

        {/* Wordmark */}
        <div ref={titWrapRef} style={{ opacity: 0 }}>
          <h1 className="hero-title">MULTISCATTER</h1>
        </div>

        {/* Handle */}
        <div ref={hanWrapRef} style={{ opacity: 0, marginTop: "2rem" }}>
          <span className="label" style={{ letterSpacing: "0.44em" }}>
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
      </div>
    </section>
  );
}
