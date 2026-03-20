"use client";

/**
 * WorkGrid — unified Work section with three selectable sub-views:
 *   1. 3D Models   2. Video Renders   3. Image Renders
 *
 * Tabs switch the view in-place; no new scroll section is needed.
 * The 3D model renders in VoidBackground and is hidden when another tab is active.
 */

import { Suspense, useEffect, useRef, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { workModels, subscribePendingTab } from "../lib/workModels";
import { trackModelView } from "../lib/analytics";
import { useIsMobile } from "../lib/useMediaQuery";
import { usePortfolioData } from "../lib/usePortfolioData";

import { WorkTab, Project, slugFromTitle, MON, CP, Corner, DEFAULT_TITLE } from "./work/types";
import { FullscreenViewer } from "./work/FullscreenViewer";
import { VideosContent } from "./work/VideosContent";
import { ImagesContent } from "./work/ImagesContent";

// ─── Fallback: minimal shell to avoid layout shift during Suspense ──────────
function WorkGridFallback() {
  return (
    <section aria-hidden style={{ position: "relative", height: "100vh", overflow: "hidden", background: "transparent" }} />
  );
}

// ─── Section (uses useSearchParams — must be inside Suspense) ────────────────
function WorkGridContent() {
  const sectionRef   = useRef<HTMLElement>(null);
  const dragZoneRef  = useRef<HTMLDivElement>(null);
  // headerRef removed — WeaponHUD replaced the old header panel
  // modelListRef removed — WeaponHUD is the sole model navigation
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
  // inWorkView removed — model list sidebar removed, WeaponHUD handles nav

  const dragRef      = useRef({ active: false, x: 0, y: 0, moved: false });
  const lastTouchRef = useRef(0); // for double-tap detection on mobile
  // Keep a ref in sync with activeTab so IntersectionObserver callbacks
  // always read the current tab without needing to re-register.
  const activeTabRef = useRef<WorkTab>(activeTab);
  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);

  // ── Camera-reference parallax on work header ──────────────────────────────
  // Header parallax removed — WeaponHUD replaced the old header panel

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

  // ── Load models from shared data cache ──────────────────────────────────────
  const { data: portfolioData, loading: dataLoading } = usePortfolioData();
  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    if (dataLoading) return;
    const models = portfolioData.models;
    if (models.length > 0) {
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
    } else {
      setLoading(false);
    }
  }, [portfolioData, dataLoading]);

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

  // Model selection removed — WeaponHUD is the sole navigation surface

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
        // Models tab: hidden (3D canvas renders models via WeaponStations).
        // Videos/Images tabs: visible so HTML data-frames can be seen.
        opacity:       activeTab !== 'models' ? 1 : 0,
        pointerEvents: activeTab !== 'models' ? "auto" : "none",
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

      {/* ── Header + tab strip removed — WeaponHUD is the sole navigation element ── */}

      {/* ── Models tab: control hints only (WeaponHUD handles navigation) ── */}
      {activeTab === 'models' && activeId && !loading && (
        <>
          {/* Drag hint: single line, bottom-center */}
          <div style={{
            position:   "absolute",
            bottom:     isNarrow ? "3.2rem" : "2.2rem",
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
              bottom:      isNarrow ? "3rem" : "1.9rem",
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

      {/* ── Videos tab content — always mounted, opacity-toggled for smooth transition ── */}
      <div
        className="data-frame"
        data-label="▶ VIDEOS"
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
        data-label="▪ IMAGES"
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
