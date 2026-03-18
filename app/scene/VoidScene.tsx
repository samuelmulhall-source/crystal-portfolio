"use client";

/**
 * VoidScene — orchestrator that composes all scene components.
 *
 * Replaces the monolithic VoidScene function from VoidBackground.tsx.
 * Provides VoidContext for shared isMobile/layers config.
 */

import React, { Suspense, createContext, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { voidState } from "../lib/voidState";
import Lighting from "./Lighting";
import { StarLayer } from "./Starfield";
import DustParticles from "./DustParticles";
import CameraRig, { VoidMotion } from "./CameraRig";
import ExpandedViewer from "./ExpandedViewer";
import StarHoverSystem from "./StarHoverSystem";
import ShootingStars from "./ShootingStars";
import WeaponStations from "./WeaponStations";
import StationInfo from "./hud/StationInfo";
import { STATIONS } from "../lib/journeyConfig";

// ─── Star layer config ─────────────────────────────────────────────────────
// Radii enlarged + stars offset to Z=-55 to cover the full Z-forward corridor
// (camera travels z=14 to z=-130). Rotation speeds kept subtle.
type LayerConfig = readonly { count: number; rMin: number; rMax: number; rotSpd: number; size: number; seed: number }[];

// Spherical shell radii — stars distributed around origin, dynamically recycled to follow camera
const LAYERS_DESKTOP = [
  { count: 2400, rMin: 18, rMax: 55, rotSpd: 0.005, size: 0.18, seed: 11111 },
  { count: 1800, rMin: 35, rMax: 70, rotSpd: 0.008, size: 0.22, seed: 22222 },
  { count: 1200, rMin: 50, rMax: 90, rotSpd: 0.012, size: 0.26, seed: 33333 },
] as const;
const LAYERS_MOBILE = [
  { count: 600, rMin: 18, rMax: 55, rotSpd: 0.006, size: 0.20, seed: 11111 },
  { count: 450, rMin: 35, rMax: 70, rotSpd: 0.009, size: 0.24, seed: 22222 },
  { count: 300, rMin: 50, rMax: 90, rotSpd: 0.013, size: 0.28, seed: 33333 },
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
  const signalled = useRef(false);
  useFrame(() => {
    if (!signalled.current) {
      signalled.current = true;
      // Signal ready after a short delay to let starfield render a few frames
      setTimeout(() => {
        voidState.firstModelReady = true;
      }, 600);
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

      {/* Skip hover system on mobile — no mouse cursor */}
      {!isMobile && <StarHoverSystem pts={[pts0, pts1, pts2]} />}
      {!isMobile && <ShootingStars pts={[pts0, pts1, pts2]} />}

      <WeaponStations />

      {/* In-world HUD: floating labels + scan lines per station (Suspense for font loading) */}
      {!isMobile && (
        <Suspense fallback={null}>
          {STATIONS.map((station, i) => (
            <StationInfo key={station.id} station={station} stationIndex={i} />
          ))}
        </Suspense>
      )}
    </VoidContext.Provider>
  );
}
