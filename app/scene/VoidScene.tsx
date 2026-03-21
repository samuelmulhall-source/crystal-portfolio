"use client";

/**
 * VoidScene — orchestrator that composes all scene components.
 *
 * Replaces the monolithic VoidScene function from VoidBackground.tsx.
 * Provides VoidContext for shared isMobile/layers config.
 */

import React, { createContext, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { loadGate } from "../lib/loadingOrchestrator";
import Lighting from "./Lighting";
import { StarLayer } from "./Starfield";
import DustParticles from "./DustParticles";
import CameraRig, { VoidMotion } from "./CameraRig";
import ExpandedViewer from "./ExpandedViewer";
import ShootingStars from "./ShootingStars";
import WeaponStations from "./WeaponStations";

// ─── Star layer config ─────────────────────────────────────────────────────
// Radii enlarged + stars offset to Z=-55 to cover the full Z-forward corridor
// (camera travels z=14 to z=-130). Rotation speeds kept subtle.
type LayerConfig = readonly { count: number; rMin: number; rMax: number; size: number; seed: number }[];

// Cylinder radii — stars distributed in annular rings around the camera path (Z axis)
const LAYERS_DESKTOP = [
  { count: 2400, rMin: 18, rMax: 55, size: 0.18, seed: 11111 },
  { count: 1800, rMin: 35, rMax: 70, size: 0.22, seed: 22222 },
  { count: 1200, rMin: 50, rMax: 90, size: 0.26, seed: 33333 },
] as const;
const LAYERS_MOBILE = [
  { count: 600, rMin: 18, rMax: 55, size: 0.20, seed: 11111 },
  { count: 450, rMin: 35, rMax: 70, size: 0.24, seed: 22222 },
  { count: 300, rMin: 50, rMax: 90, size: 0.28, seed: 33333 },
] as const;

export const VoidContext = createContext<{ isMobile: boolean; layers: LayerConfig }>({
  isMobile: false,
  layers: LAYERS_DESKTOP,
});

/**
 * SceneReady — signals that the scene has rendered at least one frame.
 * Sets voidState.firstModelReady as a fallback after the scene mounts,
 * ensuring the loading terminal dismisses even before weapon models load.
 */
function SceneReady() {
  const frameCount = useRef(0);
  useFrame(() => {
    if (frameCount.current < 5) {
      frameCount.current++;
      if (frameCount.current === 5) {
        loadGate.markSceneWarmed();
      }
    }
  });
  return null;
}

export default function VoidScene({ isMobile }: { isMobile: boolean }) {
  const pts0 = useRef<THREE.Points | null>(null);
  const pts1 = useRef<THREE.Points | null>(null);
  const pts2 = useRef<THREE.Points | null>(null);

  const layers = isMobile ? LAYERS_MOBILE : LAYERS_DESKTOP;

  return (
    <VoidContext.Provider value={{ isMobile, layers }}>
      <SceneReady />
      <Lighting />

      <StarLayer li={0} pointsRef={pts0} />
      <StarLayer li={1} pointsRef={pts1} />
      <StarLayer li={2} pointsRef={pts2} />
      {/* Skip dust + shooting stars on mobile for performance */}
      {!isMobile && <DustParticles />}

      <CameraRig />
      <ExpandedViewer />
      <VoidMotion />

      {!isMobile && <ShootingStars />}

      <WeaponStations />
    </VoidContext.Provider>
  );
}
