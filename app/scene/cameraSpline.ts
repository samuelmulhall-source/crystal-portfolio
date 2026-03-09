/**
 * Camera spline system: maps scroll progress (0-1) to camera position + lookAt + FOV.
 *
 * Two CatmullRomCurve3 splines run in parallel:
 *   - Position spline: where the camera sits
 *   - LookAt spline: where the camera points
 *
 * FOV narrows from 50 to 38 near weapon stations (telephoto compression)
 * and widens during transits for dramatic perspective.
 */

import * as THREE from "three";
import {
  CAMERA_POSITION_POINTS,
  CAMERA_LOOKAT_POINTS,
  STATIONS,
  getStationProximity,
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

const FOV_TRANSIT = 50;
const FOV_STATION = 38;

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
 * Returns position, lookAt target, and FOV. The returned vectors are
 * references to internal scratch objects — copy them if you need to persist.
 */
export function getCamera(progress: number): CameraState {
  const t = Math.max(0, Math.min(1, progress));

  getPositionSpline().getPoint(t, _pos);
  getLookAtSpline().getPoint(t, _look);

  // FOV: narrows near weapon stations for telephoto framing
  let maxProximity = 0;
  for (const station of STATIONS) {
    const prox = getStationProximity(progress, station);
    if (prox > maxProximity) maxProximity = prox;
  }
  const fov = FOV_TRANSIT - maxProximity * (FOV_TRANSIT - FOV_STATION);

  return { position: _pos, lookAt: _look, fov };
}

/**
 * Dispose cached splines (for hot-reload cleanup).
 */
export function disposeCameraSplines(): void {
  _posSpline = null;
  _lookSpline = null;
}
