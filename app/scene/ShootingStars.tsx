"use client";

/**
 * Shooting stars + starfield disruption system.
 *
 * Extracted from VoidBackground.tsx lines 617-1094.
 * Handles: meteor state, traveling point lights, starfield disruption physics,
 * loading orbit animation, model star repulsion, and meteor screen position
 * writes to voidState.meteorSlots.
 */

import React, { useRef, useMemo, useEffect, useContext } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { voidState } from "../lib/voidState";
import { workModels } from "../lib/workModels";
import { VoidContext } from "./VoidScene";
import { buildStarColors } from "./Starfield";
import { sr } from "../lib/seededRandom";

const METEOR_COUNT  = 5;
const TRAIL_LEN     = 2.5;
const TRAIL_POINTS  = 12;

// Reference frustum half-width for speed normalization.
// Computed at hero view: fov=50°, spawn depth≈6, aspect≈1.78
const REF_HALF_W = Math.tan(25 * Math.PI / 180) * 6 * 1.78;

interface MeteorState {
  active:  boolean;
  t:       number;
  maxLife: number;
  px: number; py: number; pz: number;
  dx: number; dy: number; dz: number;
  speed:   number;
  phase:   number;
  trail:   Array<{ x: number; y: number; z: number }>;
  trailHead: number; // ring buffer write index
}

