"use client";

/**
 * CrystalCorridor — Scroll-driven dual smoke animation.
 *
 * Two composited animated layers:
 *   1. Back smoke (90 frames, depth atmosphere, subtle parallax)
 *   2. Front smoke (90 frames, foreground atmosphere, stronger parallax)
 *
 * PERFORMANCE:
 *   - Frames pre-decoded with createImageBitmap() — off-thread WebP decode
 *     eliminates synchronous decode stutter on first drawImage per frame.
 *   - Canvas DPR hard-capped to 1.0 — source images are 1920×1080, no
 *     visual benefit from retina scaling on soft volumetric smoke. This
 *     reduces fillrate from ~12M to ~5M pixels per redraw.
 *   - Skip redraw when same frame and parallax stable.
 *   - Container display:none past corridor end for zero ongoing cost.
 *   - rAF only runs while corridor is potentially visible.
 *
 * Both sequences end at fully transparent frames, so no manual
 * opacity fade is needed — the animation naturally dissolves.
 */

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { voidState } from "../lib/voidState";
import { getDeviceProfile } from "../lib/deviceTier";
import { loadGate } from "../lib/loadingOrchestrator";

/** Scroll fraction where corridor sequence ends (middle ground timing) */
const CORRIDOR_END = 0.15;

/** Per-layer parallax magnitude (px at canvas scale) */
const PARALLAX_BACK  = 8;   // subtle — far layer
const PARALLAX_FRONT = 22;  // strong — near layer

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

/** Image source type — ImageBitmap when createImageBitmap is available, HTMLImageElement as fallback */
type FrameImage = ImageBitmap | HTMLImageElement;

/** Get image dimensions (works for both ImageBitmap and HTMLImageElement) */
function imgWidth(img: FrameImage): number {
  return img instanceof ImageBitmap ? img.width : img.naturalWidth;
}
function imgHeight(img: FrameImage): number {
  return img instanceof ImageBitmap ? img.height : img.naturalHeight;
}

