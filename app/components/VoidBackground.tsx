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

import React, { useRef, useMemo, useEffect, useState, useCallback, Suspense, createContext, useContext } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, useFBX, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { voidState } from "../lib/voidState";
import { workModels, WorkModelEntry, subscribeExpanded } from "../lib/workModels";

type LayerConfig = readonly { count: number; rMin: number; rMax: number; rotSpd: number; size: number; seed: number }[];

// ─── Star layer config ─────────────────────────────────────────────────────
// Desktop: full density. Mobile: reduced for <5% GPU cost.
const LAYERS_DESKTOP = [
  { count: 1800, rMin: 14, rMax: 30, rotSpd: 0.007, size: 0.22, seed: 11111 },
  { count: 1400, rMin: 26, rMax: 44, rotSpd: 0.011, size: 0.28, seed: 22222 },
  { count:  900, rMin: 36, rMax: 58, rotSpd: 0.017, size: 0.36, seed: 33333 },
] as const;
const LAYERS_MOBILE = [
  { count: 600, rMin: 14, rMax: 30, rotSpd: 0.008, size: 0.24, seed: 11111 },
  { count: 500, rMin: 26, rMax: 44, rotSpd: 0.012, size: 0.30, seed: 22222 },
  { count: 350, rMin: 36, rMax: 58, rotSpd: 0.018, size: 0.36, seed: 33333 },
] as const;

const VoidContext = createContext<{ isMobile: boolean; layers: LayerConfig }>({ isMobile: false, layers: LAYERS_DESKTOP });

// ─── Seeded random ─────────────────────────────────────────────────────────
function sr(seed: number) {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}


