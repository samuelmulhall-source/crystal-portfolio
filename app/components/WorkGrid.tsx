"use client";

/**
 * WorkGrid — unified Work section with three selectable sub-views:
 *   ① 3D Models   ② Final Renders   ③ Gallery (images)
 *
 * Tabs switch the view in-place; no new scroll section is needed.
 * The 3D model renders in VoidBackground and is hidden when another tab is active.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import WorkItemCanvas from "./WorkItemCanvas";
import { workModels, TextureSet } from "../lib/workModels";

// ─── Types ─────────────────────────────────────────────────────────────────
type WorkTab = 'models' | 'videos' | 'images';

interface Project {
  id:        string;
  title:     string;
  category:  string;
  modelPath: string;
  year:      string;
  textures:  TextureSet;
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
  const overlayRef    = useRef<HTMLDivElement>(null);
  const hovRef        = useRef(true);
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    const el = overlayRef.current;
    if (!el) return;
    gsap.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.4 });
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

  const infoPanel = (
    <div style={{
      padding: mobile ? "1.5rem 1.25rem 2rem" : "2.25rem 2rem",
      display: "flex", flexDirection: "column", gap: "1.75rem",
      background: "rgba(0,5,18,0.92)",
      borderLeft: mobile ? "none" : "1px solid rgba(184,240,255,0.06)",
      borderTop: mobile ? "1px solid rgba(184,240,255,0.06)" : "none",
    }}>
      <div>
        <p style={{ ...MON, fontSize: "0.48rem", letterSpacing: "0.36em", color: "rgba(184,240,255,0.38)", marginBottom: "0.65rem" }}>{project.category} · {project.year}</p>
        <h2 style={{ fontFamily: "var(--font-geist-sans), sans-serif", fontSize: mobile ? "1.35rem" : "1.75rem", fontWeight: 300, letterSpacing: "0.01em", color: "var(--text-primary)", margin: 0, lineHeight: 1.25 }}>{project.title}</h2>
      </div>
      <p style={{ color: "var(--text-secondary)", fontSize: "0.8125rem", lineHeight: 1.78, margin: 0 }}>PBR real-time asset. Drag to orbit, scroll to zoom.</p>
      <div style={{ ...MON, fontSize: "0.48rem", letterSpacing: "0.24em", color: "rgba(184,240,255,0.28)" }}>FBX · WebGL · React Three Fiber · WebGPU</div>
      <div style={{ marginTop: "auto", paddingTop: "1.25rem" }}>
        <a href="https://x.com/multiscatter" target="_blank" rel="noopener noreferrer" style={{ ...MON, fontSize: "0.52rem", letterSpacing: "0.28em", color: "rgba(184,240,255,0.72)", textDecoration: "none", borderBottom: "1px solid rgba(184,240,255,0.35)", paddingBottom: "0.12rem" }}>View on X ↑</a>
      </div>
    </div>
  );

  return (
    <div ref={overlayRef} style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,3,0.96)", opacity: 0 }}>
      <div style={{ display: "flex", flexDirection: mobile ? "column" : "row", width: "100%", height: "100%", overflow: "hidden" }}>
        <div ref={canvasWrapRef} style={{ flex: mobile ? "none" : 1, height: mobile ? "55vh" : "100%", minHeight: 0, position: "relative" }}>
          <WorkItemCanvas modelPath={project.modelPath} textures={project.textures} hoveredRef={hovRef} containerRef={canvasWrapRef} fullscreen />
        </div>
        <div style={{ flex: mobile ? "1 1 auto" : "0 0 360px", overflowY: "auto", position: mobile ? "relative" : "sticky", top: 0, alignSelf: "stretch" }}>
          {infoPanel}
        </div>
      </div>

      {/* Close — Igloo-style minimal; 44px touch target on mobile */}
      <button
        onClick={close}
        style={{
          position: "fixed", top: "1.25rem", right: "clamp(1rem, 4vw, 1.75rem)", zIndex: 102,
          background: "transparent", border: "none",
          color: "rgba(184,240,255,0.6)",
          ...MON, fontSize: "0.56rem", letterSpacing: "0.32em",
          padding: "0.6rem 0.5rem", minHeight: "44px", minWidth: "44px",
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          transition: "color 0.2s ease",
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "rgba(220,248,255,0.95)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "rgba(184,240,255,0.6)"; }}
        aria-label="Close viewer"
      >
        × CLOSE
      </button>
    </div>
  );
}

