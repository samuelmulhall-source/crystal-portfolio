"use client";

/**
 * HeroIntro — pinned "fly into the smoke" intro.
 *
 * The smoke lives INSIDE the hero (back canvas → content → front canvas), so
 * the front layer genuinely sits in front of the lantern. The hero pins for one
 * viewport of scroll; that scroll scrubs the smoke frame sequence (a camera
 * flying into the smoke — the frames self-dissolve to alpha at the end, so no
 * manual fade is needed) while the text and lantern dissolve out. Past the pin,
 * the page scrolls normally into the work section.
 *
 * Smoke is gated to quality tier ≥ 2; at Lite the hero renders normally with
 * mouse parallax and no smoke.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HeroEntrance } from "./HeroEntrance";
import { HeroParallax } from "./HeroParallax";
import { useQuality } from "./QualityProvider";
import { getDeviceProfile } from "../../lib/deviceTier";
import { loadGate } from "../../lib/loadingOrchestrator";
import { lenisInstance } from "../SmoothScroll";

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Nearest already-loaded frame to idx — avoids blank flashes while frames
 *  are still streaming in. */
function nearestLoaded(
  frames: (HTMLImageElement | null)[],
  idx: number,
): HTMLImageElement | null {
  if (frames[idx]) return frames[idx];
  for (let d = 1; d < frames.length; d++) {
    if (idx - d >= 0 && frames[idx - d]) return frames[idx - d];
    if (idx + d < frames.length && frames[idx + d]) return frames[idx + d];
  }
  return null;
}

