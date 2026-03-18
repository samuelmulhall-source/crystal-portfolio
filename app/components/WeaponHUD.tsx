"use client";

/**
 * WeaponHUD — Left-side tabbed WORK menu.
 *
 * Desktop: left-aligned vertical console with WORK header, 3 tab buttons
 * (MODELS / VIDEOS / IMAGES), and the item list for the active tab.
 *
 * Mobile: collapsible floating panel — toggle button in bottom-left,
 * slides up compact panel with same tab + item structure.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { voidState } from "../lib/voidState";
import { workModels, subscribePendingTab } from "../lib/workModels";
import { STATIONS } from "../lib/journeyConfig";
import { trackStationVisit, trackKeyboardNav } from "../lib/analytics";
import { usePortfolioData } from "../lib/usePortfolioData";
import { lenisInstance } from "./SmoothScroll";

type HudTab = "models" | "videos" | "images";

interface MediaItem {
  id: string;
  title: string;
  path: string;
}

export default function WeaponHUD() {
  const [activeIdx, setActiveIdx] = useState(-1);
  const [visible, setVisible] = useState(false);
  const [hudTab, setHudTab] = useState<HudTab>("models");
  const [mobileOpen, setMobileOpen] = useState(false);
  const { data: portfolioData } = usePortfolioData();
  const videos = portfolioData.videos as MediaItem[];
  const images = portfolioData.images as MediaItem[];
  const rafRef = useRef<number>(0);
  const progressRef = useRef<HTMLDivElement>(null);
  const prevIdxRef = useRef(-1);
  const prevVisibleRef = useRef(false);
  const lastHashRef = useRef("");
  const hudTabRef = useRef<HudTab>(hudTab);
  hudTabRef.current = hudTab;

  // Poll voidState via rAF
  useEffect(() => {
    const tick = () => {
      rafRef.current = requestAnimationFrame(tick);
      const newIdx = voidState.activeStationIndex;
      if (newIdx !== prevIdxRef.current) {
        prevIdxRef.current = newIdx;
        setActiveIdx(newIdx);
        if (newIdx >= 0) trackStationVisit(newIdx, STATIONS[newIdx].loreName);
      }
      const sp = voidState.scrollProgress;
      // Only show HUD on models tab — videos/images have their own nav in WorkGrid.
      // This prevents the double-menu overlap issue.
      const nowVisible = sp > 0.10 && sp < 0.90 && hudTabRef.current === "models";
      if (nowVisible !== prevVisibleRef.current) {
        prevVisibleRef.current = nowVisible;
        setVisible(nowVisible);
      }
      // URL hash deep-linking
      const hash = newIdx >= 0 ? `#${STATIONS[newIdx].id}` : "";
      if (hash !== lastHashRef.current) {
        lastHashRef.current = hash;
        if (hash) window.history.replaceState(null, "", hash);
        else if (window.location.hash) window.history.replaceState(null, "", window.location.pathname);
      }
      if (progressRef.current) {
        progressRef.current.style.transform = `scaleY(${voidState.scrollProgress})`;
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  // Sync hudTab when pendingTab is set externally (e.g. from Nav dropdown).
  // Without this, clicking "Videos" in Nav sets workModels.pendingTab but
  // the HUD's internal hudTab stays "models", so it hides (sp > 0.90 check).
  useEffect(() => {
    const unsub = subscribePendingTab(() => {
      const pt = workModels.pendingTab;
      if (pt && pt !== hudTab) {
        setHudTab(pt);
      }
    });
    return () => { unsub(); };
  });

  // On mount: deep-link from URL hash
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash.replace("#", "");
    if (!hash) return;
    const idx = STATIONS.findIndex(s => s.id === hash);
    if (idx < 0) return;
    setTimeout(() => jumpToStation(idx), 500);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const jumpToStation = useCallback((index: number) => {
    const station = STATIONS[index];
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    const target = station.scrollViewCenter * maxScroll;
    // Snap camera instantly on next frame (skip spring physics)
    voidState.snapCamera = true;
    // Use Lenis scrollTo for reliable smooth scrolling. Falls back to native.
    if (lenisInstance) {
      lenisInstance.scrollTo(target, { immediate: true });
    } else {
      window.scrollTo(0, target);
    }
  }, []);

  const selectModel = useCallback((index: number) => {
    setHudTab("models");
    jumpToStation(index);
    setMobileOpen(false);
  }, [jumpToStation]);

  const selectVideo = useCallback((id: string) => {
    setHudTab("videos");
    workModels.pendingVideoId = id;
    workModels.setPendingTab("videos");
    // Scroll work section into view
    document.getElementById("work")?.scrollIntoView({ behavior: "smooth" });
    setMobileOpen(false);
  }, []);

  const selectImage = useCallback((id: string) => {
    setHudTab("images");
    workModels.pendingImageId = id;
    workModels.setPendingTab("images");
    document.getElementById("work")?.scrollIntoView({ behavior: "smooth" });
    setMobileOpen(false);
  }, []);

  const switchTab = useCallback((tab: HudTab) => {
    setHudTab(tab);
    if (tab === "videos") {
      workModels.setPendingTab("videos");
      document.getElementById("work")?.scrollIntoView({ behavior: "smooth" });
    } else if (tab === "images") {
      workModels.setPendingTab("images");
      document.getElementById("work")?.scrollIntoView({ behavior: "smooth" });
    }
  }, []);

  // Keyboard navigation: 1-5 for stations
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const num = parseInt(e.key);
      if (num >= 1 && num <= STATIONS.length) {
        selectModel(num - 1);
        trackKeyboardNav(e.key, `station_${num}`);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectModel]);

  // Item list for active tab
  const renderItems = () => {
    if (hudTab === "models") {
      return STATIONS.map((station, i) => {
        const isActive = i === activeIdx;
        return (
          <button
            key={station.id}
            className={`whud-item ${isActive ? "active" : ""}`}
            onClick={() => selectModel(i)}
            aria-current={isActive ? "true" : undefined}
          >
            <span className={`whud-dot ${isActive ? "active" : ""}`} />
            <span className="whud-idx">{String(i + 1).padStart(2, "0")}</span>
            <span className="whud-label">{station.loreName}</span>
          </button>
        );
      });
    }
    if (hudTab === "videos") {
      return videos.map((v, i) => (
        <button key={v.id} className="whud-item" onClick={() => selectVideo(v.id)}>
          <span className="whud-dot" />
          <span className="whud-idx">{String(i + 1).padStart(2, "0")}</span>
          <span className="whud-label">{v.title.toUpperCase()}</span>
        </button>
      ));
    }
    return images.map((img, i) => (
      <button key={img.id} className="whud-item" onClick={() => selectImage(img.id)}>
        <span className="whud-dot" />
        <span className="whud-idx">{String(i + 1).padStart(2, "0")}</span>
        <span className="whud-label">{img.title.toUpperCase()}</span>
      </button>
    ));
  };

  // ── Desktop panel ──
  const panel = (
    <div className="whud-panel">
      {/* Progress track */}
      <div className="whud-progress-track" aria-hidden="true">
        <div ref={progressRef} className="whud-progress-fill" />
      </div>

      {/* Header */}
      <div className="whud-header">
        <span className="whud-header-label">WORK</span>
        <span className="whud-divider" />
      </div>

      {/* Tab buttons */}
      <div className="whud-tabs">
        {(["models", "videos", "images"] as HudTab[]).map(tab => (
          <button
            key={tab}
            className={`whud-tab ${hudTab === tab ? "active" : ""}`}
            onClick={() => switchTab(tab)}
          >
            {tab === "models" ? "◇" : tab === "videos" ? "▶" : "■"}{" "}
            {tab.toUpperCase()}
          </button>
        ))}
      </div>

      <div className="whud-divider" />

      {/* Item list */}
      <div className="whud-items">
        {renderItems()}
      </div>

      {/* Footer */}
      <div className="whud-footer">
        <span className="whud-footer-key">
          {hudTab === "models" ? "[1-5]" : hudTab === "videos" ? `[${videos.length}]` : `[${images.length}]`}
        </span>
        <span className="whud-footer-label">
          {hudTab === "models" ? "QUICK NAV" : hudTab === "videos" ? "VIDEOS" : "IMAGES"}
        </span>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop: left-aligned panel */}
      <nav
        className="whud-desktop"
        style={{
          opacity: visible ? 1 : 0,
          pointerEvents: visible ? "auto" : "none",
        }}
        aria-label="Work navigation"
      >
        {panel}
      </nav>

      {/* Mobile: collapsible floating menu */}
      <div
        className="whud-mobile"
        style={{
          opacity: visible ? 1 : 0,
          pointerEvents: visible ? "auto" : "none",
        }}
      >
        {/* Toggle button */}
        <button
          className="whud-mobile-toggle"
          onClick={() => setMobileOpen(o => !o)}
          aria-label={mobileOpen ? "Close work menu" : "Open work menu"}
        >
          {mobileOpen ? "✕" : "☰"}
        </button>

        {/* Slide-up panel */}
        <div className={`whud-mobile-panel ${mobileOpen ? "open" : ""}`}>
          {panel}
        </div>
      </div>

      <style jsx global>{`
        /* ── Shared panel styles ── */
        .whud-panel {
          display: flex;
          flex-direction: column;
          gap: 0;
          background: linear-gradient(145deg, rgba(8,14,32,0.78) 0%, rgba(4,8,20,0.88) 100%);
          backdrop-filter: blur(24px) saturate(1.6);
          -webkit-backdrop-filter: blur(24px) saturate(1.6);
          border: 1px solid rgba(184,240,255,0.06);
          border-radius: 4px;
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.06),
            inset 0 -1px 0 rgba(0,0,0,0.3),
            0 8px 32px rgba(0,0,12,0.6),
            0 0 1px rgba(184,240,255,0.08);
          overflow: hidden;
          min-width: 200px;
          position: relative;
        }

        /* Progress track */
        .whud-progress-track {
          position: absolute;
          left: 0; top: 0; bottom: 0;
          width: 2px;
          background: rgba(184,240,255,0.04);
        }
        .whud-progress-fill {
          position: absolute;
          left: 0; top: 0;
          width: 100%; height: 100%;
          background: linear-gradient(180deg, rgba(184,240,255,0.5) 0%, rgba(184,240,255,0.4) 100%);
          transform-origin: top;
          transform: scaleY(0);
        }

        /* Header */
        .whud-header {
          padding: 0.55rem 0.75rem 0.35rem 1rem;
          display: flex;
          flex-direction: column;
          gap: 0.3rem;
        }
        .whud-header-label {
          font-family: var(--font-geist-mono, monospace);
          font-size: 0.5rem;
          letter-spacing: 0.28em;
          text-transform: uppercase;
          color: rgba(184,240,255,0.5);
        }

        /* Divider */
        .whud-divider {
          display: block;
          height: 1px;
          background: linear-gradient(90deg, rgba(184,240,255,0.12), transparent);
          margin: 0 0.75rem 0 1rem;
        }

        /* Tab buttons */
        .whud-tabs {
          display: flex;
          gap: 0;
          padding: 0;
        }
        .whud-tab {
          flex: 1;
          padding: 0.4rem 0.5rem;
          border: none;
          background: transparent;
          color: rgba(184,240,255,0.4);
          cursor: pointer;
          font-family: var(--font-geist-mono, monospace);
          font-size: 0.48rem;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          transition: color 0.25s, background 0.2s;
          text-align: center;
          border-bottom: 2px solid transparent;
        }
        .whud-tab:hover {
          color: rgba(184,240,255,0.8);
          background: rgba(184,240,255,0.02);
        }
        .whud-tab.active {
          color: rgba(184,240,255,0.85);
          background: rgba(184,240,255,0.04);
          border-bottom-color: rgba(184,240,255,0.5);
        }

        /* Items */
        .whud-items {
          display: flex;
          flex-direction: column;
          max-height: 260px;
          overflow-y: auto;
          scrollbar-width: thin;
          scrollbar-color: rgba(184,240,255,0.1) transparent;
        }
        .whud-item {
          display: flex;
          align-items: center;
          gap: 0.45rem;
          padding: 0.38rem 0.75rem 0.38rem 1rem;
          border: none;
          background: transparent;
          color: rgba(184,240,255,0.4);
          cursor: pointer;
          font-family: var(--font-geist-mono, monospace);
          font-size: 0.6rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          transition: color 0.25s, background 0.2s;
          white-space: nowrap;
          text-align: left;
        }
        .whud-item:hover {
          color: rgba(184,240,255,0.85);
          background: rgba(184,240,255,0.03);
        }
        .whud-item.active {
          color: #c5f8ff;
          background: rgba(184,240,255,0.05);
          text-shadow: 0 0 10px rgba(184,240,255,0.3);
        }

        /* Dot indicator */
        .whud-dot {
          width: 4px; height: 4px;
          border-radius: 50%;
          background: rgba(184,240,255,0.15);
          flex-shrink: 0;
          transition: all 0.3s;
        }
        .whud-dot.active {
          background: rgba(184,240,255,0.9);
          box-shadow: 0 0 6px rgba(184,240,255,0.5), 0 0 12px rgba(184,240,255,0.2);
          animation: whud-pulse 2s ease-in-out infinite;
        }
        @keyframes whud-pulse {
          0%, 100% { box-shadow: 0 0 4px rgba(184,240,255,0.4), 0 0 8px rgba(184,240,255,0.15); }
          50% { box-shadow: 0 0 8px rgba(184,240,255,0.7), 0 0 16px rgba(184,240,255,0.3); }
        }
        .whud-item.active .whud-idx { color: rgba(184,240,255,0.8); }

        .whud-idx {
          font-size: 0.5rem;
          opacity: 0.6;
          min-width: 1.2em;
          transition: color 0.3s;
        }
        .whud-label {
          font-size: 0.56rem;
          letter-spacing: 0.06em;
        }

        /* Footer */
        .whud-footer {
          padding: 0.35rem 0.75rem 0.5rem 1rem;
          display: flex;
          align-items: center;
          gap: 0.4rem;
          border-top: 1px solid rgba(184,240,255,0.05);
        }
        .whud-footer-key {
          font-family: var(--font-geist-mono, monospace);
          font-size: 0.45rem;
          letter-spacing: 0.12em;
          color: rgba(184,240,255,0.3);
          padding: 1px 4px;
          border: 1px solid rgba(184,240,255,0.1);
          border-radius: 2px;
        }
        .whud-footer-label {
          font-family: var(--font-geist-mono, monospace);
          font-size: 0.42rem;
          letter-spacing: 0.18em;
          color: rgba(184,240,255,0.22);
          text-transform: uppercase;
        }

        /* ── Desktop layout ── */
        .whud-desktop {
          position: fixed;
          z-index: 40;
          left: clamp(0.75rem, 2.5vw, 2rem);
          top: 50%;
          transform: translateY(-50%);
          transition: opacity 0.5s ease;
        }

        /* ── Mobile layout ── */
        .whud-mobile {
          display: none;
          position: fixed;
          z-index: 40;
          transition: opacity 0.5s ease;
        }
        .whud-mobile-toggle {
          position: fixed;
          bottom: 1rem;
          left: 1rem;
          z-index: 41;
          width: 40px; height: 40px;
          border-radius: 50%;
          border: 1px solid rgba(184,240,255,0.15);
          background: rgba(8,14,32,0.85);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          color: rgba(184,240,255,0.6);
          font-size: 1rem;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 16px rgba(0,0,12,0.5);
          transition: all 0.25s;
        }
        .whud-mobile-toggle:hover {
          border-color: rgba(184,240,255,0.35);
          color: rgba(184,240,255,0.9);
        }
        .whud-mobile-panel {
          position: fixed;
          bottom: 3.5rem;
          left: 0.75rem;
          right: 0.75rem;
          max-height: 0;
          overflow: hidden;
          opacity: 0;
          transition: max-height 0.35s ease, opacity 0.25s ease;
          z-index: 40;
        }
        .whud-mobile-panel.open {
          max-height: 70vh;
          opacity: 1;
        }
        .whud-mobile-panel .whud-panel {
          min-width: auto;
        }

        /* ── Responsive ── */
        @media (max-width: 768px) {
          .whud-desktop { display: none; }
          .whud-mobile { display: block; }
        }
        @media (min-width: 769px) {
          .whud-mobile { display: none !important; }
        }
      `}</style>
    </>
  );
}
