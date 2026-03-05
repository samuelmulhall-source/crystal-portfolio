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

// ─── Full-screen in-place viewer ───────────────────────────────────────────
function FullscreenViewer({
  project,
  onClose,
}: {
  project:  Project;
  onClose:  () => void;
}) {
  const overlayRef      = useRef<HTMLDivElement>(null);
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    const el = overlayRef.current;
    if (!el) return;
    gsap.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.32, ease: "power2.out" });
    const panel = el.querySelector<HTMLElement>("[data-infopanel]");
    if (panel) gsap.fromTo(panel,
      { x: 28, opacity: 0 },
      { x: 0, opacity: 1, duration: 0.40, ease: "power2.out", delay: 0.08 }
    );
  }, []);

  const close = useCallback(() => {
    const el = overlayRef.current;
    if (!el) { onClose(); return; }
    gsap.to(el, { opacity: 0, duration: 0.3, onComplete: onClose });
  }, [onClose]);

  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [close]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const on = () => setMobile(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  const SPECS = [
    ["Format",    "FBX / GLB"],
    ["Engine",    "WebGL · WebGPU"],
    ["Materials", "MeshPhysicalMaterial"],
    ["Textures",  "PBR · 4K Maps"],
    ["Pipeline",  "Blender → Three.js"],
  ];
  const TAGS = ["Blender", "PBR", "Real-time", "WebGL", project.category];

  const infoPanel = (
    <div style={{
      padding: mobile ? "1.75rem 1.25rem 2rem" : "clamp(36px, 4vw, 56px)",
      display: "flex",
      flexDirection: "column",
      height: "100%",
      overflowY: "auto",
      overflowX: "hidden",
    }}>

      {/* ── Category + year ── */}
      <p style={{
        ...MON, fontSize: "0.44rem", letterSpacing: "0.38em",
        color: "rgba(184,240,255,0.62)", marginBottom: "0.8rem", marginTop: 0,
      }}>
        {project.category} — {project.year}
      </p>

      {/* ── Title with soft glow + hover shift ── */}
      <h2
        style={{
          fontFamily: "var(--font-geist-sans), sans-serif",
          fontSize: mobile ? "2rem" : "clamp(1.9rem, 3.2vw, 2.6rem)",
          fontWeight: 600,
          letterSpacing: "-0.025em",
          color: "#dff0ff",
          margin: "0 0 clamp(1.5rem, 2.5vw, 2rem)",
          lineHeight: 1.1,
          textShadow: "0 0 50px rgba(184,240,255,0.16), 0 0 100px rgba(120,200,255,0.07)",
          transition: "transform 0.45s cubic-bezier(0.22,1,0.36,1), text-shadow 0.45s ease",
          cursor: "default",
        }}
        onMouseEnter={(e) => {
          const el = e.currentTarget as HTMLHeadingElement;
          el.style.transform    = "translateY(-3px)";
          el.style.textShadow   = "0 0 50px rgba(184,240,255,0.32), 0 0 120px rgba(120,200,255,0.14)";
        }}
        onMouseLeave={(e) => {
          const el = e.currentTarget as HTMLHeadingElement;
          el.style.transform    = "";
          el.style.textShadow   = "0 0 50px rgba(184,240,255,0.16), 0 0 100px rgba(120,200,255,0.07)";
        }}
      >
        {project.title}
      </h2>

      {/* ── Divider ── */}
      <div style={{ height: "1px", background: "rgba(184,240,255,0.06)", marginBottom: "clamp(1.25rem,2vw,1.75rem)" }} />

      {/* ── Description ── */}
      <p style={{ ...MON, fontSize: "0.42rem", letterSpacing: "0.22em", color: "rgba(184,240,255,0.60)", marginBottom: "0.7rem", marginTop: 0 }}>
        ABOUT
      </p>
      <p
        style={{
          fontFamily: "var(--font-geist-sans), sans-serif",
          fontSize: "0.92rem", lineHeight: 1.85,
          color: "rgba(200,232,255,0.82)", margin: "0 0 clamp(1.5rem,2.5vw,2rem)",
          transition: "color 0.4s ease",
          cursor: "default",
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLParagraphElement).style.color = "rgba(210,240,255,0.80)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLParagraphElement).style.color = "rgba(200,232,255,0.62)"; }}
      >
        {project.description ?? "Real-time PBR asset crafted in Blender with a full physically-based rendering pipeline — hand-authored textures, precision edge loops, and production-ready UV unwrap optimised for WebGL and WebGPU."}
      </p>

      {/* ── Technical specifications ── */}
      <p style={{ ...MON, fontSize: "0.42rem", letterSpacing: "0.22em", color: "rgba(184,240,255,0.60)", marginBottom: "0.9rem", marginTop: 0 }}>
        SPECIFICATIONS
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.55rem", marginBottom: "clamp(1.5rem,2.5vw,2rem)" }}>
        {SPECS.map(([label, value]) => (
          <div
            key={label}
            style={{
              display: "flex", justifyContent: "space-between", alignItems: "baseline",
              padding: "0.4rem 0",
              borderBottom: "1px solid rgba(184,240,255,0.04)",
              transition: "border-color 0.3s ease",
              cursor: "default",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(184,240,255,0.12)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(184,240,255,0.04)"; }}
          >
            <span style={{ ...MON, fontSize: "0.44rem", letterSpacing: "0.16em", color: "rgba(184,240,255,0.58)" }}>{label}</span>
            <span
              style={{ ...MON, fontSize: "0.46rem", letterSpacing: "0.12em", color: "rgba(184,240,255,0.82)", transition: "color 0.3s ease" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLSpanElement).style.color = "rgba(184,240,255,1.0)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLSpanElement).style.color = "rgba(184,240,255,0.82)"; }}
            >
              {value}
            </span>
          </div>
        ))}
      </div>

      {/* ── Tags ── */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.38rem", marginBottom: "auto", paddingBottom: "1.5rem" }}>
        {TAGS.map((tag) => (
          <span
            key={tag}
            style={{
              ...MON, fontSize: "0.42rem", letterSpacing: "0.14em",
              padding: "0.3rem 0.62rem",
              border: "1px solid rgba(184,240,255,0.12)",
              color: "rgba(184,240,255,0.65)",
              cursor: "default",
              transition: "border-color 0.25s ease, color 0.25s ease, transform 0.25s ease",
            }}
            onMouseEnter={(e) => {
              const el = e.currentTarget as HTMLSpanElement;
              el.style.borderColor = "rgba(184,240,255,0.35)";
              el.style.color       = "rgba(184,240,255,0.95)";
              el.style.transform   = "translateY(-1px)";
            }}
            onMouseLeave={(e) => {
              const el = e.currentTarget as HTMLSpanElement;
              el.style.borderColor = "rgba(184,240,255,0.12)";
              el.style.color       = "rgba(184,240,255,0.65)";
              el.style.transform   = "";
            }}
          >
            {tag}
          </span>
        ))}
      </div>

      {/* ── Footer link ── */}
      <div style={{ borderTop: "1px solid rgba(184,240,255,0.06)", paddingTop: "1.25rem" }}>
        <a
          href="https://x.com/multiscatter"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            ...MON, fontSize: "0.48rem", letterSpacing: "0.26em",
            color: "rgba(184,240,255,0.50)",
            textDecoration: "none",
            display: "inline-flex", alignItems: "center", gap: "0.4rem",
            transition: "color 0.25s ease, letter-spacing 0.25s ease",
          }}
          onMouseEnter={(e) => {
            const el = e.currentTarget as HTMLAnchorElement;
            el.style.color = "rgba(220,248,255,0.88)";
            el.style.letterSpacing = "0.30em";
          }}
          onMouseLeave={(e) => {
            const el = e.currentTarget as HTMLAnchorElement;
            el.style.color = "rgba(184,240,255,0.50)";
            el.style.letterSpacing = "0.26em";
          }}
        >
          @MULTISCATTER ↗
        </a>
      </div>
    </div>
  );

  return (
    <div ref={overlayRef} style={{ position: "fixed", inset: 0, zIndex: 100, opacity: 0, pointerEvents: "none" }}>
      <div style={{ display: "flex", flexDirection: mobile ? "column" : "row", width: "100%", height: "100%", overflow: "hidden", pointerEvents: "none" }}>
        {/* Canvas area — transparent so VoidBackground shows through; pointer-events none */}
        <div style={{
          flex: mobile ? "none" : 1,
          height: mobile ? "47vh" : "100%",
          flexShrink: 0,
          position: "relative",
          background: "transparent",
        }} />
        {/* Info panel — fixed height on mobile to prevent model overlap */}
        <div data-infopanel="true" style={{
          flex: mobile ? "none" : "0 0 380px",
          height: mobile ? "53vh" : "100%",
          overflowY: "auto",
          overflowX: "hidden",
          position: mobile ? "relative" : "sticky",
          top: 0,
          background: "rgba(0,5,18,0.97)",
          borderLeft: mobile ? "none" : "1px solid rgba(184,240,255,0.06)",
          borderTop: mobile ? "1px solid rgba(184,240,255,0.08)" : "none",
          pointerEvents: "auto",
        }}>
          {infoPanel}
        </div>
      </div>

      <button
        onClick={close}
        style={{
          position: "fixed",
          top: "1.25rem",
          right: "clamp(1rem, 4vw, 1.75rem)",
          zIndex: 102,
          pointerEvents: "auto",
          background: "transparent",
          border: "none",
          color: "rgba(184,240,255,0.55)",
          ...MON,
          fontSize: "0.54rem",
          letterSpacing: "0.34em",
          padding: "0.6rem 0.5rem",
          minHeight: "44px",
          minWidth: "44px",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "color 0.2s ease",
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "rgba(220,248,255,0.95)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "rgba(184,240,255,0.55)"; }}
        aria-label="Close viewer"
      >
        × CLOSE
      </button>
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

// ─── Images / gallery tab ───────────────────────────────────────────────────
function ImagesContent() {
  const [images, setImages]     = useState<ImageEntry[]>([]);
  const [lightbox, setLightbox] = useState<string | null>(null);

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

  return (
    <div style={{
      width: "100%",
      display: "flex", flexDirection: "column",
      padding: "0.5rem 2.5rem 2.5rem",
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
          {images.map(img => (
            <div
              key={img.id}
              onClick={() => setLightbox(encodeURI(img.path))}
              style={{
                cursor: "pointer",
                border: "1px solid rgba(184,240,255,0.08)",
                borderRadius: "2px",
                overflow: "hidden",
                transition: "border-color 0.2s",
              }}
              onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(184,240,255,0.25)"}
              onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(184,240,255,0.08)"}
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

      {/* Lightbox — rendered via portal to escape any stacking-context trap */}
      {lightbox && typeof document !== "undefined" && createPortal(
        <div
          onClick={() => setLightbox(null)}
          style={{
            position: "fixed", inset: 0, zIndex: 9999,
            background: "rgba(0,0,5,0.94)",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "zoom-out",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="" style={{ maxWidth: "90vw", maxHeight: "90vh", objectFit: "contain" }} />
          <span style={{
            position: "absolute", top: "1.4rem", right: "1.8rem",
            fontFamily: "var(--font-geist-mono), monospace",
            fontSize: "0.6rem", letterSpacing: "0.22em",
            color: "rgba(184,240,255,0.45)", cursor: "pointer",
          }}>
            ESC / CLICK TO CLOSE
          </span>
        </div>,
        document.body
      )}
    </div>
  );
}

// ─── Module-level constants ──────────────────────────────────────────────────
const DEFAULT_TITLE = "Multiscatter";

const TAB_LABELS: Record<WorkTab, string> = {
  models: '3D Models',
  videos: 'Video Renders',
  images: 'Image Renders',
};

// ─── Shared tab strip ────────────────────────────────────────────────────────
function WorkTabButtons({
  activeTab,
  onTabChange,
}: {
  activeTab: WorkTab;
  onTabChange: (tab: WorkTab) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 0, borderBottom: "1px solid rgba(184,240,255,0.10)" }}>
      {(Object.keys(TAB_LABELS) as WorkTab[]).map((tab) => (
        <button
          key={tab}
          onClick={() => onTabChange(tab)}
          className="work-tab holo-btn"
          style={{
            background:   "none",
            border:       "none",
            borderBottom: activeTab === tab
              ? "1px solid rgba(184,240,255,0.72)"
              : "1px solid transparent",
            marginBottom: "-1px",
            padding:      "0.5rem 1.0rem 0.55rem",
            cursor:       "pointer",
            ...MON,
            fontSize:     "clamp(0.58rem, 1.5vw, 0.68rem)",
            letterSpacing: "0.18em",
            color: activeTab === tab ? "rgba(220,248,255,0.95)" : "rgba(184,240,255,0.72)",
            transition:   "color 0.25s, border-color 0.25s, box-shadow 0.25s",
            whiteSpace:   "nowrap",
          }}
          onMouseEnter={(e) => {
            const el = e.currentTarget as HTMLButtonElement;
            if (activeTab !== tab) el.style.color = "rgba(220,248,255,0.95)";
            el.style.boxShadow = "0 0 20px rgba(184,240,255,0.08)";
          }}
          onMouseLeave={(e) => {
            const el = e.currentTarget as HTMLButtonElement;
            if (activeTab !== tab) el.style.color = "rgba(184,240,255,0.72)";
            el.style.boxShadow = "none";
          }}
        >
          {TAB_LABELS[tab]}
        </button>
      ))}
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
  const [isNarrow,   setIsNarrow]   = useState(false);
  // Anchor: when work section fills the viewport, fix UI elements to screen
  const [inWorkView, setInWorkView] = useState(false);

  const dragRef      = useRef({ active: false, x: 0, y: 0, moved: false });
  const lastTouchRef = useRef(0); // for double-tap detection on mobile
  // Keep a ref in sync with activeTab so IntersectionObserver callbacks
  // always read the current tab without needing to re-register.
  const activeTabRef = useRef<WorkTab>(activeTab);
  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const on = () => setIsNarrow(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

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
      setInWorkView(entry.intersectionRatio >= 0.50);
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
        <p className="label" style={{ marginBottom: isNarrow ? "0.5rem" : "1.0rem", opacity: 0.85 }}>01 — Work</p>

        {/* Tab strip: desktop only here; mobile shows tabs at bottom */}
        {!isNarrow && (
          <WorkTabButtons activeTab={activeTab} onTabChange={setActiveTab} />
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
          <WorkTabButtons activeTab={activeTab} onTabChange={setActiveTab} />
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
      <div style={{
        position: "absolute",
        top: "clamp(155px, 22vh, 195px)",
        left: 0, right: 0, bottom: 0,
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
      <div style={{
        position: "absolute",
        top: "clamp(155px, 22vh, 195px)",
        left: 0, right: 0, bottom: 0,
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
