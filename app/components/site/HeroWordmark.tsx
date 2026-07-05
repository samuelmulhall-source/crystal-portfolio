"use client";

import { useEffect, useRef } from "react";
import { useHeroFocus } from "./HeroFocus";

/**
 * HeroWordmark — the hero wordmark, split into per-letter spans so the ACTUAL
 * letters (real DOM, with their gradient) fly to the lantern and BECOME its
 * label — and MORPH into the label text on the way (so it reads as the lantern's
 * name, not the brand). No canvas, no clone.
 *
 * Physics: each real letter springs from its place in the wordmark to its slot
 * in the (hidden) label template, with a retype stagger + mouse-gravity swirl,
 * shrinking to label size and swapping its glyph (source → target) mid-flight.
 * When the label is LONGER than the wordmark the surplus letters emerge from the
 * wordmark's tail and fade in; when shorter, the extra wordmark letters fly off
 * and fade. On un-hover everything flies home and reassembles the wordmark.
 *
 * `hero-core` is lifted above the lantern for the flight so the letters pass over
 * it. Fine-pointer only; snaps off under reduced motion (label shows statically).
 */
type L = {
  el: HTMLSpanElement;
  src: string; dst: string; hasSrc: boolean; hasDst: boolean;
  ax: number; ay: number; // rest position (viewport)
  cx: number; cy: number; vx: number; vy: number; scale: number; // live transform
  fx: number; fy: number; fscale: number; // flown target (delta + scale)
  delay: number; shown: string;
};

