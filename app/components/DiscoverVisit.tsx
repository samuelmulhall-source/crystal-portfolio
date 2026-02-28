"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

const MON = {
  fontFamily: "var(--font-geist-mono), monospace",
  textTransform: "uppercase" as const,
};

const DISCOVER_LINKS = [
  { label: "X",  href: "https://x.com/multiscatter" },
  { label: "IG", href: "https://instagram.com/multiscatter" },
  { label: "LI", href: "https://linkedin.com/in/multiscatter" },
  { label: "TK", href: "https://tiktok.com/@multiscatter" },
];

export default function DiscoverVisit() {
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    sectionRef.current?.querySelectorAll(".dv-reveal").forEach((el, i) => {
      gsap.fromTo(
        el,
        { opacity: 0, y: 24 },
        {
          opacity: 1,
          y: 0,
          duration: 0.85,
          ease: "power2.out",
          delay: i * 0.06,
          scrollTrigger: {
            trigger: el,
            start: "top 90%",
            toggleActions: "play none none reverse",
          },
        }
      );
    });
  }, []);

  return (
    <section
      id="discover"
      ref={sectionRef}
      style={{
        position: "relative",
        background: "var(--void-mid)",
        padding: "6rem 0 7rem",
        overflow: "hidden",
      }}
    >
      {/* Subtle sphere/moon gradient — right side */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: "50%",
          right: "-8%",
          width: "min(55vw, 480px)",
          height: "min(55vw, 480px)",
          transform: "translate(20%, -50%)",
          background: "radial-gradient(ellipse 50% 50% at 50% 50%, rgba(120,180,220,0.08) 0%, rgba(40,80,120,0.03) 45%, transparent 70%)",
          pointerEvents: "none",
        }}
      />

      <div style={{ position: "relative", maxWidth: "920px", margin: "0 auto", padding: "0 2.5rem" }}>
        {/* ////// Summary */}
        <p className="label dv-reveal" style={{ marginBottom: "1.5rem", letterSpacing: "0.42em", color: "rgba(184,240,255,0.35)" }}>
          ////// Summary
        </p>
        <div className="dv-reveal" style={{ marginBottom: "3.5rem" }}>
          <p style={{
            color: "var(--text-secondary)",
            lineHeight: 1.88,
            fontSize: "0.92rem",
            margin: 0,
          }}>
            Multiscatter is a Melbourne-based 3D artist and real-time technical developer specialising in WebGPU, Three.js, and high-fidelity interactive experiences.
          </p>
          <p style={{
            color: "var(--text-secondary)",
            lineHeight: 1.88,
            fontSize: "0.92rem",
            margin: "1.5rem 0 0",
          }}>
            Crafting digital worlds that blend technical precision with artistic vision.
          </p>
        </div>

        {/* /// Discover */}
        <p className="label dv-reveal" style={{ marginBottom: "1rem", letterSpacing: "0.42em", color: "rgba(184,240,255,0.35)" }}>
          /// Discover
        </p>
        <div className="dv-reveal" style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem 2.5rem", marginBottom: "2.5rem" }}>
          {DISCOVER_LINKS.map(({ label, href }) => (
            <a
              key={label}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                ...MON,
                fontSize: "0.65rem",
                letterSpacing: "0.28em",
                color: "rgba(184,240,255,0.65)",
                textDecoration: "none",
                borderBottom: "1px solid rgba(184,240,255,0.35)",
                paddingBottom: "0.12rem",
                transition: "color 0.2s, border-color 0.2s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "rgba(220,248,255,0.95)";
                e.currentTarget.style.borderColor = "rgba(184,240,255,0.7)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "rgba(184,240,255,0.65)";
                e.currentTarget.style.borderColor = "rgba(184,240,255,0.35)";
              }}
            >
              {label} ↑
            </a>
          ))}
        </div>

        {/* /// Visit */}
        <p className="label dv-reveal" style={{ marginBottom: "1rem", letterSpacing: "0.42em", color: "rgba(184,240,255,0.35)" }}>
          /// Visit
        </p>
        <div className="dv-reveal">
          <a
            href="/#work"
            style={{
              ...MON,
              fontSize: "0.65rem",
              letterSpacing: "0.28em",
              color: "rgba(184,240,255,0.65)",
              textDecoration: "none",
              borderBottom: "1px solid rgba(184,240,255,0.35)",
              paddingBottom: "0.12rem",
              transition: "color 0.2s, border-color 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "rgba(220,248,255,0.95)";
              e.currentTarget.style.borderColor = "rgba(184,240,255,0.7)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "rgba(184,240,255,0.65)";
              e.currentTarget.style.borderColor = "rgba(184,240,255,0.35)";
            }}
          >
            website ↑
          </a>
        </div>
      </div>
    </section>
  );
}
