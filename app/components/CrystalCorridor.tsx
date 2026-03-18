"use client";

/**
 * CrystalCorridor — Scroll-driven layered hero composition.
 *
 * Three composited layers:
 *   1. Back smoke still (depth atmosphere, subtle parallax)
 *   2. Animated stair sequence (90 frames at 1280×720 WebP, scroll-scrubbed)
 *   3. Front smoke still (foreground atmosphere, stronger parallax)
 *
 * The back smoke sits behind the stair animation. The front smoke
 * overlays it, giving volumetric depth. Parallax offsets differ per
 * layer so the composition reads as spatial, not flat.
 *
 * Performance:
 *   - First 12 frames loaded eagerly for instant response
 *   - Remaining frames lazy-loaded in batches of 12
 *   - Smoke stills preloaded in parallel with first batch
 *   - Canvas drawImage composites 3 layers per rAF — cheap
 *   - Container display:none past corridor end for zero ongoing cost
 *   - rAF only runs while corridor is potentially visible
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { voidState } from "../lib/voidState";

/** Total frames in the animated stair sequence */
const TOTAL_FRAMES = 90;

/** Scroll fraction where corridor sequence ends */
const CORRIDOR_END = 0.18;

/** How many frames to eagerly preload */
const EAGER_COUNT = 12;

/** Batch size for lazy loading remaining frames */
const LAZY_BATCH = 12;