export function HeroWordmark({ text, target }: { text: string; target: string }) {
  const { focusing } = useHeroFocus();
  const srcChars = [...text];
  const dstChars = [...target];
  const n = Math.max(srcChars.length, dstChars.length);

  const refs = useRef<(HTMLSpanElement | null)[]>([]);
  const st = useRef<L[]>([]);
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
    const els = refs.current.slice(0, n).filter((e): e is HTMLSpanElement => !!e);
    if (reduce || els.length < n) return;

    const heroCore = els[0].closest<HTMLElement>(".hero-core");
    const liftZ = (on: boolean) => { if (heroCore) heroCore.style.zIndex = on ? "7" : ""; };

    const sc = [...text];
    const dc = [...target];
    if (st.current.length !== n) {
      st.current = els.map((el, i) => ({
        el,
        src: sc[i] ?? "", dst: dc[i] ?? "",
        hasSrc: i < sc.length, hasDst: i < dc.length,
        ax: 0, ay: 0, cx: 0, cy: 0, vx: 0, vy: 0, scale: 1,
        fx: 0, fy: 0, fscale: 1, delay: 0, shown: sc[i] ?? "",
      }));
    }

    const labelEl = document.querySelector<HTMLElement>(".hero-specimen__cue-label");
    const node = labelEl?.firstChild;

    // Rest positions: source letters use their own box; surplus (label-longer)
    // letters spawn from the wordmark's tail.
    const measureRest = () => {
      let lastRight = 0, lastTop = 0;
      for (const L of st.current) {
        if (!L.hasSrc) continue;
        const prev = L.el.style.transform;
        L.el.style.transform = "none";
        const r = L.el.getBoundingClientRect();
        L.el.style.transform = prev;
        L.ax = r.left; L.ay = r.top; lastRight = r.right; lastTop = r.top;
      }
      for (const L of st.current) {
        if (!L.hasSrc) { L.ax = lastRight; L.ay = lastTop; }
      }
    };

    if (focusing && labelEl && node && node.nodeType === Node.TEXT_NODE) {
      measureRest();
      const wfsEl = st.current.find((l) => l.hasSrc)?.el ?? els[0];
      const wfs = parseFloat(getComputedStyle(wfsEl).fontSize) || 1;
      const tfs = parseFloat(getComputedStyle(labelEl).fontSize) || wfs;
      const fscale = tfs / wfs;
      const range = document.createRange();
      st.current.forEach((L, i) => {
        if (L.hasDst) {
          range.setStart(node, i);
          range.setEnd(node, i + 1);
          const r = range.getBoundingClientRect();
          L.fx = r.left - L.ax; L.fy = r.top - L.ay; L.fscale = fscale;
        } else {
          // surplus wordmark letter (label shorter): scatter up + shrink away
          L.fx = (i % 2 ? 1 : -1) * (40 + Math.random() * 90);
          L.fy = -70 - Math.random() * 70;
          L.fscale = 0.1;
        }
        L.delay = i * 0.028;
        if (!L.hasSrc) { L.el.textContent = L.dst; L.shown = L.dst; } // surplus label letter — set glyph now, it fades in
      });
      liftZ(true);
      mode.current = "fly";
    } else {
      if (!st.current[0] || st.current.find((l) => l.hasSrc)?.ax === 0) measureRest();
      st.current.forEach((_, i) => { st.current[i].delay = (n - 1 - i) * 0.012; });
      mode.current = "return";
    }

    const K = 118, DAMP = 19, GRAV = 24000, SOFT = 1200, MAXF = 2400;
    let last = performance.now();
    let elapsed = 0;
    cancelAnimationFrame(raf.current);

    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.033);
      last = now; elapsed += dt;
      const flying = mode.current === "fly";
      let settled = 0;
      for (const L of st.current) {
        const tx = flying ? L.fx : 0;
        const ty = flying ? L.fy : 0;
        const tsc = flying ? L.fscale : 1;
        if (elapsed >= L.delay) {
          let ax = (tx - L.cx) * K - L.vx * DAMP;
          let ay = (ty - L.cy) * K - L.vy * DAMP;
          if (flying && mouse.current.has && L.hasDst) {
            const gx = mouse.current.x - (L.ax + L.cx), gy = mouse.current.y - (L.ay + L.cy);
            const d2 = gx * gx + gy * gy + SOFT, d = Math.sqrt(d2);
            const distT = Math.hypot(tx - L.cx, ty - L.cy);
            const g = Math.min(1, distT / 140);
            let f = GRAV / d2; if (f > MAXF) f = MAXF;
            ax += (gx / d) * f * g; ay += (gy / d) * f * g;
          }
          L.vx += ax * dt; L.vy += ay * dt;
          L.cx += L.vx * dt; L.cy += L.vy * dt;
        }
        L.scale += (tsc - L.scale) * Math.min(1, dt * 9);

        const flownMag = Math.hypot(L.fx, L.fy) || 1;
        const flownness = Math.min(1, Math.hypot(L.cx, L.cy) / flownMag);
        const want = flownness > 0.5 ? (L.hasDst ? L.dst : L.src) : (L.src || L.dst);
        if (want !== L.shown) { L.el.textContent = want; L.shown = want; }

        let op = 1;
        if (L.hasSrc && !L.hasDst) op = 1 - flownness;      // surplus source → fade out flying
        else if (!L.hasSrc && L.hasDst) op = flownness;     // surplus label → fade in flying
        L.el.style.opacity = op < 0.999 ? op.toFixed(3) : "";

        const atRest = !flying && Math.abs(L.cx) < 0.01 && Math.abs(L.cy) < 0.01 && Math.abs(L.scale - 1) < 0.002;
        L.el.style.transform = atRest ? "" : `translate(${L.cx.toFixed(2)}px, ${L.cy.toFixed(2)}px) scale(${L.scale.toFixed(4)})`;
        if (Math.hypot(tx - L.cx, ty - L.cy) < 0.6 && Math.hypot(L.vx, L.vy) < 5 && Math.abs(L.scale - tsc) < 0.01) settled++;
      }
      if (settled === st.current.length) {
        if (mode.current === "return") {
          for (const L of st.current) {
            L.el.style.transform = "";
            L.el.style.opacity = "";
            if (!L.hasSrc) { L.el.textContent = ""; L.shown = ""; }
            else if (L.shown !== L.src) { L.el.textContent = L.src; L.shown = L.src; }
          }
          liftZ(false);
        }
        mode.current = "idle";
        return;
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [focusing, text, target, n]);

  return (
    <span className="hero-wordmark__text">
      {Array.from({ length: n }, (_, i) => (
        <span
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          className={`hero-wordmark__letter${i >= srcChars.length ? " is-extra" : ""}`}
        >
          {srcChars[i] ?? ""}
        </span>
      ))}
    </span>
  );
}
