"use client";

/**
 * Star hover detection system — finds nearest stars to cursor, projects
 * to screen coords, and writes to voidState.hoverSlots for EffectsOverlay.
 *
 * Extracted from VoidBackground.tsx lines 437-615.
 * No Three.js meshes rendered — purely computational.
 */

import React, { useRef, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { voidState } from "../lib/voidState";

const HOVER_POOL = 14;
interface HoverSlot {
  active:   boolean;
  ease:     number;
  layerIdx: number;
  starIdx:  number;
  variant:  number;
  wx: number; wy: number; wz: number;
}

export default function StarHoverSystem({
  pts,
}: {
  pts: [
    React.RefObject<THREE.Points | null>,
    React.RefObject<THREE.Points | null>,
    React.RefObject<THREE.Points | null>,
  ];
}) {
  const { camera } = useThree();
  const slotsRef   = useRef<HoverSlot[]>(
    Array.from({ length: HOVER_POOL }, () => ({
      active: false, ease: 0, layerIdx: -1, starIdx: -1, variant: 0, wx: 0, wy: 0, wz: 0,
    }))
  );
  const tmpV = useMemo(() => new THREE.Vector3(), []);

  useFrame((state, dt) => {
    const t     = state.clock.elapsedTime;
    const slots = slotsRef.current;
    const lerpK = Math.min(dt * 7.5, 0.92);
    const W     = typeof window !== "undefined" ? window.innerWidth  : 1920;
    const H     = typeof window !== "undefined" ? window.innerHeight : 1080;

    if (!voidState.isOnPage) {
      slots.forEach((s, i) => {
        s.active = false;
        s.ease   = Math.max(s.ease - dt * 5, 0);
        voidState.hoverSlots[i].ease = s.ease;
      });
      return;
    }

    const curNX = voidState.mouseNX;
    const curNY = -voidState.mouseNY;
    const NDC_GLOW  = 0.060;
    const NDC_LINE  = 0.120;
    const GLOW_POOL = 8;
    const camX  = camera.position.x, camY = camera.position.y, camZ = camera.position.z;
    const MIN_D2 = 5 * 5;

    type Cand = { dist: number; layerIdx: number; starIdx: number; wx: number; wy: number; wz: number; };
    const glowCands: Cand[] = [];
    const lineCands: Cand[] = [];

    for (let li = 0; li < 3; li++) {
      const pObj  = pts[li].current;
      if (!pObj) continue;
      const arr   = pObj.geometry.attributes.position.array as Float32Array;
      const matW  = pObj.matrixWorld;
      const count = arr.length / 3;
      for (let i = 0; i < count; i++) {
        tmpV.set(arr[i * 3], arr[i * 3 + 1], arr[i * 3 + 2]).applyMatrix4(matW);
        const wx = tmpV.x, wy = tmpV.y, wz = tmpV.z;
        const cdx = wx - camX, cdy = wy - camY, cdz = wz - camZ;
        if (cdx * cdx + cdy * cdy + cdz * cdz < MIN_D2) continue;
        tmpV.project(camera);
        if (tmpV.z > 1) continue;
        const dist = Math.sqrt((tmpV.x - curNX) ** 2 + (tmpV.y - curNY) ** 2);
        if (dist < NDC_GLOW) {
          glowCands.push({ dist, layerIdx: li, starIdx: i, wx, wy, wz });
        } else if (dist < NDC_LINE) {
          lineCands.push({ dist, layerIdx: li, starIdx: i, wx, wy, wz });
        }
        if (glowCands.length + lineCands.length >= HOVER_POOL * 3) break;
      }
      if (glowCands.length + lineCands.length >= HOVER_POOL * 3) break;
    }

    glowCands.sort((a, b) => a.dist - b.dist);
    lineCands.sort((a, b) => a.dist - b.dist);

    const assignSlots = (cands: Cand[], slotStart: number, slotEnd: number) => {
      const poolSize = slotEnd - slotStart;
      const topCands = cands.slice(0, poolSize);
      const existing = new Map<string, number>();
      for (let si = slotStart; si < slotEnd; si++) {
        const s = slots[si];
        if (s.active || s.ease > 0) existing.set(`${s.layerIdx}-${s.starIdx}`, si);
      }
      const used = new Set<number>();
      topCands.forEach((c) => {
        const si = existing.get(`${c.layerIdx}-${c.starIdx}`);
        if (si !== undefined) {
          slots[si].active = true;
          slots[si].wx = c.wx; slots[si].wy = c.wy; slots[si].wz = c.wz;
          used.add(si);
        }
      });
      topCands.forEach((c) => {
        if (existing.has(`${c.layerIdx}-${c.starIdx}`)) return;
        for (let si = slotStart; si < slotEnd; si++) {
          if (!used.has(si)) {
            const variant = (c.starIdx * 7 + c.layerIdx * 317) % 6;
            slots[si] = { active: true, ease: slots[si].ease, layerIdx: c.layerIdx, starIdx: c.starIdx, variant, wx: c.wx, wy: c.wy, wz: c.wz };
            used.add(si);
            break;
          }
        }
      });
      for (let si = slotStart; si < slotEnd; si++) {
        if (!used.has(si)) {
          slots[si].active = false;
          if (slots[si].ease < 0.01) { slots[si].layerIdx = -1; slots[si].starIdx = -1; }
        }
      }
    };

    assignSlots(glowCands, 0,         GLOW_POOL);
    assignSlots(lineCands, GLOW_POOL, HOVER_POOL);

    slots.forEach((s, i) => {
      const maxEase = i < GLOW_POOL ? 1.0 : 0.28;
      s.ease += ((s.active ? maxEase : 0) - s.ease) * lerpK;

      if (s.ease > 0.01 && s.layerIdx >= 0 && s.starIdx >= 0) {
        const pObj = pts[s.layerIdx].current;
        if (pObj) {
          const a = pObj.geometry.attributes.position.array as Float32Array;
          tmpV.set(a[s.starIdx * 3], a[s.starIdx * 3 + 1], a[s.starIdx * 3 + 2]);
          tmpV.applyMatrix4(pObj.matrixWorld);
          s.wx = tmpV.x; s.wy = tmpV.y; s.wz = tmpV.z;
        }
      }

      const vSlot = voidState.hoverSlots[i];
      if (s.ease > 0.01) {
        tmpV.set(s.wx, s.wy, s.wz).project(camera);
        if (tmpV.z <= 1) {
          const px = (tmpV.x + 1) / 2 * W;
          const py = (1 - tmpV.y) / 2 * H;
          const mr = voidState.modelRegion;
          const overModel = mr.rPx > 20 &&
            (px - mr.x) * (px - mr.x) + (py - mr.y) * (py - mr.y) < mr.rPx * mr.rPx;
          if (overModel) {
            vSlot.ease = 0;
          } else {
            vSlot.ease    = s.ease;
            vSlot.sx      = px;
            vSlot.sy      = py;
            vSlot.hue     = 195 + Math.sin(t * 1.45 + i * 0.72) * 55;
            vSlot.variant = s.variant;
          }
        } else {
          vSlot.ease = 0;
        }
      } else {
        vSlot.ease = 0;
      }
    });
  });

  return null;
}
