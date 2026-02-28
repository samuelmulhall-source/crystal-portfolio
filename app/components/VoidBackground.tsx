"use client";

/**
 * VoidBackground — fixed full-screen starfield canvas (WebGL).
 *
 * Architecture (post-revamp):
 *   Three.js canvas  → handles star geometry, positions, rotations,
 *                       starfield disruption, camera, lighting.
 *   EffectsOverlay   → separate 2D canvas handles ALL visual effects
 *                       (hover crystal glow, meteor trails) using
 *                       Canvas2D globalCompositeOperation:'lighter' +
 *                       createRadialGradient for reliable holographic color.
 *
 * This component writes projected screen positions to voidState so that
 * EffectsOverlay can read them without needing Three.js camera access.
 */

import React, { useRef, useMemo, useEffect, useState, Suspense } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, useFBX } from "@react-three/drei";
import * as THREE from "three";
import { voidState } from "../lib/voidState";
import { workModels, WorkModelEntry } from "../lib/workModels";

// ─── Seeded random ─────────────────────────────────────────────────────────
function sr(seed: number) {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

// ─── Star sprite texture ───────────────────────────────────────────────────
// Radial gradient: bright white core → wide ice-blue halo → transparent.
// Star sprite: round glow core with a subtle vertical smear for motion-blur feel.
// The mild Y-stretch simulates depth/parallax so the void looks alive even when still.
let _starSprite: THREE.CanvasTexture | null = null;
function getStarSprite(): THREE.CanvasTexture | null {
  if (_starSprite) return _starSprite;
  if (typeof document === "undefined") return null;
  const N   = 64;
  const cv  = document.createElement("canvas");
  cv.width  = cv.height = N;
  const ctx = cv.getContext("2d");
  if (!ctx) return null;
  const cx = N / 2, cy = N / 2;

  // Core: crisp bright point
  const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, N * 0.12);
  core.addColorStop(0.0,  "rgba(255,255,255,1.00)");
  core.addColorStop(1.0,  "rgba(220,240,255,0.80)");
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.ellipse(cx, cy, N * 0.12, N * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();

  // Halo: wide soft glow slightly taller than wide (motion-blur hint)
  const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, N * 0.5);
  halo.addColorStop(0.00, "rgba(180,225,255,0.60)");
  halo.addColorStop(0.30, "rgba(120,195,255,0.30)");
  halo.addColorStop(0.65, "rgba( 60,150,255,0.10)");
  halo.addColorStop(1.00, "rgba(  0,  0,  0,0.00)");
  ctx.globalCompositeOperation = "screen";
  ctx.fillStyle = halo;
  ctx.beginPath();
  // Subtle vertical elongation: 1.15× taller than wide
  ctx.ellipse(cx, cy, N * 0.46, N * 0.50, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = "source-over";

  _starSprite = new THREE.CanvasTexture(cv);
  return _starSprite;
}

// ─── Star color builder ────────────────────────────────────────────────────
function buildStarColors(count: number, seed: number): Float32Array {
  const col = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const br   = 0.22 + sr(seed + i * 7 + 4) * 0.65;
    const cool = sr(seed + i * 7 + 5) > 0.55;
    col[i * 3]     = br * (cool ? 0.68 : 1.00);
    col[i * 3 + 1] = br * (cool ? 0.88 : 1.00);
    col[i * 3 + 2] = br;
  }
  return col;
}

// ─── Star layer config ─────────────────────────────────────────────────────
// Higher counts give a real night-sky density; three shells at different radii
// create natural parallax depth as the camera rotates.
const LAYERS = [
  { count: 1800, rMin: 14, rMax: 30, rotSpd: 0.007, size: 0.22, seed: 11111 },
  { count: 1400, rMin: 26, rMax: 44, rotSpd: 0.011, size: 0.28, seed: 22222 },
  { count:  900, rMin: 36, rMax: 58, rotSpd: 0.017, size: 0.34, seed: 33333 },
] as const;

// Galactic tilt angle for the Milky Way band (radians)
const MW_TILT = Math.PI * 0.38;

