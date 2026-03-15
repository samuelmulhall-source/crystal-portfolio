"use client";

/**
 * WeaponHUD — Premium console-style weapon station navigation.
 *
 * Design: PS2/GameCube system menu aesthetic — sleek metallic panel with
 * subtle bevel, clean monospace typography, soft phosphor glow, and
 * blue/orange neon accent that highlights the active station.
 *
 * Desktop: right-aligned vertical panel with station names + lore tags
 * Mobile: bottom horizontal strip with compact station indices
 *
 * Clicking a station smoothly scrolls to that position on the page.
 * Active station highlighted based on voidState.activeStationIndex.
 * Number keys 1-5 for keyboard navigation.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { voidState } from "../lib/voidState";
import { STATIONS } from "../lib/journeyConfig";
import { trackStationVisit, trackKeyboardNav } from "../lib/analytics";

export default function WeaponHUD() {
  const [activeIdx, setActiveIdx] = useState(-1);
  const [visible, setVisible] = useState(false);
  const [hoverIdx, setHoverIdx] = useState(-1);
  const rafRef = useRef<number>(0);
  const progressRef = useRef<HTMLDivElement>(null);

  // Poll voidState via rAF — refs for previous values to avoid unnecessary setState
  const lastHashRef = useRef("");
  const prevIdxRef = useRef(-1);
  const prevVisibleRef = useRef(false);
  useEffect(() => {
    const tick = () => {
      rafRef.current = requestAnimationFrame(tick);
      const newIdx = voidState.activeStationIndex;

      // Only setState when index actually changes
      if (newIdx !== prevIdxRef.current) {
        prevIdxRef.current = newIdx;
        setActiveIdx(newIdx);
        if (newIdx >= 0) trackStationVisit(newIdx, STATIONS[newIdx].loreName);
      }

      // Only setState when visibility actually changes
      const sp = voidState.scrollProgress;
      const nowVisible = sp > 0.05 && sp < 0.88;
      if (nowVisible !== prevVisibleRef.current) {
        prevVisibleRef.current = nowVisible;
        setVisible(nowVisible);
      }

      // Update URL hash for deep-linking
      const hash = newIdx >= 0 ? `#${STATIONS[newIdx].id}` : "";
      if (hash !== lastHashRef.current) {
        lastHashRef.current = hash;
        if (hash) {
          window.history.replaceState(null, "", hash);
        } else if (window.location.hash) {
          window.history.replaceState(null, "", window.location.pathname);
        }
      }
      // Scroll progress indicator (direct DOM, no setState)
      if (progressRef.current) {
        progressRef.current.style.transform = `scaleY(${voidState.scrollProgress})`;
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  // On mount: if URL has a station hash, scroll to it
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash.replace("#", "");
    if (!hash) return;
    const idx = STATIONS.findIndex(s => s.id === hash);
    if (idx < 0) return;
    setTimeout(() => jumpTo(idx), 500);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const jumpTo = useCallback((index: number) => {
    const station = STATIONS[index];
    const mid = (station.scrollStart + station.scrollEnd) / 2;
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    const scrollTarget = mid * maxScroll;
    window.scrollTo({ top: scrollTarget, behavior: "smooth" });
  }, []);

  // Keyboard navigation: number keys 1-5
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Skip if typing in input/textarea
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const num = parseInt(e.key);
      if (num >= 1 && num <= STATIONS.length) {
        jumpTo(num - 1);
        trackKeyboardNav(e.key, `station_${num}`);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [jumpTo]);

  return (
    <nav
      className="weapon-hud"
      style={{
        position: "fixed",
        zIndex: 40,
        transition: "opacity 0.5s ease, transform 0.5s ease",
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? "auto" : "none",
      }}
      aria-label="Weapon station navigation"
    >
      {/* ── Scroll progress track (desktop only) ── */}
      <div className="weapon-hud-progress-track" aria-hidden="true">
        <div
          ref={progressRef}
          className="weapon-hud-progress-fill"
        />
      </div>

      {/* ── Console panel header ── */}
      <div className="weapon-hud-header" aria-hidden="true">
        <span className="weapon-hud-header-label">STATION LOG</span>
        <span className="weapon-hud-header-divider" />
      </div>

      {/* ── Station buttons ── */}
      {STATIONS.map((station, i) => {
        const isActive = i === activeIdx;
        const isHover = i === hoverIdx;
        return (
          <button
            key={station.id}
            className={`weapon-hud-item ${isActive ? "active" : ""}`}
            onClick={() => jumpTo(i)}
            onMouseEnter={() => setHoverIdx(i)}
            onMouseLeave={() => setHoverIdx(-1)}
            aria-current={isActive ? "true" : undefined}
            aria-label={`Navigate to ${station.loreName}`}
          >
            {/* Active indicator dot */}
            <span className={`weapon-hud-dot ${isActive ? "active" : ""}`} />

            <span className="weapon-hud-index">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="weapon-hud-name">
              {station.loreName}
            </span>

            {/* Lore tag — shows on hover/active */}
            <span
              className="weapon-hud-tag"
              style={{
                opacity: isActive || isHover ? 0.5 : 0,
                maxWidth: isActive || isHover ? "140px" : "0px",
              }}
            >
              {station.loreTag}
            </span>
          </button>
        );
      })}

      {/* ── Console panel footer ── */}
      <div className="weapon-hud-footer" aria-hidden="true">
        <span className="weapon-hud-footer-key">[1-5]</span>
        <span className="weapon-hud-footer-label">QUICK NAV</span>
      </div>

      <style jsx>{`
        .weapon-hud {
          /* Desktop: right-aligned vertical console panel */
          right: clamp(0.75rem, 2.5vw, 2rem);
          top: 50%;
          transform: translateY(-50%);
          display: flex;
          flex-direction: column;
          gap: 0;
          padding: 0;
          background: linear-gradient(
            145deg,
            rgba(8, 14, 32, 0.75) 0%,
            rgba(4, 8, 20, 0.85) 100%
          );
          backdrop-filter: blur(24px) saturate(1.6);
          -webkit-backdrop-filter: blur(24px) saturate(1.6);
          border: 1px solid rgba(184, 240, 255, 0.06);
          border-radius: 4px;
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.06),
            inset 0 -1px 0 rgba(0, 0, 0, 0.3),
            0 8px 32px rgba(0, 0, 12, 0.6),
            0 0 1px rgba(184, 240, 255, 0.08);
          overflow: hidden;
          min-width: 180px;
        }

        /* ── Progress track ── */
        .weapon-hud-progress-track {
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          width: 2px;
          background: rgba(184, 240, 255, 0.04);
        }

        .weapon-hud-progress-fill {
          position: absolute;
          left: 0;
          top: 0;
          width: 100%;
          height: 100%;
          background: linear-gradient(
            180deg,
            rgba(184, 240, 255, 0.5) 0%,
            rgba(255, 160, 60, 0.4) 100%
          );
          transform-origin: top;
          transform: scaleY(0);
          transition: none;
        }

        /* ── Header ── */
        .weapon-hud-header {
          padding: 0.55rem 0.75rem 0.35rem 1rem;
          display: flex;
          flex-direction: column;
          gap: 0.3rem;
        }

        .weapon-hud-header-label {
          font-family: var(--font-geist-mono, monospace);
          font-size: 0.5rem;
          letter-spacing: 0.28em;
          text-transform: uppercase;
          color: rgba(255, 160, 60, 0.5);
        }

        .weapon-hud-header-divider {
          display: block;
          height: 1px;
          background: linear-gradient(90deg, rgba(184, 240, 255, 0.12), transparent);
        }

        /* ── Items ── */
        .weapon-hud-item {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.4rem 0.75rem 0.4rem 1rem;
          border: none;
          background: transparent;
          color: rgba(184, 240, 255, 0.4);
          cursor: pointer;
          font-family: var(--font-geist-mono, monospace);
          font-size: 0.68rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          transition: color 0.25s ease, background 0.2s ease;
          white-space: nowrap;
          text-align: left;
          position: relative;
        }

        .weapon-hud-item:hover {
          color: rgba(184, 240, 255, 0.85);
          background: rgba(184, 240, 255, 0.03);
        }

        .weapon-hud-item.active {
          color: #c5f8ff;
          background: rgba(184, 240, 255, 0.05);
          text-shadow: 0 0 10px rgba(184, 240, 255, 0.3);
        }

        /* Active indicator dot */
        .weapon-hud-dot {
          width: 4px;
          height: 4px;
          border-radius: 50%;
          background: rgba(184, 240, 255, 0.15);
          flex-shrink: 0;
          transition: all 0.3s ease;
        }

        .weapon-hud-dot.active {
          background: rgba(255, 160, 60, 0.9);
          box-shadow: 0 0 6px rgba(255, 160, 60, 0.5), 0 0 12px rgba(255, 160, 60, 0.2);
          animation: dot-pulse 2s ease-in-out infinite;
        }

        @keyframes dot-pulse {
          0%, 100% { box-shadow: 0 0 4px rgba(255, 160, 60, 0.4), 0 0 8px rgba(255, 160, 60, 0.15); }
          50% { box-shadow: 0 0 8px rgba(255, 160, 60, 0.7), 0 0 16px rgba(255, 160, 60, 0.3); }
        }

        .weapon-hud-item.active .weapon-hud-index {
          color: rgba(255, 160, 60, 0.8);
        }

        .weapon-hud-index {
          font-size: 0.55rem;
          opacity: 0.6;
          min-width: 1.2em;
          transition: color 0.3s ease;
        }

        .weapon-hud-name {
          font-size: 0.62rem;
          letter-spacing: 0.06em;
        }

        .weapon-hud-tag {
          font-size: 0.45rem;
          letter-spacing: 0.12em;
          color: rgba(184, 240, 255, 0.35);
          overflow: hidden;
          transition: opacity 0.3s ease, max-width 0.4s ease;
          white-space: nowrap;
          margin-left: auto;
          padding-left: 0.5rem;
        }

        /* ── Footer ── */
        .weapon-hud-footer {
          padding: 0.35rem 0.75rem 0.5rem 1rem;
          display: flex;
          align-items: center;
          gap: 0.4rem;
          border-top: 1px solid rgba(184, 240, 255, 0.05);
        }

        .weapon-hud-footer-key {
          font-family: var(--font-geist-mono, monospace);
          font-size: 0.45rem;
          letter-spacing: 0.12em;
          color: rgba(184, 240, 255, 0.3);
          padding: 1px 4px;
          border: 1px solid rgba(184, 240, 255, 0.1);
          border-radius: 2px;
        }

        .weapon-hud-footer-label {
          font-family: var(--font-geist-mono, monospace);
          font-size: 0.42rem;
          letter-spacing: 0.18em;
          color: rgba(184, 240, 255, 0.22);
          text-transform: uppercase;
        }

        /* ── Mobile: bottom horizontal strip ── */
        @media (max-width: 768px) {
          .weapon-hud {
            right: auto;
            top: auto;
            bottom: 0.75rem;
            left: 50%;
            transform: translateX(-50%);
            flex-direction: row;
            align-items: center;
            gap: 0;
            min-width: auto;
            padding: 0;
          }

          .weapon-hud-progress-track,
          .weapon-hud-header,
          .weapon-hud-footer,
          .weapon-hud-tag,
          .weapon-hud-name {
            display: none;
          }

          .weapon-hud-item {
            padding: 0.5rem 0.65rem;
            flex-direction: column;
            gap: 0.2rem;
          }

          .weapon-hud-item:hover {
            transform: translateY(-1px);
          }

          .weapon-hud-index {
            font-size: 0.65rem;
          }

          .weapon-hud-dot {
            width: 3px;
            height: 3px;
          }
        }
      `}</style>
    </nav>
  );
}
