"use client";

/**
 * Hero — full-height text section. Sits directly over the VoidBackground
 * canvas with background: transparent so the void is completely seamless.
 * No bottom gradient — the void flows unbroken into all subsequent sections.
 */

import { useRef, useEffect } from "react";
import { gsap } from "gsap";

export default function Hero() {
  const subtitleRef = useRef<HTMLParagraphElement>(null);
  const titleRef    = useRef<HTMLHeadingElement>(null);
  const handleRef   = useRef<HTMLSpanElement>(null);
  const ctaRef      = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const tl = gsap.timeline({ delay: 0.85 });
    tl.fromTo(subtitleRef.current,
        { opacity: 0, y: 16 },
        { opacity: 1, y: 0, duration: 1.05, ease: "power2.out" }
      )
      .fromTo(titleRef.current,
        { opacity: 0, y: 26, filter: "blur(16px)" },
        { opacity: 1, y: 0, filter: "blur(0px)", duration: 1.5, ease: "power2.out" },
        "-=0.55"
      )
      .fromTo(handleRef.current,
        { opacity: 0, y: 10 },
        { opacity: 1, y: 0, duration: 0.9, ease: "power2.out" },
        "-=0.65"
      )
      .fromTo(ctaRef.current,
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
      <p
        ref={subtitleRef}
        className="label"
        style={{
          opacity:       0,
          marginBottom:  "2.2rem",
          letterSpacing: "0.44em",
          color:         "rgba(184,240,255,0.40)",
        }}
      >
        3D Computer Graphics &amp; Art Design
      </p>

      {/* Wordmark */}
      <h1
        ref={titleRef}
        className="hero-title"
        style={{ opacity: 0 }}
      >
        MULTISCATTER
      </h1>

      {/* Handle */}
      <span
        ref={handleRef}
        className="label"
        style={{
          opacity:       0,
          marginTop:    "2rem",
          letterSpacing: "0.44em",
          color:         "rgba(184,240,255,0.32)",
        }}
      >
        @multiscatter
      </span>

      {/* Scroll CTA */}
      <div
        ref={ctaRef}
        style={{
          opacity:       0,
          display:       "flex",
          flexDirection: "column",
          alignItems:    "center",
          gap:           "0.75rem",
          marginTop:     "3.6rem",
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
            color:      "rgba(184,240,255,0.58)",
            letterSpacing: "0.42em",
            fontSize:   "0.62rem",
            textShadow: "0 0 14px rgba(184,240,255,0.35)",
          }}
        >
          scroll ↓
        </span>
      </div>
      {/* No bottom gradient — void is seamless across all sections */}
    </section>
  );
}
