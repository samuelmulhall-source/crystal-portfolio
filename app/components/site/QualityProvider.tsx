"use client";

/**
 * QualityProvider — owns the active quality tier and the runtime FPS governor.
 *
 * Initial tier is seeded from the device profile (and capped by any prior
 * downgrade this session). The governor then samples real frame rate and can
 * only ever LOWER the tier (step-down-only) — never raise it mid-session — so
 * the page settles toward smooth and never oscillates. A fresh session
 * re-detects from scratch, so fixing the real cause restores full quality.
 */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  GOVERNOR,
  type QualityTier,
  forcedTier,
  initialQualityTier,
  qualityState,
  readSessionCap,
  writeSessionCap,
} from "../../lib/quality";

interface QualityContextValue {
  tier: QualityTier;
}

const QualityContext = createContext<QualityContextValue>({ tier: 3 });

export function QualityProvider({ children }: { children: React.ReactNode }) {
  const [tier, setTier] = useState<QualityTier>(() => {
    const forced = forcedTier();
    if (forced != null) return forced;
    const detected = initialQualityTier();
    const cap = readSessionCap();
    return (cap != null ? Math.min(detected, cap) : detected) as QualityTier;
  });

  // Mirror into the module singleton so per-frame rAF loops (and the governor
  // below) can read the live tier without re-subscribing.
  useEffect(() => {
    qualityState.tier = tier;
  }, [tier]);

  // ── FPS governor ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (forcedTier() != null) return; // pinned tier — don't auto-adjust

    let raf = 0;
    let last = performance.now();
    let phaseStart = last; // start of the current settle+judge phase
    let acc = 0; // ms accumulated in the judging window
    let frames = 0;

    const loop = () => {
      raf = requestAnimationFrame(loop);
      const now = performance.now();
      const dt = now - last;
      last = now;

      // Nothing lower than Lite — stop spending cycles judging.
      if (qualityState.tier <= 1) return;

      // Discard hidden tabs and one-off spikes (alt-tab, GC, downgrade churn).
      if (document.hidden || dt > GOVERNOR.spikeMs) {
        acc = 0;
        frames = 0;
        phaseStart = now;
        return;
      }

      // Let load/decode/layout jank settle before judging.
      if (now - phaseStart < GOVERNOR.settleMs) return;

      acc += dt;
      frames += 1;
      if (acc < GOVERNOR.windowMs) return;

      const fps = frames / (acc / 1000);
      acc = 0;
      frames = 0;

      if (fps < GOVERNOR.floorFps) {
        setTier((prev) => {
          const next = Math.max(1, prev - 1) as QualityTier;
          if (next !== prev) writeSessionCap(next);
          return next;
        });
        // Re-settle after a tier change so unmount/remount jank isn't re-judged.
        phaseStart = now;
      }
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const value = useMemo(() => ({ tier }), [tier]);
  return <QualityContext.Provider value={value}>{children}</QualityContext.Provider>;
}

export function useQuality() {
  return useContext(QualityContext);
}
