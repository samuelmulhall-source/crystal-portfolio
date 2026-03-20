"use client";

/**
 * Starfield — 3 layers of star points with motion blur and twinkle.
 *
 * Camera-relative forward travel: stars exist in a cylinder volume along the
 * camera path. Stars that fall behind the camera are recycled ahead.
 * No rotation — camera movement creates natural parallax streaming.
 */

import React, { useRef, useMemo, useEffect, useContext } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { voidState } from "../lib/voidState";
import { VoidContext } from "./VoidScene";
import { makeHoloStarMat } from "./starShader";
import { sr } from "../lib/seededRandom";

// ─── Spectral star color classes (Harvard classification) ──────────────────
// Cumulative probability thresholds for spectral class selection.
// Distribution weighted toward mid-range stars for natural appearance.
const SPECTRAL_CLASSES: readonly { p: number; r: number; g: number; b: number }[] = [
  { p: 0.10, r: 0.70, g: 0.85, b: 1.00 }, // O/B — bright blue-white  (10%)
  { p: 0.25, r: 1.00, g: 1.00, b: 1.00 }, // A   — pure white         (15%)
  { p: 0.65, r: 1.00, g: 0.95, b: 0.85 }, // F/G — warm white         (40%)
  { p: 0.90, r: 1.00, g: 0.82, b: 0.62 }, // K   — warm amber         (25%)
  { p: 1.01, r: 1.00, g: 0.65, b: 0.45 }, // M   — cool red-orange    (10%)
];

export function buildStarColors(count: number, seed: number): Float32Array {
  const col = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const br = 0.45 + sr(seed + i * 7 + 4) * 0.55;
    const classRng = sr(seed + i * 7 + 5);
    const cls = SPECTRAL_CLASSES.find(c => classRng < c.p) ?? SPECTRAL_CLASSES[2];
    col[i * 3]     = br * cls.r;
    col[i * 3 + 1] = br * cls.g;
    col[i * 3 + 2] = br * cls.b;
  }
  return col;
}

// ─── Cylinder volume distribution ──────────────────────────────────────────
// Stars are scattered in a cylinder around the camera path (Z axis).
// HALF_DEPTH controls how far ahead/behind the camera stars extend.
// BEHIND_MARGIN controls the recycling threshold behind the camera.
const HALF_DEPTH = 80;       // half the cylinder length along Z
const BEHIND_MARGIN = 12;    // recycle stars this far behind camera
const AHEAD_DIST = HALF_DEPTH * 2 - BEHIND_MARGIN; // how far ahead to place recycled stars
const SPREAD = 30;           // random Z spread when recycling

function buildCylinderPositions(
  count: number, rMin: number, rMax: number, seed: number, camZ: number,
): Float32Array {
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    // Radial position in annular ring [rMin, rMax] with volume-correct distribution
    const rFrac = sr(seed + i * 7 + 3);
    const r = Math.sqrt(rMin * rMin + rFrac * (rMax * rMax - rMin * rMin));
    const theta = sr(seed + i * 7 + 2) * Math.PI * 2;

    pos[i * 3]     = r * Math.cos(theta);     // X
    pos[i * 3 + 1] = r * Math.sin(theta);     // Y (radial, not gravity-aligned)
    // Z: distributed around camera position
    pos[i * 3 + 2] = camZ - HALF_DEPTH + sr(seed + i * 7 + 0) * HALF_DEPTH * 2;
  }
  return pos;
}

