/**
 * debugFlags — temporary perf-isolation switches read from the URL.
 *
 * Append `?off=<layer>[,<layer>...]` to the URL to disable heavy always-on
 * layers and watch the FPS meter recover, e.g.:
 *
 *   ?off=smoke            disable the dual smoke canvases
 *   ?off=webgl            disable the Three.js starfield canvas
 *   ?off=cursor           disable the custom cursor canvas + filter
 *   ?off=effects          disable the hover/constellation overlay
 *   ?off=scroll           disable Lenis smooth scroll (native scrolling)
 *   ?off=smoke,cursor     disable several at once
 *
 * Whichever flag makes the FPS jump back up identifies the bottleneck.
 * This module is debug-only and intended to be removed afterward.
 */

export type DebugLayer = "smoke" | "webgl" | "cursor" | "effects" | "scroll";

export function layerOff(name: DebugLayer): boolean {
  if (typeof window === "undefined") return false;
  const raw = new URLSearchParams(window.location.search).get("off");
  if (!raw) return false;
  return raw.split(",").map((s) => s.trim().toLowerCase()).includes(name);
}