// ─── Video player tab ───────────────────────────────────────────────────────
function VideosContent({ visible }: { visible: boolean }) {
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
          return;
        }
        throw new Error("no static videos");
      })
      .catch(() =>
        fetch("/api/videos")
          .then(r => r.json())
          .then(({ videos: v }: { videos: VideoEntry[] }) => {
            if (v?.length) { setVideos(v); setActiveId(v[0].id); }
          })
          .catch(() => {})
      );
  }, []);

  // Pause when tab is hidden; don't autoplay on tab switch
  useEffect(() => {
    if (!videoRef.current) return;
    if (!visible) videoRef.current.pause();
  }, [visible]);

  const active = videos.find(v => v.id === activeId);

  return (
    <div style={{ display: "flex", width: "100%", height: "100%", alignItems: "center" }}>
      {/* Left menu */}
      <nav style={{
        flexShrink: 0,
        width: "clamp(160px, 18vw, 240px)",
        marginLeft: "2.5rem",
        display: "flex",
        flexDirection: "column",
        gap: "1.4rem",
        zIndex: 2,
      }}>
        {videos.map((v, i) => {
          const on = v.id === activeId;
          return (
            <button
              key={v.id}
              onClick={() => {
                setActiveId(v.id);
                // Manual play after user selects
                setTimeout(() => videoRef.current?.play().catch(() => {}), 80);
              }}
              style={{
                background: "none", border: "none", cursor: "pointer",
                padding: 0, textAlign: "left",
                display: "flex", flexDirection: "column", gap: "0.22rem",
              }}
            >
              <span style={{ ...MON, fontSize: "0.48rem", letterSpacing: "0.22em", color: on ? "rgba(184,240,255,0.55)" : "rgba(184,240,255,0.22)", transition: "color 0.3s" }}>
                {String(i + 1).padStart(2, "0")}
              </span>
              <span style={{
                ...MON, fontSize: "0.75rem", letterSpacing: "0.08em",
                color: on ? "rgba(220,245,255,0.95)" : "rgba(184,240,255,0.38)",
                borderLeft: on ? "1px solid rgba(184,240,255,0.55)" : "1px solid rgba(184,240,255,0.10)",
                paddingLeft: "0.65rem",
                transition: "color 0.3s, border-color 0.3s",
              }}>
                {v.title}
              </span>
            </button>
          );
        })}
        {videos.length === 0 && (
          <span style={{ ...MON, fontSize: "0.6rem", color: "rgba(184,240,255,0.20)" }}>No videos found</span>
        )}
      </nav>

      {/* Video player — fills remaining space, respects viewport height */}
      <div style={{
        flex: 1,
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "0 2rem 0 1.5rem",
        height: "100%",
        overflow: "hidden",
      }}>
        {active && (
          <div style={{
            position: "relative",
            width: "100%",
            // Constrain height to viewport minus tab header (≈170px) and some padding
            maxHeight: "calc(100vh - 200px)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}>
            {/* Frost border */}
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
                // Let the browser fit the video naturally within the container
                maxWidth: "100%",
                maxHeight: "calc(100vh - 240px)",
                width: "auto",
                height: "auto",
                objectFit: "contain",
                borderRadius: "2px",
                display: "block",
                background: "#000",
              }}
            />

            {/* Title */}
            <div style={{
              marginTop: "0.8rem",
              alignSelf: "flex-start",
              display: "flex", alignItems: "center", gap: "0.9rem",
            }}>
              <span style={{ ...MON, fontSize: "0.60rem", letterSpacing: "0.22em", color: "rgba(184,240,255,0.38)" }}>
                {active.title}
              </span>
              <span style={{ ...MON, fontSize: "0.52rem", letterSpacing: "0.15em", color: "rgba(184,240,255,0.18)" }}>
                BLENDER · FINAL RENDER
              </span>
            </div>
          </div>
        )}
      </div>
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
          return;
        }
        throw new Error("no static images");
      })
      .catch(() =>
        fetch("/api/images")
          .then(r => r.json())
          .then(({ images: img }: { images: ImageEntry[] }) => setImages(img ?? []))
          .catch(() => {})
      );
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
              <div style={{ padding: "0.6rem 0.8rem", ...MON, fontSize: "0.55rem", letterSpacing: "0.15em", color: "rgba(184,240,255,0.38)" }}>
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