function buildStarGeo(count: number, rMin: number, rMax: number, seed: number, hasVelocity: boolean) {
  // Initial positions centered around z=14 (camera start)
  const pos = buildCylinderPositions(count, rMin, rMax, seed, 14);
  const col = buildStarColors(count, seed);
  // Per-star twinkle seed — random phase offset for asynchronous brightness pulsing
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) seeds[i] = sr(seed + i * 7 + 6);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position",  new THREE.BufferAttribute(pos,   3));
  g.setAttribute("color",     new THREE.BufferAttribute(col,   3));
  g.setAttribute("aSeed",     new THREE.BufferAttribute(seeds, 1));
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
  const ctx = useContext(VoidContext);
  const { layers } = ctx;
  const cfg    = layers[li];
  const hasVel = li < 2;
  const geo    = useMemo(() => buildStarGeo(cfg.count, cfg.rMin, cfg.rMax, cfg.seed, hasVel), [cfg, hasVel]);

  // GLSL ShaderMaterial
  const mat = useMemo(() => makeHoloStarMat(hasVel), [hasVel]);

  useEffect(() => () => mat.dispose(), [mat]);

  // Recycling state
  const recycleOffset = useRef(0);
  const lastCamZ = useRef(14); // camera starts at z=14
  const isFirstFrame = useRef(true);

  useFrame((s) => {
    if (!pointsRef.current) return;

    // Consistent opacity throughout the journey
    mat.uniforms.uOpacity.value = 0.90;
    mat.uniforms.uSize.value    = cfg.size;
    mat.uniforms.uVH.value = (s.gl.domElement).height * 0.5;
    mat.uniforms.uTime.value = s.clock.elapsedTime;

    const cam = s.camera.position;
    const { isMobile } = ctx;
    const posAttr = pointsRef.current.geometry.getAttribute("position") as THREE.BufferAttribute;
    const posArr = posAttr.array as Float32Array;

    // Pre-compute squared radii for volume-corrected distribution
    const rMin2 = cfg.rMin * cfg.rMin;
    const rRange2 = cfg.rMax * cfg.rMax - rMin2;

    // ── (A) First-frame pre-warm: redistribute ALL stars around camera ──────
    if (isFirstFrame.current) {
      isFirstFrame.current = false;
      for (let i = 0; i < cfg.count; i++) {
        const r = Math.sqrt(rMin2 + Math.random() * rRange2);
        const theta = Math.random() * Math.PI * 2;
        posArr[i * 3]     = cam.x + r * Math.cos(theta);
        posArr[i * 3 + 1] = cam.y + r * Math.sin(theta);
        posArr[i * 3 + 2] = cam.z - HALF_DEPTH + Math.random() * HALF_DEPTH * 2;
      }
      posAttr.needsUpdate = true;
      lastCamZ.current = cam.z;
      return;
    }

    // ── Dynamic star recycling ──────────────────────────────────────────────
    const camDeltaZ = Math.abs(cam.z - lastCamZ.current);
    lastCamZ.current = cam.z;

    // Emergency full sweep: if camera jumped > 10 units (HUD click, snap),
    // redistribute ALL stars immediately.
    if (camDeltaZ > 10) {
      for (let i = 0; i < cfg.count; i++) {
        const r = Math.sqrt(rMin2 + Math.random() * rRange2);
        const theta = Math.random() * Math.PI * 2;
        posArr[i * 3]     = cam.x + r * Math.cos(theta);
        posArr[i * 3 + 1] = cam.y + r * Math.sin(theta);
        posArr[i * 3 + 2] = cam.z - HALF_DEPTH + Math.random() * HALF_DEPTH * 2;
      }
      posAttr.needsUpdate = true;
      recycleOffset.current = 0;
      return;
    }

    // Normal budgeted recycling for smooth scrolling
    const urgency = Math.min(camDeltaZ / 2, 3);
    const BUDGET = Math.round(
      (isMobile ? 200 : 500) * (1 + urgency * 2),
    );

    const start = recycleOffset.current;
    const end = Math.min(start + BUDGET, cfg.count);
    recycleOffset.current = end >= cfg.count ? 0 : end;

    let dirty = false;
    const behindZ = cam.z + BEHIND_MARGIN;
    const aheadZ = cam.z - HALF_DEPTH;

    for (let i = start; i < end; i++) {
      const iz = i * 3 + 2;
      const starZ = posArr[iz];

      // Recycle if star is behind camera or too far ahead
      if (starZ > behindZ || starZ < aheadZ - BEHIND_MARGIN) {
        const r = Math.sqrt(rMin2 + Math.random() * rRange2);
        const theta = Math.random() * Math.PI * 2;
        posArr[i * 3]     = cam.x + r * Math.cos(theta);
        posArr[i * 3 + 1] = cam.y + r * Math.sin(theta);
        // Place ahead of camera with some random spread
        posArr[iz] = cam.z - AHEAD_DIST + Math.random() * SPREAD;
        dirty = true;
      }
    }
    if (dirty) posAttr.needsUpdate = true;
  });

  return (
    <points ref={pointsRef} renderOrder={-1} frustumCulled={false}>
      <primitive object={geo} attach="geometry" />
      <primitive object={mat} attach="material" />
    </points>
  );
}