function buildStarPositions(count: number, rMin: number, rMax: number, seed: number): Float32Array {
  const pos = new Float32Array(count * 3);
  // sin/cos of tilt for Milky Way rotation
  const sinT = Math.sin(MW_TILT), cosT = Math.cos(MW_TILT);

  for (let i = 0; i < count; i++) {
    const rng  = sr(seed + i * 7 + 0);
    const isMW = rng < 0.38; // 38 % of stars cluster along the galactic band

    let x, y, z;
    if (isMW) {
      // Milky Way band: concentrated near the equatorial plane (phi ≈ π/2)
      // Use a gaussian-style clamp: phi drawn from near π/2 with spread ~0.22 rad
      const theta = sr(seed + i * 7 + 1) * Math.PI * 2;
      const rawPhi = 0.5 + (sr(seed + i * 7 + 2) - 0.5) * 0.42; // 0.29 – 0.71 (tight band)
      const phi    = rawPhi * Math.PI;
      const r      = rMin + sr(seed + i * 7 + 3) * (rMax - rMin);
      // Build in equatorial coords then tilt
      const ex = r * Math.sin(phi) * Math.cos(theta);
      const ey = r * Math.sin(phi) * Math.sin(theta);
      const ez = r * Math.cos(phi);
      // Tilt the band around the Z axis
      x = ex * cosT - ey * sinT;
      y = ex * sinT + ey * cosT;
      z = ez;
    } else {
      // Background field: uniform sphere
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

function buildStarGeo(count: number, rMin: number, rMax: number, seed: number) {
  const pos = buildStarPositions(count, rMin, rMax, seed);
  const col = buildStarColors(count, seed);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("color",    new THREE.BufferAttribute(col, 3));
  return g;
}

// ─── Star layer component ─────────────────────────────────────────────────
function StarLayer({
  li,
  pointsRef,
}: {
  li: 0 | 1 | 2;
  pointsRef: React.RefObject<THREE.Points | null>;
}) {
  const cfg    = LAYERS[li];
  const matRef = useRef<THREE.PointsMaterial>(null);
  const geo    = useMemo(() => buildStarGeo(cfg.count, cfg.rMin, cfg.rMax, cfg.seed), [cfg]);
  const sprite = useMemo(() => getStarSprite(), []);

  useFrame((s, dt) => {
    if (!pointsRef.current || !matRef.current) return;
    pointsRef.current.rotation.y += dt * cfg.rotSpd;
    pointsRef.current.rotation.x += dt * cfg.rotSpd * 0.32;

    const t    = s.clock.elapsedTime;
    const base = 0.84 + 0.10 * Math.sin(t * 0.32 + li * 1.1);
    const dim  = 1 - voidState.scrollProgress * 0.10;
    matRef.current.opacity += (base * dim - matRef.current.opacity) * 0.04;

    // Motion blur: size grows with mouse + scroll velocity
    const vel      = voidState.mouseVel + voidState.scrollVel * 5;
    const velBoost = Math.min(vel * 0.08, 0.60);
    matRef.current.size = cfg.size * (1 + velBoost);
  });

  return (
    // renderOrder=-1 ensures stars are drawn before (behind) models at renderOrder=0
    <points ref={pointsRef} renderOrder={-1}>
      <primitive object={geo} attach="geometry" />
      <pointsMaterial
        ref={matRef}
        attach="material"
        map={sprite ?? undefined}
        size={cfg.size}
        vertexColors
        transparent
        opacity={0.84}
        sizeAttenuation
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        depthTest={true}
      />
    </points>
  );
}

// ─── Void core light ───────────────────────────────────────────────────────
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

// ─── Camera: mouse parallax + scroll descent ───────────────────────────────
const MAX_P = 1.9;

function VoidCamera() {
  const { camera } = useThree();
  const cp  = useRef(new THREE.Vector3(0, 0, 12));
  const lt  = useRef(new THREE.Vector3(0, 0, 0));
  const lt2 = useMemo(() => new THREE.Vector3(), []);

  useFrame((s, dt) => {
    const t  = s.clock.elapsedTime;
    const dx = Math.sin(t * 0.038) * 0.55;
    const dy = Math.cos(t * 0.028) * 0.32;

    const scrollOffY = -voidState.scrollProgress * 10;

    const tx = voidState.mouseNX * MAX_P + dx;
    const ty = (-voidState.mouseNY) * MAX_P * 0.55 + dy + scrollOffY;

    cp.current.x += (tx - cp.current.x) * 0.032;
    cp.current.y += (ty - cp.current.y) * 0.032;
    camera.position.set(cp.current.x, cp.current.y, 12);

    lt2.set(
      voidState.mouseNX * 0.45,
      -voidState.mouseNY * 0.28 + scrollOffY * 0.70,
      0
    );
    lt.current.lerp(lt2, 0.038 * Math.min(dt * 60, 1));
    camera.lookAt(lt.current);
  });

  return null;
}

// ─── Velocity decay ────────────────────────────────────────────────────────
function VoidMotion() {
  useFrame((_, dt) => {
    voidState.ready = true; // signal LoadingScreen that first frame is done
    const f = Math.min(dt * 60, 6);
    voidState.mouseVel  *= Math.pow(0.88, f);
    voidState.scrollVel *= Math.pow(0.90, f);
  });
  return null;
}

// ─── Star hover system ─────────────────────────────────────────────────────
// No longer renders any Three.js meshes.
// Finds the nearest stars to the cursor, projects their 3D world positions
// to screen coordinates, and writes them to voidState.hoverSlots.
// EffectsOverlay reads voidState.hoverSlots and draws holographic glow.
const HOVER_POOL = 14;
interface HoverSlot {
  active:   boolean;
  ease:     number;
  layerIdx: number;
  starIdx:  number;
  variant:  number; // 0–5 shape variant, assigned once per star, stable
  wx: number; wy: number; wz: number; // cached world position (layer rotates)
}

function StarHoverSystem({
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
    const curNY = -voidState.mouseNY; // flip Y to match Three.js NDC
    // Two detection radii:
    //   NDC_GLOW  (0–0.060) → slots 0-7:  full glow + symbol (unchanged from original)
    //   NDC_LINE  (0–0.120) → slots 8-13: low ease (0.28), used only for constellation lines
    const NDC_GLOW  = 0.060;
    const NDC_LINE  = 0.120;
    const GLOW_POOL = 8; // first 8 slots for glow, remaining 6 for lines
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

    // Helper: run stable slot assignment on a candidate list within [slotStart, slotEnd)
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

    assignSlots(glowCands, 0,         GLOW_POOL);           // full glow+symbol
    assignSlots(lineCands, GLOW_POOL, HOVER_POOL);           // line-only (low ease)

    // Update eases:
    //   Slots 0-7  (glow) : target = 1.0  — full symbol + glow
    //   Slots 8-13 (lines): target = 0.28 — barely visible, just enough for line drawing
    slots.forEach((s, i) => {
      const maxEase = i < GLOW_POOL ? 1.0 : 0.28;
      s.ease += ((s.active ? maxEase : 0) - s.ease) * lerpK;

      // Keep world position fresh as layer rotates
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
          vSlot.ease    = s.ease;
          vSlot.sx      = (tmpV.x + 1) / 2 * W;
          vSlot.sy      = (1 - tmpV.y) / 2 * H;
          vSlot.hue     = 195 + Math.sin(t * 1.45 + i * 0.72) * 55;
          vSlot.variant = s.variant; // which of the 6 shapes to draw
        } else {
          vSlot.ease = 0;
        }
      } else {
        vSlot.ease = 0;
      }
    });
  });

  return null; // All visuals handled by EffectsOverlay 2D canvas
}

