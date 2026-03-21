"use client";

/**
 * CameraRig — deterministic scroll camera.
 *
 * There is no inertia-based drift anymore. The camera is either:
 * - in transit, moving through space
 * - hard-locked on a station shot
 */

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { voidState } from "../lib/voidState";
import { workModels } from "../lib/workModels";
import { getCamera } from "./cameraSpline";
import { STATIONS, getJourneyPhase } from "../lib/journeyConfig";

const MAX_PARALLAX_X = 0.45;
const MAX_PARALLAX_Y = 0.28;

export default function CameraRig() {
  const wasExpandedRef = useRef(false);
  const lastCameraPos = useRef(new THREE.Vector3(0, 0, 14));
  const currentFov = useRef(48);
  const _targetPos = useMemo(() => new THREE.Vector3(), []);
  const _targetLook = useMemo(() => new THREE.Vector3(), []);

  useFrame((state, dt) => {
    const camera = state.camera as THREE.PerspectiveCamera;

    if (workModels.expandedModelId) {
      wasExpandedRef.current = true;
      return;
    }

    const phase = getJourneyPhase(voidState.scrollProgress);
    const { position, lookAt, fov } = getCamera(voidState.scrollProgress);

    voidState.cameraProgress = voidState.scrollProgress;
    voidState.journeyMode = phase.mode;
    voidState.activeStationIndex = phase.mode === "station" ? phase.stationIndex : -1;
    voidState.focusedStationIndex = phase.mode === "station" ? phase.stationIndex : -1;
    voidState.transitFactor = phase.mode === "transit" ? 1 : 0;

    for (let i = 0; i < STATIONS.length; i++) {
      const active = phase.mode === "station" && phase.stationIndex === i ? 1 : 0;
      voidState.stationProximity[i] = active;
      voidState.stationFocus[i] = active;
    }

    const parallaxScale = phase.mode === "hero" ? 0.45 : phase.mode === "transit" ? 0.12 : 0;
    const px = voidState.mouseNX * MAX_PARALLAX_X * parallaxScale;
    const py = -voidState.mouseNY * MAX_PARALLAX_Y * parallaxScale;

    _targetPos.copy(position).add(new THREE.Vector3(px, py, 0));
    _targetLook.copy(lookAt);

    if (voidState.snapCamera || wasExpandedRef.current || phase.mode === "station") {
      voidState.snapCamera = false;
      wasExpandedRef.current = false;
      camera.position.copy(_targetPos);
      camera.lookAt(_targetLook);
      currentFov.current = fov;
    } else {
      const travelLerp = Math.min(dt * 14, 1);
      camera.position.lerp(_targetPos, travelLerp);
      currentFov.current += (fov - currentFov.current) * Math.min(dt * 10, 1);
      camera.lookAt(_targetLook);
    }

    camera.fov = currentFov.current;
    camera.updateProjectionMatrix();

    voidState.cameraSpeed = lastCameraPos.current.distanceTo(camera.position) / Math.max(dt, 0.001);
    lastCameraPos.current.copy(camera.position);
  });

  return null;
}

export function VoidMotion() {
  useFrame((_, dt) => {
    voidState.ready = true;
    const f = Math.min(dt * 60, 6);
    voidState.mouseVel *= Math.pow(0.88, f);
    voidState.scrollVel *= Math.pow(0.90, f);
  });
  return null;
}
