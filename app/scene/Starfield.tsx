"use client";

/**
 * Starfield — 3 layers of star points with hyperspeed motion blur.
 *
 * Camera-relative forward travel: stars exist in a cylinder volume along the
 * camera path. Stars that fall behind the camera are recycled ahead.
 *
 * During transit between weapon stations, stars streak into hyperspeed lines
 * (velocity written per-frame from camera delta). At stations, stars settle
 * to clean dots for a clear "lock-in" presentation feel.
 */

import React, { useRef, useMemo, useEffect, useContext } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { VoidContext } from "./VoidScene";
import { makeHoloStarMat } from "./starShader";
import { sr } from "../lib/seededRandom";
import { voidState } from "../lib/voidState";

// ─── Spectral star color classes (Harvard classification) ──────────────────
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
const HALF_DEPTH = 80;
const BEHIND_MARGIN = 12;
const AHEAD_DIST = HALF_DEPTH * 2 - BEHIND_MARGIN;
const SPREAD = 30;

function buildStarGeo(count: number, rMin: number, rMax: number, seed: number, hasVelocity: boolean) {
  const pos = new Float32Array(count * 3);
  const col = buildStarColors(count, seed);
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const rFrac = sr(seed + i * 7 + 3);
    const r = Math.sqrt(rMin * rMin + rFrac * (rMax * rMax - rMin * rMin));
    const theta = sr(seed + i * 7 + 2) * Math.PI * 2;
    pos[i * 3]     = r * Math.cos(theta);
    pos[i * 3 + 1] = r * Math.sin(theta);
    pos[i * 3 + 2] = 14 - HALF_DEPTH + sr(seed + i * 7 + 0) * HALF_DEPTH * 2;
    seeds[i] = sr(seed + i * 7 + 6);
  }
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

  const mat = useMemo(() => makeHoloStarMat(hasVel), [hasVel]);
  useEffect(() => () => mat.dispose(), [mat]);

  // Recycling + camera tracking state
  const recycleOffset = useRef(0);
  const lastCamPos = useRef(new THREE.Vector3(0, 0, 14));
  const isFirstFrame = useRef(true);
  // Smoothed streak intensity for buttery transitions
  const smoothStreak = useRef(0);

  useFrame((s, dt) => {
    if (!pointsRef.current) return;

    const cam = s.camera.position;
    const { isMobile } = ctx;
    const posAttr = pointsRef.current.geometry.getAttribute("position") as THREE.BufferAttribute;
    const posArr = posAttr.array as Float32Array;

    // ── Compute camera velocity for hyperspeed streaking ────────────────
    const camDx = cam.x - lastCamPos.current.x;
    const camDy = cam.y - lastCamPos.current.y;
    const camDz = cam.z - lastCamPos.current.z;
    const camSpeedFrame = Math.sqrt(camDx * camDx + camDy * camDy + camDz * camDz);
    const camDeltaZ = Math.abs(camDz);

    // Transit factor from voidState (0 at station, 1 during transit)
    const transit = voidState.transitFactor;
    const travelSpeed = Math.min(Math.max((voidState.cameraSpeed - 0.6) / 7.0, 0), 1);
    const scrollBoost = Math.min(Math.abs(voidState.scrollVel) * 10.0, 1.0);
    const targetStreak = Math.pow(transit, 0.7) * Math.max(travelSpeed, scrollBoost * 0.75);
    // Smooth transition: fast ramp-up (warp engage), slower settle (station lock-in)
    const rampSpeed = targetStreak > smoothStreak.current ? 8.0 : 3.0;
    smoothStreak.current += (targetStreak - smoothStreak.current) * Math.min(dt * rampSpeed, 1);

    // ── Write uniforms ──────────────────────────────────────────────────
    // eslint-disable-next-line react-hooks/immutability -- Three.js uniforms must be set per-frame
    mat.uniforms.uOpacity.value = 0.90;
    mat.uniforms.uSize.value    = cfg.size;
    mat.uniforms.uVH.value = s.gl.domElement.height * 0.5;
    mat.uniforms.uTime.value = s.clock.elapsedTime;
    if (hasVel) {
      mat.uniforms.uStreak.value = smoothStreak.current;
    }

    const rMin2 = cfg.rMin * cfg.rMin;
    const rRange2 = cfg.rMax * cfg.rMax - rMin2;

    // ── Write velocity into aVelocity for motion blur (layers 0,1 only) ──
    if (hasVel && camSpeedFrame > 0.0001) {
      const velAttr = pointsRef.current.geometry.getAttribute("aVelocity") as THREE.BufferAttribute;
      const velArr = velAttr.array as Float32Array;

      const invDt = 1 / Math.max(dt, 0.001);
      const camVX = -camDx * invDt;
      const camVY = -camDy * invDt;
      const camVZ = -camDz * invDt;
      const velMag = Math.sqrt(camVX * camVX + camVY * camVY + camVZ * camVZ);
      const safeVelMag = Math.max(velMag, 0.0001);
      const velScale = Math.min(velMag * (0.22 + smoothStreak.current * 0.9), 28);
      const vx = (camVX / safeVelMag) * velScale;
      const vy = (camVY / safeVelMag) * velScale;
      const vz = (camVZ / safeVelMag) * velScale;

      // Write same velocity to all stars (projection handles radial spread)
      for (let i = 0; i < cfg.count; i++) {
        velArr[i * 3]     = vx;
        velArr[i * 3 + 1] = vy;
        velArr[i * 3 + 2] = vz;
      }
      velAttr.needsUpdate = true;
    } else if (hasVel) {
      // No camera movement — zero out velocities for clean dots
      const velAttr = pointsRef.current.geometry.getAttribute("aVelocity") as THREE.BufferAttribute;
      const velArr = velAttr.array as Float32Array;
      // Only zero out if streak is still significant (avoid unnecessary writes)
      if (smoothStreak.current > 0.01) {
        for (let i = 0; i < cfg.count; i++) {
          velArr[i * 3] = 0;
          velArr[i * 3 + 1] = 0;
          velArr[i * 3 + 2] = 0;
        }
        velAttr.needsUpdate = true;
      }
    }

    // ── (A) First-frame pre-warm: redistribute ALL stars around camera ──
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
      lastCamPos.current.copy(cam);
      return;
    }

    // ── Emergency full sweep (camera jump > 10 units) ────────────────────
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
      lastCamPos.current.copy(cam);
      return;
    }

    // ── Normal budgeted recycling ────────────────────────────────────────
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

      if (starZ > behindZ || starZ < aheadZ - BEHIND_MARGIN) {
        const r = Math.sqrt(rMin2 + Math.random() * rRange2);
        const theta = Math.random() * Math.PI * 2;
        posArr[i * 3]     = cam.x + r * Math.cos(theta);
        posArr[i * 3 + 1] = cam.y + r * Math.sin(theta);
        posArr[iz] = cam.z - AHEAD_DIST + Math.random() * SPREAD;
        dirty = true;
      }
    }
    if (dirty) posAttr.needsUpdate = true;

    lastCamPos.current.copy(cam);
  });

  return (
    <points ref={pointsRef} renderOrder={-1} frustumCulled={false}>
      <primitive object={geo} attach="geometry" />
      <primitive object={mat} attach="material" />
    </points>
  );
}