// ─── Shooting stars + starfield disruption ────────────────────────────────
// Visual trail/head rendering is done by EffectsOverlay (2D canvas).
// This component handles:
//   • Meteor state (spawn, position, lifetime)
//   • PointLight traveling with each meteor (3D illumination on stars)
//   • Starfield disruption (warm color flash on nearby star buffers)
//   • Writing head/tail screen positions to voidState.meteorSlots
const METEOR_COUNT  = 5;
const TRAIL_LEN     = 4.0; // world-unit trail length (tail = head - dir * TRAIL_LEN)

interface MeteorState {
  active:  boolean;
  t:       number;
  maxLife: number;
  px: number; py: number; pz: number;
  dx: number; dy: number; dz: number;
  speed:   number;
  phase:   number;
}

function ShootingStars({
  pts,
}: {
  pts: [
    React.RefObject<THREE.Points | null>,
    React.RefObject<THREE.Points | null>,
    React.RefObject<THREE.Points | null>,
  ];
}) {
  const { camera }   = useThree();
  const groupRef     = useRef<THREE.Group>(null);
  const nextSpawnRef = useRef(4 + sr(99999) * 4);
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
  const camR  = useMemo(() => new THREE.Vector3(), []); // camera right
  const camU  = useMemo(() => new THREE.Vector3(), []); // camera up

  // Per-star disruption strength buffer
  const disruption = useMemo(() => [
    new Float32Array(LAYERS[0].count),
    new Float32Array(LAYERS[1].count),
  ], []);

  // Original star colors (seeded, exact match to buildStarGeo) — all 3 layers
  // needed so the model mask can restore layer-2 colours after fading them.
  const origColors = useMemo(() => [
    buildStarColors(LAYERS[0].count, LAYERS[0].seed),
    buildStarColors(LAYERS[1].count, LAYERS[1].seed),
    buildStarColors(LAYERS[2].count, LAYERS[2].seed),
  ], []);

  // Original star positions — rest positions for the spring simulation
  const origPosBufs = useMemo(() => [
    buildStarPositions(LAYERS[0].count, LAYERS[0].rMin, LAYERS[0].rMax, LAYERS[0].seed),
    buildStarPositions(LAYERS[1].count, LAYERS[1].rMin, LAYERS[1].rMax, LAYERS[1].seed),
  ], []);

  // Per-star velocity buffer for physical displacement (world-units / second)
  const velBufs = useMemo(() => [
    new Float32Array(LAYERS[0].count * 3),
    new Float32Array(LAYERS[1].count * 3),
  ], []);

  // Per-star model mask (0–1): how much to fade this star toward void-black.
  // Covers all 3 layers so even distant background stars can be cleared.
  const modelMask = useMemo(() => [
    new Float32Array(LAYERS[0].count),
    new Float32Array(LAYERS[1].count),
    new Float32Array(LAYERS[2].count),
  ], []);

  // Traveling point lights (Three.js only — add atmosphere to 3D starfield)
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
    if (t >= nextSpawnRef.current) {
      const burst = 1 + Math.floor(sr(Math.floor(t * 1000) % 99999) * 3);
      let spawned = 0;
      for (let m = 0; m < METEOR_COUNT && spawned < burst; m++) {
        if (!meteors[m].active) {
          const met  = meteors[m];
          met.active = true;
          met.t      = 0;
          met.phase  = Math.random() * Math.PI * 2;
          met.maxLife = 2.5 + Math.random() * 1.0;
          // Camera at z=12, FOV 50°.  At pz=-6 (view-z=-18), left screen edge is
          // x ≈ -14.9 and top edge is y ≈ +8.4 (aspect 16:9).
          // Spawn just off the left screen edge so the meteor sweeps across the full view.
          met.pz = -(4 + Math.random() * 4);                         // z: -4 to -8
          // Correct distance: camera is at camera.position.z, meteor is at met.pz
          const camPosZ   = (camera as THREE.PerspectiveCamera).position?.z ?? 12;
          const viewZ     = camPosZ - met.pz;                         // true depth from camera
          const camFov    = (camera as THREE.PerspectiveCamera).fov ?? 50;
          const camAspect = (camera as THREE.PerspectiveCamera).aspect ?? 1.78;
          const halfH  = Math.tan((camFov / 2) * Math.PI / 180) * viewZ;
          const halfW  = halfH * camAspect;
          // Spawn well off the left edge (2+ screen-widths margin)
          met.px = -(halfW * 1.05 + 1.5 + Math.random() * 3.0);
          // Spread across the full vertical range plus a little above/below
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
      // 5–14 s between bursts
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
      const fadeOut = Math.max(1 - (lifeNorm - 0.65) / 0.35, 0); // start fading at 65% life
      const env     = fadeIn * fadeOut;

      met.px += met.dx * met.speed * dt;
      met.py += met.dy * met.speed * dt;
      met.pz += met.dz * met.speed * dt;

      // Project head to screen
      tmpV.set(met.px, met.py, met.pz).project(camera);
      if (tmpV.z > 1) { vMet.env = 0; continue; }
      vMet.hsx = (tmpV.x + 1) / 2 * W;
      vMet.hsy = (1 - tmpV.y) / 2 * H;

      // Project tail to screen (approximation: head minus direction × trail length)
      tmpV.set(
        met.px - met.dx * TRAIL_LEN,
        met.py - met.dy * TRAIL_LEN,
        met.pz - met.dz * TRAIL_LEN,
      ).project(camera);
      vMet.tsx = (tmpV.x + 1) / 2 * W;
      vMet.tsy = (1 - tmpV.y) / 2 * H;

      vMet.active = true;
      vMet.env    = env;

      // Traveling point light illuminates 3D starfield with warm glow
      light.position.set(met.px, met.py, met.pz);
      light.intensity = env * 4.5;

      // Starfield disruption — compact but visible (DR=9 gives a nice visible
      // burst without the old over-wide footprint).  Inner wake zone pulls stars.
      const DR     = 9.0;
      const DR2    = DR * DR;
      const WAKE_R = DR * 0.38; // inner wake zone radius
      for (let li = 0; li < 2; li++) {
        const pObj = pts[li].current;
        if (!pObj) continue;
        tmpV.set(met.px, met.py, met.pz);
        tmpV.applyMatrix4(tmpM.copy(pObj.matrixWorld).invert());
        const lx = tmpV.x, ly = tmpV.y, lz = tmpV.z;
        const posArr = pObj.geometry.attributes.position.array as Float32Array;
        const cnt    = LAYERS[li].count;
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
                // Wake zone: pull stars toward meteor's travel direction
                const wakeStr = (1 - d / WAKE_R) * env * 0.65;
                velBufs[li][i * 3]     += met.dx * wakeStr * 2.2;
                velBufs[li][i * 3 + 1] += met.dy * wakeStr * 2.2;
                velBufs[li][i * 3 + 2] += met.dz * wakeStr * 2.2;
              } else {
                // Outer zone: push away from meteor
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

    // Apply and decay disruption: ice-white flash, lerps to white then fades back
    const decay = Math.pow(0.72, Math.min(dt * 60, 6)); // slightly slower decay → more visible
    for (let li = 0; li < 2; li++) {
      const pObj = pts[li].current;
      if (!pObj) continue;
      const colArr = pObj.geometry.attributes.color.array as Float32Array;
      const oc     = origColors[li];
      const disp   = disruption[li];
      const cnt    = LAYERS[li].count;
      let changed  = false;

      for (let i = 0; i < cnt; i++) {
        if (disp[i] > 0.005) {
          changed    = true;
          disp[i]   *= decay;
          const fl   = disp[i];
          // Lerp toward ice-white (0.88, 0.94, 1.0) — guaranteed visible
          // on any star regardless of original color
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

    // Spring-return physics: pull displaced stars back to their rest positions.
    // K = spring stiffness (lower = slower return), damp = energy decay per frame.
    const SPRING_K  = 4.5;
    const dampFac   = Math.pow(0.90, Math.min(dt * 60, 6));
    for (let li = 0; li < 2; li++) {
      const pObj   = pts[li].current;
      if (!pObj) continue;
      const posArr  = pObj.geometry.attributes.position.array as Float32Array;
      const origPos = origPosBufs[li];
      const vel     = velBufs[li];
      const cnt     = LAYERS[li].count;
      let posChanged = false;

      for (let i = 0; i < cnt; i++) {
        const b  = i * 3;
        const v0 = vel[b], v1 = vel[b + 1], v2 = vel[b + 2];
        if (v0 * v0 + v1 * v1 + v2 * v2 < 0.0002) continue;
        posChanged = true;

        // Spring force toward original rest position
        vel[b]     += (origPos[b]     - posArr[b])     * SPRING_K * dt;
        vel[b + 1] += (origPos[b + 1] - posArr[b + 1]) * SPRING_K * dt;
        vel[b + 2] += (origPos[b + 2] - posArr[b + 2]) * SPRING_K * dt;

        // Velocity damping (energy bleed)
        vel[b]     *= dampFac;
        vel[b + 1] *= dampFac;
        vel[b + 2] *= dampFac;

        // Integrate position
        posArr[b]     += vel[b]     * dt;
        posArr[b + 1] += vel[b + 1] * dt;
        posArr[b + 2] += vel[b + 2] * dt;
      }

      if (posChanged) pObj.geometry.attributes.position.needsUpdate = true;
    }

    // ── Camera axes (used by mouse + model repulsion below) ────────────────
    camR.setFromMatrixColumn(camera.matrixWorld, 0);
    camU.setFromMatrixColumn(camera.matrixWorld, 1);

    // ── Mouse repulsion ────────────────────────────────────────────────────
    // Stars near the cursor get a gentle push away; the spring already
    // handles the snap-back. Uses camera axes so the push looks 2D on screen.
    if (voidState.isOnPage) {
      const mx    = voidState.mouseNX;
      const my    = -voidState.mouseNY; // flip Y to match Three.js NDC
      const MR    = 0.14;               // NDC radius
      const MR2   = MR * MR;
      const MPUSH = 0.18;

      for (let li = 0; li < 2; li++) {
        const pObj = pts[li].current;
        if (!pObj) continue;
        const posArr = pObj.geometry.attributes.position.array as Float32Array;
        const vel    = velBufs[li];
        const cnt    = LAYERS[li].count;

        for (let i = 0; i < cnt; i++) {
          tmpV2.set(posArr[i * 3], posArr[i * 3 + 1], posArr[i * 3 + 2]);
          tmpV2.applyMatrix4(pObj.matrixWorld).project(camera);
          if (tmpV2.z > 1) continue;

          const ndx = tmpV2.x - mx;
          const ndy = tmpV2.y - my;
          const nd2 = ndx * ndx + ndy * ndy;
          if (nd2 >= MR2 || nd2 < 0.000001) continue;

          const ndDist = Math.sqrt(nd2);
          const str    = (1 - ndDist / MR) * MPUSH;
          const nx     = ndx / ndDist;
          const ny_    = ndy / ndDist;

          vel[i * 3]     += (camR.x * nx + camU.x * ny_) * str;
          vel[i * 3 + 1] += (camR.y * nx + camU.y * ny_) * str;
          vel[i * 3 + 2] += (camR.z * nx + camU.z * ny_) * str;
        }
      }
    }

    // ── Model star repulsion + colour masking ─────────────────────────────
    // Three complementary techniques clear stars from around each visible model:
    //   1. 3D world-space push  — physical velocity impulse outward from model centre.
    //   2. NDC screen-space push — camera-plane impulse scaled by star depth so
    //      background stars get a proportionally larger world-space kick.
    //   3. NDC colour mask — stars projecting inside the model's screen footprint
    //      are faded toward void-black regardless of physics, definitively
    //      preventing visual overlap from any depth or direction.
    if (workModels.entries.length > 0) {
      const NDC_R      = 0.36;  // repulsion radius (NDC)
      const NDC_R2     = NDC_R * NDC_R;
      const NDC_PUSH   = 0.14;
      const MASK_R     = 0.30;  // mask radius — slightly larger than model visual footprint
      const MASK_R2    = MASK_R * MASK_R;
      const W3D        = 5.5;
      const W3D2       = W3D * W3D;
      const W3D_PUSH   = 0.18;
      const MASK_DECAY = Math.pow(0.72, Math.min(dt * 60, 6)); // fast recovery

      // Decay all masks toward 0 — refreshed below for currently visible models
      for (let li = 0; li < 3; li++) {
        const mask = modelMask[li];
        const cnt  = li < 2 ? LAYERS[li].count : LAYERS[2].count;
        for (let i = 0; i < cnt; i++) { if (mask[i] > 0) mask[i] *= MASK_DECAY; }
      }

      workModels.entries.forEach((entry) => {
        // Only mask stars for the actively-selected model
        if (workModels.activeModelId !== entry.id) return;
        const proximity = 1;

        // Model is always centred at (0, 0, 2) in the new menu-based layout
        const mwX    = 0;
        const mwY    = 0;
        const mwZ    = 2.0;
        const mwZeff = mwZ;

        tmpV.set(mwX, mwY, mwZeff).project(camera);
        const screenValid = tmpV.z <= 1;
        const cx = screenValid ? tmpV.x : 0;
        const cy = screenValid ? tmpV.y : 0;

        // Layers 0+1 get velocity physics; all 3 layers get colour masking
        for (let li = 0; li < 3; li++) {
          const pObj = pts[li]?.current;
          if (!pObj) continue;
          const posArr = pObj.geometry.attributes.position.array as Float32Array;
          const cnt    = LAYERS[li].count;
          const mask   = modelMask[li];
          const vel    = li < 2 ? velBufs[li] : null;

          for (let i = 0; i < cnt; i++) {
            const sx = posArr[i * 3], sy = posArr[i * 3 + 1], sz = posArr[i * 3 + 2];

            // ── 3D volumetric push (layers 0+1 only) ──────────────────────
            if (vel) {
              const dx3 = sx - mwX, dy3 = sy - mwY, dz3 = sz - mwZeff;
              const d2_3 = dx3 * dx3 + dy3 * dy3 + dz3 * dz3;
              if (d2_3 < W3D2 && d2_3 > 0.001) {
                const d3  = Math.sqrt(d2_3);
                const str = (1 - d3 / W3D) * W3D_PUSH * proximity;
                vel[i * 3]     += (dx3 / d3) * str;
                vel[i * 3 + 1] += (dy3 / d3) * str;
                vel[i * 3 + 2] += (dz3 / d3) * str;
              }
            }

            // ── NDC push + colour mask (all 3 layers) ─────────────────────
            if (!screenValid) continue;
            tmpV2.set(sx, sy, sz).applyMatrix4(pObj.matrixWorld).project(camera);
            if (tmpV2.z > 1) continue;
            const ndx = tmpV2.x - cx, ndy = tmpV2.y - cy;
            const nd2 = ndx * ndx + ndy * ndy;
            if (nd2 > NDC_R2 || nd2 < 0.000001) continue;

            const ndDist = Math.sqrt(nd2);

            // NDC velocity push (layers 0+1 only, depth-scaled)
            if (vel) {
              const approxDist = Math.sqrt(sx * sx + sy * sy + sz * sz);
              const depthScale = Math.max(1, approxDist / 14);
              const str        = (1 - ndDist / NDC_R) * NDC_PUSH * proximity * depthScale;
              const nx2 = ndx / ndDist, ny2 = ndy / ndDist;
              vel[i * 3]     += (camR.x * nx2 + camU.x * ny2) * str;
              vel[i * 3 + 1] += (camR.y * nx2 + camU.y * ny2) * str;
              vel[i * 3 + 2] += (camR.z * nx2 + camU.z * ny2) * str;
            }

            // Colour mask: set when inside MASK_R, otherwise let decay handle it
            if (nd2 < MASK_R2) {
              const strength = (1 - ndDist / MASK_R) * proximity;
              if (strength > mask[i]) mask[i] = strength;
            }
          }
        }
      });

      // ── Apply model colour mask to all 3 star layers ─────────────────────
      for (let li = 0; li < 3; li++) {
        const pObj = pts[li]?.current;
        if (!pObj) continue;
        const mask   = modelMask[li];
        const colArr = pObj.geometry.attributes.color.array as Float32Array;
        const oc     = origColors[li];
        const cnt    = LAYERS[li].count;
        let   changed = false;

        for (let i = 0; i < cnt; i++) {
          if (mask[i] > 0.006) {
            changed = true;
            const fl = mask[i];
            colArr[i * 3]     = oc[i * 3]     * (1 - fl);
            colArr[i * 3 + 1] = oc[i * 3 + 1] * (1 - fl);
            colArr[i * 3 + 2] = oc[i * 3 + 2] * (1 - fl);
          } else if (mask[i] > 0) {
            changed = true;
            mask[i] = 0;
            colArr[i * 3]     = oc[i * 3];
            colArr[i * 3 + 1] = oc[i * 3 + 1];
            colArr[i * 3 + 2] = oc[i * 3 + 2];
          }
        }
        if (changed) pObj.geometry.attributes.color.needsUpdate = true;
      }
    }
  });

  return <group ref={groupRef} />;
}

// ─── Mouse-localised wireframe shader ────────────────────────────────────
// Wireframe edges fade to transparent outside a screen-space radius of the
// mouse cursor in NDC coords.  This gives a "scan-line" brush effect where
// edges are only revealed near where the user is hovering.
function makeWireframeMat(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uMouseNDC: { value: new THREE.Vector2(9, 9) }, // starts off-screen
      uOpacity:  { value: 0 },
      uRadius:   { value: 0.28 }, // NDC radius ≈ 14 % of screen width
    },
    vertexShader: /* glsl */`
      uniform vec2  uMouseNDC;
      uniform float uRadius;
      varying float vFade;
      void main() {
        vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = clip;
        vec2  ndc  = clip.xy / clip.w;
        float dist = length(ndc - uMouseNDC);
        vFade = 1.0 - smoothstep(uRadius * 0.35, uRadius, dist);
      }
    `,
    fragmentShader: /* glsl */`
      uniform float uOpacity;
      varying float vFade;
      void main() {
        float a = uOpacity * vFade;
        if (a < 0.005) discard;
        gl_FragColor = vec4(0.53, 0.87, 1.0, a);
      }
    `,
    transparent: true,
    depthWrite:  false,
    blending:    THREE.AdditiveBlending,
    toneMapped:  false,
  });
}

// ─── Single work model floating in the void ───────────────────────────────
export const MODEL_X_OFFSETS = [0, 0.6, -0.6, 0.3, -0.3];
export const MODEL_Z_OFFSETS = [0, -0.3, 0.3, 0.15, -0.15];

function VoidModel({ entry, idx }: { entry: WorkModelEntry; idx: number }) {
  const scene         = useFBX(entry.modelPath);
  const posGroupRef   = useRef<THREE.Group>(null);  // world position + depth offset
  const rotGroupRef   = useRef<THREE.Group>(null);  // user/auto rotation
  const scaleGroupRef = useRef<THREE.Group>(null);  // entrance animation (0→1)
  const allMats       = useRef<THREE.MeshStandardMaterial[]>([]);
  const wireMatRefs   = useRef<THREE.ShaderMaterial[]>([]);
  const hoveredRef    = useRef(false);
  const opacityRef    = useRef(0);
  const entranceRef   = useRef(0); // 0→1 entrance progress

  // ── Replace FBX materials + compute normScale ──────────────────────────────
  // FBXLoader applies a cm→m scale correction to the root group (scale 0.01).
  // Cloning individual geometries loses that parent transform, making the model
  // either huge or invisible.  Instead we keep the full scene graph intact and
  // render it via <primitive>, swapping only the materials so we can control
  // opacity + PBR textures ourselves.
  // normScale is computed from the world-space bounding box (which already
  // accounts for FBXLoader's axis + scale corrections) and is applied as a
  // constant child group, keeping scaleGroupRef free for entrance animation.
  const { normScale, centreOffset } = useMemo(() => {
    allMats.current = [];
    scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        const mesh = o as THREE.Mesh;
        const prev = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        prev.forEach(m => (m as THREE.Material)?.dispose());
        const mat = new THREE.MeshStandardMaterial({
          color:             0xffffff,
          emissive:          new THREE.Color(0x000000),
          emissiveIntensity: 0,
          roughness:         0.72,
          metalness:         0.05,
          transparent:       true,
          opacity:           0,
          depthWrite:        true,
          envMapIntensity:   1.2,
          side:              THREE.FrontSide,
        });
        mesh.material = mat;
        allMats.current.push(mat);
      }
    });
    const box    = new THREE.Box3().setFromObject(scene);
    const size   = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const maxDim = Math.max(size.x, size.y, size.z);
    const ns     = maxDim > 0 ? 4.5 / maxDim : 1;
    // centreOffset is in the WORLD-NORMALISED frame (post-normScale).
    // Placing this group OUTSIDE normScale means its position is in the same
    // coordinate space as the already-scaled geometry, making the math exact:
    //   centreOffset = -center * ns  →  model's visual centre → (0,0,0)
    return { normScale: ns, centreOffset: center.clone().negate().multiplyScalar(ns) };
  }, [scene]);

  // ── Async PBR texture loading ──────────────────────────────────────────────
  const texSig = [
    entry.textures.map, entry.textures.normalMap,
    entry.textures.roughnessMap, entry.textures.metalnessMap,
  ].filter(Boolean).join("|");

  useEffect(() => {
    if (!texSig) return;
    const loader = new THREE.TextureLoader();
    const t      = entry.textures;

    const applyAll = (update: (m: THREE.MeshStandardMaterial) => void) => {
      allMats.current.forEach(m => { if (m) { update(m); m.needsUpdate = true; } });
    };

    if (t.map) loader.loadAsync(t.map).then(tex => {
      tex.colorSpace = THREE.SRGBColorSpace;
      applyAll(m => { m.map = tex; });
    }).catch(() => {});

    if (t.normalMap) loader.loadAsync(t.normalMap).then(tex => {
      applyAll(m => { m.normalMap = tex; });
    }).catch(() => {});

    if (t.roughnessMap) loader.loadAsync(t.roughnessMap).then(tex => {
      applyAll(m => { m.roughnessMap = tex; m.roughness = 1; });
    }).catch(() => {});

    if (t.metalnessMap) loader.loadAsync(t.metalnessMap).then(tex => {
      applyAll(m => { m.metalnessMap = tex; m.metalness = 1; });
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texSig]);

  // All models always render at the scene centre — menu selection controls visibility
  const worldX = 0;
  const worldZ = 2.0;
  // worldY tracks the camera's lookat Y so the model stays screen-centred while
  // scrolling.  Derivation: camera is at (0, -sp*10, 12), lookat at (0, -sp*7, 0),
  // the view-ray passes through z=worldZ at Y = -sp * 7.5.
  const getWorldY = () => -voidState.scrollProgress * 7.5;

  useEffect(() => {
    if (scaleGroupRef.current) scaleGroupRef.current.scale.setScalar(0.001);
    if (posGroupRef.current) posGroupRef.current.position.set(worldX, getWorldY(), worldZ - 9);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Mouse-localised wireframe edges added imperatively into each mesh ───────
  useEffect(() => {
    wireMatRefs.current = [];
    scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        const mesh = o as THREE.Mesh;
        try {
          const edgeGeo = new THREE.EdgesGeometry(mesh.geometry, 15);
          const mat     = makeWireframeMat();
          const lines   = new THREE.LineSegments(edgeGeo, mat);
          mesh.add(lines);
          wireMatRefs.current.push(mat);
        } catch { /* skip incompatible geometry */ }
      }
    });
    return () => {
      scene.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) {
          const mesh = o as THREE.Mesh;
          mesh.children
            .filter(c => c instanceof THREE.LineSegments)
            .forEach(c => {
              mesh.remove(c);
              (c as THREE.LineSegments).geometry.dispose();
              ((c as THREE.LineSegments).material as THREE.Material).dispose();
            });
        }
      });
      wireMatRefs.current = [];
    };
  }, [scene]);

  useFrame((s, dt) => {
    // ── Opacity: driven by activeModelId, not scroll position ─────────────
    const opTarget = workModels.activeModelId === entry.id ? 1 : 0;
    opacityRef.current += (opTarget - opacityRef.current) * Math.min(dt * 3.0, 1);

    // Reset entrance when fully faded so re-entry re-animates
    if (opacityRef.current < 0.01) entranceRef.current = 0;

    // ── Entrance scale ─────────────────────────────────────────────────────
    if (opacityRef.current > 0.04 && entranceRef.current < 1) {
      entranceRef.current = Math.min(entranceRef.current + dt / 1.4, 1);
    }
    if (scaleGroupRef.current) {
      const t    = entranceRef.current;
      const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      // normScale is applied via a static inner group — this group is 0→1 entrance only
      scaleGroupRef.current.scale.setScalar(Math.max(0.001, ease));
    }

    // ── Opacity applied to materials ──────────────────────────────────────
    const op = opacityRef.current;
    allMats.current.forEach((m) => { if (m) m.opacity = op; });

    // ── Depth: model arrives from / recedes into background ───────────────
    if (posGroupRef.current) {
      const depthBack = (1 - op) * 9;
      posGroupRef.current.position.set(worldX, getWorldY(), worldZ - depthBack);
    }

    // ── Sync from workModels entry ─────────────────────────────────────────
    const e = workModels.entries.find((en) => en.id === entry.id);
    if (!e) return;
    hoveredRef.current = e.hovered;

    // ── Rotation: drag + momentum + auto-spin ─────────────────────────────
    if (rotGroupRef.current) {
      if (!e.isDragging) {
        const decay = Math.pow(0.93, Math.min(dt * 60, 6));
        e.velX *= decay;
        e.velY *= decay;
        e.rotX += e.velX;
        e.rotY += e.velY;
        e.rotY += dt * 0.45;
      }
      // Entrance/exit spin: extra rotation that unwinds as the model fully appears
      const entranceSpin = (1 - op) * Math.PI * 1.5;
      rotGroupRef.current.rotation.x = e.rotX;
      rotGroupRef.current.rotation.y = e.rotY + entranceSpin;
    }

    // ── Emissive pulse (subtle — textures provide the colour, this adds rim glow) ──
    const mat0 = allMats.current[0];
    if (mat0) {
      // Set the emissive colour to a very subtle ice-blue only when we have it
      if (mat0.emissive.r === 0 && mat0.emissive.g === 0 && mat0.emissive.b === 0) {
        mat0.emissive.set(0x223344);
      }
      const baseEI = e.hovered ? 0.10 : 0.02;
      mat0.emissiveIntensity +=
        (baseEI + 0.02 * Math.sin(s.clock.elapsedTime * 0.65) - mat0.emissiveIntensity) * 0.04;
      if (allMats.current.length > 1) {
        allMats.current.slice(1).forEach((m) => {
          if (m) m.emissiveIntensity = mat0.emissiveIntensity;
        });
      }
    }

    // ── Mouse-localised wireframe: update NDC uniform + opacity ──────────
    const wireTarget = e.hovered ? op * 0.90 : 0;
    wireMatRefs.current.forEach((m) => {
      if (!m) return;
      // voidState.mouseNX is +right, mouseNY is +down (DOM space).
      // WebGL NDC Y is +up, so negate.
      m.uniforms.uMouseNDC.value.set(voidState.mouseNX, -voidState.mouseNY);
      m.uniforms.uOpacity.value += (wireTarget - m.uniforms.uOpacity.value) * 0.12;
    });
  });

  return (
    // renderOrder=1 ensures models render on top of stars (renderOrder=-1)
    <group ref={posGroupRef} renderOrder={1}>
      {/* Model spins inside rotGroupRef */}
      <group ref={rotGroupRef}>
        {/* Entrance animation: 0 → 1 */}
        <group ref={scaleGroupRef}>
          {/* centreOffset (world-normalised frame) is applied OUTSIDE normScale.
              Formula: centreOffset = -center * normScale
              This guarantees the model's visual bounding-box centre lands at
              the parent origin regardless of FBX coordinate conventions. */}
          <group position={[centreOffset.x, centreOffset.y, centreOffset.z]}>
            <group scale={normScale}>
              <primitive object={scene} />
            </group>
          </group>
        </group>
      </group>
    </group>
  );
}