// ─── Star color builder ────────────────────────────────────────────────────
function buildStarColors(count: number, seed: number): Float32Array {
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

// ─── Star sprite shader: clean round dot — no wide halo, no ray pattern ───
// Wide halos cause additive-blending bloom/flicker when many stars overlap.
// Holographic hover effects live in EffectsOverlay (2D canvas) instead.
function makeHoloStarMat(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uSize:    { value: 0.22 },
      uOpacity: { value: 0.90 },
      uVH:      { value: 400.0 }, // physical half-height of canvas, updated per frame
    },
    vertexShader: /* glsl */`
      varying vec3 vColor;
      uniform float uSize;
      uniform float uVH;
      void main() {
        vColor = color;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        // Correct pixel size: projectionMatrix[1][1] = 1/tan(fov/2)
        // uVH = drawingBufferHeight * 0.5 (physical pixels, includes dpr)
        float nat = uSize * projectionMatrix[1][1] * uVH / (-mv.z);
        if (nat < 0.5) {
          gl_Position = vec4(10.0, 10.0, 10.0, 1.0);
          gl_PointSize = 1.0;
          return;
        }
        gl_Position = projectionMatrix * mv;
        gl_PointSize = max(2.0, nat);
      }
    `,
    fragmentShader: /* glsl */`
      uniform float uOpacity;
      varying vec3 vColor;

      void main() {
        vec2 uv = gl_PointCoord * 2.0 - 1.0;
        float r = length(uv);
        if (r > 1.0) discard;

        // exp(-r²×7): soft enough to be visible at 2–3px, crisp enough to avoid halos
        float core = exp(-r * r * 7.0);
        float a    = uOpacity * core;
        if (a < 0.004) discard;
        gl_FragColor = vec4(vColor * core, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
  });
}

// ─── Star layer component ─────────────────────────────────────────────────
function StarLayer({
  li,
  pointsRef,
}: {
  li: 0 | 1 | 2;
  pointsRef: React.RefObject<THREE.Points | null>;
}) {
  const { layers } = useContext(VoidContext);
  const cfg    = layers[li];
  const geo    = useMemo(() => buildStarGeo(cfg.count, cfg.rMin, cfg.rMax, cfg.seed), [cfg]);
  const mat    = useMemo(() => makeHoloStarMat(), []);

  useEffect(() => () => mat.dispose(), [mat]);

  useFrame((s, dt) => {
    if (!pointsRef.current || !mat.uniforms) return;
    // Scroll-speed spin boost: fast scroll accelerates star rotation up to 4×
    const scrollBoost = 1 + Math.min(Math.abs(voidState.scrollVel) * 4, 3);
    pointsRef.current.rotation.y += dt * cfg.rotSpd * scrollBoost;
    pointsRef.current.rotation.x += dt * cfg.rotSpd * 0.32 * scrollBoost;

    const dim = 1 - voidState.scrollProgress * 0.12;
    mat.uniforms.uOpacity.value = 0.90 * dim;
    mat.uniforms.uSize.value    = cfg.size;
    // Feed physical half-height so nat is in real screen pixels regardless of dpr/fov
    mat.uniforms.uVH.value = (s.gl.domElement as HTMLCanvasElement).height * 0.5;
  });

  return (
    <points ref={pointsRef} renderOrder={-1}>
      <primitive object={geo} attach="geometry" />
      <primitive object={mat} attach="material" />
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

// ─── Mouse-following rim light ─────────────────────────────────────────────
// Reads voidState.mouseNX/Y each frame and smoothly repositions a warm
// point light. Creates interactive rim/key lighting that shifts as you move
// the mouse — the model reflects the light source changing position.
function MouseLight() {
  const ref = useRef<THREE.PointLight>(null);
  const lx  = useRef(0);
  const ly  = useRef(0);

  useFrame((_, dt) => {
    if (!ref.current) return;
    const f    = Math.min(dt * 60, 6);
    const lerp = Math.min(0.055 * f, 1);
    // mouseNX: −1..+1 (right positive)
    // mouseNY: −1..+1 (+1 = bottom), so negate for 3D-Y (top positive)
    lx.current += (voidState.mouseNX * 9  - lx.current) * lerp;
    ly.current += (-voidState.mouseNY * 6 - ly.current) * lerp;
    ref.current.position.set(lx.current, ly.current, 7);
  });

  // Warm-white: contrasts with the ice-blue ambient/hemisphere for clear directionality
  return (
    <pointLight ref={ref} color="#ffeedd" intensity={1.1} distance={20} />
  );
}

// ─── Camera: mouse parallax + scroll descent + spring physics ──────────────
// Spring-damp replaces simple lerp — camera overshoots slightly and settles
// naturally, giving cinematic inertia. Multi-frequency float avoids repetition.
const MAX_P      = 1.9;
const SPRING_K   = 5.0;  // stiffness (higher = snappier)
const SPRING_DAMP = 4.2;  // damping  (< 2*sqrt(K) = ~4.47 → slight overshoot)

function VoidCamera() {
  const { camera } = useThree();
  const cp  = useRef(new THREE.Vector3(0, 0, 12));
  const cvx = useRef(0);   // camera X velocity
  const cvy = useRef(0);   // camera Y velocity
  const lt  = useRef(new THREE.Vector3(0, 0, 0));
  const lt2 = useMemo(() => new THREE.Vector3(), []);
  const wasExpandedRef = useRef(false);

  useFrame((s, dt) => {
    const expanded = workModels.expandedModelId;
    if (expanded) {
      wasExpandedRef.current = true;
      return; // OrbitControls takes over
    }
    // Handoff: sync refs from OrbitControls when viewer closes — zero velocity
    if (wasExpandedRef.current) {
      cp.current.copy(camera.position);
      cvx.current = 0;
      cvy.current = 0;
      lt.current.copy(camera.position).add(camera.getWorldDirection(lt2).multiplyScalar(10));
      wasExpandedRef.current = false;
    }
    const t  = s.clock.elapsedTime;

    // Multi-frequency float: three prime-ratio harmonics — never exactly repeats
    const dx = Math.sin(t * 0.038) * 0.42 + Math.cos(t * 0.071) * 0.18 + Math.sin(t * 0.017) * 0.28;
    const dy = Math.cos(t * 0.028) * 0.28 + Math.sin(t * 0.059) * 0.14 + Math.cos(t * 0.023) * 0.22;

    const scrollOffY = -voidState.scrollProgress * 10;

    const tx = voidState.mouseNX * MAX_P + dx;
    const ty = (-voidState.mouseNY) * MAX_P * 0.55 + dy + scrollOffY;

    // Spring physics: F = k*(target - pos) - d*vel
    const cdt = Math.min(dt, 0.05); // clamp for stability at low framerates
    cvx.current += ((tx - cp.current.x) * SPRING_K - cvx.current * SPRING_DAMP) * cdt;
    cvy.current += ((ty - cp.current.y) * SPRING_K - cvy.current * SPRING_DAMP) * cdt;
    cp.current.x += cvx.current * cdt;
    cp.current.y += cvy.current * cdt;
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

// ─── Expanded view: OrbitControls when fullscreen viewer open ─────────────
// On mobile: autoRotate off until first interaction (performance)
function ExpandedOrbitControls() {
  const { camera, gl } = useThree();
  const prevExpandedRef = useRef<string | null>(null);
  const [hasInteracted, setHasInteracted] = useState(false);
  const { isMobile } = useContext(VoidContext);

  useFrame(() => {
    const expanded = workModels.expandedModelId;
    if (expanded && prevExpandedRef.current !== expanded) {
      prevExpandedRef.current = expanded;
      camera.position.set(0, 0, 10);
      camera.lookAt(0, 0, 2);
      setHasInteracted(false);
    } else if (!expanded) {
      prevExpandedRef.current = null;
    }
  });

  useEffect(() => {
    if (!isMobile || !workModels.expandedModelId) return;
    const canvas = gl.domElement;
    const onInteract = () => setHasInteracted(true);
    canvas.addEventListener("pointerdown", onInteract, { once: true });
    return () => canvas.removeEventListener("pointerdown", onInteract);
   
  }, [isMobile, gl]);

  if (!workModels.expandedModelId) return null;
  return (
    <OrbitControls
      enablePan={false}
      enableZoom
      enableRotate
      autoRotate={!isMobile || hasInteracted}
      autoRotateSpeed={0.4}
      dampingFactor={0.08}
      enableDamping
      minDistance={2.5}
      maxDistance={20}
      minPolarAngle={Math.PI * 0.08}
      maxPolarAngle={Math.PI * 0.92}
      target={[0, 0, 2]}
    />
  );
}

// ─── Velocity decay + scroll motion blur ───────────────────────────────────
function VoidMotion() {
  const { gl } = useThree();
  useFrame((_, dt) => {
    voidState.ready = true; // signal LoadingScreen that first frame is done
    const f = Math.min(dt * 60, 6);
    voidState.mouseVel  *= Math.pow(0.88, f);
    voidState.scrollVel *= Math.pow(0.90, f);

    // Motion blur: CSS blur on the Three.js canvas proportional to scroll speed
    const blur = Math.min(voidState.scrollVel * 3.2, 5.5);
    (gl.domElement as HTMLCanvasElement).style.filter =
      blur > 0.25 ? `blur(${blur.toFixed(2)}px)` : "";
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
      // Suppress hover when cursor is off-page
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
          const px = (tmpV.x + 1) / 2 * W;
          const py = (1 - tmpV.y) / 2 * H;
          // Suppress hover effects if star is inside the active model footprint
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

  const { layers } = useContext(VoidContext);
  // Per-star disruption strength buffer
  const disruption = useMemo(() => [
    new Float32Array(layers[0].count),
    new Float32Array(layers[1].count),
  ], [layers]);

  // Original star colors (seeded, exact match to buildStarGeo) — all 3 layers
  const origColors = useMemo(() => [
    buildStarColors(layers[0].count, layers[0].seed),
    buildStarColors(layers[1].count, layers[1].seed),
    buildStarColors(layers[2].count, layers[2].seed),
  ], [layers]);

  // Original star positions — rest positions for the spring simulation
  const origPosBufs = useMemo(() => [
    buildStarPositions(layers[0].count, layers[0].rMin, layers[0].rMax, layers[0].seed),
    buildStarPositions(layers[1].count, layers[1].rMin, layers[1].rMax, layers[1].seed),
  ], [layers]);

  // Per-star velocity buffer for physical displacement (world-units / second)
  const velBufs = useMemo(() => [
    new Float32Array(layers[0].count * 3),
    new Float32Array(layers[1].count * 3),
  ], [layers]);

  // Per-star model mask (0–1): how much to fade this star toward void-black.
  const modelMask = useMemo(() => [
    new Float32Array(layers[0].count),
    new Float32Array(layers[1].count),
    new Float32Array(layers[2].count),
  ], [layers]);

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
        // eslint-disable-next-line react-hooks/immutability
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
            // eslint-disable-next-line react-hooks/immutability
            if (str > disp[i]) disp[i] = str;

            if (d > 0.05) {
              if (d < WAKE_R) {
                // Wake zone: pull stars toward meteor's travel direction
                const wakeStr = (1 - d / WAKE_R) * env * 0.65;
                // eslint-disable-next-line react-hooks/immutability
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
      const cnt    = layers[li].count;
      let changed  = false;

      for (let i = 0; i < cnt; i++) {
        if (disp[i] > 0.005) {
          changed    = true;
           
          disp[i]   *= decay;
          const fl   = disp[i];
          // Lerp toward ice-white (0.88, 0.94, 1.0) — guaranteed visible
          // on any star regardless of original color
          // eslint-disable-next-line react-hooks/immutability
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
      const cnt     = layers[li].count;
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
        const cnt  = li < 2 ? layers[li].count : layers[2].count;
        // eslint-disable-next-line react-hooks/immutability
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
          const cnt    = layers[li].count;
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
        const cnt    = layers[li].count;
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

function VoidModel({ entry }: { entry: WorkModelEntry }) {
  const scene         = useFBX(entry.modelPath);
  const posGroupRef   = useRef<THREE.Group>(null);  // world position + depth offset
  const rotGroupRef   = useRef<THREE.Group>(null);  // user/auto rotation
  const scaleGroupRef = useRef<THREE.Group>(null);  // entrance animation (0→1)
  const allMats       = useRef<THREE.MeshPhysicalMaterial[]>([]);
  const wireMatRefs   = useRef<THREE.ShaderMaterial[]>([]);
  const hoveredRef    = useRef(false);
  const opacityRef    = useRef(0);
  const entranceRef   = useRef(0); // 0→1 entrance progress
  // Locked Y: captured when work section is in view so model stays anchored
  // to the work section's viewport position rather than drifting with global scroll.
  const lockedWorkY   = useRef<number | null>(null);
  const tmpMp         = useMemo(() => new THREE.Vector3(), []);

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
    const labelLike = /(normal\s*map|tangent|tris|polygon|vertex|uv\s*map|specular|roughness\s*map|metalness|debug|label)/i;
    allMats.current = [];
    scene.traverse((o) => {
      if (labelLike.test(o.name)) {
        o.visible = false;
        return;
      }
      if ((o as THREE.Mesh).isMesh) {
        const mesh = o as THREE.Mesh;
        const prev = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        prev.forEach(m => (m as THREE.Material)?.dispose());
        const mat = new THREE.MeshPhysicalMaterial({
          color:              0xffffff,
          emissive:           new THREE.Color(0x000000),
          emissiveIntensity:  0,
          roughness:          0.65,
          metalness:          0.08,
          transparent:        true,
          opacity:            0,
          depthWrite:         true,
          envMapIntensity:    2.4,
          iridescence:        0,
          clearcoat:          0.18,
          clearcoatRoughness: 0.08,
          side:               THREE.FrontSide,
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

    const applyAll = (update: (m: THREE.MeshPhysicalMaterial) => void) => {
      allMats.current.forEach(m => { if (m) { update(m); m.needsUpdate = true; } });
    };

    if (t.map) loader.loadAsync(t.map).then(tex => {
      tex.colorSpace = THREE.SRGBColorSpace;
      applyAll(m => { m.map = tex; });
    }).catch(() => {});

    if (t.normalMap) loader.loadAsync(t.normalMap).then(tex => {
      tex.colorSpace = THREE.NoColorSpace; // normal maps are linear data, not sRGB
      applyAll(m => { m.normalMap = tex; m.normalMapType = THREE.TangentSpaceNormalMap; });
    }).catch(() => {});

    if (t.roughnessMap) loader.loadAsync(t.roughnessMap).then(tex => {
      // Cap at 0.88 so surfaces never go full mirror — prevents dark patches on metallic faces
      applyAll(m => { m.roughnessMap = tex; m.roughness = 0.88; });
    }).catch(() => {});

    if (t.metalnessMap) loader.loadAsync(t.metalnessMap).then(tex => {
      // Cap at 0.85 — retains slight diffuse response so dark metals catch fill lights
      applyAll(m => { m.metalnessMap = tex; m.metalness = 0.85; });
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texSig]);

  // All models always render at the scene centre — menu selection controls visibility
  const worldX = 0;
  const worldZ = 2.0;
  // worldY tracks the camera's lookat Y so the model stays screen-centred while
  // scrolling.  Derivation: camera is at (0, -sp*10, 12), lookat at (0, -sp*7, 0),
  // the view-ray passes through z=worldZ at Y = -sp * 7.5.
  // We lock this value when the work section is visible so the model is anchored
  // to the work section's viewport position rather than floating at screen center
  // when the user scrolls past the section.
  const getWorldY = () => {
    const dynamic = -voidState.scrollProgress * 7.5;
    if (workModels.sectionRatio > 0.20) lockedWorkY.current = dynamic;
    return lockedWorkY.current ?? dynamic;
  };

  useEffect(() => {
    if (scaleGroupRef.current) scaleGroupRef.current.scale.setScalar(0.001);
    if (posGroupRef.current) posGroupRef.current.position.set(worldX, getWorldY(), worldZ - 9);
    // Intentionally run once on mount — getWorldY() reads voidState.scrollProgress,
    // which we don't want in deps (would re-run on every scroll).
     
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
    opacityRef.current += (opTarget - opacityRef.current) * Math.min(dt * 5.5, 1);

    // Reset entrance when fully faded so re-entry re-animates
    if (opacityRef.current < 0.01) entranceRef.current = 0;

    // ── Entrance scale ─────────────────────────────────────────────────────
    if (opacityRef.current > 0.04 && entranceRef.current < 1) {
      entranceRef.current = Math.min(entranceRef.current + dt / 0.8, 1);
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

    // ── Signal first model ready for LoadingScreen ───────────────────────
    if (op > 0.3 && workModels.entries[0]?.id === entry.id) {
      voidState.firstModelReady = true;
    }

    // ── Depth: model arrives from / recedes into background ───────────────
    if (posGroupRef.current) {
      const depthBack  = (1 - op) * 9;
      const isExpanded = workModels.expandedModelId === entry.id;
      const targetY    = isExpanded ? 0 : getWorldY();
      const curY       = posGroupRef.current.position.y;
      const newY       = curY + (targetY - curY) * Math.min(dt * 4, 1);
      posGroupRef.current.position.set(worldX, newY, worldZ - depthBack);
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

    // ── Wireframe: keep hidden ────────────────────────────────────────────
    wireMatRefs.current.forEach((m) => {
      if (!m) return;
      m.uniforms.uOpacity.value += (0 - m.uniforms.uOpacity.value) * 0.12;
    });

    // ── Write model screen region so hover effects are suppressed on model ─
    if (workModels.activeModelId === entry.id && posGroupRef.current && op > 0.08) {
      posGroupRef.current.getWorldPosition(tmpMp);
      tmpMp.project(s.camera);
      const W = s.size.width, H = s.size.height;
      voidState.modelRegion.x   = (tmpMp.x + 1) / 2 * W;
      voidState.modelRegion.y   = (1 - tmpMp.y) / 2 * H;
      voidState.modelRegion.rPx = Math.min(W, H) * 0.22 * Math.min(op, 1);
    } else if (workModels.activeModelId !== entry.id) {
      // Zero out only if no other model is active (last active model clears it)
      if (workModels.activeModelId === null) voidState.modelRegion.rPx = 0;
    }
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

// ─── Volumetric dust motes ────────────────────────────────────────────────
// 220 slow-drifting ice-blue particles — no per-particle updates, just group
// rotation. Creates a sense of depth and ambient atmosphere without GPU cost.
function DustParticles() {
  const groupRef = useRef<THREE.Group>(null);

  const geo = useMemo(() => {
    const count = 220;
    const pos   = new Float32Array(count * 3);
    const seed  = 77777;
    for (let i = 0; i < count; i++) {
      const theta = sr(seed + i * 5 + 0) * Math.PI * 2;
      const phi   = Math.acos(2 * sr(seed + i * 5 + 1) - 1);
      const r     = 8 + sr(seed + i * 5 + 2) * 30;  // 8–38 units from center
      pos[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = r * Math.cos(phi);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return g;
  }, []);

  const mat = useMemo(() => new THREE.PointsMaterial({
    color:           new THREE.Color(0.78, 0.92, 1.0),
    size:            0.055,
    sizeAttenuation: true,
    transparent:     true,
    opacity:         0.20,
    blending:        THREE.AdditiveBlending,
    depthWrite:      false,
  }), []);

  useEffect(() => () => { geo.dispose(); mat.dispose(); }, [geo, mat]);

  useFrame((_, dt) => {
    if (!groupRef.current) return;
    groupRef.current.rotation.y += dt * 0.0038;
    groupRef.current.rotation.x += dt * 0.0016;
  });

  return (
    <group ref={groupRef}>
      <points renderOrder={-2}>
        <primitive object={geo} attach="geometry" />
        <primitive object={mat} attach="material" />
      </points>
    </group>
  );
}

// ─── All work models in the void — first model eager, others lazy on select ─
function WorkModelsInScene() {
  const [entries, setEntries] = useState<WorkModelEntry[]>([]);
  const [loadedIds, setLoadedIds] = useState<Set<string>>(new Set());
  const versionRef = useRef(-1);

  useFrame(() => {
    if (workModels.version !== versionRef.current) {
      versionRef.current = workModels.version;
      setEntries([...workModels.entries]);
      const firstId    = workModels.entries[0]?.id;
      const activeId   = workModels.activeModelId;
      const expandedId = workModels.expandedModelId;
      setLoadedIds((prev) => {
        const next = new Set(prev);
        if (firstId)    next.add(firstId);
        if (activeId)   next.add(activeId);
        if (expandedId) next.add(expandedId);
        return next;
      });
    }
  });

  if (entries.length === 0) return null;

  // Only mount VoidModel for first + active (lazy-load others on select)
  const toRender = entries.filter((e) => loadedIds.has(e.id));

  return (
    <>
      {toRender.map((e) => (
        <VoidModel key={e.id} entry={e} />
      ))}
    </>
  );
}

// ─── Scene ─────────────────────────────────────────────────────────────────
function VoidScene({ isMobile }: { isMobile: boolean }) {
  const pts0 = useRef<THREE.Points | null>(null);
  const pts1 = useRef<THREE.Points | null>(null);
  const pts2 = useRef<THREE.Points | null>(null);

  const layers = isMobile ? LAYERS_MOBILE : LAYERS_DESKTOP;
  return (
    <VoidContext.Provider value={{ isMobile, layers }}>
    <>
      <color attach="background" args={["#000005"]} />
      {/* ── Neutral studio lighting for PBR models on dark void background ── */}
      <ambientLight intensity={0.40} color="#e0e0e0" />
      {/* Hemisphere: sky-ice above, dark blue-void below — brighter ground lifts dark metal undersides */}
      <hemisphereLight args={["#b8d0ff", "#1a2035", 0.85]} />
      {/* Under-fill: soft blue from below-front to prevent pure-black metal undersides */}
      <directionalLight position={[0, -8, 4]} intensity={0.55} color="#8aa8d0" />
      {/* Key light: upper-left, primary illumination */}
      <directionalLight position={[-4, 10, 7]}  intensity={2.2} color="#ffffff" />
      {/* Fill: opposite side */}
      <directionalLight position={[ 5,  3,  5]}  intensity={1.8} color="#f8f8f8" />
      {/* Front fill: camera-aligned — essential for smooth dark objects */}
      <directionalLight position={[ 0,  2, 12]}  intensity={2.2} color="#f4f4f4" />
      {/* Rim/back: cool blue-grey edge separation */}
      <directionalLight position={[ 0, -4, -10]} intensity={0.9} color="#b0c8e0" />
      {/* Overhead kicker */}
      <directionalLight position={[ 0, 12,  2]}  intensity={0.8} color="#f0f0f0" />
      {/* Camera-adjacent point: brightens camera-facing surfaces of smooth metals */}
      <pointLight position={[0, 0, 5]} intensity={2.5} color="#ffffff" distance={22} />
      {/* IBL: studio preset, elevated intensity for metallic reflections */}
      <Environment preset="studio" environmentIntensity={1.1} />

      <StarLayer li={0} pointsRef={pts0} />
      <StarLayer li={1} pointsRef={pts1} />
      <StarLayer li={2} pointsRef={pts2} />
      <DustParticles />

      <VoidCore />
      <MouseLight />
      <VoidCamera />
      <ExpandedOrbitControls />
      <VoidMotion />

      <StarHoverSystem pts={[pts0, pts1, pts2]} />
      <ShootingStars   pts={[pts0, pts1, pts2]} />

      {/* Work models rendered directly in the void — no separate canvas */}
      <Suspense fallback={null}>
        <WorkModelsInScene />
      </Suspense>
    </>
    </VoidContext.Provider>
  );
}

// ─── Root export ───────────────────────────────────────────────────────────
export default function VoidBackground() {
  const [mounted, setMounted] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 768px)");
    const on = () => setIsMobile(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  useEffect(() => {
    if (!mounted || typeof window === "undefined") return;
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

    // Mobile: track touch position so star hover effects follow the thumb
    const onTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (!touch) return;
      voidState.mouseNX  = (touch.clientX / window.innerWidth)  * 2 - 1;
      voidState.mouseNY  = (touch.clientY / window.innerHeight) * 2 - 1;
      voidState.isOnPage = true;
    };
    const onTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (!touch) return;
      voidState.mouseNX  = (touch.clientX / window.innerWidth)  * 2 - 1;
      voidState.mouseNY  = (touch.clientY / window.innerHeight) * 2 - 1;
      voidState.isOnPage = true;
    };
    const onTouchEnd = () => { voidState.isOnPage = false; };

    document.addEventListener("mousemove",  onMove);
    document.addEventListener("mouseleave", onLeave);
    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove",  onTouchMove,  { passive: true });
    document.addEventListener("touchend",   onTouchEnd);
    window.addEventListener("scroll",       onScroll, { passive: true });
    return () => {
      document.removeEventListener("mousemove",  onMove);
      document.removeEventListener("mouseleave", onLeave);
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove",  onTouchMove);
      document.removeEventListener("touchend",   onTouchEnd);
      window.removeEventListener("scroll",       onScroll);
    };
  }, [mounted]);

  // Sync expanded state — subscribe to workModels changes (no setInterval polling)
  useEffect(() => {
    const unsub = subscribeExpanded(() => setExpanded(!!workModels.expandedModelId));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setExpanded(!!workModels.expandedModelId); // initial sync
    return () => { unsub(); };
  }, []);

  const onCanvasCreated = useCallback((state: { gl: THREE.WebGLRenderer & { domElement?: HTMLCanvasElement } }) => {
    const canvas = state.gl?.domElement;
    if (!canvas?.addEventListener) return;
    const onContextLost = (e: Event) => {
      (e as { preventDefault?: () => void }).preventDefault?.();
    };
    canvas.addEventListener("webglcontextlost", onContextLost, false);
  }, []);

  // Client-only: avoid hydration mismatch — R3F/Three.js runs only after mount
  if (!mounted || typeof window === "undefined") {
    return (
      <div
        style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none", background: "#000005" }}
        role="presentation"
        aria-hidden="true"
      />
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: expanded ? 50 : 0,
        pointerEvents: expanded ? "auto" : "none",
      }}
      role="presentation"
      aria-hidden="true"
    >
      <Canvas
        camera={{ position: [0, 0, 12], fov: 50 }}
        dpr={[1, 1.5]}
        style={{ width: "100%", height: "100%", display: "block" }}
        aria-label="Interactive 3D star field with model viewer"
        onCreated={onCanvasCreated}
      >
        <VoidScene isMobile={isMobile} />
      </Canvas>
    </div>
  );
}
