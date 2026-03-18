"use client";

/**
 * Starfield — 3 layers of star points with motion blur, scroll-boost rotation,
 * and Milky Way band clustering.
 *
 * Rotation is applied in the vertex shader (via uRotY/uRotX uniforms) so that
 * geometry buffer positions remain stable in world space. This is critical for
 * the recycling system which repositions stars near the camera.
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

// Galactic tilt angle for the Milky Way band (radians)
const MW_TILT = Math.PI * 0.38;

export function buildStarPositions(count: number, rMin: number, rMax: number, seed: number): Float32Array {
  const pos = new Float32Array(count * 3);
  const sinT = Math.sin(MW_TILT), cosT = Math.cos(MW_TILT);

  for (let i = 0; i < count; i++) {
    const rng  = sr(seed + i * 7 + 0);
    const isMW = rng < 0.38;

    // Spherical shell distribution (uniform volume)
    const rFrac = sr(seed + i * 7 + 3);
    const r = Math.cbrt(rMin * rMin * rMin + rFrac * (rMax * rMax * rMax - rMin * rMin * rMin));
    const theta = sr(seed + i * 7 + 2) * Math.PI * 2;
    const phi   = Math.acos(2 * sr(seed + i * 7 + 1) - 1);

    let x = r * Math.sin(phi) * Math.cos(theta);
    let y = r * Math.sin(phi) * Math.sin(theta);
    let z = r * Math.cos(phi);

    if (isMW) {
      // Milky Way band: compress Y toward galactic plane, then tilt
      y *= 0.35;
      const rx = x * cosT - y * sinT;
      const ry = x * sinT + y * cosT;
      x = rx;
      y = ry;
    }

    pos[i * 3] = x;
    pos[i * 3 + 1] = y;
    pos[i * 3 + 2] = z;
  }
  return pos;
}

function buildStarGeo(count: number, rMin: number, rMax: number, seed: number, hasVelocity: boolean) {
  const pos = buildStarPositions(count, rMin, rMax, seed);
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

  // Accumulated rotation angles (applied in shader, not on group)
  const rotY = useRef(0);
  const rotX = useRef(0);

  // Recycling state
  const recycleOffset = useRef(0);
  const lastCamPos = useRef(new THREE.Vector3());
  const isFirstFrame = useRef(true);

  useFrame((s, frameDt) => {
    if (!pointsRef.current) return;
    const dt = frameDt || 0.016;
    const scrollBoost = 1 + Math.min(Math.abs(voidState.scrollVel) * 4, 3);

    // Accumulate rotation — applied in shader, NOT on the group transform.
    rotY.current += dt * cfg.rotSpd * scrollBoost;
    rotX.current += dt * cfg.rotSpd * 0.32 * scrollBoost;

    // Consistent opacity throughout the journey
    mat.uniforms.uOpacity.value = 0.90;
    mat.uniforms.uSize.value    = cfg.size;
    mat.uniforms.uVH.value = (s.gl.domElement).height * 0.5;
    mat.uniforms.uTime.value = s.clock.elapsedTime;
    mat.uniforms.uRotY.value = rotY.current;
    mat.uniforms.uRotX.value = rotX.current;
    // Expose rotation angles for StarHoverSystem + ShootingStars
    voidState.starRotY[li] = rotY.current;
    voidState.starRotX[li] = rotX.current;

    const cam = s.camera.position;
    const { isMobile } = ctx;
    const posAttr = pointsRef.current.geometry.getAttribute("position") as THREE.BufferAttribute;
    const posArr = posAttr.array as Float32Array;

    // Pre-compute cube of radii for volume-corrected distribution
    const rMin3 = cfg.rMin * cfg.rMin * cfg.rMin;
    const rRange3 = cfg.rMax * cfg.rMax * cfg.rMax - rMin3;

    // ── Inverse-rotated camera position ────────────────────────────────────
    // The vertex shader rotates buffer positions by (rotY, rotX) around the
    // origin before projecting. For recycling to match visual positions, we
    // need the camera position in "buffer space" — i.e., where the camera
    // sits before the shader rotation is applied. We compute this by applying
    // the INVERSE rotation (−rotX then −rotY) to the camera position.
    const cyR = Math.cos(-rotY.current), syR = Math.sin(-rotY.current);
    const cxR = Math.cos(-rotX.current), sxR = Math.sin(-rotX.current);
    // Inverse X rotation (undo shader's X rotation)
    let irx = cam.x;
    let iry = cxR * cam.y - sxR * cam.z;
    let irz = sxR * cam.y + cxR * cam.z;
    // Inverse Y rotation (undo shader's Y rotation)
    const cx = cyR * irx + syR * irz;
    const cy2 = iry;
    const cz = -syR * irx + cyR * irz;

    // ── (A) First-frame pre-warm: redistribute ALL stars around camera ──────
    if (isFirstFrame.current) {
      isFirstFrame.current = false;
      for (let i = 0; i < cfg.count; i++) {
        const ix = i * 3, iy = i * 3 + 1, iz = i * 3 + 2;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const r = Math.cbrt(rMin3 + Math.random() * rRange3);
        posArr[ix] = cx + r * Math.sin(phi) * Math.cos(theta);
        posArr[iy] = cy2 + r * Math.sin(phi) * Math.sin(theta);
        posArr[iz] = cz + r * Math.cos(phi);
      }
      posAttr.needsUpdate = true;
      lastCamPos.current.set(cx, cy2, cz);
      return;
    }

    // ── Dynamic star recycling ──────────────────────────────────────────────
    const maxDist = cfg.rMax * 1.1;
    const maxDist2 = maxDist * maxDist;
    let dirty = false;

    // Camera movement since last frame
    const camDelta = (cx - lastCamPos.current.x) ** 2 +
                     (cy2 - lastCamPos.current.y) ** 2 +
                     (cz - lastCamPos.current.z) ** 2;
    lastCamPos.current.set(cx, cy2, cz);
    const camDist = Math.sqrt(camDelta);

    // Emergency full sweep: if camera jumped > 10 units (HUD click, snap),
    // redistribute ALL stars immediately — no budget, no partial sweep.
    const behindThresh = cfg.rMax * 0.3;
    if (camDist > 10) {
      for (let i = 0; i < cfg.count; i++) {
        const ix = i * 3, iy = i * 3 + 1, iz = i * 3 + 2;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const r = Math.cbrt(rMin3 + Math.random() * rRange3);
        posArr[ix] = cx + r * Math.sin(phi) * Math.cos(theta);
        posArr[iy] = cy2 + r * Math.sin(phi) * Math.sin(theta);
        posArr[iz] = cz + r * Math.cos(phi);
      }
      posAttr.needsUpdate = true;
      recycleOffset.current = 0;
    } else {
      // Normal budgeted recycling for smooth scrolling
      const urgency = Math.min(camDist / 2, 3);
      const BUDGET = Math.round(
        (isMobile ? 200 : 500) * (1 + urgency * 2),
      );

      const start = recycleOffset.current;
      const end = Math.min(start + BUDGET, cfg.count);
      recycleOffset.current = end >= cfg.count ? 0 : end;

      for (let i = start; i < end; i++) {
        const ix = i * 3, iy = i * 3 + 1, iz = i * 3 + 2;
        const dx = posArr[ix] - cx;
        const dy = posArr[iy] - cy2;
        const dz = posArr[iz] - cz;
        const dist2 = dx * dx + dy * dy + dz * dz;

        if (dist2 > maxDist2) {
          const theta = Math.random() * Math.PI * 2;
          const phi = Math.acos(2 * Math.random() - 1);
          const r = Math.cbrt(rMin3 + Math.random() * rRange3);
          const sx = r * Math.sin(phi) * Math.cos(theta);
          const sy = r * Math.sin(phi) * Math.sin(theta);
          let sz = r * Math.cos(phi);
          if (sz > behindThresh) sz = -sz;
          posArr[ix] = cx + sx;
          posArr[iy] = cy2 + sy;
          posArr[iz] = cz + sz;
          dirty = true;
        }
      }
      if (dirty) posAttr.needsUpdate = true;
    }
  });

  return (
    <points ref={pointsRef} renderOrder={-1} frustumCulled={false}>
      <primitive object={geo} attach="geometry" />
      <primitive object={mat} attach="material" />
    </points>
  );
}
