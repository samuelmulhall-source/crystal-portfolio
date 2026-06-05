"use client";

/**
 * StaticStarfield — the Lite-tier (quality 1) background.
 *
 * Pure CSS: layered radial-gradient nebula glows + two tiled dot grids for
 * stars. No canvas, no WebGL, no rAF — guaranteed fast on software rendering
 * or low-end devices. Keeps the deep-midnight void identity so the reduced
 * path still reads as intentional, not broken.
 */

export default function StaticStarfield() {
  return <div className="static-starfield" role="presentation" aria-hidden="true" />;
}
