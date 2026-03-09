"use client";

/**
 * WeaponHUD — glassmorphism overlay for weapon station navigation.
 *
 * Shows a vertical list of weapon names (desktop) or horizontal strip (mobile).
 * Clicking a weapon smoothly scrolls to that station's position on the page.
 * Active station is highlighted based on voidState.activeStationIndex.
 */

import { useState, useEffect, useRef } from "react";
import { voidState } from "../lib/voidState";
import { STATIONS, TOTAL_SCROLL_VH } from "../lib/journeyConfig";

export default function WeaponHUD() {
  const [activeIdx, setActiveIdx] = useState(-1);
  const [visible, setVisible] = useState(false);
  const rafRef = useRef<number>(0);

  // Poll voidState.activeStationIndex via rAF + update URL hash
  const lastHashRef = useRef("");
  useEffect(() => {
    const tick = () => {
      rafRef.current = requestAnimationFrame(tick);
      const newIdx = voidState.activeStationIndex;
      if (newIdx !== activeIdx) setActiveIdx(newIdx);
      // Show HUD once scrolled past hero
      setVisible(voidState.scrollProgress > 0.05);
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
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  });

  // On mount: if URL has a station hash, scroll to it
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash.replace("#", "");
    if (!hash) return;
    const idx = STATIONS.findIndex(s => s.id === hash);
    if (idx < 0) return;
    // Delay to let page height settle
    setTimeout(() => jumpTo(idx), 500);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const jumpTo = (index: number) => {
    const station = STATIONS[index];
    const mid = (station.scrollStart + station.scrollEnd) / 2;
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    const scrollTarget = mid * maxScroll;
    window.scrollTo({ top: scrollTarget, behavior: "smooth" });
  };

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
      aria-label="Weapon navigation"
    >
      {STATIONS.map((station, i) => {
        const isActive = i === activeIdx;
        return (
          <button
            key={station.id}
            className={`weapon-hud-item ${isActive ? "active" : ""}`}
            onClick={() => jumpTo(i)}
            aria-current={isActive ? "true" : undefined}
          >
            <span className="weapon-hud-index">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="weapon-hud-name">
              {station.loreName}
            </span>
          </button>
        );
      })}

      <style jsx>{`
        .weapon-hud {
          /* Desktop: right-aligned vertical list */
          right: clamp(1rem, 3vw, 2.5rem);
          top: 50%;
          transform: translateY(-50%);
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
          padding: 0.75rem 1rem;
          background: rgba(4, 8, 24, 0.55);
          backdrop-filter: blur(18px) saturate(1.5);
          -webkit-backdrop-filter: blur(18px) saturate(1.5);
          border: 1px solid rgba(184, 240, 255, 0.08);
          border-radius: 8px;
        }

        .weapon-hud-item {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          padding: 0.35rem 0.5rem;
          border: none;
          background: transparent;
          color: rgba(184, 240, 255, 0.45);
          cursor: pointer;
          font-family: var(--font-geist-mono, monospace);
          font-size: 0.7rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          transition: color 0.3s ease, transform 0.2s ease;
          white-space: nowrap;
          text-align: left;
        }

        .weapon-hud-item:hover {
          color: rgba(184, 240, 255, 0.85);
          transform: translateX(-3px);
        }

        .weapon-hud-item.active {
          color: #c5f8ff;
          text-shadow: 0 0 12px rgba(184, 240, 255, 0.35);
        }

        .weapon-hud-item.active .weapon-hud-index {
          color: #b8f0ff;
          text-shadow: 0 0 8px rgba(184, 240, 255, 0.5);
        }

        .weapon-hud-index {
          font-size: 0.6rem;
          opacity: 0.6;
          min-width: 1.2em;
        }

        .weapon-hud-name {
          font-size: 0.65rem;
        }

        /* Mobile: bottom horizontal strip */
        @media (max-width: 768px) {
          .weapon-hud {
            right: auto;
            top: auto;
            bottom: 1rem;
            left: 50%;
            transform: translateX(-50%);
            flex-direction: row;
            gap: 0.15rem;
            padding: 0.5rem 0.75rem;
          }

          .weapon-hud-name {
            display: none;
          }

          .weapon-hud-item {
            padding: 0.3rem 0.5rem;
          }

          .weapon-hud-item:hover {
            transform: translateY(-2px);
          }

          .weapon-hud-index {
            font-size: 0.7rem;
          }
        }
      `}</style>
    </nav>
  );
}
