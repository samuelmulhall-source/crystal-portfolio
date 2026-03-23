"use client";

/**
 * VoidScene — orchestrator that composes all scene components.
 *
 * Replaces the monolithic VoidScene function from VoidBackground.tsx.
 * Provides VoidContext for shared isMobile/layers config.
 */

import React, { Suspense, useRef } from "react";
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
import { VoidContext, LAYERS_DESKTOP } from "./VoidContext";

// Re-export for backward compatibility
export { VoidContext };

const LAYERS_MOBILE = [
  { count: 600, rMin: 14, rMax: 30, rotSpd: 0.008, size: 0.24, seed: 11111 },
  { count: 500, rMin: 26, rMax: 44, rotSpd: 0.012, size: 0.30, seed: 22222 },
  { count: 350, rMin: 36, rMax: 58, rotSpd: 0.018, size: 0.36, seed: 33333 },
] as const;

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
      <DustParticles />

      <CameraRig />
      <ExpandedViewer />
      <VoidMotion />

      {/* Skip hover system on mobile — no mouse cursor */}
      {!isMobile && <StarHoverSystem pts={[pts0, pts1, pts2]} />}
      <ShootingStars />

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
