"use client";

/**
 * Nav — Minimal top navigation bar.
 *
 * Three links: brand wordmark, Work, Contact.
 * No dropdown — WeaponHUD is the sole archive navigation.
 */

import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { STATIONS, getJourneyScrollMetrics } from "../lib/journeyConfig";
import { voidState } from "../lib/voidState";
import { lenisInstance } from "./SmoothScroll";

type SectionId = "hero" | "work" | "contact" | null;

export default function Nav() {
  const navRef = useRef<HTMLElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const [activeSection, setActiveSection] = useState<SectionId>("hero");

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    gsap.fromTo(navRef.current,
      { opacity: 0, y: -10 },
      { opacity: 1, y: 0, duration: 0.75, ease: "power3.out", delay: 0.30 }
    );
    ScrollTrigger.create({
      start: "top -90px",
      onEnter: () => setScrolled(true),
      onLeaveBack: () => setScrolled(false),
    });
  }, []);

  // Active section highlight
  useEffect(() => {
    const sections = [
      { id: "hero" as const, el: document.getElementById("hero") },
      { id: "work" as const, el: document.getElementById("work") },
      { id: "contact" as const, el: document.getElementById("contact") },
    ].filter((s) => s.el) as { id: SectionId; el: HTMLElement }[];
    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const byId = new Map<string, number>();
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).id;
          if (id === "hero" || id === "work" || id === "contact") {
            byId.set(id, entry.intersectionRatio);
          }
        }
        if (byId.size === 0) return;
        const best = [...byId.entries()].reduce((a, b) => (a[1] >= b[1] ? a : b))[0] as SectionId;
        setActiveSection(best);
      },
      { rootMargin: "-25% 0px -50% 0px", threshold: [0, 0.1, 0.5, 1] }
    );
    sections.forEach((s) => observer.observe(s.el));
    return () => observer.disconnect();
  }, []);

  const scrollTo = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    e.preventDefault();
    if (href === "#work") {
      // Scroll to first weapon station
      const station = STATIONS[0];
      const metrics = getJourneyScrollMetrics();
      if (!metrics) return;
      const target = metrics.start + station.scrollViewCenter * metrics.max;
      voidState.snapCamera = true;
      if (lenisInstance) {
        lenisInstance.scrollTo(target);
      } else {
        window.scrollTo({ top: target, behavior: "smooth" });
      }
    } else {
      document.querySelector(href)?.scrollIntoView({ behavior: "smooth" });
    }
  };

  const linkActive = (section: SectionId) => activeSection === section;

  const linkStyle = (section: SectionId): React.CSSProperties => ({
    color: linkActive(section)
      ? "rgba(184,240,255,0.85)"
      : scrolled ? "rgba(184,240,255,0.48)" : "rgba(184,240,255,0.72)",
    textShadow: linkActive(section) ? "0 0 12px rgba(184,240,255,0.25)" : "none",
    minHeight: "44px",
    display: "flex",
    alignItems: "center",
    padding: "0 4px",
    borderBottom: linkActive(section)
      ? "1px solid rgba(184,240,255,0.45)"
      : "1px solid transparent",
    marginBottom: linkActive(section) ? "-1px" : "0",
    transition: "color 0.25s ease, border-color 0.25s ease, text-shadow 0.25s ease",
    textDecoration: "none",
    fontFamily: "var(--font-geist-mono), monospace",
    fontSize: "0.6rem",
    letterSpacing: "0.1em",
    textTransform: "uppercase",
  });

  return (
    <nav
      ref={navRef}
      aria-label="Main navigation"
      style={{
        position: "fixed",
        top: 0, left: 0, right: 0,
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 clamp(1rem, 4vw, 2.5rem)",
        height: scrolled ? "48px" : "62px",
        background: scrolled
          ? "linear-gradient(145deg, rgba(8,14,32,0.82) 0%, rgba(4,8,20,0.90) 100%)"
          : "transparent",
        backdropFilter: scrolled ? "blur(32px) saturate(1.8) brightness(1.04)" : "none",
        WebkitBackdropFilter: scrolled ? "blur(32px) saturate(1.8) brightness(1.04)" : "none",
        borderBottom: scrolled ? "1px solid rgba(184,240,255,0.06)" : "none",
        boxShadow: scrolled
          ? "inset 0 1px 0 rgba(255,255,255,0.04), 0 8px 32px rgba(0,0,12,0.5)"
          : "none",
        transition: "height 0.4s ease, background 0.4s ease, box-shadow 0.4s ease, border-color 0.4s ease",
      }}
    >
      {/* ── Wordmark ── */}
      <a
        href="#hero"
        className="glitch"
        data-text="MULTISCATTER"
        onClick={(e) => scrollTo(e, "#hero")}
        style={{
          fontFamily: "var(--font-geist-mono), monospace",
          fontSize: "0.65rem",
          letterSpacing: "0.28em",
          textTransform: "uppercase",
          color: linkActive("hero")
            ? "rgba(184,240,255,0.9)"
            : scrolled ? "rgba(184,240,255,0.6)" : "rgba(238,248,255,0.88)",
          textDecoration: "none",
          textShadow: linkActive("hero")
            ? "0 0 16px rgba(184,240,255,0.3)"
            : scrolled ? "none" : "0 0 22px rgba(184,240,255,0.18), 0 1px 2px rgba(0,0,0,0.4)",
          transition: "color 0.35s ease, text-shadow 0.35s ease",
          minHeight: "44px", display: "flex", alignItems: "center", gap: "0.5rem",
        }}
      >
        <span className="status-led" />
        MULTISCATTER
      </a>

      {/* ── Links ── */}
      <ul style={{ display: "flex", alignItems: "center", gap: "1.8rem", listStyle: "none", margin: 0, padding: 0 }}>
        <li>
          <a href="#work" className="frost-link nav-link" onClick={(e) => scrollTo(e, "#work")} style={linkStyle("work")}>
            Work
          </a>
        </li>
        <li>
          <a href="#contact" className="frost-link nav-link" onClick={(e) => scrollTo(e, "#contact")} style={linkStyle("contact")}>
            Contact
          </a>
        </li>
      </ul>
    </nav>
  );
}
