"use client";

/**
 * Starfield — 3 layers of star points with motion blur, scroll-boost rotation,
 * and Milky Way band clustering.
 *
 * Uses GLSL ShaderMaterial for point sprites with velocity motion blur.
 */

import React, { useRef, useMemo, useEffect, useContext } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { voidState } from "../lib/voidState";
import { VoidContext } from "./VoidScene";
import { makeHoloStarMat } from "./starShader";
import { sr } from "../lib/seededRandom";

// ─── Star color builder ────────────────────────────────────────────────────
export function buildStarColors(count: number, seed: number): Float32Array {
  const col = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const br   = 0.45 + sr(seed + i * 7 + 4) * 0.55;
    const cool = sr(seed + i * 7 + 5) > 0.55;
    col[i * 3]     = br * (cool ? 0.68 : 1.00);
    col[i * 3 + 1] = br * (cool ? 0.88 : 1.00);
    col[i * 3 + 2] = br;
  }
  return col;
}

// Galactic tilt angle for the Milky Way band (radians)
const MW_TILT = Math.PI * 0.38;

export function buildStarPositions(count: number, rMin: number, rMax: number, seed: number): Float32Array {
  const pos = new Float32Array(count * 3);
  const sinT = Math.sin(MW_TILT), cosT = Math.cos(MW_TILT);

  for (let i = 0; i < count; i++) {
    const rng  = sr(seed + i * 7 + 0);
    const isMW = rng < 0.38;

    let x, y, z;
    if (isMW) {
      const theta = sr(seed + i * 7 + 1) * Math.PI * 2;
      const rawPhi = 0.5 + (sr(seed + i * 7 + 2) - 0.5) * 0.42;
      const phi    = rawPhi * Math.PI;
      const r      = rMin + sr(seed + i * 7 + 3) * (rMax - rMin);
      const ex = r * Math.sin(phi) * Math.cos(theta);
      const ey = r * Math.sin(phi) * Math.sin(theta);
      const ez = r * Math.cos(phi);
      x = ex * cosT - ey * sinT;
      y = ex * sinT + ey * cosT;
      z = ez;
    } else {
      const theta = sr(seed + i * 7 + 1) * Math.PI * 2;
      const phi   = Math.acos(2 * sr(seed + i * 7 + 2) - 1);
      const r     = rMin + sr(seed + i * 7 + 3) * (rMax - rMin);
      x = r * Math.sin(phi) * Math.cos(theta);
      y = r * Math.sin(phi) * Math.sin(theta);
      z = r * Math.cos(phi);
    }
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
  }
  return pos;
}

function buildStarGeo(count: number, rMin: number, rMax: number, seed: number, hasVelocity: boolean) {
  const pos = buildStarPositions(count, rMin, rMax, seed);
  const col = buildStarColors(count, seed);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("color",    new THREE.BufferAttribute(col, 3));
  if (hasVelocity) {
    const vel = new Float32Array(count * 3);
    g.setAttribute("aVelocity", new THREE.BufferAttribute(vel, 3));
  }
  return g;
}

// ─── Star layer component ─────────────────────────────────────────────────
export function StarLayer({
  li,
  pointsRef,
}: {
  li: 0 | 1 | 2;
  pointsRef: React.RefObject<THREE.Points | null>;
}) {
  const { layers } = useContext(VoidContext);
  const cfg    = layers[li];
  const hasVel = li < 2;
  const geo    = useMemo(() => buildStarGeo(cfg.count, cfg.rMin, cfg.rMax, cfg.seed, hasVel), [cfg, hasVel]);

  // GLSL ShaderMaterial
  const mat = useMemo(() => makeHoloStarMat(hasVel), [hasVel]);

  useEffect(() => () => mat.dispose(), [mat]);

  useFrame((s) => {
    if (!pointsRef.current) return;
    const dt = s.clock.getDelta() || 0.016;
    const scrollBoost = 1 + Math.min(Math.abs(voidState.scrollVel) * 4, 3);
    pointsRef.current.rotation.y += dt * cfg.rotSpd * scrollBoost;
    pointsRef.current.rotation.x += dt * cfg.rotSpd * 0.32 * scrollBoost;

    const dim = 1 - voidState.scrollProgress * 0.12;
    mat.uniforms.uOpacity.value = 0.90 * dim;
    mat.uniforms.uSize.value    = cfg.size;
    mat.uniforms.uVH.value = (s.gl.domElement).height * 0.5;
  });

  return (
    <points ref={pointsRef} renderOrder={-1} frustumCulled={false}>
      <primitive object={geo} attach="geometry" />
      <primitive object={mat} attach="material" />
    </points>
  );
}
