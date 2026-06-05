/**
 * Quality tiers — a single signal that drives how much of the decorative
 * layer stack is rendered. Seeded at load from the device profile, then only
 * ever lowered at runtime by the FPS governor (step-down-only, no flicker).
 *
 *   3 = Full     — WebGL starfield + hover constellation + dust + smoke + cursor, DPR ≤ 1.5
 *   2 = Balanced — WebGL starfield (fewer stars, DPR 1.0, no dust/hover) + smoke + cursor
 *   1 = Lite     — static CSS starfield only; no WebGL, smoke, hover; native cursor; posters
 *
 * The contract's progressive-enhancement posture: content + typography land
 * first, decoration scales to the machine, and reduced tiers stay coherent.
 */

import { getDeviceProfile } from "./deviceTier";

export type QualityTier = 1 | 2 | 3;

/** Mirror of the React tier for rAF loops that read state per-frame. */
export const qualityState = { tier: 3 as QualityTier };

/** Map the one-shot device profile to a starting tier. */
export function initialQualityTier(): QualityTier {
  if (typeof window === "undefined") return 3;
  const p = getDeviceProfile();
  if (p.isSoftware) return 1; // CPU rendering — start at the lightest path
  return p.tier === "high" ? 3 : p.tier === "mid" ? 2 : 1;
}

/** Debug/QA override: `?q=1|2|3` pins a tier (and disables the governor). */
export function forcedTier(): QualityTier | null {
  if (typeof window === "undefined") return null;
  const v = Number(new URLSearchParams(window.location.search).get("q"));
  return v === 1 || v === 2 || v === 3 ? (v as QualityTier) : null;
}

// ── Runtime FPS governor tuning ──────────────────────────────────────────────
export const GOVERNOR = {
  /** Ignore the first stretch after load/downgrade (decode + layout jank). */
  settleMs: 2000,
  /** Rolling window the average is judged over. */
  windowMs: 3000,
  /** Sustained average below this (absolute, not refresh-relative) → step down. */
  floorFps: 45,
  /** A single frame longer than this resets the window (tab switch, GC, alt-tab). */
  spikeMs: 200,
};

// ── Per-session cap ──────────────────────────────────────────────────────────
// A runtime downgrade is remembered for the session so reloads don't re-jank,
// but it is NOT persisted permanently — a fresh session re-detects, so fixing
// the real cause (e.g. re-enabling GPU acceleration) restores full quality.
const SESSION_KEY = "multiscatter-quality-cap";

export function readSessionCap(): QualityTier | null {
  if (typeof window === "undefined") return null;
  try {
    const v = Number(window.sessionStorage.getItem(SESSION_KEY));
    return v === 1 || v === 2 || v === 3 ? (v as QualityTier) : null;
  } catch {
    return null;
  }
}

export function writeSessionCap(tier: QualityTier): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(SESSION_KEY, String(tier));
  } catch {
    /* storage unavailable — ignore */
  }
}
