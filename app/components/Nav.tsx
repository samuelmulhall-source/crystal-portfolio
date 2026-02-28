"use client";

import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { workModels } from "../lib/workModels";

type WorkTab = 'models' | 'videos' | 'images';
const WORK_SUBS: { label: string; tab: WorkTab }[] = [
  { label: "3D Models",     tab: "models" },
  { label: "Final Renders", tab: "videos" },
  { label: "Gallery",       tab: "images" },
];
const LINKS = [
  { label: "Contact", href: "#contact" },
];

export default function Nav() {
  const navRef    = useRef<HTMLElement>(null);
  const [scrolled, setScrolled]     = useState(false);
  const [workOpen, setWorkOpen]     = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    gsap.fromTo(navRef.current,
      { opacity: 0, y: -20 },
      { opacity: 1, y: 0, duration: 1.4, ease: "power2.out", delay: 0.6 }
    );
    ScrollTrigger.create({
      start:      "top -90px",
      onEnter:     () => setScrolled(true),
      onLeaveBack: () => setScrolled(false),
    });
  }, []);

  const scrollTo = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    e.preventDefault();
    setWorkOpen(false);
    document.querySelector(href)?.scrollIntoView({ behavior: "smooth" });
  };

  const linkColor = scrolled ? "rgba(184,240,255,0.48)" : "rgba(184,240,255,0.60)";
  const linkShadow = scrolled ? "none" : "0 1px 4px rgba(0,0,0,0.5)";

  const openWork  = () => { if (closeTimer.current) clearTimeout(closeTimer.current); setWorkOpen(true);  };
  const closeWork = () => { closeTimer.current = setTimeout(() => setWorkOpen(false), 160); };
  const toggleWork = () => setWorkOpen((o) => !o);

  return (
    <nav
      ref={navRef}
      style={{
        position:       "fixed",
        top: 0, left: 0, right: 0,
        zIndex:          50,
        display:        "flex",
        alignItems:     "center",
        justifyContent: "space-between",
        padding:        "0 clamp(1rem, 4vw, 2.5rem)",
        height:          scrolled ? "50px" : "66px",
        background:     scrolled ? "rgba(5,7,15,0.90)" : "transparent",
        backdropFilter:  scrolled ? "blur(32px) saturate(1.5)" : "none",
        WebkitBackdropFilter: scrolled ? "blur(32px) saturate(1.5)" : "none",
        borderBottom:    scrolled ? "1px solid rgba(184,240,255,0.08)" : "none",
        transition:     "height 0.4s ease, background 0.4s ease, border-color 0.4s ease",
      }}
    >
      {/* Wordmark */}
      <a
        href="#hero"
        className="glitch"
        data-text="MULTISCATTER"
        onClick={(e) => scrollTo(e, "#hero")}
        style={{
          fontFamily:    "var(--font-geist-mono), monospace",
          fontSize:       "0.6875rem",
          letterSpacing:  "0.30em",
          textTransform:  "uppercase",
          color:          scrolled ? "var(--text-primary)" : "rgba(238,248,255,0.90)",
          textDecoration: "none",
          textShadow: scrolled
            ? "0 0 18px rgba(184,240,255,0.14)"
            : "0 0 28px rgba(184,240,255,0.22), 0 1px 3px rgba(0,0,0,0.6)",
          transition: "color 0.4s ease, text-shadow 0.4s ease",
          minHeight: "44px", display: "flex", alignItems: "center",
        }}
      >
        MULTISCATTER
      </a>

      {/* Links */}
      <ul style={{ display: "flex", alignItems: "center", gap: "2.2rem", listStyle: "none", margin: 0, padding: 0 }}>

        {/* Work — hover on desktop, tap to toggle on mobile */}
        <li style={{ position: "relative" }} onMouseEnter={openWork} onMouseLeave={closeWork}>
          <a
            href="#work"
            className="frost-link"
            onClick={(e) => {
              if (window.matchMedia("(max-width: 768px)").matches) {
                e.preventDefault();
                toggleWork();
              } else {
                scrollTo(e, "#work");
              }
            }}
            style={{
              color: linkColor, textShadow: linkShadow, display: "flex", alignItems: "center", gap: "0.28rem",
              minHeight: "44px", justifyContent: "center", padding: "0 4px",
            }}
          >
            Work
            <span style={{
              fontSize: "0.55rem",
              opacity: 0.55,
              transform: workOpen ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 0.2s ease",
              lineHeight: 1,
              marginTop: "1px",
            }}>▾</span>
          </a>

          {/* Dropdown */}
          <ul style={{
            position:   "absolute",
            top:        "calc(100% + 8px)",
            left:       "50%",
            transform:  workOpen
              ? "translateX(-50%) translateY(0)"
              : "translateX(-50%) translateY(-6px)",
            background: "rgba(5,7,15,0.92)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            border:     "1px solid rgba(184,240,255,0.10)",
            borderRadius: "4px",
            padding:    "6px 0",
            listStyle:  "none",
            margin:     0,
            minWidth:   "148px",
            opacity:    workOpen ? 1 : 0,
            pointerEvents: workOpen ? "auto" : "none",
            transition: "opacity 0.18s ease, transform 0.18s ease",
          }}>
            {WORK_SUBS.map(({ label, tab }) => (
              <li key={tab}>
                <a
                  href="#work"
                  onClick={(e) => { workModels.pendingTab = tab; scrollTo(e, "#work"); setWorkOpen(false); }}
                  style={{
                    display:       "block",
                    padding:       "12px 18px",
                    minHeight:     "44px",
                    boxSizing:     "border-box",
                    color:         "rgba(184,240,255,0.60)",
                    textDecoration: "none",
                    fontFamily:    "var(--font-geist-mono), monospace",
                    fontSize:       "0.65rem",
                    letterSpacing:  "0.12em",
                    textTransform:  "uppercase",
                    whiteSpace:    "nowrap",
                    transition:    "color 0.15s ease, background 0.15s ease",
                  }}
                  onMouseEnter={e => {
                    (e.target as HTMLElement).style.color = "rgba(184,240,255,0.92)";
                    (e.target as HTMLElement).style.background = "rgba(184,240,255,0.05)";
                  }}
                  onMouseLeave={e => {
                    (e.target as HTMLElement).style.color = "rgba(184,240,255,0.60)";
                    (e.target as HTMLElement).style.background = "";
                  }}
                >
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </li>

        {LINKS.map(({ label, href }) => (
          <li key={href}>
            <a
              href={href}
              className="frost-link"
              onClick={(e) => { scrollTo(e, href); setWorkOpen(false); }}
              style={{
                color: linkColor, textShadow: linkShadow,
                minHeight: "44px", display: "flex", alignItems: "center", padding: "0 4px",
              }}
            >
              {label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
