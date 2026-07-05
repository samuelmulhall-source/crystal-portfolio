"use client";

import { useEffect, useRef } from "react";
import { useHeroFocus } from "./HeroFocus";

/**
 * HeroWordmark — the hero wordmark, split into per-letter spans so the ACTUAL
 * letters (real DOM, with their gradient) can fly to the lantern and BECOME its
 * label. No canvas, no clone: on hover each real letter springs from its place
 * in the wordmark to its slot in the (hidden) label template at the lantern —
 * with a retype stagger and mouse-gravity swirl — and stays there as the label.
 * On un-hover they fly back and reassemble the wordmark. Fine-pointer only; snaps
 * off (no flight) under reduced motion, where the label shows statically.
 *
 * The target slots come from the `.hero-specimen__cue-label` template (same text,
 * small), measured per-character — so the flown letters land exactly on it.
 */
type Letter = {
  el: HTMLSpanElement;
  ax: number; ay: number; aw: number; ah: number; // rest rect (viewport)
  cx: number; cy: number; vx: number; vy: number; scale: number; // live transform
  dx: number; dy: number; ts: number; // target translate + scale
  delay: number;
};

export function HeroWordmark({ text }: { text: string }) {
  const { focusing } = useHeroFocus();
  const letterRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const state = useRef<Letter[]>([]);
  const mouse = useRef({ x: 0, y: 0, has: false });
  const raf = useRef(0);
  const mode = useRef<"fly" | "return" | "idle">("idle");

  useEffect(() => {
    const onMove = (e: PointerEvent) => { mouse.current = { x: e.clientX, y: e.clientY, has: true }; };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const els = letterRefs.current.filter((e): e is HTMLSpanElement => !!e);
    if (reduce || !els.length) return;

    // Lift the wordmark's stacking context above the lantern (wrap z 6) while its
    // letters are in flight, or they'd pass BEHIND the lantern on the way over.
    const heroCore = els[0].closest<HTMLElement>(".hero-core");
    const liftZ = (on: boolean) => { if (heroCore) heroCore.style.zIndex = on ? "7" : ""; };

    // Ensure per-letter state exists, keyed to the current live transforms.
    if (state.current.length !== els.length) {
      state.current = els.map((el) => ({
        el, ax: 0, ay: 0, aw: 0, ah: 0, cx: 0, cy: 0, vx: 0, vy: 0, scale: 1, dx: 0, dy: 0, ts: 1, delay: 0,
      }));
    }

    // Measure REST rects (clear transform → read → the loop reapplies).
    const measureRest = () => {
      for (const L of state.current) {
        const prev = L.el.style.transform;
        L.el.style.transform = "none";
        const r = L.el.getBoundingClientRect();
        L.el.style.transform = prev;
        L.ax = r.left; L.ay = r.top; L.aw = r.width; L.ah = r.height;
      }
    };

    if (focusing) {
      const label = document.querySelector<HTMLElement>(".hero-specimen__cue-label");
      const node = label?.firstChild;
      if (!label || !node || node.nodeType !== Node.TEXT_NODE) return;
      measureRest();
      // Uniform scale = target font size ÷ wordmark letter font size.
      const wfs = parseFloat(getComputedStyle(state.current[0].el).fontSize) || 1;
      const tfs = parseFloat(getComputedStyle(label).fontSize) || wfs;
      const ts = tfs / wfs;
      // Per-character target top-left from the label template.
      const range = document.createRange();
      const text2 = label.textContent ?? "";
      state.current.forEach((L, i) => {
        let bx = L.ax, by = L.ay;
        if (i < text2.length) {
          range.setStart(node, i);
          range.setEnd(node, i + 1);
          const r = range.getBoundingClientRect();
          bx = r.left; by = r.top;
        }
        L.dx = bx - L.ax;
        L.dy = by - L.ay;
        L.ts = ts;
        L.delay = i * 0.03;
      });
      liftZ(true);
      mode.current = "fly";
    } else {
      // Fly home: targets are the rest positions.
      if (state.current[0]?.aw === 0) measureRest();
      state.current.forEach((L, i) => {
        L.dx = 0; L.dy = 0; L.ts = 1;
        L.delay = (state.current.length - 1 - i) * 0.014; // unwind right→left
      });
      mode.current = "return";
    }

    const K = 118, DAMP = 19, GRAV = 24000, SOFT = 1200, MAXF = 2400;
    let last = performance.now();
    let elapsed = 0;
    cancelAnimationFrame(raf.current);

    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.033);
      last = now;
      elapsed += dt;
      let settled = 0;
      const flying = mode.current === "fly";
      for (const L of state.current) {
        if (elapsed >= L.delay) {
          let ax = (L.dx - L.cx) * K - L.vx * DAMP;
          let ay = (L.dy - L.cy) * K - L.vy * DAMP;
          if (flying && mouse.current.has) {
            // letter's live viewport centre
            const px = L.ax + L.cx + (L.aw * L.scale) / 2;
            const py = L.ay + L.cy + (L.ah * L.scale) / 2;
            const gx = mouse.current.x - px, gy = mouse.current.y - py;
            const d2 = gx * gx + gy * gy + SOFT;
            const d = Math.sqrt(d2);
            const distT = Math.hypot(L.dx - L.cx, L.dy - L.cy);
            const g = Math.min(1, distT / 140); // ease off near the slot
            let f = GRAV / d2;
            if (f > MAXF) f = MAXF;
            ax += (gx / d) * f * g;
            ay += (gy / d) * f * g;
          }
          L.vx += ax * dt; L.vy += ay * dt;
          L.cx += L.vx * dt; L.cy += L.vy * dt;
        }
        L.scale += (L.ts - L.scale) * Math.min(1, dt * 9);
        const settledPos = Math.hypot(L.dx - L.cx, L.dy - L.cy) < 0.6 && Math.hypot(L.vx, L.vy) < 5;
        if (settledPos && Math.abs(L.scale - L.ts) < 0.01) settled++;
        if (Math.abs(L.cx) < 0.01 && Math.abs(L.cy) < 0.01 && Math.abs(L.scale - 1) < 0.002 && mode.current === "return") {
          L.el.style.transform = "";
        } else {
          L.el.style.transform = `translate(${L.cx.toFixed(2)}px, ${L.cy.toFixed(2)}px) scale(${L.scale.toFixed(4)})`;
        }
      }
      if (settled === state.current.length) {
        if (mode.current === "return") {
          state.current.forEach((L) => { L.el.style.transform = ""; });
          liftZ(false); // letters home — drop back below the lantern
        }
        mode.current = "idle";
        return;
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [focusing, text]);

  const chars = [...text];
  return (
    <span className="hero-wordmark__text">
      {chars.map((ch, i) => (
        <span
          key={i}
          ref={(el) => { letterRefs.current[i] = el; }}
          className={`hero-wordmark__letter${ch === " " ? " is-space" : ""}`}
        >
          {ch === " " ? " " : ch}
        </span>
      ))}
    </span>
  );
}
