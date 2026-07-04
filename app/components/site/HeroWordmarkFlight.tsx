"use client";

import { useEffect, useRef } from "react";

/**
 * HeroWordmarkFlight — the hero wordmark's own letters lift off and fly to the
 * lantern label, reassembling into it. A 2D-canvas particle system (one glyph
 * per target letter):
 *
 *  · retype stagger — letters launch left-to-right and their glyph swaps to the
 *    target as they land, so the label "types" itself into being;
 *  · mouse gravity — while in flight each letter is pulled toward the cursor
 *    (1/d², capped, easing off as it nears its slot), so the stream swirls
 *    around the pointer as it passes;
 *  · dithering — the canvas renders at half resolution, pixel-upscaled, and an
 *    ordered (Bayer 4×4) 1-bit alpha threshold gives the letters a dissolving,
 *    dithered edge instead of a smooth fade.
 *
 * The real wordmark fades out for the duration (its letters have "left"), and
 * the DOM label cross-dissolves in as the flight lands. Decorative + fine-
 * pointer only; snaps off under reduced motion. The wordmark and the link's
 * accessible name are never altered for assistive tech.
 */

const ICE = "202, 240, 255";

// Bayer 4×4 ordered-dither thresholds (0..1).
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

type Glyph = { ch: string; cx: number; cy: number };
type CharData = { glyphs: Glyph[]; fontSize: number; family: string; weight: string };

/** Per-character centre points + font of an element's single text node. */
function charData(el: HTMLElement): CharData {
  const node = el.firstChild;
  const text = el.textContent ?? "";
  const cs = getComputedStyle(el);
  const upper = cs.textTransform === "uppercase";
  const glyphs: Glyph[] = [];
  if (node && node.nodeType === Node.TEXT_NODE) {
    const range = document.createRange();
    for (let i = 0; i < text.length; i++) {
      range.setStart(node, i);
      range.setEnd(node, i + 1);
      const r = range.getBoundingClientRect();
      glyphs.push({
        ch: upper ? text[i].toUpperCase() : text[i],
        cx: r.left + r.width / 2,
        cy: r.top + r.height / 2,
      });
    }
  }
  return { glyphs, fontSize: parseFloat(cs.fontSize) || 16, family: cs.fontFamily, weight: cs.fontWeight };
}

type Particle = {
  fromCh: string;
  toCh: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  tx: number;
  ty: number;
  fromSize: number;
  toSize: number;
  delay: number;
  d0: number;
};