/** Per-layer parallax magnitude (px at canvas scale) */
const PARALLAX_BACK  = 6;   // subtle — far layer
const PARALLAX_STAIR = 12;  // medium — main animation
const PARALLAX_FRONT = 20;  // strong — near layer

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export default function CrystalCorridor() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const framesRef = useRef<(HTMLImageElement | null)[]>(new Array(TOTAL_FRAMES).fill(null));
  const backSmokeRef = useRef<HTMLImageElement | null>(null);
  const frontSmokeRef = useRef<HTMLImageElement | null>(null);
  const loadedCountRef = useRef(0);
  const currentFrameRef = useRef(-1);
  const smoothFrameRef = useRef(0);
  // Per-layer parallax offsets (smoothed independently)
  const offsetBackX = useRef(0);
  const offsetBackY = useRef(0);
  const offsetStairX = useRef(0);
  const offsetStairY = useRef(0);
  const offsetFrontX = useRef(0);
  const offsetFrontY = useRef(0);
  const opacityRef = useRef(1);
  const rafRef = useRef(0);
  const dprRef = useRef(1);
  const [ready, setReady] = useState(false);

  /** Load a single stair frame */
  const loadFrame = useCallback((index: number): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      if (framesRef.current[index]) {
        resolve(framesRef.current[index]!);
        return;
      }
      const img = new Image();
      img.decoding = "async";
      const padded = String(index + 1).padStart(2, "0");
      img.src = `/hero/seq/${padded}.webp`;
      img.onload = () => {
        framesRef.current[index] = img;
        loadedCountRef.current++;
        resolve(img);
      };
      img.onerror = reject;
    });
  }, []);

  /** Load a smoke layer image */
  const loadSmoke = useCallback((path: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.decoding = "async";
      img.src = path;
      img.onload = () => resolve(img);
      img.onerror = reject;
    });
  }, []);

  // ── Preload frames + smoke layers ──
  useEffect(() => {
    let cancelled = false;

    async function preload() {
      // Kick off smoke loading in parallel with frame loading
      const smokePromise = Promise.all([
        loadSmoke("/hero/smoke/back.webp"),
        loadSmoke("/hero/smoke/front.webp"),
      ]);

      // Eager: first N stair frames
      const eagerPromises: Promise<HTMLImageElement>[] = [];
      for (let i = 0; i < Math.min(EAGER_COUNT, TOTAL_FRAMES); i++) {
        eagerPromises.push(loadFrame(i));
      }
      const [smokeResult] = await Promise.all([smokePromise, Promise.all(eagerPromises)]);
      if (cancelled) return;

      backSmokeRef.current = smokeResult[0];
      frontSmokeRef.current = smokeResult[1];
      setReady(true);

      // Lazy: remaining stair frames in batches
      for (let start = EAGER_COUNT; start < TOTAL_FRAMES; start += LAZY_BATCH) {
        if (cancelled) return;
        const batch: Promise<HTMLImageElement>[] = [];
        for (let i = start; i < Math.min(start + LAZY_BATCH, TOTAL_FRAMES); i++) {
          batch.push(loadFrame(i));
        }
        await Promise.all(batch);
      }
    }

    preload();
    return () => { cancelled = true; };
  }, [loadFrame, loadSmoke]);

  // ── Scroll-driven multi-layer canvas rendering ──
  useEffect(() => {
    if (!ready) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio, 2);
    dprRef.current = dpr;

    const resize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    };
    resize();
    window.addEventListener("resize", resize);

    /** Draw an image cover-fit to canvas with parallax offset */
    function drawCover(
      image: HTMLImageElement,
      cw: number, ch: number,
      ox: number, oy: number,
      alpha: number,
      extraScale = 1.08,
    ) {
      const imgAspect = image.naturalWidth / image.naturalHeight;
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

    const tick = () => {
      rafRef.current = requestAnimationFrame(tick);

      const p = voidState.scrollProgress;

      // Hide entirely past corridor for zero cost
      if (p > CORRIDOR_END + 0.04) {
        if (containerRef.current) containerRef.current.style.display = "none";
        return;
      }
      if (containerRef.current) containerRef.current.style.display = "";

      // Map scroll → frame index
      const corridorP = Math.min(p / CORRIDOR_END, 1);
      const targetFrame = corridorP * (TOTAL_FRAMES - 1);

      // Smooth interpolation for silky scrubbing
      smoothFrameRef.current = lerp(smoothFrameRef.current, targetFrame, 0.18);
      const frameIdx = Math.round(Math.max(0, Math.min(TOTAL_FRAMES - 1, smoothFrameRef.current)));

      // Mouse parallax — different magnitude per layer for depth
      const mx = voidState.mouseNX;
      const my = voidState.mouseNY;

      // Back smoke: subtle, slow chase
      offsetBackX.current = lerp(offsetBackX.current, mx * PARALLAX_BACK * dpr, 0.03);
      offsetBackY.current = lerp(offsetBackY.current, my * PARALLAX_BACK * 0.5 * dpr, 0.03);

      // Stair animation: medium
      offsetStairX.current = lerp(offsetStairX.current, mx * PARALLAX_STAIR * dpr, 0.06);
      offsetStairY.current = lerp(offsetStairY.current, my * PARALLAX_STAIR * 0.5 * dpr, 0.06);

      // Front smoke: strong, fast chase
      offsetFrontX.current = lerp(offsetFrontX.current, mx * PARALLAX_FRONT * dpr, 0.09);
      offsetFrontY.current = lerp(offsetFrontY.current, my * PARALLAX_FRONT * 0.5 * dpr, 0.09);

      // Opacity — fade out approaching corridor end
      const fadeStart = CORRIDOR_END * 0.65;
      const fadeEnd = CORRIDOR_END;
      let targetOpacity = 1;
      if (p >= fadeStart) {
        targetOpacity = Math.max(0, 1 - (p - fadeStart) / (fadeEnd - fadeStart));
      }
      opacityRef.current = lerp(opacityRef.current, targetOpacity, 0.12);

      // Skip redraw if same frame and parallax stable
      const parallaxMoving =
        Math.abs(offsetStairX.current) > 0.3 ||
        Math.abs(offsetFrontX.current) > 0.3;
      const shouldDraw = frameIdx !== currentFrameRef.current || parallaxMoving;
      if (!shouldDraw && Math.abs(opacityRef.current - targetOpacity) < 0.01) return;
      currentFrameRef.current = frameIdx;

      const stairImg = framesRef.current[frameIdx];
      if (!stairImg) return;

      const cw = canvas.width;
      const ch = canvas.height;
      ctx!.clearRect(0, 0, cw, ch);

      const op = opacityRef.current;

      // Layer 1: Back smoke — dimmer, very subtle parallax
      if (backSmokeRef.current) {
        drawCover(backSmokeRef.current, cw, ch,
          offsetBackX.current, offsetBackY.current,
          op * 0.55, 1.12);
      }

      // Layer 2: Animated stair sequence — main content
      drawCover(stairImg, cw, ch,
        offsetStairX.current, offsetStairY.current,
        op, 1.08);

      // Layer 3: Front smoke — brighter, stronger parallax
      if (frontSmokeRef.current) {
        drawCover(frontSmokeRef.current, cw, ch,
          offsetFrontX.current, offsetFrontY.current,
          op * 0.45, 1.14);
      }

      ctx!.globalAlpha = 1;
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [ready]);

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
