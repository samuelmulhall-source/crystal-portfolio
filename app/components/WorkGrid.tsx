"use client";

/**
 * WorkGrid — unified Work section with three selectable sub-views:
 *   ① 3D Models   ② Video Renders   ③ Image Renders
 *
 * Tabs switch the view in-place; no new scroll section is needed.
 * The 3D model renders in VoidBackground and is hidden when another tab is active.
 */

import { Suspense, useEffect, useRef, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { workModels, TextureSet, subscribePendingTab } from "../lib/workModels";
import { voidState } from "../lib/voidState";
import { trackModelView, trackVideoPlay, trackImageView, trackTabSwitch, trackWireframeToggle } from "../lib/analytics";
import { useIsMobile } from "../lib/useMediaQuery";

// ─── Types ─────────────────────────────────────────────────────────────────
type WorkTab = 'models' | 'videos' | 'images';

interface Project {
  id:          string;
  title:       string;
  category:    string;
  modelPath:   string;
  year:        string;
  textures:    TextureSet;
  description?: string;
  /** Optional WebP placeholder from generate-static-data (when sharp is installed) */
  thumbnail?:  string;
}
interface VideoEntry { id: string; path: string; title: string; }
interface ImageEntry { id: string; path: string; title: string; }

/** URL-friendly slug from asset title: "Ornate Dagger" → "ornate-dagger", "AR-15" → "ar-15" */
function slugFromTitle(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

// ─── Corner accent ─────────────────────────────────────────────────────────
type CP = "tl" | "tr" | "bl" | "br";
function Corner({ pos, on }: { pos: CP; on: boolean }) {
  const T = pos[0] === "t", L = pos[1] === "l";
  return (
    <div style={{
      position: "absolute",
      top:    T ? 0 : undefined, bottom: T ? undefined : 0,
      left:   L ? 0 : undefined, right:  L ? undefined : 0,
      width: 24, height: 24,
      borderTop:    T ? `1px solid rgba(184,240,255,${on ? 0.45 : 0.14})` : undefined,
      borderBottom: T ? undefined : `1px solid rgba(184,240,255,${on ? 0.45 : 0.14})`,
      borderLeft:   L ? `1px solid rgba(184,240,255,${on ? 0.45 : 0.14})` : undefined,
      borderRight:  L ? undefined : `1px solid rgba(184,240,255,${on ? 0.45 : 0.14})`,
      transition: "border-color 0.40s ease",
      pointerEvents: "none", zIndex: 4,
    }} />
  );
}

const MON: React.CSSProperties = {
  fontFamily:    "var(--font-geist-mono), monospace",
  textTransform: "uppercase",
};

// ─── Viewer controls — wireframe, auto-rotate, reset ──────────────────────
function ViewerControls({ mobile }: { mobile: boolean }) {
  const [wireframe, setWireframe] = useState(voidState.showWireframe);
  const [autoRot, setAutoRot] = useState(voidState.autoRotate);

  const toggleWireframe = useCallback(() => {
    voidState.showWireframe = !voidState.showWireframe;
    setWireframe(voidState.showWireframe);
    trackWireframeToggle(voidState.showWireframe);
  }, []);

  const toggleAutoRotate = useCallback(() => {
    voidState.autoRotate = !voidState.autoRotate;
    setAutoRot(voidState.autoRotate);
  }, []);

  const resetView = useCallback(() => {
    // Reset rotation on all entries
    workModels.entries.forEach(e => {
      e.rotX = 0;
      e.rotY = 0;
      e.velX = 0;
      e.velY = 0;
    });
  }, []);

  // Keyboard shortcuts: W=wireframe, R=auto-rotate
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "w" || e.key === "W") toggleWireframe();
      if (e.key === "r" || e.key === "R") toggleAutoRotate();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleWireframe, toggleAutoRotate]);

  const btnStyle: React.CSSProperties = {
    background: "rgba(4,8,20,0.75)",
    border: "1px solid rgba(184,240,255,0.1)",
    borderRadius: "3px",
    color: "rgba(184,240,255,0.5)",
    cursor: "pointer",
    padding: "0.35rem 0.6rem",
    fontFamily: "var(--font-geist-mono), monospace",
    fontSize: "0.5rem",
    letterSpacing: "0.14em",
    textTransform: "uppercase" as const,
    transition: "all 0.25s ease",
    display: "flex",
    alignItems: "center",
    gap: "0.35rem",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
  };

  const activeStyle: React.CSSProperties = {
    ...btnStyle,
    borderColor: "rgba(255,160,60,0.3)",
    color: "rgba(255,160,60,0.8)",
    boxShadow: "0 0 8px rgba(255,160,60,0.15)",
  };

  return (
    <div
      style={{
        position: "fixed",
        zIndex: 102,
        pointerEvents: "auto",
        display: "flex",
        gap: "0.4rem",
        ...(mobile
          ? { bottom: "1.2rem", left: "50%", transform: "translateX(-50%)" }
          : { bottom: "1.5rem", left: "50%", transform: "translateX(-50%)" }),
      }}
    >
      <button
        onClick={toggleWireframe}
        style={wireframe ? activeStyle : btnStyle}
        onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(184,240,255,0.35)"; e.currentTarget.style.color = "rgba(184,240,255,0.9)"; }}
        onMouseLeave={e => {
          if (!wireframe) { e.currentTarget.style.borderColor = "rgba(184,240,255,0.1)"; e.currentTarget.style.color = "rgba(184,240,255,0.5)"; }
          else { e.currentTarget.style.borderColor = "rgba(255,160,60,0.3)"; e.currentTarget.style.color = "rgba(255,160,60,0.8)"; }
        }}
        title="Toggle wireframe [W]"
      >
        <span style={{ fontSize: "0.55rem" }}>◇</span>
        WIRE {wireframe ? "ON" : "OFF"}
      </button>

      <button
        onClick={toggleAutoRotate}
        style={autoRot ? activeStyle : btnStyle}
        onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(184,240,255,0.35)"; e.currentTarget.style.color = "rgba(184,240,255,0.9)"; }}
        onMouseLeave={e => {
          if (!autoRot) { e.currentTarget.style.borderColor = "rgba(184,240,255,0.1)"; e.currentTarget.style.color = "rgba(184,240,255,0.5)"; }
          else { e.currentTarget.style.borderColor = "rgba(255,160,60,0.3)"; e.currentTarget.style.color = "rgba(255,160,60,0.8)"; }
        }}
        title="Toggle auto-rotate [R]"
      >
        <span style={{ fontSize: "0.55rem" }}>↻</span>
        SPIN {autoRot ? "ON" : "OFF"}
      </button>

      <button
        onClick={resetView}
        style={btnStyle}
        onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(184,240,255,0.35)"; e.currentTarget.style.color = "rgba(184,240,255,0.9)"; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(184,240,255,0.1)"; e.currentTarget.style.color = "rgba(184,240,255,0.5)"; }}
        title="Reset rotation"
      >
        <span style={{ fontSize: "0.55rem" }}>⟲</span>
        RESET
      </button>
    </div>
  );
}

