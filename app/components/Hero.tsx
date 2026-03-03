"use client";

/**
 * Hero — full-height text section. Sits directly over the VoidBackground
 * canvas with background: transparent so the void is completely seamless.
 * No bottom gradient — the void flows unbroken into all subsequent sections.
 *
 * Entrance animation: GSAP on wrapper divs (y + opacity + filter).
 * Mouse parallax: rAF reading voidState on inner elements, separate transform.
 * Using separate wrappers prevents GSAP and the rAF from fighting over transform.
 */

import { useRef, useEffect } from "react";
import { gsap } from "gsap";
import { voidState } from "../lib/voidState";

export default function Hero() {
  // GSAP entrance targets (outer wrappers — y + opacity)
  const subWrapRef  = useRef<HTMLDivElement>(null);
  const titWrapRef  = useRef<HTMLDivElement>(null);
  const hanWrapRef  = useRef<HTMLDivElement>(null);
  const ctaWrapRef  = useRef<HTMLDivElement>(null);

  // Parallax targets (inner elements — translate only)
  const subtitleRef = useRef<HTMLParagraphElement>(null);
  const titleRef    = useRef<HTMLHeadingElement>(null);
  const handleRef   = useRef<HTMLSpanElement>(null);
  const ctaRef      = useRef<HTMLDivElement>(null);

  // Mouse parallax — reads voidState so no duplicate mouse listeners
  useEffect(() => {
    let raf: number;
    let subX = 0, subY = 0;
    let titX = 0, titY = 0;
    let hanX = 0, hanY = 0;
    let ctaX = 0, ctaY = 0;

    function tick() {
      raf = requestAnimationFrame(tick);
      const mx = voidState.mouseNX; // −1..+1
      const my = voidState.mouseNY; // −1..+1 (bottom positive)

      // Different lerp speeds per layer create asynchronous parallax depth
      subX += (mx * 6   - subX) * 0.06;
      subY += (my * 4   - subY) * 0.06;
      titX += (mx * 3   - titX) * 0.05;
      titY += (my * 2   - titY) * 0.05;
      hanX += (mx * 5   - hanX) * 0.07;
      hanY += (my * 3   - hanY) * 0.07;
      ctaX += (mx * 2   - ctaX) * 0.04;
      ctaY += (my * 1.5 - ctaY) * 0.04;

      if (subtitleRef.current) subtitleRef.current.style.transform = `translate(${subX}px,${subY}px)`;
      if (titleRef.current)    titleRef.current.style.transform    = `translate(${titX}px,${titY}px)`;
      if (handleRef.current)   handleRef.current.style.transform   = `translate(${hanX}px,${hanY}px)`;
      if (ctaRef.current)      ctaRef.current.style.transform      = `translate(${ctaX}px,${ctaY}px)`;
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Entrance animation — runs on wrapper divs so transform is on a separate element
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
        <p
          ref={subtitleRef}
          className="label"
          style={{ letterSpacing: "0.44em", color: "rgba(184,240,255,0.40)", margin: 0 }}
        >
          3D Computer Graphics &amp; Art Design
        </p>
      </div>

      {/* Wordmark */}
      <div ref={titWrapRef} style={{ opacity: 0 }}>
        <h1 ref={titleRef} className="hero-title">
          MULTISCATTER
        </h1>
      </div>

      {/* Handle */}
      <div ref={hanWrapRef} style={{ opacity: 0, marginTop: "2rem" }}>
        <span
          ref={handleRef}
          className="label"
          style={{ letterSpacing: "0.44em", color: "rgba(184,240,255,0.32)" }}
        >
          @multiscatter
        </span>
      </div>

      {/* Scroll CTA */}
      <div ref={ctaWrapRef} style={{ opacity: 0, marginTop: "3.6rem" }}>
        <div
          ref={ctaRef}
          style={{
            display:        "flex",
            flexDirection:  "column",
            alignItems:     "center",
            gap:            "0.75rem",
          }}
        >
          <div
            style={{
              width:      "1px",
              height:     "48px",
              background: "linear-gradient(to bottom, rgba(184,240,255,0.50), transparent)",
              boxShadow:  "0 0 6px rgba(184,240,255,0.20)",
            }}
          />
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

      {/* No bottom gradient — void is seamless across all sections */}
    </section>
  );
}