// ─── All work models in the void ─────────────────────────────────────────
function WorkModelsInScene() {
  const [entries, setEntries] = useState<WorkModelEntry[]>([]);
  const versionRef = useRef(-1);

  useFrame(() => {
    if (workModels.version !== versionRef.current) {
      versionRef.current = workModels.version;
      setEntries([...workModels.entries]);
    }
  });

  if (entries.length === 0) return null;

  return (
    <>
      {entries.map((e, idx) => (
        <VoidModel key={e.id} entry={e} idx={idx} />
      ))}
    </>
  );
}

// ─── Scene ─────────────────────────────────────────────────────────────────
function VoidScene() {
  const pts0 = useRef<THREE.Points>(null);
  const pts1 = useRef<THREE.Points>(null);
  const pts2 = useRef<THREE.Points>(null);

  return (
    <>
      <color attach="background" args={["#000005"]} />
      {/* ── Studio three-point lighting for PBR model display ── */}
      {/* Global fill — lifts shadows without flattening */}
      <ambientLight intensity={0.32} color="#c0d8ee" />
      {/* Key light: upper-left, main illumination — kept moderate to avoid blown highlights */}
      <directionalLight position={[-4, 10, 7]}  intensity={2.2} color="#f0f8ff" />
      {/* Fill light: opposite side — brightened to reduce harsh shadow side */}
      <directionalLight position={[ 5, 3, 5]}   intensity={1.8} color="#d8eeff" />
      {/* Rim/back light: separating edge — softened */}
      <directionalLight position={[ 0, -4, -10]} intensity={0.9} color="#7ab8e8" />
      {/* Overhead kicker — subtle top highlight */}
      <directionalLight position={[ 0, 12, 2]}   intensity={0.8} color="#e4f4ff" />
      {/* Close point light at model centre */}
      <pointLight position={[0, 0, 5]} intensity={1.4} color="#a0d0f0" distance={18} />
      {/* IBL — reduced to prevent over-glossy reflections */}
      <Environment preset="studio" environmentIntensity={0.85} />

      <StarLayer li={0} pointsRef={pts0} />
      <StarLayer li={1} pointsRef={pts1} />
      <StarLayer li={2} pointsRef={pts2} />

      <VoidCore />
      <VoidCamera />
      <VoidMotion />

      <StarHoverSystem pts={[pts0, pts1, pts2]} />
      <ShootingStars   pts={[pts0, pts1, pts2]} />

      {/* Work models rendered directly in the void — no separate canvas */}
      <Suspense fallback={null}>
        <WorkModelsInScene />
      </Suspense>
    </>
  );
}