// ─── Full-screen in-place viewer — igloo-style, model shows through ────────
function FullscreenViewer({
  project,
  onClose,
}: {
  project:  Project;
  onClose:  () => void;
}) {
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
          color: "rgba(255,160,60,0.4)", pointerEvents: "none",
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
            ////// {project.category}
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
            /// About
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
            /// Specifications
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

// ─── Video player tab ───────────────────────────────────────────────────────
function VideosContent({ visible, isNarrow }: { visible: boolean; isNarrow?: boolean }) {
  const [videos, setVideos]     = useState<VideoEntry[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    fetch("/data.json")
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then((data: { videos?: VideoEntry[] }) => {
        if (Array.isArray(data.videos) && data.videos.length > 0) {
          setVideos(data.videos);
          setActiveId(data.videos[0].id);
        }
      })
      .catch(() => {});
  }, []);

  // Pause when tab is hidden; don't autoplay on tab switch
  useEffect(() => {
    if (!videoRef.current) return;
    if (!visible) videoRef.current.pause();
  }, [visible]);

  const active = videos.find(v => v.id === activeId);
  const columnLayout = isNarrow;

  // Video list (shared between desktop-left and mobile-bottom)
  const videoNav = (
    <nav style={{
      flexShrink: 0,
      width: columnLayout ? "100%" : "clamp(160px, 18vw, 240px)",
      maxHeight: columnLayout ? "22vh" : "none",
      overflowY: columnLayout ? "hidden" : "visible",
      overflowX: columnLayout ? "auto" : "hidden",
      marginRight: columnLayout ? 0 : "2.5rem",
      padding: columnLayout ? "0.5rem clamp(1rem, 4vw, 2rem) 0.5rem" : 0,
      display: "flex",
      flexDirection: columnLayout ? "row" : "column",
      gap: columnLayout ? "0.5rem" : "1.4rem",
      zIndex: 2,
      flexWrap: "nowrap",
    }}>
      {videos.map((v, i) => {
        const on = v.id === activeId;
        return (
          <button
            key={v.id}
            onClick={() => {
              setActiveId(v.id);
              trackVideoPlay(v.id, v.title);
              setTimeout(() => videoRef.current?.play().catch(() => {}), 80);
            }}
            style={{
              background: "none",
              border: columnLayout ? `1px solid rgba(184,240,255,${on ? 0.3 : 0.12})` : "none",
              borderLeft: !columnLayout && on ? "1px solid rgba(184,240,255,0.55)" : undefined,
              borderRadius: columnLayout ? "3px" : undefined,
              cursor: "pointer",
              padding: columnLayout ? "0.5rem 0.75rem" : 0,
              paddingLeft: !columnLayout ? "0.65rem" : undefined,
              textAlign: "left",
              flexShrink: 0,
              display: "flex", flexDirection: "column", gap: "0.2rem",
            }}
          >
            <span style={{ ...MON, fontSize: "0.55rem", letterSpacing: "0.2em", color: on ? "rgba(184,240,255,0.6)" : "rgba(184,240,255,0.4)", transition: "color 0.3s" }}>
              {String(i + 1).padStart(2, "0")}
            </span>
            <span style={{
              ...MON, fontSize: columnLayout ? "0.72rem" : "0.75rem", letterSpacing: "0.08em",
              color: on ? "rgba(220,245,255,0.95)" : "rgba(184,240,255,0.55)",
              transition: "color 0.3s",
            }}>
              {v.title}
            </span>
          </button>
        );
      })}
      {videos.length === 0 && (
        <span style={{ ...MON, fontSize: "0.65rem", color: "rgba(184,240,255,0.4)" }}>No videos found</span>
      )}
    </nav>
  );

  return (
    <div style={{
      display: "flex",
      flexDirection: columnLayout ? "column" : "row",
      width: "100%",
      height: "100%",
      alignItems: "center",
      overflow: "hidden",
    }}>
      {/* Desktop: video list on the LEFT (matching model selection placement) */}
      {!columnLayout && videoNav}

      {/* Video player */}
      <div style={{
        flex: 1,
        minWidth: 0,
        minHeight: columnLayout ? "min(50vh, 320px)" : 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: columnLayout ? "0 clamp(1rem, 4vw, 2rem)" : "0 1.5rem",
        height: columnLayout ? "auto" : "100%",
        overflow: "hidden",
      }}>
        {active && (
          <div style={{
            position: "relative",
            width: "100%",
            maxHeight: columnLayout ? "min(55vh, 400px)" : "calc(100vh - 200px)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}>
            <div style={{
              position: "absolute", inset: "-1px",
              border: "1px solid rgba(184,240,255,0.12)",
              borderRadius: "3px",
              boxShadow: "0 0 0 1px rgba(184,240,255,0.04) inset, 0 30px 80px rgba(0,0,0,0.85)",
              pointerEvents: "none",
            }} />
            <video
              ref={videoRef}
              key={active.path}
              src={active.path}
              controls
              loop
              playsInline
              style={{
                maxWidth: "100%",
                maxHeight: columnLayout ? "min(50vh, 360px)" : "calc(100vh - 240px)",
                width: "auto",
                height: "auto",
                objectFit: "contain",
                borderRadius: "2px",
                display: "block",
                background: "#000",
              }}
            />
            <div style={{
              marginTop: "0.6rem",
              alignSelf: "flex-start",
              display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap",
            }}>
              <span style={{ ...MON, fontSize: "0.68rem", letterSpacing: "0.18em", color: "rgba(184,240,255,0.6)" }}>
                {active.title}
              </span>
              <span style={{ ...MON, fontSize: "0.58rem", letterSpacing: "0.12em", color: "rgba(184,240,255,0.4)" }}>
                BLENDER · FINAL RENDER
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Mobile: video list at BOTTOM (like model chip strip) */}
      {columnLayout && (
        <div style={{
          width: "100%",
          overflowX: "auto",
          overflowY: "hidden",
          flexShrink: 0,
          borderTop: "1px solid rgba(184,240,255,0.06)",
          background: "rgba(0,4,16,0.60)",
          backdropFilter: "blur(10px)",
        }}>
          {videoNav}
        </div>
      )}
    </div>
  );
}

// ─── Images / gallery tab — enhanced lightbox with keyboard nav + zoom ─────
function ImagesContent() {
  const [images, setImages]           = useState<ImageEntry[]>([]);
  const [lightboxIdx, setLightboxIdx] = useState<number>(-1);
  const [zoomed, setZoomed]           = useState(false);

  useEffect(() => {
    fetch("/data.json")
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then((data: { images?: ImageEntry[] }) => {
        if (Array.isArray(data.images) && data.images.length > 0) {
          setImages(data.images);
        }
      })
      .catch(() => {});
  }, []);

  const openLightbox = useCallback((idx: number) => {
    setLightboxIdx(idx);
    setZoomed(false);
    if (images[idx]) trackImageView(images[idx].id, images[idx].title);
  }, [images]);

  const closeLightbox = useCallback(() => {
    setLightboxIdx(-1);
    setZoomed(false);
  }, []);

  const nextImage = useCallback(() => {
    setLightboxIdx(prev => prev < images.length - 1 ? prev + 1 : 0);
    setZoomed(false);
  }, [images.length]);

  const prevImage = useCallback(() => {
    setLightboxIdx(prev => prev > 0 ? prev - 1 : images.length - 1);
    setZoomed(false);
  }, [images.length]);

  // Keyboard nav: ←/→ cycle, Escape close
  useEffect(() => {
    if (lightboxIdx < 0) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeLightbox();
      else if (e.key === "ArrowRight") nextImage();
      else if (e.key === "ArrowLeft") prevImage();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [lightboxIdx, closeLightbox, nextImage, prevImage]);

  // Touch swipe: left/right to navigate images on mobile
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    if (lightboxIdx < 0) return;
    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      touchStartRef.current = { x: t.clientX, y: t.clientY };
    };
    const onEnd = (e: TouchEvent) => {
      if (!touchStartRef.current) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - touchStartRef.current.x;
      const dy = t.clientY - touchStartRef.current.y;
      touchStartRef.current = null;
      // Only horizontal swipe, threshold 50px, ignore vertical
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        if (dx < 0) nextImage();
        else prevImage();
      }
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchend", onEnd);
    };
  }, [lightboxIdx, nextImage, prevImage]);

  const lightboxImage = lightboxIdx >= 0 && lightboxIdx < images.length ? images[lightboxIdx] : null;

  return (
    <div style={{
      width: "100%",
      display: "flex", flexDirection: "column",
      padding: "0.5rem clamp(1rem, 4vw, 2.5rem) 2.5rem",
    }}>
      {images.length === 0 ? (
        <div style={{
          flex: 1, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", gap: "1rem",
        }}>
          <p style={{ ...MON, fontSize: "0.65rem", letterSpacing: "0.22em", color: "rgba(184,240,255,0.22)" }}>
            Drop images into /public/Image renders to populate this gallery
          </p>
        </div>
      ) : (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
          gap: "1rem",
          paddingBottom: "2rem",
        }}>
          {images.map((img, idx) => (
            <div
              key={img.id}
              onClick={() => openLightbox(idx)}
              className="image-grid-card"
              style={{
                cursor: "pointer",
                border: "1px solid rgba(184,240,255,0.08)",
                borderRadius: "2px",
                overflow: "hidden",
                transition: "border-color 0.3s ease, transform 0.3s ease, box-shadow 0.3s ease",
              }}
              onMouseEnter={e => {
                const el = e.currentTarget as HTMLDivElement;
                el.style.borderColor = "rgba(184,240,255,0.25)";
                el.style.transform = "scale(1.02)";
                el.style.boxShadow = "0 0 20px rgba(184,240,255,0.08)";
              }}
              onMouseLeave={e => {
                const el = e.currentTarget as HTMLDivElement;
                el.style.borderColor = "rgba(184,240,255,0.08)";
                el.style.transform = "scale(1)";
                el.style.boxShadow = "none";
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={encodeURI(img.path)} alt={img.title} loading="lazy" style={{ width: "100%", aspectRatio: "16/9", objectFit: "cover", display: "block" }} />
              <div style={{ padding: "0.6rem 0.8rem", ...MON, fontSize: "0.65rem", letterSpacing: "0.14em", color: "rgba(184,240,255,0.55)" }}>
                {img.title}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lightbox — full keyboard nav, zoom toggle, counter */}
      {lightboxImage && typeof document !== "undefined" && createPortal(
        <div
          onClick={(e) => {
            // Only close if clicking backdrop, not nav buttons
            if (e.target === e.currentTarget) closeLightbox();
          }}
          style={{
            position: "fixed", inset: 0, zIndex: 9999,
            background: "rgba(0,0,5,0.95)",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: zoomed ? "zoom-out" : "zoom-in",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={encodeURI(lightboxImage.path)}
            alt={lightboxImage.title}
            onClick={(e) => { e.stopPropagation(); setZoomed(z => !z); }}
            style={{
              maxWidth: zoomed ? "100vw" : "90vw",
              maxHeight: zoomed ? "100vh" : "88vh",
              objectFit: "contain",
              transition: "transform 0.35s ease, max-width 0.35s ease, max-height 0.35s ease",
              transform: zoomed ? "scale(1)" : "scale(0.98)",
            }}
          />

          {/* Image counter — top left */}
          <span style={{
            position: "absolute", top: "1.4rem", left: "1.8rem",
            ...MON, fontSize: "0.55rem", letterSpacing: "0.22em",
            color: "rgba(184,240,255,0.4)",
          }}>
            {String(lightboxIdx + 1).padStart(2, "0")} / {String(images.length).padStart(2, "0")}
          </span>

          {/* Close + nav hint — top right */}
          <span style={{
            position: "absolute", top: "1.4rem", right: "1.8rem",
            ...MON, fontSize: "0.5rem", letterSpacing: "0.18em",
            color: "rgba(184,240,255,0.35)", cursor: "pointer",
          }}
            onClick={(e) => { e.stopPropagation(); closeLightbox(); }}
          >
            CLOSE
          </span>

          {/* Image title — bottom center */}
          <div style={{
            position: "absolute", bottom: "1.5rem", left: "50%", transform: "translateX(-50%)",
            ...MON, fontSize: "0.6rem", letterSpacing: "0.16em",
            color: "rgba(184,240,255,0.5)",
            textAlign: "center",
          }}>
            {lightboxImage.title}
          </div>

          {/* Prev/Next arrows */}
          {images.length > 1 && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); prevImage(); }}
                style={{
                  position: "absolute", left: "1rem", top: "50%", transform: "translateY(-50%)",
                  background: "rgba(4,8,20,0.6)", border: "1px solid rgba(184,240,255,0.1)",
                  borderRadius: "3px", color: "rgba(184,240,255,0.5)", cursor: "pointer",
                  padding: "0.6rem 0.5rem", fontSize: "1rem",
                  backdropFilter: "blur(8px)", transition: "all 0.2s ease",
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(184,240,255,0.35)"; e.currentTarget.style.color = "rgba(184,240,255,0.9)"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(184,240,255,0.1)"; e.currentTarget.style.color = "rgba(184,240,255,0.5)"; }}
                aria-label="Previous image"
              >
                ‹
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); nextImage(); }}
                style={{
                  position: "absolute", right: "1rem", top: "50%", transform: "translateY(-50%)",
                  background: "rgba(4,8,20,0.6)", border: "1px solid rgba(184,240,255,0.1)",
                  borderRadius: "3px", color: "rgba(184,240,255,0.5)", cursor: "pointer",
                  padding: "0.6rem 0.5rem", fontSize: "1rem",
                  backdropFilter: "blur(8px)", transition: "all 0.2s ease",
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(184,240,255,0.35)"; e.currentTarget.style.color = "rgba(184,240,255,0.9)"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(184,240,255,0.1)"; e.currentTarget.style.color = "rgba(184,240,255,0.5)"; }}
                aria-label="Next image"
              >
                ›
              </button>
            </>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}

// ─── Module-level constants ──────────────────────────────────────────────────
const DEFAULT_TITLE = "Multiscatter";

const TAB_LABELS: Record<WorkTab, { label: string; icon: string }> = {
  models: { label: 'ARTIFACTS',     icon: '◇' },
  videos: { label: 'DATA LOGS',     icon: '▶' },
  images: { label: 'MEMORY CARDS',  icon: '▪' },
};

// ─── Shared tab strip — console styled ──────────────────────────────────────
function WorkTabButtons({
  activeTab,
  onTabChange,
}: {
  activeTab: WorkTab;
  onTabChange: (tab: WorkTab) => void;
}) {
  return (
    <div style={{
      display: "flex",
      gap: 0,
      borderBottom: "1px solid rgba(184,240,255,0.08)",
      background: "linear-gradient(180deg, rgba(8,14,28,0.4) 0%, transparent 100%)",
    }}>
      {(Object.keys(TAB_LABELS) as WorkTab[]).map((tab) => {
        const isActive = activeTab === tab;
        return (
          <button
            key={tab}
            onClick={() => onTabChange(tab)}
            className="work-tab holo-btn"
            style={{
              background:   isActive ? "rgba(184,240,255,0.03)" : "none",
              border:       "none",
              borderBottom: isActive
                ? "2px solid rgba(255,160,60,0.6)"
                : "2px solid transparent",
              marginBottom: "-1px",
              padding:      "0.55rem 1.1rem 0.55rem",
              cursor:       "pointer",
              ...MON,
              fontSize:     "clamp(0.55rem, 1.4vw, 0.64rem)",
              letterSpacing: "0.16em",
              color: isActive ? "rgba(255,160,60,0.85)" : "rgba(184,240,255,0.5)",
              transition:   "color 0.25s, border-color 0.25s, background 0.25s",
              whiteSpace:   "nowrap",
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
            }}
            onMouseEnter={(e) => {
              const el = e.currentTarget as HTMLButtonElement;
              if (!isActive) {
                el.style.color = "rgba(184,240,255,0.85)";
                el.style.background = "rgba(184,240,255,0.02)";
              }
            }}
            onMouseLeave={(e) => {
              const el = e.currentTarget as HTMLButtonElement;
              if (!isActive) {
                el.style.color = "rgba(184,240,255,0.5)";
                el.style.background = "none";
              }
            }}
          >
            <span style={{ fontSize: "0.5rem", opacity: 0.7 }}>{TAB_LABELS[tab].icon}</span>
            {TAB_LABELS[tab].label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Fallback: minimal shell to avoid layout shift during Suspense ──────────
function WorkGridFallback() {
  return (
    <section id="work" style={{ position: "relative", height: "100vh", overflow: "hidden", background: "transparent" }} />
  );
}

// ─── Section (uses useSearchParams — must be inside Suspense) ────────────────
function WorkGridContent() {
  const sectionRef   = useRef<HTMLElement>(null);
  const dragZoneRef  = useRef<HTMLDivElement>(null);
  const headerRef    = useRef<HTMLDivElement>(null);
  const modelListRef = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();
  const router = useRouter();

  const [projects,   setProjects]   = useState<Project[]>([]);
  const [activeId,   setActiveId]   = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isHovered,  setIsHovered]  = useState(false);
  const [viewer,     setViewer]     = useState<{ project: Project } | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [activeTab,  setActiveTab]  = useState<WorkTab>('models');
  const isNarrow = useIsMobile();
  // Anchor: when work section fills the viewport, fix UI elements to screen
  const [inWorkView, setInWorkView] = useState(false);

  const dragRef      = useRef({ active: false, x: 0, y: 0, moved: false });
  const lastTouchRef = useRef(0); // for double-tap detection on mobile
  // Keep a ref in sync with activeTab so IntersectionObserver callbacks
  // always read the current tab without needing to re-register.
  const activeTabRef = useRef<WorkTab>(activeTab);
  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);

  // ── Camera-reference parallax on work header ──────────────────────────────
  useEffect(() => {
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    let raf: number;
    let hx = 0, hy = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      hx += (voidState.mouseNX * 2.8 - hx) * 0.038;
      hy += (voidState.mouseNY * 1.6 - hy) * 0.038;
      if (headerRef.current) {
        headerRef.current.style.transform = `translate(${hx.toFixed(2)}px, ${hy.toFixed(2)}px)`;
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // ── Deep link: open viewer from ?model=slug (e.g. ?model=torch) ─────────────
  // (viewer omitted from deps so closing with setViewer(null) doesn't re-run and re-open)
  useEffect(() => {
    const slug = searchParams.get("model");
    if (!slug || projects.length === 0) return;
    const project = projects.find(p => slugFromTitle(p.title) === slug.toLowerCase());
    if (!project) return;
    setViewer({ project });
    setActiveTab("models");
    setActiveId(project.id);
    workModels.activeModelId = project.id;
    workModels.setExpandedModelId(project.id);
    workModels.version++;
    document.getElementById("work")?.scrollIntoView({ behavior: "smooth" });
  }, [searchParams, projects]);

  // ── document.title: set when viewer opens, reset on close ──────────────────
  useEffect(() => {
    if (viewer) {
      document.title = `${viewer.project.title} | ${DEFAULT_TITLE}`;
      return () => { document.title = DEFAULT_TITLE; };
    }
    document.title = DEFAULT_TITLE;
  }, [viewer]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onPopState = () => {
      if (!new URLSearchParams(window.location.search).has("model")) {
        setViewer(null);
        workModels.setExpandedModelId(null);
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // ── Read pendingTab from nav (subscribe, no setInterval polling) ───────────
  useEffect(() => {
    const unsub = subscribePendingTab(() => {
      if (workModels.pendingTab) {
        setActiveTab(workModels.pendingTab!);
        workModels.setPendingTab(null);
      }
    });
    return () => { unsub(); };
  }, []);

  // ── When tab changes away from models, immediately hide the 3D model ──────
  useEffect(() => {
    if (activeTab !== 'models') {
      setActiveId(null);
      workModels.activeModelId = null;
      workModels.version++;
    }
    // When switching BACK to models, let the IntersectionObserver re-activate
    // the model — don't force it here, so it only shows when section is in view.
  }, [activeTab]);

  // ── Load models (static data.json first for static export, else API) ───────
  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const applyModels = (models: Array<{ path: string; title: string; category: string; year: string; description?: string; textures?: TextureSet; thumbnail?: string }>) => {
      setProjects(models.map((m, i) => ({
        id:        `proj-${i}`,
        title:     m.title,
        category:  m.category,
        modelPath: m.path,
        year:        m.year,
        description: m.description,
        textures:    m.textures ?? {},
        thumbnail:   m.thumbnail,
      })));
      setLoading(false);
    };
    fetch("/data.json")
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then((data: { models?: Array<{ path: string; title: string; category: string; year: string; description?: string; textures?: TextureSet; thumbnail?: string }> }) => {
        if (Array.isArray(data.models) && data.models.length > 0) {
          applyModels(data.models);
        } else {
          setLoading(false);
        }
      })
      .catch(() => setLoading(false));
  }, []);

  // ── Register models + IntersectionObserver ────────────────────────────────
  useEffect(() => {
    if (projects.length === 0) return;

    projects.forEach((project, index) => {
      if (!workModels.entries.find((e) => e.id === project.id)) {
        workModels.entries.push({
          id: project.id, modelPath: project.modelPath,
          title: project.title, category: project.category,
          year: project.year, textures: project.textures,
          scrollProgress: 0, hovered: false, labelSet: index,
          rotX: 0, rotY: 0, velX: 0, velY: 0,
          isDragging: false, wasDragged: false,
        });
      }
    });
    workModels.version++;

    // Set first model active immediately so it loads (needed for LoadingScreen.firstModelReady).
    // On mobile the work section is below the fold so intersection never reaches 0.78.
    const firstId = workModels.entries[0]?.id ?? null;
    if (firstId && !workModels.activeModelId && activeTab === "models") {
      workModels.activeModelId = firstId;
      setActiveId(firstId);
      workModels.version++;
    }

    const THRESHOLDS = Array.from({ length: 21 }, (_, i) => i / 20);
    const observer = new IntersectionObserver(([entry]) => {
      workModels.sectionRatio = entry.intersectionRatio;
      // Anchor: fix UI to screen when section fills the viewport
      // Fade in UI when section reaches ~30% visible; never switch position — always fixed
      setInWorkView(entry.intersectionRatio >= 0.62);
      const ACTIVE_THRESH = 0.55;
      const DEACTIVE_THRESH = 0.35;
      if (entry.isIntersecting && entry.intersectionRatio >= ACTIVE_THRESH && activeTabRef.current === 'models') {
        const firstId = workModels.entries[0]?.id ?? null;
        if (firstId && !workModels.activeModelId) {
          workModels.activeModelId = firstId;
          setActiveId(firstId);
          workModels.version++;
        }
      } else if (entry.intersectionRatio < DEACTIVE_THRESH) {
        workModels.activeModelId = null;
        workModels.version++;
      }
    }, { threshold: THRESHOLDS });

    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => {
      observer.disconnect();
      workModels.entries = workModels.entries.filter(e => !projects.find(p => p.id === e.id));
      workModels.activeModelId = null;
      workModels.version = 0; // Reset to avoid stale skips in WorkModelsInScene on remount
    };
    // projects only — viewer/searchParams omitted so closing viewer doesn't re-run
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects]);

  // ── Model selection ──────────────────────────────────────────────────────
  const selectModel = (id: string) => {
    if (activeId && activeId !== id) {
      const prev = workModels.entries.find(e => e.id === activeId);
      if (prev) prev.hovered = false;
    }
    setActiveId(id);
    workModels.activeModelId = id;
    workModels.version++;
  };

  // ── Expand model to fullscreen viewer ────────────────────────────────────
  const handleExpand = useCallback(() => {
    const p = projects.find(pr => pr.id === activeId);
    if (!p || loading) return;
    router.push(`/?model=${slugFromTitle(p.title)}`);
    workModels.activeModelId = p.id;
    workModels.setExpandedModelId(p.id);
    workModels.version++;
    setViewer({ project: p });
    trackModelView(p.id, p.title);
  }, [activeId, projects, loading, router]);

  // ── Drag-zone interactions ────────────────────────────────────────────────
  const onEnter = () => {
    setIsHovered(true);
    if (activeId) { const e = workModels.entries.find(e => e.id === activeId); if (e) { e.hovered = true; workModels.version++; } }
  };
  const onLeave = () => {
    if (dragRef.current.active) return;
    setIsHovered(false);
    if (activeId) { const e = workModels.entries.find(e => e.id === activeId); if (e) { e.hovered = false; workModels.version++; } }
  };
  const onPointerDown = (ev: React.PointerEvent) => {
    ev.currentTarget.setPointerCapture(ev.pointerId);
    dragRef.current = { active: true, x: ev.clientX, y: ev.clientY, moved: false };
    setIsDragging(true);
    if (activeId) { const e = workModels.entries.find(e => e.id === activeId); if (e) e.isDragging = true; }
  };
  const onPointerMove = (ev: React.PointerEvent) => {
    if (!dragRef.current.active) return;
    const dx = ev.clientX - dragRef.current.x;
    const dy = ev.clientY - dragRef.current.y;
    if (Math.hypot(dx, dy) > 4) dragRef.current.moved = true;
    dragRef.current.x = ev.clientX;
    dragRef.current.y = ev.clientY;
    if (ev.pointerType === "touch" && Math.abs(dy) > Math.abs(dx)) return;
    if (activeId) {
      const e = workModels.entries.find(en => en.id === activeId);
      if (e) { const s = 0.007; e.rotY += dx * s; e.rotX += dy * s; e.velY = dx * s; e.velX = dy * s; }
    }
  };
  const onPointerUp = () => {
    const wasDrag = dragRef.current.moved;
    dragRef.current.active = false;
    setIsDragging(false);
    if (activeId) { const e = workModels.entries.find(en => en.id === activeId); if (e) { e.isDragging = false; e.wasDragged = wasDrag; } }
  };

  return (
    <section
      id="work"
      ref={sectionRef}
      style={{
        position: "relative",
        height: "100vh",
        overflow: "hidden",
        background: "transparent",
        // Subtle inset frame reinforces the "anchored HUD viewport" feel
        boxShadow: "inset 0 0 0 1px rgba(184,240,255,0.04)",
      }}
    >
      {/* ── Drag zone (only active on models tab) ── */}
      {activeTab === 'models' && (
        <div
          ref={dragZoneRef}
          style={{
            position: "absolute", inset: 0, zIndex: 1,
            cursor: isDragging ? "grabbing" : "grab",
            touchAction: "pan-y",
          }}
          onMouseEnter={onEnter}
          onMouseLeave={onLeave}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onDoubleClick={activeId && !loading ? handleExpand : undefined}
          onTouchStart={(ev) => {
            if (!activeId || loading) return;
            const now = performance.now();
            if (now - lastTouchRef.current < 340) {
              handleExpand();
              ev.preventDefault();
            }
            lastTouchRef.current = now;
          }}
          onWheel={e => { if (dragRef.current.active) { e.preventDefault(); e.stopPropagation(); } }}
        />
      )}

      {/* ── Corner accents ── */}
      {(["tl","tr","bl","br"] as CP[]).map(p => (
        <div key={p} style={{ position: "absolute", zIndex: 2, pointerEvents: "none",
          top: p[0]==="t" ? 0 : undefined, bottom: p[0]==="b" ? 0 : undefined,
          left: p[1]==="l" ? 0 : undefined, right: p[1]==="r" ? 0 : undefined,
        }}>
          <Corner pos={p} on={isHovered && activeTab === 'models'} />
        </div>
      ))}

      {/* ── Header (top-left) — glass panel, anchors to screen when section fills viewport ── */}
      <div
        ref={headerRef}
        style={{
          position:      "fixed",
          top:           "clamp(80px, 12vh, 110px)",
          left:          "clamp(1rem, 4vw, 2.5rem)",
          zIndex:        4,
          pointerEvents: inWorkView ? "auto" : "none",
          opacity:       inWorkView ? 1 : 0,
          transform:     inWorkView ? "translateY(0)" : "translateY(-14px)",
          transition:    "opacity 0.45s cubic-bezier(0.22,1,0.36,1), transform 0.45s cubic-bezier(0.22,1,0.36,1)",
          padding:       isNarrow ? "0.6rem 0" : "0.8rem 0",
        }}
      >
        {/* Console-styled section label */}
        <div style={{
          display: "flex", alignItems: "center", gap: "0.75rem",
          marginBottom: "0.45rem",
        }}>
          <span style={{
            fontFamily: "var(--font-geist-mono), monospace",
            fontSize: "0.42rem", letterSpacing: "0.24em", textTransform: "uppercase",
            color: "rgba(255,160,60,0.45)",
          }}>
            RECOVERED DATA
          </span>
          <span style={{
            flex: 1, height: "1px",
            background: "linear-gradient(90deg, rgba(255,160,60,0.15), transparent 60%)",
          }} />
        </div>
        <p className="label" style={{ marginBottom: isNarrow ? "0.5rem" : "1.0rem", opacity: 0.85 }}>01 — Work</p>

        {/* Tab strip: desktop only here; mobile shows tabs at bottom */}
        {!isNarrow && (
          <WorkTabButtons activeTab={activeTab} onTabChange={(t) => { setActiveTab(t); trackTabSwitch(t); }} />
        )}
      </div>

      {/* Mobile: tabs anchored at very bottom */}
      {isNarrow && (
        <div style={{
          position:      "fixed",
          bottom:        "clamp(0.6rem, 2.5vh, 1.25rem)",
          left:          "clamp(1rem, 4vw, 2.5rem)",
          right:         "clamp(1rem, 4vw, 2.5rem)",
          zIndex:        4,
          pointerEvents: inWorkView ? "auto" : "none",
          opacity:       inWorkView ? 1 : 0,
          transform:     inWorkView ? "translateY(0)" : "translateY(18px)",
          transition:    "opacity 0.45s cubic-bezier(0.22,1,0.36,1), transform 0.45s cubic-bezier(0.22,1,0.36,1)",
        }}>
          <WorkTabButtons activeTab={activeTab} onTabChange={(t) => { setActiveTab(t); trackTabSwitch(t); }} />
        </div>
      )}

      {/* ── Models tab content ── */}
      {activeTab === 'models' && (
        <>
          {/* Model list: on narrow screens horizontal strip at bottom; on desktop left sidebar */}
          <div
            ref={modelListRef}
            style={{
              position:      "fixed",
              pointerEvents: (inWorkView && activeTab === 'models') ? "auto" : "none",
              opacity:       (inWorkView && activeTab === 'models') ? 1 : 0,
              transition:    "opacity 0.42s cubic-bezier(0.22,1,0.36,1) 0.12s, transform 0.42s cubic-bezier(0.22,1,0.36,1) 0.12s",
              zIndex:        4,
              ...(isNarrow
                ? {
                    left: 0, right: 0,
                    bottom: "calc(clamp(2.4rem, 6vh, 3rem) + clamp(1rem, 5vh, 2rem))",
                    height: "auto",
                    overflowX: "auto", overflowY: "hidden",
                    display: "flex", flexDirection: "row", gap: 0, alignItems: "stretch", flexWrap: "nowrap",
                    padding: "0 clamp(1rem, 4vw, 2.5rem)",
                    transform: (inWorkView && activeTab === 'models') ? "translateX(0)" : "translateX(-18px)",
                  }
                : {
                    left: "2.5rem",
                    top: "50%",
                    transform: (inWorkView && activeTab === 'models') ? "translateY(-50%)" : "translateY(-50%) translateX(-18px)",
                    width: "clamp(160px, 18vw, 240px)",
                    padding:       "0.5rem 0",
                  }
              ),
            }}
          >
            {loading ? (
              <span className="label" style={{ opacity: 0.4 }}>Loading…</span>
            ) : isNarrow ? (
              <div style={{ display: "flex", gap: "0.5rem", paddingBottom: "0.5rem" }}>
                {projects.map((p) => {
                  const active = activeId === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => selectModel(p.id)}
                      style={{
                        cursor: "pointer",
                        flexShrink: 0,
                        padding: "0.6rem 0.9rem",
                        border: `1px solid rgba(184,240,255,${active ? 0.35 : 0.12})`,
                        borderRadius: "3px",
                        background: active ? "rgba(184,240,255,0.06)" : "transparent",
                        textAlign: "left",
                        opacity: active ? 1 : 0.7,
                        transition: "opacity 0.2s, border-color 0.2s, background 0.2s",
                      }}
                    >
                      <div>
                        <div style={{
                          fontFamily: "var(--font-geist-sans), sans-serif",
                          fontSize: "0.8rem", fontWeight: active ? 500 : 400,
                          color: active ? "rgba(220,248,255,0.98)" : "rgba(184,240,255,0.75)",
                          marginBottom: "0.15rem",
                        }}>{p.title}</div>
                        <div style={{ ...MON, fontSize: "0.6rem", letterSpacing: "0.12em", color: active ? "rgba(184,240,255,0.6)" : "rgba(184,240,255,0.45)" }}>{p.year}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              projects.map((p, i) => {
                const active = activeId === p.id;
                return (
                  <div
                    key={p.id}
                    onClick={() => selectModel(p.id)}
                    style={{
                      cursor: "pointer", padding: "0.8rem 0.4rem",
                      borderTop: `1px solid rgba(184,240,255,${active ? 0.14 : 0.05})`,
                      display: "flex", alignItems: "center", gap: "0.85rem",
                      opacity: active ? 1 : 0.72,
                      transition: "opacity 0.22s cubic-bezier(0.22,1,0.36,1), transform 0.22s cubic-bezier(0.22,1,0.36,1)",
                    }}
                    onMouseEnter={e => {
                      const el = e.currentTarget as HTMLDivElement;
                      if (!active) {
                        el.style.opacity   = "0.90";
                        el.style.transform = "translateX(3px)";
                      }
                    }}
                    onMouseLeave={e => {
                      const el = e.currentTarget as HTMLDivElement;
                      if (!active) {
                        el.style.opacity   = "0.72";
                        el.style.transform = "";
                      }
                    }}
                  >
                    {/* Active bracket — L-shape: vertical bar + top/bottom caps */}
                    <div style={{ position: "relative", width: "10px", height: "28px", flexShrink: 0 }}>
                      {/* Vertical bar */}
                      <div style={{
                        position: "absolute", left: 0, top: 0, bottom: 0, width: "1px",
                        background: active ? "rgba(184,240,255,0.80)" : "rgba(184,240,255,0.12)",
                        boxShadow: active ? "0 0 7px rgba(184,240,255,0.55)" : "none",
                        transition: "background 0.3s ease, box-shadow 0.3s ease",
                      }} />
                      {/* Top cap */}
                      <div style={{
                        position: "absolute", left: 0, top: 0, height: "1px",
                        width: active ? "7px" : "3px",
                        background: active ? "rgba(184,240,255,0.80)" : "rgba(184,240,255,0.12)",
                        transition: "width 0.3s ease, background 0.3s ease",
                      }} />
                      {/* Bottom cap */}
                      <div style={{
                        position: "absolute", left: 0, bottom: 0, height: "1px",
                        width: active ? "7px" : "3px",
                        background: active ? "rgba(184,240,255,0.80)" : "rgba(184,240,255,0.12)",
                        transition: "width 0.3s ease, background 0.3s ease",
                      }} />
                    </div>
                    <span style={{ ...MON, fontSize: "0.52rem", letterSpacing: "0.28em", color: "rgba(184,240,255,0.60)", flexShrink: 0, minWidth: "1.2rem" }}>
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div style={{ flex: 1 }}>
                      <div style={{
                        fontFamily: "var(--font-geist-sans), sans-serif",
                        fontSize: "clamp(0.8rem, 1.2vw, 0.92rem)", fontWeight: active ? 400 : 300,
                        letterSpacing: "0.03em",
                        color: active ? "rgba(220,248,255,0.95)" : "rgba(184,240,255,0.88)",
                        textShadow: active ? "0 0 16px rgba(184,240,255,0.30)" : "none",
                        transition: "color 0.25s ease, text-shadow 0.25s ease", marginBottom: "0.2rem",
                      }}>{p.title}</div>
                      <div style={{ ...MON, fontSize: "0.62rem", letterSpacing: "0.16em", color: active ? "rgba(184,240,255,0.62)" : "rgba(184,240,255,0.58)", transition: "color 0.22s ease" }}>
                        {p.year}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* ── Control hints — igloo-style minimal text ── */}
          {activeId && !loading && (
            <>
              {/* Drag hint: single line, bottom-center */}
              <div style={{
                position:   "absolute",
                bottom:     isNarrow ? "calc(clamp(2.4rem, 6vh, 3rem) + clamp(1rem, 5vh, 2rem) + 4rem)" : "2.2rem",
                left:       "50%",
                transform:  "translateX(-50%)",
                zIndex:     3,
                pointerEvents: "none",
                opacity:    isHovered && !isDragging ? 1 : 0,
                transition: "opacity 0.5s cubic-bezier(0.22,1,0.36,1)",
              }}>
                <span style={{ ...MON, fontSize: "0.44rem", letterSpacing: "0.28em", color: "rgba(184,240,255,0.38)", whiteSpace: "nowrap" }}>
                  — drag to orbit —
                </span>
              </div>

              {/* View CTA: bottom-right corner, single click */}
              <button
                onClick={(e) => { e.stopPropagation(); if (!loading) handleExpand(); }}
                onPointerDown={(e) => e.stopPropagation()}
                style={{
                  position:    "absolute",
                  bottom:      isNarrow ? "calc(clamp(2.4rem, 6vh, 3rem) + clamp(1rem, 5vh, 2rem) + 3.8rem)" : "1.9rem",
                  right:       "clamp(1.2rem, 3.5vw, 2.5rem)",
                  zIndex:      3,
                  background:  "transparent",
                  border:      "none",
                  cursor:      "pointer",
                  padding:     "0.6rem",
                  margin:      "-0.6rem",
                  opacity:     isHovered ? 1 : 0,
                  transition:  "opacity 0.5s cubic-bezier(0.22,1,0.36,1)",
                  pointerEvents: isHovered ? "auto" : "none",
                }}
              >
                <span style={{ ...MON, fontSize: "0.44rem", letterSpacing: "0.22em", color: "rgba(184,240,255,0.52)" }}>
                  view ↗
                </span>
              </button>
            </>
          )}
        </>
      )}

      {/* ── Videos tab content — always mounted, opacity-toggled for smooth transition ── */}
      <div
        className="data-frame"
        data-label="▶ RECOVERED DATA LOGS"
        style={{
          position: "absolute",
          top: "clamp(155px, 22vh, 195px)",
          left: "clamp(0.5rem, 1vw, 1rem)", right: "clamp(0.5rem, 1vw, 1rem)",
          bottom: "clamp(0.5rem, 1vh, 1rem)",
          display: "flex",
          alignItems: "center",
          zIndex: 2,
          opacity:       activeTab === 'videos' ? 1 : 0,
          transform:     `translateY(${activeTab === 'videos' ? 0 : 8}px)`,
          pointerEvents: activeTab === 'videos' ? "auto" : "none",
          transition:    "opacity 0.20s cubic-bezier(0.22,1,0.36,1), transform 0.20s cubic-bezier(0.22,1,0.36,1)",
        }}>
        <VideosContent visible={activeTab === 'videos'} isNarrow={isNarrow} />
      </div>

      {/* ── Images tab content — always mounted, opacity-toggled ── */}
      <div
        className="data-frame"
        data-label="▪ MEMORY CARD ARCHIVE"
        style={{
          position: "absolute",
          top: "clamp(155px, 22vh, 195px)",
          left: "clamp(0.5rem, 1vw, 1rem)", right: "clamp(0.5rem, 1vw, 1rem)",
          bottom: "clamp(0.5rem, 1vh, 1rem)",
          zIndex: 2,
          overflowY: activeTab === 'images' ? "auto" : "hidden",
          opacity:       activeTab === 'images' ? 1 : 0,
          transform:     `translateY(${activeTab === 'images' ? 0 : 8}px)`,
          pointerEvents: activeTab === 'images' ? "auto" : "none",
          transition:    "opacity 0.20s cubic-bezier(0.22,1,0.36,1), transform 0.20s cubic-bezier(0.22,1,0.36,1)",
        }}>
        <ImagesContent />
      </div>

      {/* ── Fullscreen viewer — via portal so it escapes section stacking/overflow ── */}
      {viewer && typeof document !== "undefined" && createPortal(
        <FullscreenViewer
          project={viewer.project}
          onClose={() => { router.replace("/"); workModels.setExpandedModelId(null); setViewer(null); }}
        />,
        document.body
      )}
    </section>
  );
}

// Default: wrap in Suspense so useSearchParams does not cause static export / hydration issues
export default function WorkGrid() {
  return (
    <Suspense fallback={<WorkGridFallback />}>
      <WorkGridContent />
    </Suspense>
  );
}