export default function CrystalCorridor() {
  const profile = useMemo(() => getDeviceProfile(), []);
  const TOTAL_FRAMES = profile.smokeFrames;
  const EAGER_COUNT = profile.smokeEager;
  const LAZY_BATCH = profile.tier === "low" ? 10 : 15;
  const SMOKE_FOLDER_BACK = `smoke_back${profile.smokeSuffix}`;
  const SMOKE_FOLDER_FRONT = `smoke_front${profile.smokeSuffix}`;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const backFramesRef = useRef<(FrameImage | null)[]>(new Array(TOTAL_FRAMES).fill(null));
  const frontFramesRef = useRef<(FrameImage | null)[]>(new Array(TOTAL_FRAMES).fill(null));
  const currentFrameRef = useRef(-1);
  const smoothFrameRef = useRef(0);
  const springVelRef = useRef(0);      // spring velocity for frame position
  const lastTickRef = useRef(0);       // timestamp for dt calculation
  // Per-layer parallax offsets (smoothed independently)
  const offsetBackX = useRef(0);
  const offsetBackY = useRef(0);
  const offsetFrontX = useRef(0);
  const offsetFrontY = useRef(0);
  const rafRef = useRef(0);
  const [ready, setReady] = useState(false);

  /**
   * Load + pre-decode a single frame.
   * Uses createImageBitmap for off-thread WebP decode where available,
   * falls back to HTMLImageElement for older browsers.
   */
  const loadFrame = useCallback(async (
    folder: string,
    index: number,
    targetArray: (FrameImage | null)[],
  ): Promise<void> => {
    if (targetArray[index]) return;
    const padded = String(index + 1).padStart(2, "0");
    const url = `/hero/${folder}/${padded}.webp`;

    try {
      if (typeof createImageBitmap !== "undefined") {
        // Preferred: off-thread decode via createImageBitmap
        const resp = await fetch(url);
        const blob = await resp.blob();
        const bmp = await createImageBitmap(blob);
        targetArray[index] = bmp;
      } else {
        // Fallback: HTMLImageElement (synchronous decode on first drawImage)
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const el = new Image();
          el.decoding = "async";
          el.src = url;
          el.onload = () => resolve(el);
          el.onerror = reject;
        });
        targetArray[index] = img;
      }
    } catch {
      // Silent fail — frame will be skipped during rendering
    }
  }, []);

  // ── Preload frames for both layers ──
  useEffect(() => {
    let cancelled = false;

    async function preload() {
      // Eager: first N frames of both layers in parallel
      const eagerBack: Promise<void>[] = [];
      const eagerFront: Promise<void>[] = [];
      for (let i = 0; i < Math.min(EAGER_COUNT, TOTAL_FRAMES); i++) {
        eagerBack.push(loadFrame(SMOKE_FOLDER_BACK, i, backFramesRef.current));
        eagerFront.push(loadFrame(SMOKE_FOLDER_FRONT, i, frontFramesRef.current));
      }
      await Promise.all([...eagerBack, ...eagerFront]);
      if (cancelled) return;
      setReady(true);
      loadGate.markSmokeReady();

      // Lazy: remaining frames in batches
      for (let start = EAGER_COUNT; start < TOTAL_FRAMES; start += LAZY_BATCH) {
        if (cancelled) return;
        const batch: Promise<void>[] = [];
        for (let i = start; i < Math.min(start + LAZY_BATCH, TOTAL_FRAMES); i++) {
          batch.push(loadFrame(SMOKE_FOLDER_BACK, i, backFramesRef.current));
          batch.push(loadFrame(SMOKE_FOLDER_FRONT, i, frontFramesRef.current));
        }
        await Promise.all(batch);
      }
    }

    preload();
    return () => { cancelled = true; };
  }, [loadFrame, EAGER_COUNT, LAZY_BATCH, SMOKE_FOLDER_BACK, SMOKE_FOLDER_FRONT, TOTAL_FRAMES]);

  // ── Scroll-driven dual-layer canvas rendering ──
  useEffect(() => {
    if (!ready) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    // DPR HARD-CAPPED to 1.0 — smoke images are 1920×1080, no visual benefit
    // from retina scaling on soft volumetric smoke. Reduces fillrate by 2-4×.
    const dpr = 1;

    const resize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      // Force redraw after resize
      currentFrameRef.current = -1;
    };
    resize();
    window.addEventListener("resize", resize);

    /** Draw an image cover-fit to canvas with parallax offset */
    function drawCover(
      image: FrameImage,
      cw: number, ch: number,
      ox: number, oy: number,
      alpha: number,
      extraScale = 1.08,
    ) {
      const iw = imgWidth(image);
      const ih = imgHeight(image);
      if (iw === 0 || ih === 0) return;
      const imgAspect = iw / ih;
      const canvasAspect = cw / ch;
      let drawW: number, drawH: number;
      if (canvasAspect > imgAspect) {
        drawW = cw * extraScale;
        drawH = drawW / imgAspect;
      } else {
        drawH = ch * extraScale;
        drawW = drawH * imgAspect;
      }
      ctx!.globalAlpha = alpha;
      ctx!.drawImage(image, (cw - drawW) / 2 + ox, (ch - drawH) / 2 + oy, drawW, drawH);
    }

    // ── Spring constants for silky frame interpolation ──────────────────
    // Critically-damped spring: responsive to scroll input but settles
    // without oscillation. dt-aware so it's framerate-independent.
    const SPRING_K    = 90;   // stiffness — higher = faster response
    const SPRING_DAMP = 19;   // damping — ~2*sqrt(K) for critical damping

    lastTickRef.current = performance.now();

    const tick = (now: number) => {
      rafRef.current = requestAnimationFrame(tick);

      // dt-aware spring physics (capped to prevent explosion on tab-switch)
      const dt = Math.min((now - lastTickRef.current) / 1000, 0.05);
      lastTickRef.current = now;

      const p = voidState.scrollProgress;

      // Hide entirely past corridor for zero cost
      if (p > CORRIDOR_END + 0.04) {
        if (containerRef.current) containerRef.current.style.display = "none";
        return;
      }
      if (containerRef.current) containerRef.current.style.display = "";

      // Map scroll → target frame (continuous, not quantized)
      const corridorP = Math.min(p / CORRIDOR_END, 1);
      const targetFrame = corridorP * (TOTAL_FRAMES - 1);

      // Spring physics on frame position — gives momentum + settle
      const displacement = targetFrame - smoothFrameRef.current;
      const springForce  = displacement * SPRING_K;
      const dampForce    = springVelRef.current * SPRING_DAMP;
      springVelRef.current += (springForce - dampForce) * dt;
      smoothFrameRef.current += springVelRef.current * dt;

      // Clamp to valid range
      smoothFrameRef.current = Math.max(0, Math.min(TOTAL_FRAMES - 1, smoothFrameRef.current));

      // Crossfade: split into floor/ceil frame + fractional blend
      const frameA = Math.floor(smoothFrameRef.current);
      const frameB = Math.min(frameA + 1, TOTAL_FRAMES - 1);
      const frac   = smoothFrameRef.current - frameA;

      // Mouse parallax — different magnitude per layer for depth
      const mx = voidState.mouseNX;
      const my = voidState.mouseNY;

      // Back smoke: subtle, slow chase (dt-aware lerp)
      const pLerp = Math.min(dt * 4, 1);
      offsetBackX.current = lerp(offsetBackX.current, mx * PARALLAX_BACK * dpr, pLerp * 0.5);
      offsetBackY.current = lerp(offsetBackY.current, my * PARALLAX_BACK * 0.5 * dpr, pLerp * 0.5);

      // Front smoke: strong, fast chase
      offsetFrontX.current = lerp(offsetFrontX.current, mx * PARALLAX_FRONT * dpr, pLerp * 1.2);
      offsetFrontY.current = lerp(offsetFrontY.current, my * PARALLAX_FRONT * 0.5 * dpr, pLerp * 1.2);

      // Skip redraw if spring has settled (velocity near zero, same frames)
      const settled = Math.abs(springVelRef.current) < 0.05 && frac < 0.01;
      const parallaxStable =
        Math.abs(offsetBackX.current) < 0.3 &&
        Math.abs(offsetFrontX.current) < 0.3;
      if (settled && parallaxStable && frameA === currentFrameRef.current) return;
      currentFrameRef.current = frameA;

      const cw = canvas.width;
      const ch = canvas.height;
      ctx!.clearRect(0, 0, cw, ch);

      // ── Crossfade rendering ──────────────────────────────────────────
      // Draw both floor and ceil frames with alpha blending based on
      // fractional position. This eliminates visible frame stepping —
      // the eye sees a smooth blend between adjacent frames.

      const backA  = backFramesRef.current[frameA];
      const backB  = backFramesRef.current[frameB];
      const frontA = frontFramesRef.current[frameA];
      const frontB = frontFramesRef.current[frameB];

      // Layer 1: Back smoke — depth atmosphere
      if (backA) {
        drawCover(backA, cw, ch,
          offsetBackX.current, offsetBackY.current,
          0.6 * (1 - frac), 1.12);
      }
      if (backB && frac > 0.01) {
        drawCover(backB, cw, ch,
          offsetBackX.current, offsetBackY.current,
          0.6 * frac, 1.12);
      }

      // Layer 2: Front smoke — foreground atmosphere
      if (frontA) {
        drawCover(frontA, cw, ch,
          offsetFrontX.current, offsetFrontY.current,
          0.5 * (1 - frac), 1.14);
      }
      if (frontB && frac > 0.01) {
        drawCover(frontB, cw, ch,
          offsetFrontX.current, offsetFrontY.current,
          0.5 * frac, 1.14);
      }

      ctx!.globalAlpha = 1;
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [ready, TOTAL_FRAMES]);

  return (
    <div
      ref={containerRef}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1,
        pointerEvents: "none",
        overflow: "hidden",
      }}
      aria-hidden="true"
    >
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
        }}
      />
    </div>
  );
}