// ─── Root export ───────────────────────────────────────────────────────────
export default function VoidBackground() {
  useEffect(() => {
    let prevMX = 0, prevMY = 0, prevMT = performance.now();
    let prevSP = 0, prevST = performance.now();

    const onMove = (e: MouseEvent) => {
      const nx  = (e.clientX / window.innerWidth)  * 2 - 1;
      const ny  = (e.clientY / window.innerHeight) * 2 - 1;
      const now = performance.now();
      const dt  = Math.max(now - prevMT, 8) * 0.001;
      const raw = Math.min(Math.hypot(nx - prevMX, ny - prevMY) / dt, 10);
      voidState.mouseVel = voidState.mouseVel * 0.65 + raw * 0.35;
      prevMX = nx; prevMY = ny; prevMT = now;
      voidState.mouseNX  = nx;
      voidState.mouseNY  = ny;
      voidState.isOnPage = true;
    };
    const onLeave = () => {
      voidState.mouseNX  = 0;
      voidState.mouseNY  = 0;
      voidState.isOnPage = false;
      voidState.mouseVel = 0;
    };
    const onScroll = () => {
      const max  = document.documentElement.scrollHeight - window.innerHeight;
      const newP = max > 0 ? window.scrollY / max : 0;
      const now  = performance.now();
      const dt   = Math.max(now - prevST, 8) * 0.001;
      const raw  = Math.min(Math.abs(newP - prevSP) / dt, 5);
      voidState.scrollVel      = voidState.scrollVel * 0.60 + raw * 0.40;
      voidState.scrollProgress = newP;
      prevSP = newP;
      prevST = now;
    };

    document.addEventListener("mousemove",  onMove);
    document.addEventListener("mouseleave", onLeave);
    window.addEventListener("scroll",       onScroll, { passive: true });
    return () => {
      document.removeEventListener("mousemove",  onMove);
      document.removeEventListener("mouseleave", onLeave);
      window.removeEventListener("scroll",       onScroll);
    };
  }, []);

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" }}
      role="presentation"
      aria-hidden="true"
    >
      <Canvas
        camera={{ position: [0, 0, 12], fov: 50 }}
        dpr={[1, 1.5]}
        style={{ width: "100%", height: "100%", display: "block" }}
        aria-label="Interactive 3D star field with model viewer"
      >
        <VoidScene />
      </Canvas>
    </div>
  );
}
