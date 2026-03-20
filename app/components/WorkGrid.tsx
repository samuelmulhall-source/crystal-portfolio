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
import { workModels, TextureSet, subscribePendingTab } from "../lib/workModels";
import { voidState } from "../lib/voidState";
import { STATIONS } from "../lib/journeyConfig";
import { lenisInstance } from "./SmoothScroll";
import { trackModelView, trackTabSwitch } from "../lib/analytics";
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

  // ── Model selection — scroll to weapon station to show the 3D model ─────
  const selectModel = (id: string) => {
    if (activeId && activeId !== id) {
      const prev = workModels.entries.find(e => e.id === activeId);
      if (prev) prev.hovered = false;
    }
    setActiveId(id);
    workModels.activeModelId = id;
    workModels.version++;

    // Scroll camera to this model's weapon station
    const station = STATIONS.find(s => s.modelId === id);
    if (station) {
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      const target = station.scrollViewCenter * maxScroll;
      voidState.snapCamera = true;
      if (lenisInstance) {
        lenisInstance.scrollTo(target, { immediate: true });
      } else {
        window.scrollTo(0, target);
      }
    }
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