export function HeroIntro({ children }: { children: React.ReactNode }) {
  const { tier } = useQuality();
  const pinned = tier >= 2;

  const profile = useMemo(() => getDeviceProfile(), []);
  const TOTAL = profile.smokeFrames;
  const EAGER = profile.smokeEager;
  const BATCH = profile.tier === "low" ? 10 : 15;
  const FOLDER_BACK = `smoke_back${profile.smokeSuffix}`;
  const FOLDER_FRONT = `smoke_front${profile.smokeSuffix}`;

  const sectionRef = useRef<HTMLElement>(null);
  const backRef = useRef<HTMLCanvasElement>(null);
  const frontRef = useRef<HTMLCanvasElement>(null);
  const backFrames = useRef<(HTMLImageElement | null)[]>(new Array(TOTAL).fill(null));
  const frontFrames = useRef<(HTMLImageElement | null)[]>(new Array(TOTAL).fill(null));
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

  // Preload frames (only when smoke is enabled).
  useEffect(() => {
    if (!pinned) { loadGate.markSmokeReady(); return; }
    let cancelled = false;
    (async () => {
      const eager: Promise<HTMLImageElement>[] = [];
      for (let i = 0; i < Math.min(EAGER, TOTAL); i++) {
        eager.push(loadFrame(FOLDER_BACK, i, backFrames.current));
        eager.push(loadFrame(FOLDER_FRONT, i, frontFrames.current));
      }
      await Promise.all(eager);
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
    })();
    return () => { cancelled = true; };
  }, [pinned, loadFrame, EAGER, BATCH, FOLDER_BACK, FOLDER_FRONT, TOTAL]);

  // Scroll controller: scrub frames + dissolve content across the pin.
  useEffect(() => {
    if (!pinned || !ready) return;
    const bc = backRef.current, fc = frontRef.current, section = sectionRef.current;
    if (!bc || !fc || !section) return;
    const bctx = bc.getContext("2d", { alpha: true });
    const fctx = fc.getContext("2d", { alpha: true });
    if (!bctx || !fctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, profile.smokeDpr);
    let currentIdx = 0;   // playback head (float)
    let lastDrawIdx = -1; // last integer frame drawn
    let lastCp = -1;      // last playback progress applied to content
    let lastT = performance.now();
    const MIN_FPS = 42;   // locked playback floor (frames/sec)
    const CATCHUP = 6;    // extra rate for big scroll jumps
    const resize = () => {
      const w = window.innerWidth, h = window.innerHeight;
      for (const c of [bc, fc]) {
        c.width = w * dpr; c.height = h * dpr;
        c.style.width = `${w}px`; c.style.height = `${h}px`;
      }
      lastDrawIdx = -1; lastCp = -1; // force redraw at new size
    };

    const fadeEls = Array.from(section.querySelectorAll<HTMLElement>("[data-hero-fade]"));

    const drawCover = (ctx: CanvasRenderingContext2D, img: HTMLImageElement, alpha: number) => {
      const W = bc.width, H = bc.height;
      const ia = img.naturalWidth / img.naturalHeight;
      const ca = W / H;
      const extra = 1.12;
      let dw: number, dh: number;
      if (ca > ia) { dw = W * extra; dh = dw / ia; } else { dh = H * extra; dw = dh * ia; }
      ctx.globalAlpha = alpha;
      ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2 - H * 0.04, dw, dh);
      ctx.globalAlpha = 1;
    };

    let raf = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min((now - lastT) / 1000, 0.05);
      lastT = now;

      const introDist = window.innerHeight || 1;
      // Aim at the UN-eased scroll destination (Lenis.targetScroll), not its
      // soft-tailed animated position, so the frames never creep at gesture end.
      const dest =
        lenisInstance && typeof lenisInstance.targetScroll === "number"
          ? lenisInstance.targetScroll
          : window.scrollY || 0;
      const targetIdx = clamp01(dest / introDist) * (TOTAL - 1);

      // Locked-framerate playback toward the target: at least MIN_FPS, faster
      // for big scroll jumps, never overshooting.
      const gap = targetIdx - currentIdx;
      const adist = Math.abs(gap);
      if (adist < 0.001) currentIdx = targetIdx;
      else currentIdx += Math.sign(gap) * Math.min(adist, Math.max(MIN_FPS, adist * CATCHUP) * dt);

      const di = Math.round(currentIdx);
      const cp = clamp01(currentIdx / (TOTAL - 1));
      if (di === lastDrawIdx && Math.abs(cp - lastCp) < 0.0006) return; // settled
      lastCp = cp;

      // ── Cinematic dive: each layer is "passed" by the camera as it accelerates
      //    into the smoke — translate outward + scale + motion-blur, the lantern
      //    blooming brighter before it dissolves. Driven by playback (cp) so it
      //    stays locked to the smoke. ──
      const p = cp;
      for (const el of fadeEls) {
        const role = el.dataset.heroFade;
        if (role === "text") {
          const m = clamp01(p / 0.46), em = m * m;
          el.style.opacity = (1 - m).toFixed(3);
          el.style.transform =
            `translate(${(-em * 160).toFixed(1)}px, ${(-em * 64).toFixed(1)}px) ` +
            `scale(${(1 + em * 1.4).toFixed(3)}) rotate(${(-em * 2.4).toFixed(2)}deg)`;
          el.style.filter = em > 0.001 ? `blur(${(em * 11).toFixed(1)}px)` : "";
        } else if (role === "asset") {
          const m = clamp01((p - 0.05) / 0.62), em = m * m;
          el.style.opacity = (1 - clamp01((p - 0.2) / 0.48)).toFixed(3);
          el.style.transform =
            `translate(${(em * 112).toFixed(1)}px, ${(-em * 36).toFixed(1)}px) scale(${(1 + em * 1.05).toFixed(3)})`;
          el.style.filter = `brightness(${(1 + em * 0.8).toFixed(2)}) blur(${(em * 13).toFixed(1)}px)`;
        } else if (role === "cue") {
          const m = clamp01(p / 0.3);
          el.style.opacity = (1 - clamp01(p / 0.13)).toFixed(3);
          el.style.transform = `translate(-50%, ${(m * m * 30).toFixed(1)}px)`;
        }
      }

      // ── Smoke: redraw only when the integer frame changes ──
      if (di !== lastDrawIdx) {
        lastDrawIdx = di;
        const bframe = nearestLoaded(backFrames.current, di);
        const fframe = nearestLoaded(frontFrames.current, di);
        bctx.clearRect(0, 0, bc.width, bc.height);
        if (bframe) drawCover(bctx, bframe, 1);
        fctx.clearRect(0, 0, fc.width, fc.height);
        if (fframe) drawCover(fctx, fframe, 1);
      }
    };

    resize();
    window.addEventListener("resize", resize);
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, [pinned, ready, profile.smokeDpr, TOTAL]);

  return (
    <section ref={sectionRef} className={`hero-intro${pinned ? " is-pinned" : ""}`}>
      <div className="hero-intro__stage">
        {pinned ? (
          <canvas ref={backRef} className="hero-intro__smoke hero-intro__smoke--back" aria-hidden="true" />
        ) : null}
        <div className="hero-intro__content">
          {!pinned ? <HeroParallax /> : null}
          <HeroEntrance>{children}</HeroEntrance>
        </div>
        {pinned ? (
          <canvas ref={frontRef} className="hero-intro__smoke hero-intro__smoke--front" aria-hidden="true" />
        ) : null}
      </div>
    </section>
  );
}
