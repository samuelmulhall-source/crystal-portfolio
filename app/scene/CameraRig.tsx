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
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { voidState } from "../lib/voidState";
import { workModels } from "../lib/workModels";
import { getCamera } from "./cameraSpline";
import { STATIONS, findActiveStation, getStationProximity } from "../lib/journeyConfig";

const SPRING_K    = 8.0;
const SPRING_DAMP = 5.5;
const MAX_PARALLAX_X = 1.5;
const MAX_PARALLAX_Y = 0.8;

export default function CameraRig() {
  const { camera } = useThree();

  // Spring state for position
  const springPos = useRef(new THREE.Vector3(0, 0, 14));
  const springVel = useRef(new THREE.Vector3());
  // Spring state for lookAt
  const springLook = useRef(new THREE.Vector3());
  const springLookVel = useRef(new THREE.Vector3());
  // FOV smoothing
  const currentFov = useRef(50);

  const wasExpandedRef = useRef(false);

  // Scratch vectors (avoid per-frame allocation)
  const _targetPos = useMemo(() => new THREE.Vector3(), []);
  const _targetLook = useMemo(() => new THREE.Vector3(), []);
  const _parallelOffset = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, dt) => {
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
    for (let i = 0; i < STATIONS.length; i++) {
      voidState.stationProximity[i] = getStationProximity(voidState.scrollProgress, STATIONS[i]);
    }

    // Compute max proximity to any station (reduces parallax near weapons)
    let maxProx = 0;
    for (let i = 0; i < voidState.stationProximity.length; i++) {
      if (voidState.stationProximity[i] > maxProx) maxProx = voidState.stationProximity[i];
    }
    const parallaxScale = 1 - maxProx * 0.7;

    // Mouse parallax offset
    const px = voidState.mouseNX * MAX_PARALLAX_X * parallaxScale;
    const py = -voidState.mouseNY * MAX_PARALLAX_Y * parallaxScale;
    _parallelOffset.set(px, py, 0);

    // Target position = spline + parallax
    _targetPos.copy(position).add(_parallelOffset);

    // Target lookAt = spline lookAt
    _targetLook.copy(lookAt);

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

    // Near a station → kill spring velocity for stable viewing
    if (maxProx > 0.5) {
      const dampFactor = Math.pow(1 - maxProx, 2); // 0.5→0.25, 0.8→0.04, 1.0→0
      springVel.current.multiplyScalar(dampFactor);
      springLookVel.current.multiplyScalar(dampFactor);
    }

    // Warp-speed distortion: FOV stretch during fast scrolling
    const scrollSpeed = Math.abs(voidState.scrollVel);
    const warpFov = scrollSpeed > 0.3 ? Math.min((scrollSpeed - 0.3) * 15, 12) : 0;

    // Smooth FOV (base + warp)
    const targetFov = fov + warpFov;
    currentFov.current += (targetFov - currentFov.current) * Math.min(dt * 3, 1);

    // Apply to camera
    camera.position.copy(springPos.current);
    camera.lookAt(springLook.current);
    (camera as THREE.PerspectiveCamera).fov = currentFov.current;
    (camera as THREE.PerspectiveCamera).updateProjectionMatrix();
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