export function HeroWordmarkFlight({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouse = useRef({ x: 0, y: 0, has: false });
  const raf = useRef(0);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      mouse.current = { x: e.clientX, y: e.clientY, has: true };
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    cancelAnimationFrame(raf.current);

    const wm = document.querySelector<HTMLElement>(".hero-wordmark__text");
    const label = document.querySelector<HTMLElement>(".hero-specimen__cue-label");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const restoreWm = () => { if (wm) wm.style.opacity = ""; };

    if (!active || reduce || !wm || !label) {
      canvas.style.transition = "opacity 200ms ease";
      canvas.style.opacity = "0";
      restoreWm();
      return;
    }

    const src = charData(wm);
    const dst = charData(label);
    if (!src.glyphs.length || !dst.glyphs.length) return;

    // One particle per target glyph (spaces skipped). Each flies from a source
    // letter — the matching index, or a random wordmark letter for slots the
    // shorter source can't cover, so every letter "comes from" the wordmark.
    const parts: Particle[] = [];
    for (let i = 0; i < dst.glyphs.length; i++) {
      const d = dst.glyphs[i];
      if (!d.ch.trim()) continue;
      const overflow = i >= src.glyphs.length;
      const s = src.glyphs[overflow ? Math.floor(Math.random() * src.glyphs.length) : i];
      const jit = overflow ? 26 : 0;
      const sx = s.cx + (Math.random() - 0.5) * jit;
      const sy = s.cy + (Math.random() - 0.5) * jit;
      parts.push({
        fromCh: s.ch,
        toCh: d.ch,
        x: sx,
        y: sy,
        vx: 0,
        vy: 0,
        tx: d.cx,
        ty: d.cy,
        fromSize: src.fontSize,
        toSize: dst.fontSize,
        delay: i * 0.026,
        d0: Math.hypot(d.cx - sx, d.cy - sy) || 1,
      });
    }
    if (!parts.length) return;

    // The real wordmark hands its letters to the flight.
    wm.style.transition = "opacity 150ms ease";
    wm.style.opacity = "0";

    // Half-res backing, pixel-upscaled (chunky + dither-friendly).
    const SC = 0.5;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) { restoreWm(); return; }
    const resize = () => {
      const w = window.innerWidth || 1, h = window.innerHeight || 1;
      canvas.width = Math.max(1, Math.round(w * SC));
      canvas.height = Math.max(1, Math.round(h * SC));
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    };
    resize();
    canvas.style.transition = "opacity 200ms ease";
    canvas.style.opacity = "1";

    const K = 128, DAMP = 20, GRAV = 26000, SOFT = 1000, MAXF = 2600;
    let last = performance.now();
    let elapsed = 0;
    let fading = false;

    const step = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.033);
      last = now;
      elapsed += dt;
      const W = canvas.width, H = canvas.height;
      ctx.clearRect(0, 0, W, H);
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";

      let settled = 0;
      for (const p of parts) {
        if (elapsed >= p.delay) {
          let ax = (p.tx - p.x) * K;
          let ay = (p.ty - p.y) * K;
          if (mouse.current.has) {
            const dx = mouse.current.x - p.x, dy = mouse.current.y - p.y;
            const d2 = dx * dx + dy * dy + SOFT;
            const d = Math.sqrt(d2);
            const distT = Math.hypot(p.tx - p.x, p.ty - p.y);
            const g = Math.min(1, distT / 120); // ease gravity off near the slot
            let f = GRAV / d2;
            if (f > MAXF) f = MAXF;
            ax += (dx / d) * f * g;
            ay += (dy / d) * f * g;
          }
          ax -= p.vx * DAMP;
          ay -= p.vy * DAMP;
          p.vx += ax * dt;
          p.vy += ay * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
        }

        const distT = Math.hypot(p.tx - p.x, p.ty - p.y);
        if (distT < 1.5 && Math.hypot(p.vx, p.vy) < 8) settled++;
        const prog = 1 - Math.min(1, distT / p.d0);
        const size = (p.fromSize + (p.toSize - p.fromSize) * prog) * SC;
        const glyph = prog < 0.55 ? p.fromCh : p.toCh;
        const alpha = elapsed < p.delay ? 0 : Math.min(1, (elapsed - p.delay) / 0.12);
        ctx.font = `${src.weight} ${Math.max(1, size)}px ${src.family}`;
        ctx.fillStyle = `rgba(${ICE}, ${alpha})`;
        ctx.fillText(glyph, p.x * SC, p.y * SC);
      }

      // Ordered (Bayer) 1-bit alpha dither — dissolving/dithered edges.
      const img = ctx.getImageData(0, 0, W, H);
      const data = img.data;
      for (let idx = 0, px = 0; idx < data.length; idx += 4, px++) {
        const a = data[idx + 3];
        if (a === 0) continue;
        const x = px % W, y = (px / W) | 0;
        const thr = BAYER[(x & 3) + ((y & 3) << 2)] * 255;
        data[idx + 3] = a >= thr ? 255 : 0;
      }
      ctx.putImageData(img, 0, 0);

      if (!fading && settled === parts.length && elapsed > 0.35) {
        fading = true;
        canvas.style.opacity = "0"; // cross-dissolve with the DOM label
      }
      if (fading && elapsed > 0.35 + 0.25) return; // done
      raf.current = requestAnimationFrame(step);
    };

    window.addEventListener("resize", resize);
    raf.current = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf.current);
      window.removeEventListener("resize", resize);
      restoreWm();
    };
  }, [active]);

  return <canvas ref={canvasRef} className="hero-flight-canvas" aria-hidden="true" />;
}
