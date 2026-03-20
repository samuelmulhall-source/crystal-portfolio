"use client";

/**
 * CrystalCorridor — Scroll-driven dual smoke animation.
 *
 * Two composited animated layers:
 *   1. Back smoke (200 frames, depth atmosphere, subtle parallax)
 *   2. Front smoke (200 frames, foreground atmosphere, stronger parallax)
 *
 * RENDERING PIPELINE:
 *   - Spring physics (critically damped) drive a continuous frame position.
 *   - For each layer: two adjacent frames are crossfade-blended on a single
 *     offscreen canvas, then composited to the visible canvas.
 *   - Frames pre-decoded with createImageBitmap() for off-thread WebP decode.
 *   - Canvas DPR hard-capped to 1.0 — source images are 1920×1080.
 *   - Container display:none past corridor end for zero ongoing cost.
 */

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { voidState } from "../lib/voidState";
import { getDeviceProfile } from "../lib/deviceTier";
import { loadGate } from "../lib/loadingOrchestrator";

/** Scroll fraction where corridor sequence ends */
const CORRIDOR_END = 0.15;

/** Per-layer parallax magnitude (px at canvas scale) */
const PARALLAX_BACK  = 8;
const PARALLAX_FRONT = 22;

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

/** Image source type — ImageBitmap when available, HTMLImageElement as fallback */
type FrameImage = ImageBitmap | HTMLImageElement;

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
  const springVelRef = useRef(0);
  const lastTickRef = useRef(0);
  const offsetBackX = useRef(0);
  const offsetBackY = useRef(0);
  const offsetFrontX = useRef(0);
  const offsetFrontY = useRef(0);
  const rafRef = useRef(0);
  const [ready, setReady] = useState(false);

  /** Load + pre-decode a single frame. */
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
        const resp = await fetch(url);
        const blob = await resp.blob();
        const bmp = await createImageBitmap(blob);
        targetArray[index] = bmp;
      } else {
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
    const ctxOrNull = canvas.getContext("2d", { alpha: true });
    if (!ctxOrNull) return;
    const ctx = ctxOrNull; // non-null const for use in closures

    const dpr = 1;

    // Single offscreen canvas for per-layer crossfade blending.
    // Only ONE extra canvas (not two) to stay well within browser limits.
    const blend = document.createElement("canvas");
    const bctx = blend.getContext("2d", { alpha: true });
    if (!bctx) {
      // Canvas context limit hit — fall back to no crossfade
      console.warn("[CrystalCorridor] Could not create offscreen canvas context");
    }

    const resize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      if (bctx) {
        blend.width = w * dpr;
        blend.height = h * dpr;
      }
      currentFrameRef.current = -1;
    };
    resize();
    window.addEventListener("resize", resize);

    /** Draw an image cover-fit with parallax offset */
    function drawCover(
      target: CanvasRenderingContext2D,
      image: FrameImage,
      cw: number, ch: number,
      ox: number, oy: number,
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
      target.drawImage(image, (cw - drawW) / 2 + ox, (ch - drawH) / 2 + oy, drawW, drawH);
    }

    /**
     * Find the nearest loaded frame to `idx`.
     * Searches outward ±1, ±2… Returns null only if nothing loaded.
     */
    function nearestLoaded(
      frames: (FrameImage | null)[],
      idx: number,
    ): FrameImage | null {
      if (idx >= 0 && idx < TOTAL_FRAMES && frames[idx]) return frames[idx];
      for (let d = 1; d < TOTAL_FRAMES; d++) {
        if (idx - d >= 0 && frames[idx - d]) return frames[idx - d];
        if (idx + d < TOTAL_FRAMES && frames[idx + d]) return frames[idx + d];
      }
      return null;
    }

    /**
     * Draw a crossfade-blended smoke layer onto `ctx` (the visible canvas).
     *
     * When the offscreen blend canvas is available:
     *   1. Frame A drawn at full alpha on offscreen
     *   2. Frame B drawn at `frac` alpha on top (source-over → correct lerp for opaque pixels)
     *   3. Offscreen composited to visible canvas at `layerAlpha`
     *
     * When offscreen unavailable: draws frame A directly (no crossfade).
     */
    function drawLayer(
      frames: (FrameImage | null)[],
      idxA: number,
      idxB: number,
      frac: number,
      cw: number, ch: number,
      ox: number, oy: number,
      layerAlpha: number,
      scale: number,
    ) {
      const imgA = nearestLoaded(frames, idxA);
      if (!imgA) return;

      if (bctx) {
        // Crossfade via offscreen canvas
        bctx.clearRect(0, 0, cw, ch);
        bctx.globalAlpha = 1;
        drawCover(bctx, imgA, cw, ch, ox, oy, scale);

        if (frac > 0.005) {
          const imgB = nearestLoaded(frames, idxB);
          if (imgB && imgB !== imgA) {
            bctx.globalAlpha = frac;
            drawCover(bctx, imgB, cw, ch, ox, oy, scale);
          }
        }

        // Composite blended result to visible canvas
        ctx.globalAlpha = layerAlpha;
        ctx.drawImage(blend, 0, 0);
      } else {
        // No offscreen — draw directly without crossfade
        ctx.globalAlpha = layerAlpha;
        drawCover(ctx, imgA, cw, ch, ox, oy, scale);
      }
    }

    // ── Spring constants ──
    const SPRING_K    = 100;
    const SPRING_DAMP = 20;

    lastTickRef.current = performance.now();

    const tick = (now: number) => {
      rafRef.current = requestAnimationFrame(tick);

      const dt = Math.min((now - lastTickRef.current) / 1000, 0.05);
      lastTickRef.current = now;

      const p = voidState.scrollProgress;

      // Hide entirely past corridor for zero cost
      if (p > CORRIDOR_END + 0.04) {
        if (containerRef.current) containerRef.current.style.display = "none";
        return;
      }
      if (containerRef.current) containerRef.current.style.display = "";

      // Map scroll → target frame
      const corridorP = Math.min(p / CORRIDOR_END, 1);
      const targetFrame = corridorP * (TOTAL_FRAMES - 1);

      // Spring physics
      const displacement = targetFrame - smoothFrameRef.current;
      const springForce  = displacement * SPRING_K;
      const dampForce    = springVelRef.current * SPRING_DAMP;
      springVelRef.current += (springForce - dampForce) * dt;
      smoothFrameRef.current += springVelRef.current * dt;
      smoothFrameRef.current = Math.max(0, Math.min(TOTAL_FRAMES - 1, smoothFrameRef.current));

      const frameA = Math.floor(smoothFrameRef.current);
      const frameB = Math.min(frameA + 1, TOTAL_FRAMES - 1);
      const frac   = smoothFrameRef.current - frameA;

      // Mouse parallax
      const mx = voidState.mouseNX;
      const my = voidState.mouseNY;
      const pLerp = Math.min(dt * 4, 1);
      offsetBackX.current = lerp(offsetBackX.current, mx * PARALLAX_BACK * dpr, pLerp * 0.5);
      offsetBackY.current = lerp(offsetBackY.current, my * PARALLAX_BACK * 0.5 * dpr, pLerp * 0.5);
      offsetFrontX.current = lerp(offsetFrontX.current, mx * PARALLAX_FRONT * dpr, pLerp * 1.2);
      offsetFrontY.current = lerp(offsetFrontY.current, my * PARALLAX_FRONT * 0.5 * dpr, pLerp * 1.2);

      // Skip redraw if spring at rest and same frame
      const atRest = Math.abs(springVelRef.current) < 0.01 && frac < 0.005;
      const parallaxStable =
        Math.abs(offsetBackX.current) < 0.3 &&
        Math.abs(offsetFrontX.current) < 0.3;
      if (atRest && parallaxStable && frameA === currentFrameRef.current) return;
      currentFrameRef.current = frameA;

      const cw = canvas.width;
      const ch = canvas.height;
      ctx.clearRect(0, 0, cw, ch);

      // Layer 1: Back smoke
      drawLayer(
        backFramesRef.current,
        frameA, frameB, frac,
        cw, ch,
        offsetBackX.current, offsetBackY.current,
        1.0, 1.12,
      );

      // Layer 2: Front smoke (composites on top via source-over;
      // front frames' alpha channel controls what shows through)
      drawLayer(
        frontFramesRef.current,
        frameA, frameB, frac,
        cw, ch,
        offsetFrontX.current, offsetFrontY.current,
        1.0, 1.14,
      );

      ctx.globalAlpha = 1;
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