// ─── Section ───────────────────────────────────────────────────────────────
export default function WorkGrid() {
  const sectionRef  = useRef<HTMLElement>(null);
  const dragZoneRef = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();
  const router = useRouter();

  const [projects,   setProjects]   = useState<Project[]>([]);
  const [activeId,   setActiveId]   = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isHovered,  setIsHovered]  = useState(false);
  const [viewer,     setViewer]     = useState<{ project: Project } | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [activeTab,  setActiveTab]  = useState<WorkTab>('models');

  const dragRef = useRef({ active: false, x: 0, y: 0, moved: false });

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
    workModels.version++;
    document.getElementById("work")?.scrollIntoView({ behavior: "smooth" });
  }, [searchParams, projects]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onPopState = () => {
      if (!new URLSearchParams(window.location.search).has("model")) setViewer(null);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // ── Read pendingTab from nav ──────────────────────────────────────────────
  useEffect(() => {
    const check = () => {
      if (workModels.pendingTab) {
        setActiveTab(workModels.pendingTab);
        workModels.pendingTab = null;
      }
    };
    const id = setInterval(check, 80);
    return () => clearInterval(id);
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
    const applyModels = (models: Array<{ path: string; title: string; category: string; year: string; textures?: TextureSet }>) => {
      setProjects(models.map((m, i) => ({
        id:        `proj-${i}`,
        title:     m.title,
        category:  m.category,
        modelPath: m.path,
        year:      m.year,
        textures:  m.textures ?? {},
      })));
      setLoading(false);
    };
    fetch("/data.json")
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then((data: { models?: Array<{ path: string; title: string; category: string; year: string; textures?: TextureSet }> }) => {
        if (Array.isArray(data.models) && data.models.length > 0) {
          applyModels(data.models);
          return;
        }
        throw new Error("no static models");
      })
      .catch(() =>
        fetch("/api/models")
          .then(r => r.json())
          .then(({ models }: { models: Array<{ path: string; title: string; category: string; year: string; textures: TextureSet }> }) => applyModels(models))
          .catch(() => setLoading(false))
      );
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

    const THRESHOLDS = Array.from({ length: 21 }, (_, i) => i / 20);
    const observer = new IntersectionObserver(([entry]) => {
      workModels.sectionRatio = entry.intersectionRatio;
      // Only show model when section nearly fills the viewport (≥ 80%)
      // so the model appears centred rather than floating in a partial section.
      if (entry.isIntersecting && entry.intersectionRatio >= 0.78 && activeTab === 'models') {
        const firstId = workModels.entries[0]?.id ?? null;
        if (firstId && !workModels.activeModelId) {
          workModels.activeModelId = firstId;
          setActiveId(firstId);
          workModels.version++;
        }
      } else if (entry.intersectionRatio < 0.55) {
        // Deactivate promptly when section is scrolling away
        workModels.activeModelId = null;
        workModels.version++;
      }
    }, { threshold: THRESHOLDS });

    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => {
      observer.disconnect();
      workModels.entries = workModels.entries.filter(e => !projects.find(p => p.id === e.id));
      workModels.activeModelId = null;
      workModels.version++;
    };
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

  const TAB_LABELS: Record<WorkTab, string> = {
    models: '3D Models',
    videos: 'Final Renders',
    images: 'Gallery',
  };

  return (
    <section
      id="work"
      ref={sectionRef}
      style={{ position: "relative", height: "100vh", overflow: "hidden", background: "transparent" }}
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

      {/* ── Header + tab switcher (top-left) ── */}
      <div style={{
        position: "absolute", top: "clamp(80px, 12vh, 110px)", left: "2.5rem",
        zIndex: 3, pointerEvents: "auto",
      }}>
        <p className="label" style={{ marginBottom: "1.2rem", opacity: 0.6 }}>01 — Work</p>

        {/* Tab strip */}
        <div style={{ display: "flex", gap: "0", borderBottom: "1px solid rgba(184,240,255,0.10)" }}>
          {(Object.keys(TAB_LABELS) as WorkTab[]).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                background:  "none",
                border:      "none",
                borderBottom: activeTab === tab
                  ? "1px solid rgba(184,240,255,0.65)"
                  : "1px solid transparent",
                marginBottom: "-1px",
                padding:     "0.5rem 1.0rem 0.55rem",
                cursor:      "pointer",
                ...MON,
                fontSize:    "0.58rem",
                letterSpacing: "0.18em",
                color: activeTab === tab ? "rgba(220,248,255,0.95)" : "rgba(184,240,255,0.35)",
                transition:  "color 0.25s, border-color 0.25s",
                whiteSpace:  "nowrap",
              }}
              onMouseEnter={e => {
                if (activeTab !== tab) (e.currentTarget as HTMLButtonElement).style.color = "rgba(184,240,255,0.70)";
              }}
              onMouseLeave={e => {
                if (activeTab !== tab) (e.currentTarget as HTMLButtonElement).style.color = "rgba(184,240,255,0.35)";
              }}
            >
              {TAB_LABELS[tab]}
            </button>
          ))}
        </div>
      </div>

      {/* ── Models tab content ── */}
      {activeTab === 'models' && (
        <>
          {/* Left menu — vertically centred */}
          <div style={{
            position: "absolute", left: "2.5rem", top: "50%",
            transform: "translateY(-50%)",
            zIndex: 2,
            width: "clamp(160px, 18vw, 240px)",
            pointerEvents: "auto",
          }}>
            {loading ? (
              <span className="label" style={{ opacity: 0.25 }}>Loading…</span>
            ) : projects.map((p, i) => {
              const active = activeId === p.id;
              return (
                <div
                  key={p.id}
                  onClick={() => selectModel(p.id)}
                  style={{
                    cursor: "pointer", padding: "0.8rem 0",
                    borderTop: `1px solid rgba(184,240,255,${active ? 0.14 : 0.05})`,
                    display: "flex", alignItems: "center", gap: "0.85rem",
                    opacity: active ? 1 : 0.38, transition: "opacity 0.25s ease",
                  }}
                  onMouseEnter={e => { if (!active) (e.currentTarget as HTMLDivElement).style.opacity = "0.68"; }}
                  onMouseLeave={e => { if (!active) (e.currentTarget as HTMLDivElement).style.opacity = "0.38"; }}
                >
                  <span style={{ ...MON, fontSize: "0.40rem", letterSpacing: "0.30em", color: "rgba(184,240,255,0.28)", flexShrink: 0 }}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{
                      fontFamily: "var(--font-geist-sans), sans-serif",
                      fontSize: "clamp(0.74rem, 1.2vw, 0.88rem)", fontWeight: active ? 400 : 300,
                      letterSpacing: "0.03em",
                      color: active ? "rgba(220,248,255,0.95)" : "rgba(180,220,255,0.60)",
                      transition: "color 0.25s ease", marginBottom: "0.14rem",
                    }}>{p.title}</div>
                    <div style={{ ...MON, fontSize: "0.37rem", letterSpacing: "0.18em", color: active ? "rgba(184,240,255,0.36)" : "rgba(184,240,255,0.14)", transition: "color 0.25s ease" }}>
                      {p.year}
                    </div>
                  </div>
                  <div style={{ width: "3px", height: "3px", borderRadius: "50%", flexShrink: 0, background: "rgba(184,240,255,0.72)", opacity: active ? 1 : 0, transition: "opacity 0.25s ease" }} />
                </div>
              );
            })}
          </div>

          {/* Drag hint */}
          <div style={{
            position: "absolute", bottom: "2rem", right: "2rem", zIndex: 2, pointerEvents: "none",
            ...MON, fontSize: "0.35rem", letterSpacing: "0.24em",
            color: isHovered ? "rgba(184,240,255,0.24)" : "rgba(184,240,255,0.08)",
            transition: "color 0.4s ease",
          }}>
            DRAG TO ROTATE
          </div>

          {/* ── EXPAND button — prominent, bottom-centre ── */}
          {activeId && !loading && (
            <button
              onClick={() => {
                const p   = projects.find(p => p.id === activeId);
                const idx = projects.findIndex(p => p.id === activeId);
                if (p) {
                  router.push(`/?model=${slugFromTitle(p.title)}`);
                  setViewer({ project: p });
                }
              }}
              style={{
                position: "absolute",
                bottom:   "2rem",
                left:     "50%",
                transform: "translateX(-50%)",
                zIndex:    3,
                background: "rgba(0,10,25,0.60)",
                border:   "1px solid rgba(184,240,255,0.28)",
                color:    "rgba(184,240,255,0.75)",
                backdropFilter: "blur(8px)",
                ...MON, fontSize: "0.60rem", letterSpacing: "0.28em",
                padding: "0.65rem 1.8rem",
                cursor: "pointer",
                transition: "border-color 0.2s, color 0.2s, background 0.2s",
              }}
              onMouseEnter={e => {
                const b = e.currentTarget as HTMLButtonElement;
                b.style.borderColor = "rgba(184,240,255,0.65)"; b.style.color = "rgba(220,248,255,0.95)";
                b.style.background  = "rgba(0,20,50,0.80)";
              }}
              onMouseLeave={e => {
                const b = e.currentTarget as HTMLButtonElement;
                b.style.borderColor = "rgba(184,240,255,0.28)"; b.style.color = "rgba(184,240,255,0.75)";
                b.style.background  = "rgba(0,10,25,0.60)";
              }}
            >
              ⊞ EXPAND VIEW
            </button>
          )}
        </>
      )}

      {/* ── Videos tab content ── */}
      {activeTab === 'videos' && (
        <div style={{
          position: "absolute",
          top: "clamp(155px, 22vh, 195px)",
          left: 0, right: 0, bottom: 0,
          display: "flex",
          alignItems: "center",
          zIndex: 2,
        }}>
          <VideosContent visible={activeTab === 'videos'} />
        </div>
      )}

      {/* ── Images tab content ── */}
      {activeTab === 'images' && (
        <div style={{
          position: "absolute",
          // Respect header + tab height before showing images
          top: "clamp(155px, 22vh, 195px)",
          left: 0, right: 0, bottom: 0,
          zIndex: 2,
          overflowY: "auto",
        }}>
          <ImagesContent />
        </div>
      )}

      {/* ── Inline fullscreen viewer ── */}
      {viewer && (
        <FullscreenViewer
          project={viewer.project}
          onClose={() => { router.replace("/"); setViewer(null); }}
        />
      )}
    </section>
  );
}
