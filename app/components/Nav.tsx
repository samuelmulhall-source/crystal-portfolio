"use client";

/**
 * Nav — Console-themed top navigation bar.
 *
 * PS2/GameCube aesthetic: metallic glass panel with subtle warm accents,
 * monospace typography, and a structured dropdown for Work sub-tabs.
 * Active section uses orange phosphor accent; inactive uses ice-blue.
 */

import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { workModels } from "../lib/workModels";
import { useIsMobile } from "../lib/useMediaQuery";

type WorkTab = 'models' | 'videos' | 'images';
const WORK_SUBS: { icon: string; label: string; tab: WorkTab }[] = [
  { icon: "\u25C7", label: "Artifacts",    tab: "models" },
  { icon: "\u25B6", label: "Data Logs",    tab: "videos" },
  { icon: "\u25AA", label: "Memory Cards", tab: "images" },
];
const LINKS = [
  { label: "Gallery", href: "#work" },
  { label: "Contact", href: "#contact" },
];

type SectionId = "hero" | "work" | "contact" | null;

export default function Nav() {
  const navRef    = useRef<HTMLElement>(null);
  const [scrolled, setScrolled]     = useState(false);
  const [workOpen, setWorkOpen]     = useState(false);
  const [activeSection, setActiveSection] = useState<SectionId>("hero");
  const isMobile = useIsMobile();
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    gsap.fromTo(navRef.current,
      { opacity: 0, y: -10 },
      { opacity: 1, y: 0, duration: 0.75, ease: "power3.out", delay: 0.30 }
    );
    ScrollTrigger.create({
      start:      "top -90px",
      onEnter:     () => setScrolled(true),
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

  const scrollTo = (e: React.MouseEvent<HTMLAnchorElement | HTMLButtonElement>, href: string) => {
    e.preventDefault();
    setWorkOpen(false);
    document.querySelector(href)?.scrollIntoView({ behavior: "smooth" });
  };

  const openWork  = () => { if (closeTimer.current) clearTimeout(closeTimer.current); setWorkOpen(true);  };
  const closeWork = () => { closeTimer.current = setTimeout(() => setWorkOpen(false), 160); };
  const toggleWork = () => setWorkOpen((o) => !o);

  const linkActive = (section: SectionId) => activeSection === section;

  return (
    <nav
      ref={navRef}
      aria-label="Main navigation"
      style={{
        position:       "fixed",
        top: 0, left: 0, right: 0,
        zIndex:          50,
        display:        "flex",
        alignItems:     "center",
        justifyContent: "space-between",
        padding:        "0 clamp(1rem, 4vw, 2.5rem)",
        height:          scrolled ? "48px" : "62px",
        background:     scrolled
          ? "linear-gradient(145deg, rgba(8,14,32,0.82) 0%, rgba(4,8,20,0.90) 100%)"
          : "transparent",
        backdropFilter:  scrolled ? "blur(32px) saturate(1.8) brightness(1.04)" : "none",
        WebkitBackdropFilter: scrolled ? "blur(32px) saturate(1.8) brightness(1.04)" : "none",
        borderBottom:    scrolled ? "1px solid rgba(184,240,255,0.06)" : "none",
        boxShadow:       scrolled
          ? "inset 0 1px 0 rgba(255,255,255,0.04), 0 8px 32px rgba(0,0,12,0.5)"
          : "none",
        transition:     "height 0.4s ease, background 0.4s ease, box-shadow 0.4s ease, border-color 0.4s ease",
      }}
    >
      {/* ── Wordmark ── */}
      <a
        href="#hero"
        className="glitch"
        data-text="MULTISCATTER"
        onClick={(e) => scrollTo(e, "#hero")}
        style={{
          fontFamily:    "var(--font-geist-mono), monospace",
          fontSize:       "0.65rem",
          letterSpacing:  "0.28em",
          textTransform:  "uppercase",
          color:          linkActive("hero")
            ? "rgba(255,160,60,0.9)"
            : scrolled ? "rgba(184,240,255,0.6)" : "rgba(238,248,255,0.88)",
          textDecoration: "none",
          textShadow: linkActive("hero")
            ? "0 0 16px rgba(255,160,60,0.3)"
            : scrolled ? "none" : "0 0 22px rgba(184,240,255,0.18), 0 1px 2px rgba(0,0,0,0.4)",
          transition: "color 0.35s ease, text-shadow 0.35s ease",
          minHeight: "44px", display: "flex", alignItems: "center", gap: "0.5rem",
        }}
      >
        {/* PS2-style status LED */}
        <span className="status-led" />
        MULTISCATTER
      </a>

      {/* ── Links ── */}
      <ul style={{ display: "flex", alignItems: "center", gap: "1.8rem", listStyle: "none", margin: 0, padding: 0 }}>

        {/* Work — hover on desktop, tap toggle on mobile */}
        <li style={{ position: "relative", minWidth: "3rem", textAlign: "center" }}
          onMouseEnter={!isMobile ? openWork : undefined}
          onMouseLeave={!isMobile ? closeWork : undefined}
        >
          <a
            href="#work"
            className="frost-link nav-link"
            onClick={(e) => {
              if (isMobile) {
                e.preventDefault();
                toggleWork();
              } else {
                scrollTo(e, "#work");
              }
            }}
            style={{
              color: linkActive("work") ? "rgba(255,160,60,0.85)" : scrolled ? "rgba(184,240,255,0.48)" : "rgba(184,240,255,0.72)",
              textShadow: linkActive("work") ? "0 0 12px rgba(255,160,60,0.25)" : "none",
              display: "flex", alignItems: "center", gap: "0.3rem",
              minHeight: "44px", justifyContent: "center", padding: "0 4px",
              borderBottom: linkActive("work") ? "1px solid rgba(255,160,60,0.45)" : "1px solid transparent",
              marginBottom: linkActive("work") ? "-1px" : "0",
              transition: "color 0.25s ease, border-color 0.25s ease, text-shadow 0.25s ease",
            }}
          >
            Work
            {/* Dropdown chevron */}
            <span style={{
              fontSize: "0.4rem",
              transition: "transform 0.2s ease",
              transform: workOpen ? "rotate(180deg)" : "rotate(0deg)",
              opacity: 0.5,
            }}>
              &#9660;
            </span>
          </a>

          {/* ── Dropdown: console-styled panel ── */}
          <ul style={{
            position:   "absolute",
            top:        "calc(100% + 4px)",
            right:      0,
            transform:  workOpen
              ? "translateY(0) scale(1)"
              : "translateY(-4px) scale(0.97)",
            background: "linear-gradient(145deg, rgba(8,14,32,0.92) 0%, rgba(4,8,20,0.96) 100%)",
            backdropFilter: "blur(24px) saturate(1.6)",
            WebkitBackdropFilter: "blur(24px) saturate(1.6)",
            border:       "1px solid rgba(184,240,255,0.06)",
            borderRadius: "3px",
            padding:      "4px 0",
            listStyle:    "none",
            margin:       0,
            minWidth:     "168px",
            opacity:      workOpen ? 1 : 0,
            pointerEvents: workOpen ? "auto" : "none",
            transition:   "opacity 0.18s ease, transform 0.18s cubic-bezier(0.22,1,0.36,1)",
            boxShadow:    "inset 0 1px 0 rgba(255,255,255,0.04), 0 16px 40px rgba(0,0,12,0.7), 0 0 1px rgba(184,240,255,0.06)",
            overflow:     "hidden",
          }}>
            {/* Dropdown header */}
            <li style={{
              padding: "6px 14px 4px",
              borderBottom: "1px solid rgba(184,240,255,0.05)",
            }}>
              <span style={{
                fontFamily: "var(--font-geist-mono), monospace",
                fontSize: "0.42rem",
                letterSpacing: "0.24em",
                textTransform: "uppercase",
                color: "rgba(255,160,60,0.4)",
              }}>
                RECOVERED DATA
              </span>
            </li>
            {WORK_SUBS.map(({ icon, label, tab }) => (
              <li key={tab}>
                <a
                  href="#work"
                  onClick={(e) => { workModels.setPendingTab(tab); scrollTo(e, "#work"); setWorkOpen(false); }}
                  style={{
                    display:       "flex",
                    alignItems:    "center",
                    gap:           "0.5rem",
                    padding:       "8px 14px",
                    minHeight:     "40px",
                    boxSizing:     "border-box",
                    color:         "rgba(184,240,255,0.6)",
                    textDecoration: "none",
                    fontFamily:    "var(--font-geist-mono), monospace",
                    fontSize:       "0.6rem",
                    letterSpacing:  "0.1em",
                    textTransform:  "uppercase",
                    whiteSpace:    "nowrap",
                    transition:    "color 0.15s ease, background 0.15s ease",
                  }}
                  onMouseEnter={e => {
                    const el = e.currentTarget as HTMLElement;
                    el.style.color      = "rgba(255,160,60,0.9)";
                    el.style.background = "rgba(255,160,60,0.04)";
                    el.style.textShadow = "0 0 10px rgba(255,160,60,0.2)";
                  }}
                  onMouseLeave={e => {
                    const el = e.currentTarget as HTMLElement;
                    el.style.color      = "rgba(184,240,255,0.6)";
                    el.style.background = "";
                    el.style.textShadow = "";
                  }}
                >
                  <span style={{ fontSize: "0.5rem", opacity: 0.7 }}>{icon}</span>
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </li>

        {LINKS.map(({ label, href }) => {
          const sectionId = href.replace("#", "") as SectionId;
          const active = linkActive(sectionId);
          return (
            <li key={href} style={{ minWidth: "3rem", textAlign: "center" }}>
              <a
                href={href}
                className="frost-link nav-link"
                onClick={(e) => { scrollTo(e, href); setWorkOpen(false); }}
                style={{
                  color: active ? "rgba(255,160,60,0.85)" : scrolled ? "rgba(184,240,255,0.48)" : "rgba(184,240,255,0.72)",
                  textShadow: active ? "0 0 12px rgba(255,160,60,0.25)" : "none",
                  minHeight: "44px", display: "flex", alignItems: "center", padding: "0 4px",
                  borderBottom: active ? "1px solid rgba(255,160,60,0.45)" : "1px solid transparent",
                  marginBottom: active ? "-1px" : "0",
                  transition: "color 0.25s ease, border-color 0.25s ease, text-shadow 0.25s ease",
                }}
              >
                {label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
