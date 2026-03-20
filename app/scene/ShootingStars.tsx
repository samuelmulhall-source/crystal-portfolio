"use client";

/**
 * Shooting stars system — camera-relative meteor spawning with trail rendering.
 *
 * Decoupled from starfield: no disruption color flash, no star buffer access.
 * Only active during hero + first transit (scrollProgress < 0.35).
 * Meteor screen positions written to voidState.meteorSlots for EffectsOverlay.
 */

import React, { useRef, useMemo, useEffect, useContext } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { voidState } from "../lib/voidState";
import { workModels } from "../lib/workModels";
import { VoidContext } from "./VoidScene";
import { sr } from "../lib/seededRandom";

const METEOR_COUNT  = 5;
const TRAIL_LEN     = 2.5;
const TRAIL_POINTS  = 12;

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

export default function ShootingStars() {
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

  const { isMobile } = useContext(VoidContext);

  const lights = useMemo(() =>
    Array.from({ length: METEOR_COUNT }, () => new THREE.PointLight("#4488ff", 0, 16)),
  []);

  useEffect(() => {
    const g = groupRef.current;
    if (!g) return;
    lights.forEach((l) => g.add(l));
    return () => lights.forEach((l) => g.remove(l));
  }, [lights]);

  useFrame((state, dt) => {
    const t       = state.clock.elapsedTime;
    const meteors = meteorsRef.current;
    const W       = typeof window !== "undefined" ? window.innerWidth  : 1920;
    const H       = typeof window !== "undefined" ? window.innerHeight : 1080;

    // Only render meteors during hero + first transit
    const pastHero = voidState.scrollProgress > 0.35;

    // Spawn (only if in hero region) — camera-relative via matrixWorld basis
    const maxActive = isMobile ? 3 : METEOR_COUNT;
    if (!pastHero && t >= nextSpawnRef.current) {
      const burst = 1 + Math.floor(sr(Math.floor(t * 1000) % 99999) * 3);
      let spawned = 0;
      const activeCount = meteors.filter(m => m.active).length;

      // Extract camera basis vectors from matrixWorld (zero alloc)
      const mw = camera.matrixWorld.elements;
      const rX = mw[0], rY = mw[1], rZ = mw[2];     // camera right
      const uX = mw[4], uY = mw[5], uZ = mw[6];     // camera up
      const fX = -mw[8], fY = -mw[9], fZ = -mw[10];  // camera forward (-Z)
      const camX = camera.position.x, camY = camera.position.y, camZ = camera.position.z;

      // Frustum geometry for spawn sizing
      const camFov    = (camera as THREE.PerspectiveCamera).fov ?? 50;
      const camAspect = (camera as THREE.PerspectiveCamera).aspect ?? 1.78;
      const depth     = 4 + Math.random() * 4;
      const halfH     = Math.tan((camFov / 2) * Math.PI / 180) * depth;
      const halfW     = halfH * camAspect;

      // Speed normalization: consistent screen-space crossing time
      const REF_HALF_W = Math.tan(25 * Math.PI / 180) * 6 * 1.78;
      const speedScale = halfW / REF_HALF_W;

      for (let m = 0; m < METEOR_COUNT && spawned < burst && activeCount + spawned < maxActive; m++) {
        if (!meteors[m].active) {
          const met  = meteors[m];
          met.active = true;
          met.t      = 0;
          met.phase  = Math.random() * Math.PI * 2;
          met.maxLife = 2.5 + Math.random() * 1.0;

          // Spawn in camera space: left edge, random vertical, at depth
          const offRight = -(halfW * 1.05 + 1.5 + Math.random() * 3.0);
          const offUp    = (-halfH * 0.3) + Math.random() * (halfH * 1.6);

          // Transform to world space
          met.px = camX + fX * depth + rX * offRight + uX * offUp;
          met.py = camY + fY * depth + rY * offRight + uY * offUp;
          met.pz = camZ + fZ * depth + rZ * offRight + uZ * offUp;

          // Direction in camera space (right + slightly down + slight forward)
          const sx  = 26 + Math.random() * 8;
          const sy  = -(5 + Math.random() * 4);
          const sz  = -(0.5 + Math.random() * 1.5);
          const len = Math.sqrt(sx * sx + sy * sy + sz * sz);
          const cdx = sx / len, cdy = sy / len, cdz = sz / len;

          // Transform direction to world space
          met.dx = rX * cdx + uX * cdy + fX * cdz;
          met.dy = rY * cdx + uY * cdy + fY * cdz;
          met.dz = rZ * cdx + uZ * cdy + fZ * cdz;

          met.speed = (8 + Math.random() * 5) * speedScale;

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
        // eslint-disable-next-line react-hooks/immutability -- Three.js light intensity per-frame update
        light.intensity = Math.max(light.intensity - dt * 18, 0);
        continue;
      }

      // If we scrolled past hero, kill active meteors quickly
      if (pastHero) {
        met.t = met.maxLife; // force expire
      }

      met.t += dt;
      const lifeNorm = Math.min(met.t / met.maxLife, 1);
      if (lifeNorm >= 1) { met.active = false; continue; }

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

      tmpV.set(
        met.px - met.dx * TRAIL_LEN,
        met.py - met.dy * TRAIL_LEN,
        met.pz - met.dz * TRAIL_LEN,
      ).project(camera);
      vMet.tsx = (tmpV.x + 1) / 2 * W;
      vMet.tsy = (1 - tmpV.y) / 2 * H;

      // Project trail points to screen space (newest first)
      let trailCount = 0;
      for (let ti = 0; ti < TRAIL_POINTS; ti++) {
        // Read from ring buffer: newest -> oldest
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
