"use client";

/**
 * Shooting stars + starfield disruption system.
 *
 * Extracted from VoidBackground.tsx lines 617-1094.
 * Handles: meteor state, traveling point lights, starfield disruption physics,
 * loading orbit animation, model star repulsion, and meteor screen position
 * writes to voidState.meteorSlots.
 */

import React, { useRef, useMemo, useEffect, useState, useContext } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { voidState } from "../lib/voidState";
import { workModels } from "../lib/workModels";
import { VoidContext } from "./VoidScene";
import { buildStarColors, buildStarPositions } from "./Starfield";
import { sr } from "../lib/seededRandom";

const METEOR_COUNT  = 5;
const TRAIL_LEN     = 4.0;

interface MeteorState {
  active:  boolean;
  t:       number;
  maxLife: number;
  px: number; py: number; pz: number;
  dx: number; dy: number; dz: number;
  speed:   number;
  phase:   number;
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
    }))
  );

  const tmpV  = useMemo(() => new THREE.Vector3(), []);
  const tmpV2 = useMemo(() => new THREE.Vector3(), []);
  const tmpM  = useMemo(() => new THREE.Matrix4(), []);
  const camR  = useMemo(() => new THREE.Vector3(), []);
  const camU  = useMemo(() => new THREE.Vector3(), []);

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

  const origPosBufs = useMemo(() => [
    buildStarPositions(layers[0].count, layers[0].rMin, layers[0].rMax, layers[0].seed),
    buildStarPositions(layers[1].count, layers[1].rMin, layers[1].rMax, layers[1].seed),
  ], [layers]);

  const velBufs = useMemo(() => [
    new Float32Array(layers[0].count * 3),
    new Float32Array(layers[1].count * 3),
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

  useFrame((state, dt) => {
    const t       = state.clock.elapsedTime;
    const meteors = meteorsRef.current;
    const W       = typeof window !== "undefined" ? window.innerWidth  : 1920;
    const H       = typeof window !== "undefined" ? window.innerHeight : 1080;

    // Spawn
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
          met.pz = -(4 + Math.random() * 4);
          const camPosZ   = (camera as THREE.PerspectiveCamera).position?.z ?? 12;
          const viewZ     = camPosZ - met.pz;
          const camFov    = (camera as THREE.PerspectiveCamera).fov ?? 50;
          const camAspect = (camera as THREE.PerspectiveCamera).aspect ?? 1.78;
          const halfH  = Math.tan((camFov / 2) * Math.PI / 180) * viewZ;
          const halfW  = halfH * camAspect;
          met.px = -(halfW * 1.05 + 1.5 + Math.random() * 3.0);
          met.py = (-halfH * 0.3) + Math.random() * (halfH * 1.6);
          const sx  = 26 + Math.random() * 8;
          const sy  = -(5 + Math.random() * 4);
          const sz  = -(0.5 + Math.random() * 1.5);
          const len = Math.sqrt(sx * sx + sy * sy + sz * sz);
          met.dx = sx / len; met.dy = sy / len; met.dz = sz / len;
          met.speed = 8 + Math.random() * 5;
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

      const fadeIn  = Math.min(met.t / (met.maxLife * 0.10), 1);
      const fadeOut = Math.max(1 - (lifeNorm - 0.65) / 0.35, 0);
      const env     = fadeIn * fadeOut;

      met.px += met.dx * met.speed * dt;
      met.py += met.dy * met.speed * dt;
      met.pz += met.dz * met.speed * dt;

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

      vMet.active = true;
      vMet.env    = env;

      light.position.set(met.px, met.py, met.pz);
      light.intensity = env * 4.5;

      // Starfield disruption
      const DR     = isMobile ? 6.0 : 9.0;
      const DR2    = DR * DR;
      const WAKE_R = DR * 0.38;
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

            if (d > 0.05) {
              if (d < WAKE_R) {
                const wakeStr = (1 - d / WAKE_R) * env * 0.65;
                velBufs[li][i * 3]     += met.dx * wakeStr * 2.2;
                velBufs[li][i * 3 + 1] += met.dy * wakeStr * 2.2;
                velBufs[li][i * 3 + 2] += met.dz * wakeStr * 2.2;
              } else {
                const push = (str * 2.0) / d;
                velBufs[li][i * 3]     += dx * push;
                velBufs[li][i * 3 + 1] += dy * push;
                velBufs[li][i * 3 + 2] += dz * push;
              }
            }
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

    // Loading orbit: gravitational swirl
    loadPhaseRef.current += ((voidState.modelLoading ? 1 : 0) - loadPhaseRef.current) * Math.min(dt * 1.0, 1);
    const loadPhase = loadPhaseRef.current;
    voidState.loadPhase = loadPhase;

    const SPRING_K_VAL = loadPhase > 0.2 ? 4.5 * (1 - loadPhase * 0.85) : 4.5;
    const dampFac  = Math.pow(0.90, Math.min(dt * 60, 6));

    for (let li = 0; li < 2; li++) {
      const pObj   = pts[li].current;
      if (!pObj) continue;
      const posArr  = pObj.geometry.attributes.position.array as Float32Array;
      const origPos = origPosBufs[li];
      const vel     = velBufs[li];
      const cnt     = layers[li].count;
      let posChanged = false;

      const modelWorldY = lockedLoadY.current ?? (-voidState.scrollProgress * 7.5);
      let modelLX = 0, modelLY = modelWorldY, modelLZ = 2;
      if (loadPhase > 0.01) {
        tmpV.set(0, modelWorldY, 2).applyMatrix4(tmpM.copy(pObj.matrixWorld).invert());
        modelLX = tmpV.x; modelLY = tmpV.y; modelLZ = tmpV.z;
      }

      for (let i = 0; i < cnt; i++) {
        const b = i * 3;
        let hasOrbit = false;

        if (loadPhase > 0.01) {
          const sx = posArr[b], sy = posArr[b + 1], sz = posArr[b + 2];
          const toX = modelLX - sx, toY = modelLY - sy, toZ = modelLZ - sz;
          const dist = Math.sqrt(toX * toX + toY * toY + toZ * toZ);
          if (dist > 2 && dist < 40) {
            hasOrbit = true;
            const invD = 1 / dist;
            const ph   = loadPhase;
            const aStr = 0.85 * ph;
            vel[b]     += toX * invD * aStr * dt;
            vel[b + 1] += toY * invD * aStr * dt;
            vel[b + 2] += toZ * invD * aStr * dt;
            const tStr = 1.6 * ph;
            vel[b]     += (-toZ * invD) * tStr * dt;
            vel[b + 2] += ( toX * invD) * tStr * dt;
          }
        }

        const v0 = vel[b], v1 = vel[b + 1], v2 = vel[b + 2];
        if (!hasOrbit && v0 * v0 + v1 * v1 + v2 * v2 < 0.0002) continue;
        posChanged = true;

        vel[b]     += (origPos[b]     - posArr[b])     * SPRING_K_VAL * dt;
        vel[b + 1] += (origPos[b + 1] - posArr[b + 1]) * SPRING_K_VAL * dt;
        vel[b + 2] += (origPos[b + 2] - posArr[b + 2]) * SPRING_K_VAL * dt;

        vel[b]     *= dampFac;
        vel[b + 1] *= dampFac;
        vel[b + 2] *= dampFac;

        posArr[b]     += vel[b]     * dt;
        posArr[b + 1] += vel[b + 1] * dt;
        posArr[b + 2] += vel[b + 2] * dt;
      }

      if (posChanged) pObj.geometry.attributes.position.needsUpdate = true;
      const velAttr = pObj.geometry.attributes.aVelocity;
      if (velAttr) {
        (velAttr as THREE.BufferAttribute).array = vel;
        velAttr.needsUpdate = true;
      }
    }

    // Camera axes for repulsion
    camR.setFromMatrixColumn(camera.matrixWorld, 0);
    camU.setFromMatrixColumn(camera.matrixWorld, 1);

    // Model star repulsion
    if (workModels.activeModelId && workModels.entries.length > 0) {
      const NDC_R      = 0.14;
      const NDC_R2     = NDC_R * NDC_R;
      const NDC_PUSH   = 0.04;
      const W3D        = 2.2;
      const W3D2       = W3D * W3D;
      const W3D_PUSH   = 0.06;

      workModels.entries.forEach((entry) => {
        if (workModels.activeModelId !== entry.id) return;
        const proximity = 1;

        const mwX    = 0;
        const mwY    = lockedLoadY.current ?? (-voidState.scrollProgress * 7.5);
        const mwZ    = 2.0;

        tmpV.set(mwX, mwY, mwZ).project(camera);
        const screenValid = tmpV.z <= 1;
        const cx = screenValid ? tmpV.x : 0;
        const cy = screenValid ? tmpV.y : 0;

        for (let li = 0; li < 2; li++) {
          const pObj = pts[li]?.current;
          if (!pObj) continue;
          const posArr = pObj.geometry.attributes.position.array as Float32Array;
          const cnt    = layers[li].count;
          const vel    = velBufs[li];

          for (let i = 0; i < cnt; i++) {
            const sx = posArr[i * 3], sy = posArr[i * 3 + 1], sz = posArr[i * 3 + 2];

            if (vel) {
              const dx3 = sx - mwX, dy3 = sy - mwY, dz3 = sz - mwZ;
              const d2_3 = dx3 * dx3 + dy3 * dy3 + dz3 * dz3;
              if (d2_3 < W3D2 && d2_3 > 0.001) {
                const d3  = Math.sqrt(d2_3);
                const str = (1 - d3 / W3D) * W3D_PUSH * proximity;
                vel[i * 3]     += (dx3 / d3) * str;
                vel[i * 3 + 1] += (dy3 / d3) * str;
                vel[i * 3 + 2] += (dz3 / d3) * str;
              }
            }

            if (!screenValid) continue;
            tmpV2.set(sx, sy, sz).applyMatrix4(pObj.matrixWorld).project(camera);
            if (tmpV2.z > 1) continue;
            const ndx = tmpV2.x - cx, ndy = tmpV2.y - cy;
            const nd2 = ndx * ndx + ndy * ndy;
            if (nd2 > NDC_R2 || nd2 < 0.000001) continue;

            const ndDist = Math.sqrt(nd2);
            const approxDist = Math.sqrt(sx * sx + sy * sy + sz * sz);
            const depthScale = Math.max(1, approxDist / 14);
            const str        = (1 - ndDist / NDC_R) * NDC_PUSH * proximity * depthScale;
            const nx2 = ndx / ndDist, ny2 = ndy / ndDist;
            vel[i * 3]     += (camR.x * nx2 + camU.x * ny2) * str;
            vel[i * 3 + 1] += (camR.y * nx2 + camU.y * ny2) * str;
            vel[i * 3 + 2] += (camR.z * nx2 + camU.z * ny2) * str;
          }
        }
      });
    }
  });

  return <group ref={groupRef} />;
}
