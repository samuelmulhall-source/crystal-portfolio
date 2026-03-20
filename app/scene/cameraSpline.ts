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
// Transit segments: tiny scroll range → big spline jump (camera warps)
// Station segments: wide scroll range → tiny spline change (camera parked)
//
// The spline has 25 control points (24 segments), each ~4.17% of T.
// Station "viewing" positions are at roughly these spline-T values:
//   Station 1 (Torch):  T ≈ 5/24 = 0.208
//   Station 2 (Dagger): T ≈ 9/24 = 0.375
//   Station 3 (Shield): T ≈ 13/24 = 0.542
//   Station 4 (Sword):  T ≈ 17/24 = 0.708
//   Station 5 (Bow):    T ≈ 21/24 = 0.875
//
// [scrollStart, scrollEnd, splineStart, splineEnd]
const REMAP_TABLE: [number, number, number, number][] = [
  [0.00, 0.07, 0.000, 0.125],  // hero — free camera travel
  [0.07, 0.09, 0.125, 0.208],  // transit 1 → warp to station 1 viewing pos
  [0.09, 0.24, 0.208, 0.260],  // STATION 1 — 15% scroll, 5.2% spline (barely moves)
  [0.24, 0.26, 0.260, 0.375],  // transit 2 → warp to station 2
  [0.26, 0.41, 0.375, 0.425],  // STATION 2
  [0.41, 0.43, 0.425, 0.542],  // transit 3
  [0.43, 0.58, 0.542, 0.590],  // STATION 3
  [0.58, 0.60, 0.590, 0.708],  // transit 4
  [0.60, 0.75, 0.708, 0.755],  // STATION 4
  [0.75, 0.77, 0.755, 0.875],  // transit 5
  [0.77, 0.90, 0.875, 0.920],  // STATION 5
  [0.90, 1.00, 0.920, 1.000],  // about — gentle descent
];

/**
 * Remap scroll progress (0-1) to spline parameter (0-1).
 * Piecewise linear interpolation through the remap table.
 */
function remapScroll(scrollProgress: number): number {
  const t = Math.max(0, Math.min(1, scrollProgress));
  for (const [ss, se, ts, te] of REMAP_TABLE) {
    if (t <= se) {
      const frac = se > ss ? (t - ss) / (se - ss) : 0;
      return ts + Math.max(0, Math.min(1, frac)) * (te - ts);
    }
  }
  return 1;
}

const FOV_TRANSIT = 54; // wider during warp for speed sensation
const FOV_STATION = 32; // tighter at station for model framing

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
