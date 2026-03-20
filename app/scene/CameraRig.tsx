"use client";

/**
 * CameraRig — scroll-driven camera journey along CatmullRom spline.
 *
 * Reads voidState.scrollProgress, samples position + lookAt splines,
 * applies spring physics for cinematic inertia, and mouse parallax.
 * Writes activeStationIndex + stationProximity to voidState.
 *
 * When expandedModelId is set, yields to ExpandedViewer's OrbitControls.
 */

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { voidState } from "../lib/voidState";
import { workModels } from "../lib/workModels";
import { getCamera } from "./cameraSpline";
import { STATIONS, findActiveStation, getStationFocusProximity, getStationProximity } from "../lib/journeyConfig";

const SPRING_K    = 10.0;
const SPRING_DAMP = 7.0;
const MAX_PARALLAX_X = 1.5;
const MAX_PARALLAX_Y = 0.8;

export default function CameraRig() {
  const cameraRef = useRef<THREE.Camera | null>(null);

  // Spring state for position
  const springPos = useRef(new THREE.Vector3(0, 0, 14));
  const springVel = useRef(new THREE.Vector3());
  // Spring state for lookAt
  const springLook = useRef(new THREE.Vector3());
  const springLookVel = useRef(new THREE.Vector3());
  // FOV smoothing
  const currentFov = useRef(50);
  const lastCameraPos = useRef(new THREE.Vector3(0, 0, 14));

  const wasExpandedRef = useRef(false);

  // Scratch vectors (avoid per-frame allocation)
  const _targetPos = useMemo(() => new THREE.Vector3(), []);
  const _targetLook = useMemo(() => new THREE.Vector3(), []);
  const _parallelOffset = useMemo(() => new THREE.Vector3(), []);

  useFrame((state, dt) => {
    const camera = state.camera;
    cameraRef.current = camera;

    // Yield to OrbitControls when expanded
    const expanded = workModels.expandedModelId;
    if (expanded) {
      wasExpandedRef.current = true;
      return;
    }

    // Handoff: sync from OrbitControls when viewer closes
    if (wasExpandedRef.current) {
      springPos.current.copy(camera.position);
      springVel.current.set(0, 0, 0);
      springLookVel.current.set(0, 0, 0);
      wasExpandedRef.current = false;
    }

    // Sample spline at current scroll progress
    const { position, lookAt, fov } = getCamera(voidState.scrollProgress);

    // Write journey state to voidState
    voidState.cameraProgress = voidState.scrollProgress;
    voidState.activeStationIndex = findActiveStation(voidState.scrollProgress);
    voidState.focusedStationIndex = -1;
    for (let i = 0; i < STATIONS.length; i++) {
      voidState.stationProximity[i] = getStationProximity(voidState.scrollProgress, STATIONS[i]);
      voidState.stationFocus[i] = getStationFocusProximity(voidState.scrollProgress, STATIONS[i]);
    }

    // Compute max proximity to any station (reduces parallax near weapons)
    let maxProx = 0;
    let maxFocus = 0;
    for (let i = 0; i < voidState.stationProximity.length; i++) {
      if (voidState.stationProximity[i] > maxProx) maxProx = voidState.stationProximity[i];
      if (voidState.stationFocus[i] > maxFocus) {
        maxFocus = voidState.stationFocus[i];
        voidState.focusedStationIndex = i;
      }
    }
    const parallaxScale = 1 - maxFocus * 0.9;

    // Transit factor is driven by the narrow focus band, not the broad station window.
    const rawTransit = 1 - maxFocus;
    voidState.transitFactor = rawTransit * rawTransit * rawTransit;

    // Mouse parallax offset
    const px = voidState.mouseNX * MAX_PARALLAX_X * parallaxScale;
    const py = -voidState.mouseNY * MAX_PARALLAX_Y * parallaxScale;
    _parallelOffset.set(px, py, 0);

    // Target position = spline + parallax
    _targetPos.copy(position).add(_parallelOffset);

    // Target lookAt = spline lookAt
    _targetLook.copy(lookAt);

    // Snap: teleport camera to target instantly (menu click jump)
    if (voidState.snapCamera) {
      voidState.snapCamera = false;
      springPos.current.copy(_targetPos);
      springVel.current.set(0, 0, 0);
      springLook.current.copy(_targetLook);
      springLookVel.current.set(0, 0, 0);
    }

    // Spring physics on position
    const cdt = Math.min(dt, 0.05);
    const accelX = (_targetPos.x - springPos.current.x) * SPRING_K - springVel.current.x * SPRING_DAMP;
    const accelY = (_targetPos.y - springPos.current.y) * SPRING_K - springVel.current.y * SPRING_DAMP;
    const accelZ = (_targetPos.z - springPos.current.z) * SPRING_K - springVel.current.z * SPRING_DAMP;
    springVel.current.x += accelX * cdt;
    springVel.current.y += accelY * cdt;
    springVel.current.z += accelZ * cdt;
    springPos.current.x += springVel.current.x * cdt;
    springPos.current.y += springVel.current.y * cdt;
    springPos.current.z += springVel.current.z * cdt;

    // Spring physics on lookAt (matched to position for no decoupling)
    const lookAccelX = (_targetLook.x - springLook.current.x) * SPRING_K - springLookVel.current.x * SPRING_DAMP;
    const lookAccelY = (_targetLook.y - springLook.current.y) * SPRING_K - springLookVel.current.y * SPRING_DAMP;
    const lookAccelZ = (_targetLook.z - springLook.current.z) * SPRING_K - springLookVel.current.z * SPRING_DAMP;
    springLookVel.current.x += lookAccelX * cdt;
    springLookVel.current.y += lookAccelY * cdt;
    springLookVel.current.z += lookAccelZ * cdt;
    springLook.current.x += springLookVel.current.x * cdt;
    springLook.current.y += springLookVel.current.y * cdt;
    springLook.current.z += springLookVel.current.z * cdt;

    // Near the focus band → aggressively kill spring velocity and lock onto the shot.
    // With the parked hold zone, this needs to clamp hard to avoid "sliding past".
    if (maxFocus > 0.01) {
      const dampFactor = Math.pow(1 - maxFocus, 8); // very aggressive damping
      springVel.current.multiplyScalar(dampFactor);
      springLookVel.current.multiplyScalar(dampFactor);
      // Hard settle: at full focus, camera snaps directly to target
      const settle = Math.min(0.18 + maxFocus * 0.68, 0.86);
      springPos.current.lerp(_targetPos, settle);
      springLook.current.lerp(_targetLook, settle);
    }

    // Warp-speed distortion: driven by actual camera travel, with scroll as a booster.
    const scrollSpeed = Math.abs(voidState.scrollVel);
    const travelWarp = voidState.transitFactor * Math.min(voidState.cameraSpeed / 3.2, 1) * 16;
    const scrollWarp = voidState.transitFactor * Math.min(scrollSpeed * 22, 1) * 8;
    const warpFov = Math.max(travelWarp, scrollWarp);

    // Smooth FOV (base + warp)
    const targetFov = fov + warpFov;
    currentFov.current += (targetFov - currentFov.current) * Math.min(dt * 3, 1);

    // Apply to camera
    camera.position.copy(springPos.current);
    camera.lookAt(springLook.current);
    (camera as THREE.PerspectiveCamera).fov = currentFov.current;
    (camera as THREE.PerspectiveCamera).updateProjectionMatrix();

    voidState.cameraSpeed = lastCameraPos.current.distanceTo(springPos.current) / Math.max(cdt, 0.001);
    lastCameraPos.current.copy(springPos.current);
  });

  return null;
}

/**
 * Velocity decay — runs every frame to decay mouse/scroll velocity.
 * Extracted from VoidBackground VoidMotion.
 */
export function VoidMotion() {
  useFrame((_, dt) => {
    voidState.ready = true;
    const f = Math.min(dt * 60, 6);
    voidState.mouseVel  *= Math.pow(0.88, f);
    voidState.scrollVel *= Math.pow(0.90, f);
  });
  return null;
}
