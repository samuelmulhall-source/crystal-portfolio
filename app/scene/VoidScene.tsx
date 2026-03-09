"use client";

/**
 * VoidScene — orchestrator that composes all scene components.
 *
 * Replaces the monolithic VoidScene function from VoidBackground.tsx.
 * Provides VoidContext for shared isMobile/layers config.
 */

import React, { createContext, useRef } from "react";
import * as THREE from "three";
import Lighting from "./Lighting";
import { StarLayer } from "./Starfield";
import DustParticles from "./DustParticles";
import CameraRig, { VoidMotion } from "./CameraRig";
import ExpandedViewer from "./ExpandedViewer";
import StarHoverSystem from "./StarHoverSystem";
import ShootingStars from "./ShootingStars";
import WeaponStations from "./WeaponStations";
import PostPipeline from "./postprocessing/PostPipeline";

// ─── Star layer config ─────────────────────────────────────────────────────
type LayerConfig = readonly { count: number; rMin: number; rMax: number; rotSpd: number; size: number; seed: number }[];

const LAYERS_DESKTOP = [
  { count: 1800, rMin: 14, rMax: 30, rotSpd: 0.007, size: 0.22, seed: 11111 },
  { count: 1400, rMin: 26, rMax: 44, rotSpd: 0.011, size: 0.28, seed: 22222 },
  { count:  900, rMin: 36, rMax: 58, rotSpd: 0.017, size: 0.36, seed: 33333 },
] as const;
const LAYERS_MOBILE = [
  { count: 600, rMin: 14, rMax: 30, rotSpd: 0.008, size: 0.24, seed: 11111 },
  { count: 500, rMin: 26, rMax: 44, rotSpd: 0.012, size: 0.30, seed: 22222 },
  { count: 350, rMin: 36, rMax: 58, rotSpd: 0.018, size: 0.36, seed: 33333 },
] as const;

export const VoidContext = createContext<{ isMobile: boolean; layers: LayerConfig }>({
  isMobile: false,
  layers: LAYERS_DESKTOP,
});

export default function VoidScene({ isMobile }: { isMobile: boolean }) {
  const pts0 = useRef<THREE.Points | null>(null);
  const pts1 = useRef<THREE.Points | null>(null);
  const pts2 = useRef<THREE.Points | null>(null);

  const layers = isMobile ? LAYERS_MOBILE : LAYERS_DESKTOP;

  return (
    <VoidContext.Provider value={{ isMobile, layers }}>
      <Lighting />

      <StarLayer li={0} pointsRef={pts0} />
      <StarLayer li={1} pointsRef={pts1} />
      <StarLayer li={2} pointsRef={pts2} />
      <DustParticles />

      <CameraRig />
      <ExpandedViewer />
      <VoidMotion />

      {/* Skip hover system on mobile — no mouse cursor */}
      {!isMobile && <StarHoverSystem pts={[pts0, pts1, pts2]} />}
      <ShootingStars pts={[pts0, pts1, pts2]} />

      <WeaponStations />

      {/* Post-processing pipeline: bloom, grain, chromatic aberration, vignette */}
      <PostPipeline />
    </VoidContext.Provider>
  );
}
