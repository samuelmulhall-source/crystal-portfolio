/**
 * Camera spline system: maps scroll progress (0-1) to camera position + lookAt + FOV.
 *
 * Two CatmullRomCurve3 splines run in parallel:
 *   - Position spline: where the camera sits
 *   - LookAt spline: where the camera points
 *
 * SCROLL→SPLINE REMAP: the key to the two-phase experience.
 * During transit (2% of scroll), the spline parameter jumps rapidly —
 * camera warps through space. During station (15% of scroll), the spline
 * parameter barely advances — camera is locked on the model.
 *
 * FOV narrows at stations (telephoto compression for dramatic framing)
 * and widens during transits for dramatic perspective + warp feel.
 */

import * as THREE from "three";
import {
  CAMERA_POSITION_POINTS,
  CAMERA_LOOKAT_POINTS,
  STATIONS,
  getStationProximity,
  getStationFocusProximity,
} from "../lib/journeyConfig";

let _posSpline: THREE.CatmullRomCurve3 | null = null;
let _lookSpline: THREE.CatmullRomCurve3 | null = null;

function getPositionSpline(): THREE.CatmullRomCurve3 {
  if (!_posSpline) {
    _posSpline = new THREE.CatmullRomCurve3(
      CAMERA_POSITION_POINTS.map((p) => new THREE.Vector3(...p)),
      false,
      "centripetal",
      0.5,
    );
  }
  return _posSpline;
}

function getLookAtSpline(): THREE.CatmullRomCurve3 {
  if (!_lookSpline) {
    _lookSpline = new THREE.CatmullRomCurve3(
      CAMERA_LOOKAT_POINTS.map((p) => new THREE.Vector3(...p)),
      false,
      "centripetal",
      0.5,
    );
  }
  return _lookSpline;
}

// ─── Scroll → Spline remap ─────────────────────────────────────────────────
// Maps scroll progress (0-1) to spline parameter (0-1).
//
// Key requirement:
// - transit should move quickly through space
// - station should actually park on the model instead of gliding past it
//
// Each station therefore has three sub-phases:
// - settle: camera eases into the framed viewing pose
// - hold: camera stays effectively parked on the model
// - release: camera eases out toward the next transit

const HERO_SCROLL_END = 0.07;
const HERO_SPLINE_END = 0.125;
const ABOUT_SCROLL_START = 0.90;
const ABOUT_SPLINE_START = 22 / 24;
const STATION_SEGMENT = 1 / 24;
const STATION_VIEW_SEGMENTS = [5, 9, 13, 17, 21].map((v) => v / 24);
const STATION_SETTLE_FRACTION = 0.22;
const STATION_RELEASE_FRACTION = 0.22;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function smoothstep01(value: number): number {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Remap scroll progress (0-1) to spline parameter (0-1).
 * Transit zones move aggressively; station zones settle and then hold.
 */
function remapScroll(scrollProgress: number): number {
  const t = Math.max(0, Math.min(1, scrollProgress));

  if (t <= HERO_SCROLL_END) {
    return lerp(0, HERO_SPLINE_END, smoothstep01(t / HERO_SCROLL_END));
  }

  let previousScrollEnd = HERO_SCROLL_END;
  let previousSplineExit = HERO_SPLINE_END;

  for (let i = 0; i < STATIONS.length; i++) {
    const station = STATIONS[i];
    const viewT = STATION_VIEW_SEGMENTS[i];
    const approachT = viewT - STATION_SEGMENT;
    const exitT = viewT + STATION_SEGMENT;

    if (t < station.scrollStart) {
      const transitSpan = station.scrollStart - previousScrollEnd;
      const transitT = transitSpan > 0 ? (t - previousScrollEnd) / transitSpan : 1;
      return lerp(previousSplineExit, approachT, smoothstep01(transitT));
    }

    if (t <= station.scrollEnd) {
      const stationSpan = station.scrollEnd - station.scrollStart;
      const settleEnd = station.scrollStart + stationSpan * STATION_SETTLE_FRACTION;
      const releaseStart = station.scrollEnd - stationSpan * STATION_RELEASE_FRACTION;

      if (t <= settleEnd) {
        const settleT = (t - station.scrollStart) / Math.max(settleEnd - station.scrollStart, 0.0001);
        return lerp(approachT, viewT, smoothstep01(settleT));
      }

      if (t >= releaseStart) {
        const releaseT = (t - releaseStart) / Math.max(station.scrollEnd - releaseStart, 0.0001);
        return lerp(viewT, exitT, smoothstep01(releaseT));
      }

      return viewT;
    }

    previousScrollEnd = station.scrollEnd;
    previousSplineExit = exitT;
  }

  if (t <= ABOUT_SCROLL_START) {
    return previousSplineExit;
  }

  const aboutT = (t - ABOUT_SCROLL_START) / Math.max(1 - ABOUT_SCROLL_START, 0.0001);
  return lerp(ABOUT_SPLINE_START, 1, smoothstep01(aboutT));
}

const FOV_TRANSIT = 58; // wider during warp for speed sensation
const FOV_STATION = 28; // tighter at station for model framing

export interface CameraState {
  position: THREE.Vector3;
  lookAt: THREE.Vector3;
  fov: number;
}

// Reusable vectors to avoid per-frame allocation
const _pos = new THREE.Vector3();
const _look = new THREE.Vector3();

/**
 * Sample the camera state at a given scroll progress (0-1).
 *
 * Applies scroll→spline remap so stations are slow (locked viewing)
 * and transits are fast (hyperspace warp).
 */
export function getCamera(progress: number): CameraState {
  const scrollT = Math.max(0, Math.min(1, progress));
  const splineT = remapScroll(scrollT);

  getPositionSpline().getPoint(splineT, _pos);
  getLookAtSpline().getPoint(splineT, _look);

  // FOV: narrows sharply at station focus for dramatic model framing
  let maxProximity = 0;
  let maxFocus = 0;
  for (const station of STATIONS) {
    const prox = getStationProximity(scrollT, station);
    if (prox > maxProximity) maxProximity = prox;
    const focus = getStationFocusProximity(scrollT, station);
    if (focus > maxFocus) maxFocus = focus;
  }
  const fovBias = Math.max(maxProximity * 0.4, maxFocus);
  const fov = FOV_TRANSIT - fovBias * (FOV_TRANSIT - FOV_STATION);

  return { position: _pos, lookAt: _look, fov };
}
