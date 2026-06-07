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

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

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
    let lastP = -1;
    const resize = () => {
      const w = window.innerWidth, h = window.innerHeight;
      for (const c of [bc, fc]) {
        c.width = w * dpr; c.height = h * dpr;
        c.style.width = `${w}px`; c.style.height = `${h}px`;
      }
      lastP = -1; // force redraw at new size
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
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const introDist = window.innerHeight || 1;
      const p = clamp01((window.scrollY || 0) / introDist);
      if (Math.abs(p - lastP) < 0.001) return;
      lastP = p;

      // Dissolve the hero content as the camera flies in.
      for (const el of fadeEls) {
        const role = el.dataset.heroFade;
        let o = 1;
        if (role === "text") o = 1 - clamp01(p / 0.5);
        else if (role === "asset") o = 1 - clamp01((p - 0.12) / 0.62);
        else if (role === "cue") o = 1 - clamp01(p / 0.16);
        el.style.opacity = o.toFixed(3);
        if (role === "asset") el.style.filter = p > 0.001 ? `blur(${(p * 6).toFixed(1)}px)` : "";
      }

      // Scrub the frame sequence (cross-fade adjacent frames for smoothness).
      const f = p * (TOTAL - 1);
      const i0 = Math.min(TOTAL - 1, Math.floor(f));
      const i1 = Math.min(TOTAL - 1, i0 + 1);
      const frac = f - i0;

      bctx.clearRect(0, 0, bc.width, bc.height);
      const b0 = backFrames.current[i0], b1 = backFrames.current[i1];
      if (b0) drawCover(bctx, b0, 1 - frac);
      if (b1 && frac > 0.001) drawCover(bctx, b1, frac);

      fctx.clearRect(0, 0, fc.width, fc.height);
      const ff0 = frontFrames.current[i0], ff1 = frontFrames.current[i1];
      if (ff0) drawCover(fctx, ff0, 1 - frac);
      if (ff1 && frac > 0.001) drawCover(fctx, ff1, frac);
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
