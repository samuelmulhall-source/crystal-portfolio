"use client";

/**
 * WeaponHUD — Primary archive navigation.
 *
 * Unified left-side menu for all work: Models, Videos, Images.
 * Visible whenever scrollProgress is within the work region (0.10–0.92).
 * Simplified chrome: dark translucent slab, restrained active states,
 * clean typography hierarchy.
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
  const prevIdxRef = useRef(-1);
  const prevVisibleRef = useRef(false);
  const lastHashRef = useRef("");
  const hudTabRef = useRef<HudTab>(hudTab);
  hudTabRef.current = hudTab;

  // Poll voidState via rAF — visible for ALL tabs within work region
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
      const nowVisible = sp > 0.10 && sp < 0.92;
      if (nowVisible !== prevVisibleRef.current) {
        prevVisibleRef.current = nowVisible;
        setVisible(nowVisible);
      }
      // URL hash deep-linking (models tab only)
      if (hudTabRef.current === "models") {
        const hash = newIdx >= 0 ? `#${STATIONS[newIdx].id}` : "";
        if (hash !== lastHashRef.current) {
          lastHashRef.current = hash;
          if (hash) window.history.replaceState(null, "", hash);
          else if (window.location.hash) window.history.replaceState(null, "", window.location.pathname);
        }
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  // Sync hudTab from external sources (Nav, etc.)
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
    workModels.activeModelId = station.modelId;
    workModels.version++;
    voidState.snapCamera = true;
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
    if (tab === "models") {
      // Jump to current or first station
      const idx = activeIdx >= 0 ? activeIdx : 0;
      jumpToStation(idx);
    } else {
      workModels.setPendingTab(tab);
      document.getElementById("work")?.scrollIntoView({ behavior: "smooth" });
    }
  }, [activeIdx, jumpToStation]);

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
            <span className="whud-rail" />
            <span className="whud-idx">{String(i + 1).padStart(2, "0")}</span>
            <span className="whud-label">{station.loreName}</span>
          </button>
        );
      });
    }
    if (hudTab === "videos") {
      return videos.map((v, i) => (
        <button key={v.id} className="whud-item" onClick={() => selectVideo(v.id)}>
          <span className="whud-rail" />
          <span className="whud-idx">{String(i + 1).padStart(2, "0")}</span>
          <span className="whud-label">{v.title.toUpperCase()}</span>
        </button>
      ));
    }
    return images.map((img, i) => (
      <button key={img.id} className="whud-item" onClick={() => selectImage(img.id)}>
        <span className="whud-rail" />
        <span className="whud-idx">{String(i + 1).padStart(2, "0")}</span>
        <span className="whud-label">{img.title.toUpperCase()}</span>
      </button>
    ));
  };

  const panel = (
    <div className="whud-panel">
      {/* Tab row — unified, no header/divider chrome */}
      <div className="whud-tabs">
        {(["models", "videos", "images"] as HudTab[]).map(tab => (
          <button
            key={tab}
            className={`whud-tab ${hudTab === tab ? "active" : ""}`}
            onClick={() => switchTab(tab)}
          >
            {tab.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Item list */}
      <div className="whud-items">
        {renderItems()}
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
        <button
          className="whud-mobile-toggle"
          onClick={() => setMobileOpen(o => !o)}
          aria-label={mobileOpen ? "Close work menu" : "Open work menu"}
        >
          {mobileOpen ? "✕" : "☰"}
        </button>
        <div className={`whud-mobile-panel ${mobileOpen ? "open" : ""}`}>
          {panel}
        </div>
      </div>

      <style jsx global>{`
        /* ── Panel: dark translucent slab ── */
        .whud-panel {
          display: flex;
          flex-direction: column;
          background: rgba(5,8,18,0.82);
          backdrop-filter: blur(20px) saturate(1.4);
          -webkit-backdrop-filter: blur(20px) saturate(1.4);
          border: 1px solid rgba(184,240,255,0.05);
          border-radius: 3px;
          overflow: hidden;
          min-width: 185px;
        }

        /* ── Tabs: compact row ── */
        .whud-tabs {
          display: flex;
          border-bottom: 1px solid rgba(184,240,255,0.06);
        }
        .whud-tab {
          flex: 1;
          padding: 0.5rem 0.4rem;
          border: none;
          background: transparent;
          color: rgba(184,240,255,0.35);
          cursor: pointer;
          font-family: var(--font-geist-mono, monospace);
          font-size: 0.44rem;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          transition: color 0.2s, background 0.2s;
          text-align: center;
        }
        .whud-tab:hover {
          color: rgba(184,240,255,0.65);
        }
        .whud-tab.active {
          color: rgba(184,240,255,0.85);
          background: rgba(184,240,255,0.04);
          box-shadow: inset 0 -1px 0 rgba(184,240,255,0.35);
        }

        /* ── Items ── */
        .whud-items {
          display: flex;
          flex-direction: column;
          max-height: 280px;
          overflow-y: auto;
          scrollbar-width: thin;
          scrollbar-color: rgba(184,240,255,0.08) transparent;
          padding: 0.15rem 0;
        }
        .whud-item {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          padding: 0.4rem 0.65rem;
          border: none;
          background: transparent;
          color: rgba(184,240,255,0.4);
          cursor: pointer;
          font-family: var(--font-geist-mono, monospace);
          font-size: 0.58rem;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          transition: color 0.2s, background 0.2s;
          white-space: nowrap;
          text-align: left;
          position: relative;
        }
        .whud-item:hover {
          color: rgba(184,240,255,0.75);
          background: rgba(184,240,255,0.02);
        }
        .whud-item.active {
          color: rgba(200,245,255,0.92);
          background: rgba(184,240,255,0.04);
        }

        /* Rail indicator — thin vertical strip on active item */
        .whud-rail {
          width: 2px;
          align-self: stretch;
          border-radius: 1px;
          background: transparent;
          transition: background 0.25s;
          flex-shrink: 0;
        }
        .whud-item.active .whud-rail {
          background: rgba(184,240,255,0.6);
          box-shadow: 0 0 4px rgba(184,240,255,0.2);
        }

        /* Index number */
        .whud-idx {
          font-size: 0.44rem;
          color: rgba(184,240,255,0.25);
          min-width: 1.1em;
          transition: color 0.2s;
        }
        .whud-item.active .whud-idx {
          color: rgba(184,240,255,0.5);
        }

        /* Label */
        .whud-label {
          font-size: 0.52rem;
          letter-spacing: 0.05em;
        }

        /* ── Desktop layout ── */
        .whud-desktop {
          position: fixed;
          z-index: 40;
          left: clamp(0.75rem, 2.5vw, 1.5rem);
          top: 50%;
          transform: translateY(-50%);
          transition: opacity 0.4s ease;
        }

        /* ── Mobile layout ── */
        .whud-mobile {
          display: none;
          position: fixed;
          z-index: 40;
          transition: opacity 0.4s ease;
        }
        .whud-mobile-toggle {
          position: fixed;
          bottom: 1rem;
          left: 1rem;
          z-index: 41;
          width: 38px; height: 38px;
          border-radius: 50%;
          border: 1px solid rgba(184,240,255,0.12);
          background: rgba(5,8,18,0.85);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          color: rgba(184,240,255,0.5);
          font-size: 0.9rem;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 12px rgba(0,0,12,0.4);
          transition: all 0.2s;
        }
        .whud-mobile-toggle:hover {
          border-color: rgba(184,240,255,0.25);
          color: rgba(184,240,255,0.8);
        }
        .whud-mobile-panel {
          position: fixed;
          bottom: 3.5rem;
          left: 0.75rem;
          right: 0.75rem;
          max-height: 0;
          overflow: hidden;
          opacity: 0;
          transition: max-height 0.3s ease, opacity 0.2s ease;
          z-index: 40;
        }
        .whud-mobile-panel.open {
          max-height: 65vh;
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
