/**
 * Analytics — Lightweight custom event tracking.
 *
 * Wraps @vercel/analytics `track()` and provides typed event helpers for
 * model views, media plays, scroll milestones, and UI interactions.
 *
 * Events fire at most once per session per unique key (de-duplicated via Set)
 * to avoid flooding the analytics provider with repeated signals.
 */

import { track } from "@vercel/analytics";

const fired = new Set<string>();

/** Fire a named event at most once per session per unique key. */
function once(key: string, name: string, data?: Record<string, string | number>) {
  if (fired.has(key)) return;
  fired.add(key);
  try {
    track(name, data);
  } catch {
    // Graceful degrade if analytics blocked
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

/** User expanded a 3D model in the fullscreen viewer. */
export function trackModelView(modelId: string, title: string) {
  once(`model:${modelId}`, "model_view", { model: modelId, title });
}

/** User arrived at a weapon station via scroll. */
export function trackStationVisit(stationIndex: number, stationName: string) {
  once(`station:${stationIndex}`, "station_visit", { index: stationIndex, name: stationName });
}

/** User played a video. */
export function trackVideoPlay(videoId: string, title: string) {
  once(`video:${videoId}`, "video_play", { video: videoId, title });
}

/** User opened an image in the lightbox. */
export function trackImageView(imageId: string, title: string) {
  once(`image:${imageId}`, "image_view", { image: imageId, title });
}

/** Scroll milestone reached (25%, 50%, 75%, 100%). */
export function trackScrollMilestone(pct: number) {
  const key = `scroll:${pct}`;
  once(key, "scroll_milestone", { percent: pct });
}

/** User toggled wireframe on a model. */
export function trackWireframeToggle(enabled: boolean) {
  // Allow repeated (don't deduplicate toggles)
  try { track("wireframe_toggle", { enabled: enabled ? "on" : "off" }); } catch { /* */ }
}

/** User switched Work tab. */
export function trackTabSwitch(tab: string) {
  // Allow repeated
  try { track("tab_switch", { tab }); } catch { /* */ }
}

/** User used keyboard navigation. */
export function trackKeyboardNav(key: string, action: string) {
  once(`kbd:${key}:${action}`, "keyboard_nav", { key, action });
}
