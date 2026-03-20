"use client";

import { useEffect, useRef, useCallback } from "react";
import { gsap } from "gsap";
import { useIsMobile } from "../../lib/useMediaQuery";
import { ViewerControls } from "./ViewerControls";
import { type Project, MON } from "./types";

export interface FullscreenViewerProps {
  project:  Project;
  onClose:  () => void;
}

// ─── Full-screen in-place viewer — igloo-style, model shows through ────────
export function FullscreenViewer({
  project,
  onClose,
}: FullscreenViewerProps) {
  const overlayRef  = useRef<HTMLDivElement>(null);
  const contentRef  = useRef<HTMLDivElement>(null);
  const mobile = useIsMobile();

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.body.classList.add("viewer-open");
    return () => {
      document.body.style.overflow = prev;
      document.body.classList.remove("viewer-open");
    };
  }, []);

  useEffect(() => {
    const el = overlayRef.current;
    if (!el) return;
    gsap.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.38, ease: "power2.out" });
    if (contentRef.current) {
      gsap.fromTo(contentRef.current,
        { opacity: 0, y: 14 },
        { opacity: 1, y: 0, duration: 0.52, ease: "power2.out", delay: 0.12 }
      );
    }
  }, []);

  const close = useCallback(() => {
    const el = overlayRef.current;
    if (!el) { onClose(); return; }
    gsap.to(el, { opacity: 0, duration: 0.28, onComplete: onClose });
  }, [onClose]);

  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [close]);

  const SPECS = [
    ["Format",    "FBX / GLB"],
    ["Engine",    "WebGL · WebGPU"],
    ["Materials", "PBR Physical"],
    ["Textures",  "4K Hand-Authored"],
    ["Pipeline",  "Blender → Three.js"],
  ];

  return (
    <div
      ref={overlayRef}
      style={{
        position: "fixed", inset: 0, zIndex: 100, opacity: 0,
        // Overlay is near-transparent — DOM content is hidden via body.viewer-open CSS,
        // so the Three.js canvas (z:0, fixed, outside <main>) shows through cleanly.
        // The faint tint suppresses any stray fixed elements and gives depth.
        background: "rgba(2,4,14,0.10)",
        pointerEvents: "none",
      }}
    >

      {/* Top bar — console header + close */}
      <div style={{
        position: "fixed", top: 0, left: 0, right: 0,
        zIndex: 102, pointerEvents: "none",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "1.2rem clamp(1.2rem, 3.5vw, 2rem)",
      }}>
        {/* Console label — top-left */}
        <span style={{
          ...MON, fontSize: "0.42rem", letterSpacing: "0.24em",
          color: "rgba(184,240,255,0.4)", pointerEvents: "none",
        }}>
          SPECIMEN ANALYSIS · {project.title.toUpperCase()}
        </span>

        {/* Close — bracket notation, top-right */}
        <button
          onClick={close}
          style={{
            background: "transparent", border: "none", cursor: "pointer",
            padding: "0.6rem", margin: "-0.6rem", pointerEvents: "auto",
            minHeight: "44px", display: "flex", alignItems: "center", gap: "0.18rem",
            ...MON, fontSize: "0.50rem", letterSpacing: "0.26em",
            color: "rgba(184,240,255,0.48)",
            transition: "color 0.2s ease",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "rgba(220,248,255,0.90)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "rgba(184,240,255,0.48)"; }}
          aria-label="Close viewer"
        >
          <span style={{ opacity: 0.50 }}>[</span>
          <span style={{ margin: "0 0.2em" }}>esc</span>
          <span style={{ opacity: 0.50 }}>]</span>
        </button>
      </div>

      {/* ── Model controls bar — console-styled ── */}
      <ViewerControls mobile={mobile} />

      {/* Content column — floats over the scene on the left (desktop) or anchored bottom (mobile) */}
      <div
        ref={contentRef}
        style={{
          position: "absolute",
          // Mobile: panel at bottom half, leaving top clear for 3D model
          // Desktop: full left column — gets its own dark glass background since the
          //          overlay is near-transparent (body.viewer-open hides main instead)
          ...(mobile
            ? { left: 0, right: 0, bottom: 0, height: "38vh",
                background: "linear-gradient(to bottom, rgba(2,4,14,0.40) 0%, rgba(2,4,14,0.92) 28%)",
                borderTop: "1px solid rgba(184,240,255,0.12)",
                backdropFilter: "blur(18px) saturate(1.4)",
                WebkitBackdropFilter: "blur(18px) saturate(1.4)" }
            : { top: 0, left: 0, bottom: 0, width: "min(440px, 40vw)",
                background: "rgba(2,4,14,0.72)",
                backdropFilter: "blur(14px) saturate(1.3)",
                WebkitBackdropFilter: "blur(14px) saturate(1.3)",
                borderRight: "1px solid rgba(184,240,255,0.06)" }),
          overflowY: "auto", overflowX: "hidden",
          padding: mobile
            ? "1.5rem 1.75rem 2.5rem"
            : "clamp(3.5rem, 8vh, 5.5rem) clamp(2rem, 5vw, 4rem) 3rem",
          display: "flex", flexDirection: "column",
          pointerEvents: "auto",
          opacity: 0,
        }}
      >
        {/* ////// Category header */}
        <div style={{ marginBottom: "2.2rem" }}>
          <p style={{ ...MON, fontSize: "0.44rem", letterSpacing: "0.30em", color: "rgba(184,240,255,0.35)", margin: "0 0 0.9rem" }}>
            {"////// "}{project.category}
          </p>
          <h2 style={{
            fontFamily: "var(--font-geist-sans), sans-serif",
            fontSize: mobile ? "clamp(1.6rem, 7vw, 2.2rem)" : "clamp(1.8rem, 3.2vw, 2.6rem)",
            fontWeight: 300, letterSpacing: "0.04em",
            color: "#eef8ff", margin: "0 0 0.7rem", lineHeight: 1.05,
            textShadow: "0 0 35px rgba(184,240,255,0.18)",
          }}>
            {project.title}
          </h2>
          <p style={{ ...MON, fontSize: "0.44rem", letterSpacing: "0.22em", color: "rgba(184,240,255,0.38)", margin: 0 }}>
            {project.year}
          </p>
        </div>

        {/* Divider */}
        <div style={{ height: "1px", background: "rgba(184,240,255,0.08)", marginBottom: "2rem" }} />

        {/* /// About */}
        <div style={{ marginBottom: "2.2rem" }}>
          <p style={{ ...MON, fontSize: "0.44rem", letterSpacing: "0.30em", color: "rgba(184,240,255,0.35)", marginBottom: "0.85rem" }}>
            {"/// About"}
          </p>
          <p style={{
            fontFamily: "var(--font-geist-sans), sans-serif",
            fontSize: "clamp(0.85rem, 1.2vw, 0.92rem)", lineHeight: 1.9,
            color: "rgba(200,232,255,0.68)", margin: 0,
          }}>
            {project.description ?? "Real-time PBR asset built in Blender — hand-authored textures, production-ready UV unwrap, and a full physically-based material pipeline optimised for WebGL and WebGPU."}
          </p>
        </div>

        {/* /// Specifications */}
        <div style={{ marginBottom: "2.4rem" }}>
          <p style={{ ...MON, fontSize: "0.44rem", letterSpacing: "0.30em", color: "rgba(184,240,255,0.35)", marginBottom: "0.85rem" }}>
            {"/// Specifications"}
          </p>
          {SPECS.map(([label, value]) => (
            <div key={label} style={{
              display: "flex", justifyContent: "space-between", alignItems: "baseline",
              padding: "0.42rem 0",
              borderBottom: "1px solid rgba(184,240,255,0.05)",
            }}>
              <span style={{ ...MON, fontSize: "0.42rem", letterSpacing: "0.16em", color: "rgba(184,240,255,0.44)" }}>
                {label}
              </span>
              <span style={{ ...MON, fontSize: "0.44rem", letterSpacing: "0.11em", color: "rgba(184,240,255,0.78)" }}>
                {value}
              </span>
            </div>
          ))}
        </div>

        {/* Footer link */}
        <div style={{ marginTop: "auto", paddingTop: "1.8rem", borderTop: "1px solid rgba(184,240,255,0.06)" }}>
          <a
            href="https://x.com/multiscatter"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              ...MON, fontSize: "0.48rem", letterSpacing: "0.26em",
              color: "rgba(184,240,255,0.46)", textDecoration: "none",
              display: "inline-block",
              transition: "color 0.22s ease",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "rgba(220,248,255,0.88)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "rgba(184,240,255,0.46)"; }}
          >
            ↗ @multiscatter
          </a>
        </div>
      </div>
    </div>
  );
}
