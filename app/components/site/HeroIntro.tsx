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
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { getDeviceProfile } from "../../lib/deviceTier";
import { loadGate } from "../../lib/loadingOrchestrator";
import { lenisInstance } from "../SmoothScroll";

gsap.registerPlugin(ScrollTrigger);

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

// Extra scroll past one viewport before the pin releases. The work section is
// pushed down by this same fraction (margin-top in CSS) so it starts rising a
// touch later yet still lands exactly as the pin ends — keep the two in sync.
const INTRO_TAIL = 0.2;

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
  const stageRef = useRef<HTMLDivElement>(null);
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

  // Pin the hero for one viewport of scroll. ScrollTrigger handles the spacer,
  // so the work section follows immediately when the pin releases — no void.
  useEffect(() => {
    if (!pinned) return;
    const stage = stageRef.current;
    if (!stage) return;
    const st = ScrollTrigger.create({
      trigger: stage,
      start: "top top",
      end: () => "+=" + (window.innerHeight || 1) * (1 + INTRO_TAIL),
      pin: true,
      // No spacer: the work section scrolls up BEHIND the pinned smoke (the
      // hero sits at a higher z-index) and is fully in place the moment the
      // pin releases — it rises out from behind the clearing smoke, no void.
      pinSpacing: false,
      anticipatePin: 1,
    });
    return () => st.kill();
  }, [pinned]);

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

      const introDist = (window.innerHeight || 1) * (1 + INTRO_TAIL);
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

      // ── The text + lantern DROP straight down off the bottom (accelerating,
      //    like falling) with no opacity change. They sit behind the front
      //    smoke (z2 < z3), so they fall into it and the smoke swallows them. ──
      const p = cp;
      for (const el of fadeEls) {
        const role = el.dataset.heroFade;
        el.style.opacity = "1";
        el.style.filter = "";
        if (role === "cue") {
          const m = clamp01(p / 0.16);
          el.style.transform = `translate(-50%, ${(m * m * 90).toFixed(1)}vh)`;
        } else {
          // text + asset drop fast — gone within the first fraction of the dive,
          // a slight rate offset for a touch of depth as they fall.
          const span = role === "asset" ? 0.32 : 0.28;
          const m = clamp01(p / span);
          el.style.transform = `translateY(${(m * m * 130).toFixed(1)}vh)`;
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
      <div ref={stageRef} className="hero-intro__stage">
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
