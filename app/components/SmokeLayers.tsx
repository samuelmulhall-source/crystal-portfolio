"use client";

/**
 * SmokeLayers — Split dual-canvas smoke for the hero sandwich.
 *
 * Renders TWO fixed canvases:
 *   1. Back smoke  (z-index 1) — behind page content
 *   2. Front smoke (z-index 5) — over page content, pointer-events: none
 *
 * The hero video sits between them in normal document flow (z-index 2),
 * creating a depth-layered smoke → asset → smoke composition.
 *
 * Performance:
 *   - Same eager/lazy frame loading as CrystalCorridor
 *   - Each canvas draws a single image per rAF — cheaper than before
 *   - Both canvases display:none past corridor end
 */

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { voidState } from "../lib/voidState";
import { getDeviceProfile } from "../lib/deviceTier";
import { loadGate } from "../lib/loadingOrchestrator";

const CORRIDOR_END = 0.28;
const PARALLAX_BACK = 8;
const PARALLAX_FRONT = 22;

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export default function SmokeLayers() {
  const profile = useMemo(() => getDeviceProfile(), []);
  const TOTAL = profile.smokeFrames;
  const EAGER = profile.smokeEager;
  const BATCH = profile.tier === "low" ? 10 : 15;
  const FOLDER_BACK = `smoke_back${profile.smokeSuffix}`;
  const FOLDER_FRONT = `smoke_front${profile.smokeSuffix}`;

  const backCanvasRef = useRef<HTMLCanvasElement>(null);
  const frontCanvasRef = useRef<HTMLCanvasElement>(null);
  const backContainerRef = useRef<HTMLDivElement>(null);
  const frontContainerRef = useRef<HTMLDivElement>(null);

  const backFrames = useRef<(HTMLImageElement | null)[]>(new Array(TOTAL).fill(null));
  const frontFrames = useRef<(HTMLImageElement | null)[]>(new Array(TOTAL).fill(null));
  const rafRef = useRef(0);
  const dprRef = useRef(1);

  // Per-layer parallax offsets
  const obx = useRef(0);
  const oby = useRef(0);
  const ofx = useRef(0);
  const ofy = useRef(0);

  const [ready, setReady] = useState(false);

  const loadFrame = useCallback(
    (folder: string, index: number, target: (HTMLImageElement | null)[]): Promise<HTMLImageElement> =>
      new Promise((resolve, reject) => {
        if (target[index]) { resolve(target[index]!); return; }
        const img = new Image();
        img.decoding = "async";
        const srcIdx = index * 4 + 1;
        img.src = `/hero/${folder}/${String(Math.min(srcIdx, 200)).padStart(2, "0")}.webp`;
        img.onload = () => { target[index] = img; resolve(img); };
        img.onerror = reject;
      }),
    [],
  );

  // Preload
  useEffect(() => {
    let cancelled = false;
    async function preload() {
      const eb: Promise<HTMLImageElement>[] = [];
      const ef: Promise<HTMLImageElement>[] = [];
      for (let i = 0; i < Math.min(EAGER, TOTAL); i++) {
        eb.push(loadFrame(FOLDER_BACK, i, backFrames.current));
        ef.push(loadFrame(FOLDER_FRONT, i, frontFrames.current));
      }
      await Promise.all([...eb, ...ef]);
      if (cancelled) return;
      setReady(true);
      loadGate.markSmokeReady();

      for (let s = EAGER; s < TOTAL; s += BATCH) {
        if (cancelled) return;
        const batch: Promise<HTMLImageElement>[] = [];
        for (let i = s; i < Math.min(s + BATCH, TOTAL); i++) {
          batch.push(loadFrame(FOLDER_BACK, i, backFrames.current));
          batch.push(loadFrame(FOLDER_FRONT, i, frontFrames.current));
        }
        await Promise.all(batch);
      }
    }
    preload();
    return () => { cancelled = true; };
  }, [loadFrame, EAGER, BATCH, FOLDER_BACK, FOLDER_FRONT, TOTAL]);

  // Render loop
  useEffect(() => {
    if (!ready) return;
    const bc = backCanvasRef.current;
    const fc = frontCanvasRef.current;
    if (!bc || !fc) return;
    const bctx = bc.getContext("2d", { alpha: true });
    const fctx = fc.getContext("2d", { alpha: true });
    if (!bctx || !fctx) return;

    const dpr = Math.min(window.devicePixelRatio, profile.smokeDpr);
    dprRef.current = dpr;

    const resize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      for (const c of [bc, fc]) {
        c.width = w * dpr;
        c.height = h * dpr;
        c.style.width = `${w}px`;
        c.style.height = `${h}px`;
      }
    };
    resize();
    window.addEventListener("resize", resize);

    function drawCover(
      ctx: CanvasRenderingContext2D,
      image: HTMLImageElement,
      cw: number, ch: number,
      ox: number, oy: number,
      alpha: number,
      extra = 1.08,
    ) {
      const ia = image.naturalWidth / image.naturalHeight;
      const ca = cw / ch;
      let dw: number, dh: number;
      if (ca > ia) { dw = cw * extra; dh = dw / ia; }
      else { dh = ch * extra; dw = dh * ia; }
      ctx.globalAlpha = alpha;
      ctx.drawImage(image, (cw - dw) / 2 + ox, (ch - dh) / 2 + oy, dw, dh);
    }

    // Scroll-linear playback: the smoke sequence advances 1:1 with scroll as
    // the page moves from the hero into the work section. The original version
    // looked stuttery because it stepped between discrete frames — here we
    // CROSS-FADE adjacent frames, so the motion is continuous at any scroll
    // speed without any time-based / ping-pong drift.
    const START = (TOTAL - 1) * 0.3; // dense rest frame at scroll 0
    let smoothF = START;
    let lastNow = performance.now();
    let lastDrawF = -1;
    let lastObx = -999, lastOby = -999, lastOfx = -999, lastOfy = -999;

    const tick = (now: number) => {
      rafRef.current = requestAnimationFrame(tick);
      const dt = Math.min((now - lastNow) * 0.001, 0.05);
      lastNow = now;

      const p = voidState.scrollProgress;
      const corridorP = Math.min(Math.max(p / CORRIDOR_END, 0), 1);

      // Frame position tracks scroll linearly; a light ease removes scroll
      // micro-jitter without the laggy "rubberband" feel.
      const targetF = START + corridorP * ((TOTAL - 1) - START);
      smoothF += (targetF - smoothF) * Math.min(dt * 14, 1);

      // Opacity holds over the hero, then fades out as we cross into work.
      const fade = 1 - Math.min(Math.max((corridorP - 0.55) / 0.45, 0), 1);
      const hidden = fade <= 0.001;
      if (backContainerRef.current) {
        backContainerRef.current.style.display = hidden ? "none" : "";
        backContainerRef.current.style.opacity = fade.toFixed(3);
      }
      if (frontContainerRef.current) {
        frontContainerRef.current.style.display = hidden ? "none" : "";
        frontContainerRef.current.style.opacity = fade.toFixed(3);
      }
      if (hidden) return;

      // Mouse parallax (subtle, smoothed).
      const mx = voidState.mouseNX, my = voidState.mouseNY;
      obx.current = lerp(obx.current, mx * PARALLAX_BACK * dpr, 0.05);
      oby.current = lerp(oby.current, my * PARALLAX_BACK * 0.5 * dpr, 0.05);
      ofx.current = lerp(ofx.current, mx * PARALLAX_FRONT * dpr, 0.09);
      ofy.current = lerp(ofy.current, my * PARALLAX_FRONT * 0.5 * dpr, 0.09);

      // Redraw only when the frame advanced or parallax visibly moved.
      const moved =
        Math.abs(obx.current - lastObx) > 0.4 || Math.abs(oby.current - lastOby) > 0.4 ||
        Math.abs(ofx.current - lastOfx) > 0.4 || Math.abs(ofy.current - lastOfy) > 0.4;
      if (Math.abs(smoothF - lastDrawF) < 0.01 && !moved) return;
      lastDrawF = smoothF;
      lastObx = obx.current; lastOby = oby.current; lastOfx = ofx.current; lastOfy = ofy.current;

      // Cross-fade the two frames bracketing the float playhead.
      const i0 = Math.max(0, Math.min(TOTAL - 1, Math.floor(smoothF)));
      const i1 = Math.min(TOTAL - 1, i0 + 1);
      const frac = smoothF - i0;

      const bcw = bc.width, bch = bc.height;
      const fcw = fc.width, fch = fc.height;
      const backLift = bch * 0.05;
      const frontLift = fch * 0.07;

      bctx.clearRect(0, 0, bcw, bch);
      const b0 = backFrames.current[i0], b1 = backFrames.current[i1];
      if (b0) drawCover(bctx, b0, bcw, bch, obx.current, oby.current - backLift, 0.6 * (1 - frac), 1.34);
      if (b1 && frac > 0.001) drawCover(bctx, b1, bcw, bch, obx.current, oby.current - backLift, 0.6 * frac, 1.34);
      bctx.globalAlpha = 1;

      fctx.clearRect(0, 0, fcw, fch);
      const f0 = frontFrames.current[i0], f1 = frontFrames.current[i1];
      if (f0) drawCover(fctx, f0, fcw, fch, ofx.current, ofy.current - frontLift, 0.7 * (1 - frac), 1.46);
      if (f1 && frac > 0.001) drawCover(fctx, f1, fcw, fch, ofx.current, ofy.current - frontLift, 0.7 * frac, 1.46);
      fctx.globalAlpha = 1;
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [ready, TOTAL, profile.smokeDpr]);

  const canvasStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
  };

  return (
    <>
      {/* Back smoke — behind page content */}
      <div
        ref={backContainerRef}
        style={{ position: "fixed", inset: 0, zIndex: 1, pointerEvents: "none", overflow: "hidden", willChange: "opacity" }}
        aria-hidden="true"
      >
        <canvas ref={backCanvasRef} style={canvasStyle} />
      </div>

      {/* Front smoke — over page content AND the hero asset (lantern) */}
      <div
        ref={frontContainerRef}
        style={{ position: "fixed", inset: 0, zIndex: 6, pointerEvents: "none", overflow: "hidden", willChange: "opacity" }}
        aria-hidden="true"
      >
        <canvas ref={frontCanvasRef} style={canvasStyle} />
      </div>
    </>
  );
}