export default function ShootingStars({
  pts,
}: {
  pts: [
    React.RefObject<THREE.Points | null>,
    React.RefObject<THREE.Points | null>,
    React.RefObject<THREE.Points | null>,
  ];
}) {
  const { camera, gl } = useThree();
  const groupRef       = useRef<THREE.Group>(null);
  const nextSpawnRef   = useRef(4 + sr(99999) * 4);
  const loadPhaseRef   = useRef(0);
  const lastActiveRef  = useRef<string | null>(null);
  const lockedLoadY    = useRef<number | null>(null);
  const meteorsRef   = useRef<MeteorState[]>(
    Array.from({ length: METEOR_COUNT }, () => ({
      active: false, t: 0, maxLife: 1.8,
      px: 0, py: 0, pz: 0,
      dx: 1, dy: 0, dz: 0,
      speed: 14, phase: 0,
      trail: Array.from({ length: TRAIL_POINTS }, () => ({ x: 0, y: 0, z: 0 })),
      trailHead: 0,
    }))
  );

  const tmpV  = useMemo(() => new THREE.Vector3(), []);
  const tmpM  = useMemo(() => new THREE.Matrix4(), []);

  const { isMobile, layers } = useContext(VoidContext);
  const disruption = useMemo(() => [
    new Float32Array(layers[0].count),
    new Float32Array(layers[1].count),
  ], [layers]);

  const origColors = useMemo(() => [
    buildStarColors(layers[0].count, layers[0].seed),
    buildStarColors(layers[1].count, layers[1].seed),
    buildStarColors(layers[2].count, layers[2].seed),
  ], [layers]);


  const lights = useMemo(() =>
    Array.from({ length: METEOR_COUNT }, () => new THREE.PointLight("#4488ff", 0, 16)),
  []);

  useEffect(() => {
    const g = groupRef.current;
    if (!g) return;
    lights.forEach((l) => g.add(l));
    return () => lights.forEach((l) => g.remove(l));
  }, [lights]);

  useFrame((state, rawDt) => {
    // Cap dt to prevent meteors teleporting during frame drops (loading, tab switch)
    const dt      = Math.min(rawDt, 0.05);
    const t       = state.clock.elapsedTime;
    const meteors = meteorsRef.current;
    const W       = typeof window !== "undefined" ? window.innerWidth  : 1920;
    const H       = typeof window !== "undefined" ? window.innerHeight : 1080;

    // ── Camera basis vectors (from matrixWorld columns) ──────────────────
    // These define the camera's local coordinate system in world space.
    // Using matrix elements directly avoids Vector3 allocations.
    const mw = camera.matrixWorld.elements;
    const rX = mw[0], rY = mw[1], rZ = mw[2];     // camera right
    const uX = mw[4], uY = mw[5], uZ = mw[6];     // camera up
    const fX = -mw[8], fY = -mw[9], fZ = -mw[10];  // camera forward (into screen)
    const cpx = camera.position.x, cpy = camera.position.y, cpz = camera.position.z;

    const camFov    = (camera as THREE.PerspectiveCamera).fov ?? 50;
    const camAspect = (camera as THREE.PerspectiveCamera).aspect ?? 1.78;

    // Spawn — camera-relative so meteors look consistent at any scroll depth
    const maxActive = isMobile ? 3 : METEOR_COUNT;
    if (t >= nextSpawnRef.current) {
      const burst = 1 + Math.floor(sr(Math.floor(t * 1000) % 99999) * 3);
      let spawned = 0;
      const activeCount = meteors.filter(m => m.active).length;
      for (let m = 0; m < METEOR_COUNT && spawned < burst && activeCount + spawned < maxActive; m++) {
        if (!meteors[m].active) {
          const met  = meteors[m];
          met.active = true;
          met.t      = 0;
          met.phase  = Math.random() * Math.PI * 2;
          met.maxLife = 2.5 + Math.random() * 1.0;

          // Frustum dimensions at spawn depth (in camera space)
          const spawnDepth = 4 + Math.random() * 4;
          const halfH  = Math.tan((camFov / 2) * Math.PI / 180) * spawnDepth;
          const halfW  = halfH * camAspect;

          // Spawn at left edge of frustum, random Y — in camera space
          const offRight = -(halfW * 1.05 + 1.5 + Math.random() * 3.0);
          const offUp    = (-halfH * 0.3) + Math.random() * (halfH * 1.6);

          // Convert to world space: camera pos + depth*forward + offsets
          met.px = cpx + fX * spawnDepth + rX * offRight + uX * offUp;
          met.py = cpy + fY * spawnDepth + rY * offRight + uY * offUp;
          met.pz = cpz + fZ * spawnDepth + rZ * offRight + uZ * offUp;

          // Direction in camera space (mostly right + slight down + slight forward)
          const rawDx = 26 + Math.random() * 8;
          const rawDy = -(5 + Math.random() * 4);
          const rawDz = -(0.5 + Math.random() * 1.5);
          const len = Math.sqrt(rawDx * rawDx + rawDy * rawDy + rawDz * rawDz);
          const cdx = rawDx / len, cdy = rawDy / len, cdz = rawDz / len;

          // Transform direction to world space
          met.dx = rX * cdx + uX * cdy + fX * cdz;
          met.dy = rY * cdx + uY * cdy + fY * cdz;
          met.dz = rZ * cdx + uZ * cdy + fZ * cdz;

          // Scale speed to frustum width — consistent screen-space crossing time
          met.speed = (8 + Math.random() * 5) * (halfW / REF_HALF_W);

          // Reset trail ring buffer — fill with spawn position
          met.trailHead = 0;
          for (let ti = 0; ti < TRAIL_POINTS; ti++) {
            met.trail[ti].x = met.px;
            met.trail[ti].y = met.py;
            met.trail[ti].z = met.pz;
          }
          spawned++;
        }
      }
      nextSpawnRef.current = t + 5 + Math.random() * 9;
    }

    for (let m = 0; m < METEOR_COUNT; m++) {
      const met  = meteors[m];
      const vMet = voidState.meteorSlots[m];
      const light = lights[m];

      if (!met.active) {
        vMet.env     = Math.max(vMet.env - dt * 6, 0);
        vMet.active  = false;
        light.intensity = Math.max(light.intensity - dt * 18, 0);
        continue;
      }

      met.t += dt;
      const lifeNorm = Math.min(met.t / met.maxLife, 1);
      if (lifeNorm >= 1) { met.active = false; continue; }

      // Kill meteors that are too far from camera (user scrolled away)
      const toCamDist2 = (met.px - cpx) ** 2 + (met.py - cpy) ** 2 + (met.pz - cpz) ** 2;
      if (toCamDist2 > 2500) { met.active = false; continue; }

      const fadeIn  = Math.min(met.t / (met.maxLife * 0.10), 1);
      const fadeOut = Math.max(1 - (lifeNorm - 0.65) / 0.35, 0);
      const env     = fadeIn * fadeOut;

      met.px += met.dx * met.speed * dt;
      met.py += met.dy * met.speed * dt;
      met.pz += met.dz * met.speed * dt;

      // Push current position into trail ring buffer
      met.trail[met.trailHead].x = met.px;
      met.trail[met.trailHead].y = met.py;
      met.trail[met.trailHead].z = met.pz;
      met.trailHead = (met.trailHead + 1) % TRAIL_POINTS;

      tmpV.set(met.px, met.py, met.pz).project(camera);
      if (tmpV.z > 1) { vMet.env = 0; continue; }
      vMet.hsx = (tmpV.x + 1) / 2 * W;
      vMet.hsy = (1 - tmpV.y) / 2 * H;

      // Scale trail length to match speed scaling (consistent screen-space length)
      const trailScale = met.speed / 11; // 11 ≈ midpoint of base speed range (8-13)
      const scaledTrailLen = TRAIL_LEN * trailScale;
      tmpV.set(
        met.px - met.dx * scaledTrailLen,
        met.py - met.dy * scaledTrailLen,
        met.pz - met.dz * scaledTrailLen,
      ).project(camera);
      vMet.tsx = (tmpV.x + 1) / 2 * W;
      vMet.tsy = (1 - tmpV.y) / 2 * H;

      // Project trail points to screen space (newest first)
      let trailCount = 0;
      for (let ti = 0; ti < TRAIL_POINTS; ti++) {
        // Read from ring buffer: newest → oldest
        const idx = (met.trailHead - 1 - ti + TRAIL_POINTS * 2) % TRAIL_POINTS;
        const tp = met.trail[idx];
        tmpV.set(tp.x, tp.y, tp.z).project(camera);
        if (tmpV.z > 1) break;
        vMet.trail[ti].sx = (tmpV.x + 1) / 2 * W;
        vMet.trail[ti].sy = (1 - tmpV.y) / 2 * H;
        trailCount++;
      }
      vMet.trailLen = trailCount;

      vMet.active = true;
      vMet.env    = env;

      light.position.set(met.px, met.py, met.pz);
      light.intensity = env * 4.5;

      // Starfield disruption — color flash only, no position displacement.
      // Stars maintain consistent density throughout the journey.
      const DR     = isMobile ? 6.0 : 9.0;
      const DR2    = DR * DR;
      for (let li = 0; li < 2; li++) {
        const pObj = pts[li].current;
        if (!pObj) continue;
        tmpV.set(met.px, met.py, met.pz);
        tmpV.applyMatrix4(tmpM.copy(pObj.matrixWorld).invert());
        const lx = tmpV.x, ly = tmpV.y, lz = tmpV.z;
        const posArr = pObj.geometry.attributes.position.array as Float32Array;
        const cnt    = layers[li].count;
        const disp   = disruption[li];
        for (let i = 0; i < cnt; i++) {
          const dx = posArr[i * 3] - lx;
          const dy = posArr[i * 3 + 1] - ly;
          const dz = posArr[i * 3 + 2] - lz;
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 < DR2) {
            const d   = Math.sqrt(d2);
            const str = (1 - d / DR) * env;
            if (str > disp[i]) disp[i] = str;
          }
        }
      }
    }

    // Apply and decay disruption colors
    const decay = Math.pow(0.72, Math.min(dt * 60, 6));
    for (let li = 0; li < 2; li++) {
      const pObj = pts[li].current;
      if (!pObj) continue;
      const colArr = pObj.geometry.attributes.color.array as Float32Array;
      const oc     = origColors[li];
      const disp   = disruption[li];
      const cnt    = layers[li].count;
      let changed  = false;

      for (let i = 0; i < cnt; i++) {
        if (disp[i] > 0.005) {
          changed    = true;
          disp[i]   *= decay;
          const fl   = disp[i];
          colArr[i * 3]     = oc[i * 3]     + (0.88 - oc[i * 3])     * fl;
          colArr[i * 3 + 1] = oc[i * 3 + 1] + (0.94 - oc[i * 3 + 1]) * fl;
          colArr[i * 3 + 2] = oc[i * 3 + 2] + (1.00 - oc[i * 3 + 2]) * fl;
        } else if (disp[i] > 0) {
          changed = true;
          disp[i] = 0;
          colArr[i * 3]     = oc[i * 3];
          colArr[i * 3 + 1] = oc[i * 3 + 1];
          colArr[i * 3 + 2] = oc[i * 3 + 2];
        }
      }
      if (changed) pObj.geometry.attributes.color.needsUpdate = true;
    }

    // Loading state management
    const currentActive = workModels.activeModelId;
    if (currentActive !== lastActiveRef.current) {
      lastActiveRef.current = currentActive;
      if (currentActive) {
        voidState.modelOpacity = 0;
        voidState.modelLoading = true;
        lockedLoadY.current = null;
      }
    }
    if (currentActive) {
      voidState.modelLoading = voidState.modelOpacity < 0.35 && workModels.sectionRatio > 0.05;
    } else {
      voidState.modelLoading = false;
    }

    // Write modelRegion from camera projection
    if (voidState.modelLoading) {
      const dynamicY = -voidState.scrollProgress * 7.5;
      if (workModels.sectionRatio > 0.20) lockedLoadY.current = dynamicY;
      const modelY = lockedLoadY.current ?? dynamicY;
      tmpV.set(0, modelY, 2).project(camera);
      const cW = gl.domElement.clientWidth;
      const cH = gl.domElement.clientHeight;
      voidState.modelRegion.x   = (tmpV.x + 1) / 2 * cW;
      voidState.modelRegion.y   = (1 - tmpV.y) / 2 * cH;
      voidState.modelRegion.rPx = Math.min(cW, cH) * 0.22;
    }

    // Loading state
    loadPhaseRef.current += ((voidState.modelLoading ? 1 : 0) - loadPhaseRef.current) * Math.min(dt * 1.0, 1);
    voidState.loadPhase = loadPhaseRef.current;
  });

  return <group ref={groupRef} />;
}
