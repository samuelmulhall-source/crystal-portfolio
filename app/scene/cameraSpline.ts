/**
 * Camera path contract.
 *
 * The experience is explicitly binary:
 * - transit: camera moves through space
 * - station: camera is parked on a model
 *
 * There is no longer any "slow glide through a station". If the scroll is
 * inside a station window, the camera uses that station's exact framed shot.
 */

import * as THREE from "three";
import {
  CAMERA_LOOKAT_POINTS,
  CAMERA_POSITION_POINTS,
  STATIONS,
  getJourneyPhase,
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

const STATION_VIEW_SEGMENTS = [5, 9, 13, 17, 21].map((v) => v / 24);
const HERO_SPLINE_END = 0.125;
const ABOUT_SPLINE_START = 22 / 24;
const FOV_HERO = 48;
const FOV_TRANSIT = 66;
const FOV_STATION = 31;
const FOV_ABOUT = 42;

const _pos = new THREE.Vector3();
const _look = new THREE.Vector3();

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function smoothstep01(value: number): number {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function applySplinePoint(t: number, outPos: THREE.Vector3, outLook: THREE.Vector3) {
  getPositionSpline().getPoint(t, outPos);
  getLookAtSpline().getPoint(t, outLook);
}

function getStationView(index: number, outPos: THREE.Vector3, outLook: THREE.Vector3) {
  const viewT = STATION_VIEW_SEGMENTS[index];
  applySplinePoint(viewT, outPos, outLook);
}

export interface CameraState {
  position: THREE.Vector3;
  lookAt: THREE.Vector3;
  fov: number;
}

export function getCamera(progress: number): CameraState {
  const phase = getJourneyPhase(progress);

  if (phase.mode === "hero") {
    const t = smoothstep01(phase.phaseProgress);
    applySplinePoint(HERO_SPLINE_END * t, _pos, _look);
    return { position: _pos, lookAt: _look, fov: THREE.MathUtils.lerp(FOV_HERO, 54, t) };
  }

  if (phase.mode === "station" && phase.stationIndex >= 0) {
    getStationView(phase.stationIndex, _pos, _look);
    return { position: _pos, lookAt: _look, fov: FOV_STATION };
  }

  if (phase.mode === "about") {
    const t = smoothstep01(phase.phaseProgress);
    applySplinePoint(THREE.MathUtils.lerp(ABOUT_SPLINE_START, 1, t), _pos, _look);
    return { position: _pos, lookAt: _look, fov: THREE.MathUtils.lerp(FOV_TRANSIT, FOV_ABOUT, t) };
  }

  // Transit: interpolate directly from one locked shot to the next.
  const transitT = smoothstep01(phase.phaseProgress);
  const fromPos = new THREE.Vector3();
  const fromLook = new THREE.Vector3();
  const toPos = new THREE.Vector3();
  const toLook = new THREE.Vector3();

  if (phase.stationIndex <= 0) {
    applySplinePoint(HERO_SPLINE_END, fromPos, fromLook);
    getStationView(0, toPos, toLook);
  } else if (phase.stationIndex >= STATIONS.length) {
    getStationView(STATIONS.length - 1, fromPos, fromLook);
    applySplinePoint(ABOUT_SPLINE_START, toPos, toLook);
  } else {
    getStationView(phase.stationIndex - 1, fromPos, fromLook);
    getStationView(phase.stationIndex, toPos, toLook);
  }

  _pos.copy(fromPos).lerp(toPos, transitT);
  _look.copy(fromLook).lerp(toLook, transitT);
  // Gentle vertical arc during transit for cinematic feel
  _pos.y += Math.sin(transitT * Math.PI) * 0.08;

  return { position: _pos, lookAt: _look, fov: FOV_TRANSIT };
}
