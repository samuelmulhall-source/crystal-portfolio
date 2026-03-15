"use client";

/**
 * Scene lighting — all lights + Environment IBL + interactive lights.
 *
 * Extracted from VoidBackground.tsx lines 278-314 + VoidScene lights (1587-1607).
 */

import { Suspense, useContext, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Environment } from "@react-three/drei";
import * as THREE from "three";
import { voidState } from "../lib/voidState";
import { VoidContext } from "./VoidScene";

/** Pulsing void core point light at world origin */
function VoidCore() {
  const ref = useRef<THREE.PointLight>(null);
  useFrame((s) => {
    if (ref.current)
      ref.current.intensity = 0.9 + 0.4 * Math.sin(s.clock.elapsedTime * 0.55);
  });
  return (
    <pointLight ref={ref} position={[0, 0, 0]} color="#88d8ff" intensity={0.9} distance={22} />
  );
}

/** Mouse-following rim light — warm-white, tracks voidState.mouseNX/Y */
function MouseLight() {
  const ref = useRef<THREE.PointLight>(null);
  const lx  = useRef(0);
  const ly  = useRef(0);

  useFrame((_, dt) => {
    if (!ref.current) return;
    const f    = Math.min(dt * 60, 6);
    const lerp = Math.min(0.055 * f, 1);
    lx.current += (voidState.mouseNX * 9  - lx.current) * lerp;
    ly.current += (-voidState.mouseNY * 6 - ly.current) * lerp;
    ref.current.position.set(lx.current, ly.current, 7);
  });

  return (
    <pointLight ref={ref} color="#ffeedd" intensity={1.1} distance={20} />
  );
}

/** All scene lights composed together */
export default function Lighting() {
  const { isMobile } = useContext(VoidContext);
  return (
    <>
      <color attach="background" args={["#000005"]} />

      {/* Neutral studio lighting for PBR models on dark void background */}
      <ambientLight intensity={0.40} color="#e0e0e0" />
      {/* Hemisphere: sky-ice above, dark blue-void below */}
      <hemisphereLight args={["#b8d0ff", "#1a2035", 0.85]} />
      {/* Under-fill: soft blue from below-front (skip on mobile) */}
      {!isMobile && <directionalLight position={[0, -8, 4]} intensity={0.55} color="#8aa8d0" />}
      {/* Key light: upper-left */}
      <directionalLight position={[-4, 10, 7]}  intensity={2.2} color="#ffffff" />
      {/* Fill: opposite side */}
      <directionalLight position={[ 5,  3,  5]}  intensity={1.8} color="#f8f8f8" />
      {/* Front fill: camera-aligned */}
      <directionalLight position={[ 0,  2, 12]}  intensity={2.2} color="#f4f4f4" />
      {/* Rim/back: cool blue-grey edge separation (skip on mobile) */}
      {!isMobile && <directionalLight position={[ 0, -4, -10]} intensity={0.9} color="#b0c8e0" />}
      {/* Overhead kicker (skip on mobile) */}
      {!isMobile && <directionalLight position={[ 0, 12,  2]}  intensity={0.8} color="#f0f0f0" />}
      {/* Camera-adjacent point */}
      <pointLight position={[0, 0, 5]} intensity={2.5} color="#ffffff" distance={22} />
      {/* IBL: studio preset — Suspense boundary prevents R3F Canvas Block */}
      <Suspense fallback={null}>
        <Environment preset="studio" environmentIntensity={1.1} />
      </Suspense>

      {/* Animated lights: skip on mobile (no mouse, saves 2 useFrame callbacks) */}
      {!isMobile && <VoidCore />}
      {!isMobile && <MouseLight />}
    </>
  );
}
