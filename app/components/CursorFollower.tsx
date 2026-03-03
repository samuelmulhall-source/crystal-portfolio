"use client";

/**
 * CursorFollower — multi-state canvas cursor for desktop.
 *
 * Uses mix-blend-mode: difference so the cursor always inverts the
 * background beneath it — white on dark starfield, dark on bright stars,
 * guaranteed contrast everywhere.
 *
 * States (priority high → low):
 *  nebula  — mousedown: radial glow + scatter pixel burst
 *  vector  — scrolling: solid triangle rotates 180° when scrolling down
 *  sight   — hover interactive: crosshair, gap closes + turns cyan on nav
 *  pulsar  — default: ring + core + continuous motion trail (line, not dots)
 *
 * Idle > 1.5s → scale 0.88 depth cue, springs back on movement.
 * Desktop-only (no-op on pointer:coarse / touch devices).
 */

import { useEffect, useRef } from "react";
import { voidState } from "../lib/voidState";

const NAV_SEL  = "nav a, nav button";
const INTERACT = "a, button, [role=button], input, textarea, label, select, [data-cursor=expand]";

type Particle = { x: number; y: number; vx: number; vy: number; life: number };

export default function CursorFollower() {
  const cvRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

    const styleTag = document.createElement("style");
    styleTag.textContent = "*, *::before, *::after { cursor: none !important; }";
    document.head.appendChild(styleTag);

    // ── Canvas ────────────────────────────────────────────────────────────────
    const cv  = cvRef.current!;
    const ctx = cv.getContext("2d")!;
    let dpr   = window.devicePixelRatio || 1;

    function resize() {
      dpr = window.devicePixelRatio || 1;
      cv.width  = window.innerWidth  * dpr;
      cv.height = window.innerHeight * dpr;
      cv.style.width  = window.innerWidth  + "px";
      cv.style.height = window.innerHeight + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener("resize", resize, { passive: true });

    // ── State ─────────────────────────────────────────────────────────────────
    let mouseX = window.innerWidth / 2, mouseY = window.innerHeight / 2;
    let curX   = mouseX, curY   = mouseY;
    let onPage   = false;
    let hovering = false;
    let onNav    = false;
    let pressing = false;

    // Animated lerp values
    let sightGap  = 8;     // crosshair half-gap in px  (target: 4 on nav, 8 default)
    let sightCyan = 0;     // 0 = white, 1 = cyan
    let vectorAng = 0;     // 0 = up, π = down
    let idleScale = 1;     // 1.0 → 0.88 after idle
    let breathPh  = 0;     // ring breathing phase
    let lastMove  = performance.now();

    // Trail: ring buffer of lerped positions
    const TLEN = 28;
    const trlX = new Float32Array(TLEN);
    const trlY = new Float32Array(TLEN);
    trlX.fill(mouseX); trlY.fill(mouseY);

    const particles: Particle[] = [];

    // ── Events ────────────────────────────────────────────────────────────────
    const onMove = (e: MouseEvent) => {
      mouseX = e.clientX; mouseY = e.clientY;
      onPage = true; lastMove = performance.now();
    };
    const onLeave = () => { onPage = false; };
    const onEnter = () => { onPage = true;  };
    const onPtrOver = (e: PointerEvent) => {
      const el = e.target as Element;
      hovering = !!el.closest(INTERACT);
      onNav    = !!el.closest(NAV_SEL);
    };
    const onDown = (e: MouseEvent) => {
      pressing = true;
      for (let i = 0; i < 10; i++) {
        const a = (Math.PI * 2 * i / 10) + (Math.random() - 0.5) * 0.6;
        const s = 2.2 + Math.random() * 3.5;
        particles.push({ x: e.clientX, y: e.clientY,
                         vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1 });
      }
    };
    const onUp = () => { pressing = false; };

    document.addEventListener("mousemove",   onMove,    { passive: true });
    document.addEventListener("mouseleave",  onLeave);
    document.addEventListener("mouseenter",  onEnter);
    document.addEventListener("pointerover", onPtrOver, { passive: true });
    document.addEventListener("mousedown",   onDown,    { passive: true });
    document.addEventListener("mouseup",     onUp,      { passive: true });

    // ── Render loop ───────────────────────────────────────────────────────────
    let raf: number;
    let lastT = performance.now();

    function tick(now: number) {
      raf = requestAnimationFrame(tick);
      const dt = Math.min((now - lastT) / 1000, 0.05);
      lastT = now;
      const f = Math.min(dt * 60, 6);

      // Lerp cursor
      curX += (mouseX - curX) * Math.min(0.16 * f, 1);
      curY += (mouseY - curY) * Math.min(0.16 * f, 1);

      // Trail ring buffer
      for (let i = TLEN - 1; i > 0; i--) { trlX[i] = trlX[i-1]; trlY[i] = trlY[i-1]; }
      trlX[0] = curX; trlY[0] = curY;

      // Lerp animation values
      sightGap  += ((onNav ? 4 : 8)  - sightGap)  * Math.min(0.12 * f, 1);
      sightCyan += ((onNav ? 1 : 0)  - sightCyan) * Math.min(0.10 * f, 1);
      vectorAng += ((voidState.scrollVel > 0.25 ? Math.PI : 0) - vectorAng) * Math.min(0.07 * f, 1);
      idleScale += ((performance.now() - lastMove > 1500 ? 0.88 : 1.0) - idleScale) * Math.min(0.04 * f, 1);
      breathPh  += dt * (Math.PI * 2 / 7); // 7s breath period

      const isVector = voidState.scrollVel > 0.25;
      const isSight  = hovering && !isVector && !pressing;
      const isPulsar = !pressing && !isVector && !isSight;

      const W = window.innerWidth;
      const cx = curX, cy = curY, sc = idleScale;

      ctx.clearRect(0, 0, W, window.innerHeight);
      if (!onPage) return;

      // ── Note: canvas has mix-blend-mode: difference in CSS.
      // All draws use white/near-white: appears bright on dark bg, dark on bright stars.

      // ══════════════════════════════════════════════════════ PULSAR (default) ══
      if (isPulsar) {
        // Continuous connected trail — line strokes, not dots
        ctx.save();
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        for (let i = 1; i < TLEN; i++) {
          const dx = trlX[i-1] - trlX[i], dy = trlY[i-1] - trlY[i];
          if (dx * dx + dy * dy < 0.1) continue; // skip zero-length segments
          const t = 1 - i / TLEN;
          ctx.beginPath();
          ctx.moveTo(trlX[i-1], trlY[i-1]);
          ctx.lineTo(trlX[i],   trlY[i]);
          ctx.lineWidth   = Math.max(0.4, t * 2.5 * sc);
          ctx.strokeStyle = `rgba(255,255,255,${(t * 0.50).toFixed(3)})`;
          ctx.stroke();
        }
        ctx.restore();

        // Breathing ring glow (soft annular gradient)
        const ringR = (26 + 3 * Math.sin(breathPh)) * sc;
        const rGrd  = ctx.createRadialGradient(cx, cy, ringR - 7, cx, cy, ringR + 7);
        rGrd.addColorStop(0,   "rgba(255,255,255,0)");
        rGrd.addColorStop(0.5, `rgba(255,255,255,${(0.18 * sc).toFixed(3)})`);
        rGrd.addColorStop(1,   "rgba(255,255,255,0)");
        ctx.fillStyle = rGrd;
        ctx.beginPath(); ctx.arc(cx, cy, ringR + 7, 0, Math.PI * 2); ctx.fill();

        // Ring hairline
        ctx.beginPath();
        ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255,255,255,${(0.80 * sc).toFixed(3)})`;
        ctx.lineWidth   = 1.5;
        ctx.stroke();

        // Core starburst glow
        const cGrd = ctx.createRadialGradient(cx, cy, 0, cx, cy, 18 * sc);
        cGrd.addColorStop(0,   `rgba(255,255,255,${(0.95 * sc).toFixed(3)})`);
        cGrd.addColorStop(0.25, `rgba(255,255,255,${(0.40 * sc).toFixed(3)})`);
        cGrd.addColorStop(1,   "rgba(255,255,255,0)");
        ctx.fillStyle = cGrd;
        ctx.beginPath(); ctx.arc(cx, cy, 18 * sc, 0, Math.PI * 2); ctx.fill();

        // Solid core dot
        ctx.fillStyle = "rgba(255,255,255,0.98)";
        ctx.beginPath(); ctx.arc(cx, cy, 3.5 * sc, 0, Math.PI * 2); ctx.fill();
      }

      // ══════════════════════════════════════════════════════ SIGHT (hover) ═════
      if (isSight) {
        const arm = 15 * sc, gap = sightGap * sc;
        // White → cyan interpolation (difference mode: both look great on dark bg)
        const rC = Math.round(255 - 115 * sightCyan);
        const gC = Math.round(255 -  35 * sightCyan);
        const col = `rgba(${rC},${gC},255,0.95)`;

        // Wide glow pass
        ctx.lineCap = "round";
        ctx.strokeStyle = `rgba(${rC},${gC},255,0.18)`;
        ctx.lineWidth = 6;
        ctx.beginPath(); ctx.moveTo(cx, cy - gap); ctx.lineTo(cx, cy - gap - arm); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx, cy + gap); ctx.lineTo(cx, cy + gap + arm); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx - gap, cy); ctx.lineTo(cx - gap - arm, cy); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx + gap, cy); ctx.lineTo(cx + gap + arm, cy); ctx.stroke();

        // Sharp arm lines
        ctx.strokeStyle = col;
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(cx, cy - gap); ctx.lineTo(cx, cy - gap - arm); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx, cy + gap); ctx.lineTo(cx, cy + gap + arm); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx - gap, cy); ctx.lineTo(cx - gap - arm, cy); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx + gap, cy); ctx.lineTo(cx + gap + arm, cy); ctx.stroke();

        // Center dot
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(cx, cy, 2.2 * sc, 0, Math.PI * 2); ctx.fill();
      }

      // ══════════════════════════════════════════════════════ VECTOR (scroll) ══
      if (isVector) {
        const h = 20 * sc, w = 11 * sc;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(vectorAng);

        // Glow halo
        const vGrd = ctx.createRadialGradient(0, 0, 0, 0, 0, 26 * sc);
        vGrd.addColorStop(0, "rgba(255,255,255,0.22)");
        vGrd.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = vGrd;
        ctx.beginPath(); ctx.arc(0, 0, 26 * sc, 0, Math.PI * 2); ctx.fill();

        // Solid triangle needle (tip up = 0, tip down = π)
        ctx.beginPath();
        ctx.moveTo(0,      -h);
        ctx.lineTo( w * 0.5,  h * 0.42);
        ctx.lineTo(-w * 0.5,  h * 0.42);
        ctx.closePath();
        ctx.fillStyle = "rgba(255,255,255,0.95)";
        ctx.fill();

        ctx.restore();
      }

      // ══════════════════════════════════════════════════════ NEBULA (click) ════
      if (pressing) {
        // Expanding glow disc
        const nGrd = ctx.createRadialGradient(cx, cy, 0, cx, cy, 30 * sc);
        nGrd.addColorStop(0,   "rgba(255,255,255,0.65)");
        nGrd.addColorStop(0.35, "rgba(255,255,255,0.22)");
        nGrd.addColorStop(1,   "rgba(255,255,255,0)");
        ctx.fillStyle = nGrd;
        ctx.beginPath(); ctx.arc(cx, cy, 30 * sc, 0, Math.PI * 2); ctx.fill();

        // Bright nucleus
        ctx.fillStyle = "rgba(255,255,255,0.98)";
        ctx.beginPath(); ctx.arc(cx, cy, 4 * sc, 0, Math.PI * 2); ctx.fill();
      }

      // ── Scatter particles (persist after mouseup until life runs out) ─────────
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x  += p.vx; p.y  += p.vy;
        p.vx *= 0.90; p.vy *= 0.90;
        p.life -= dt * 1.6;
        if (p.life <= 0) { particles.splice(i, 1); continue; }
        ctx.fillStyle = `rgba(255,255,255,${(p.life * 0.92).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.3, 2.0 * p.life), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      document.head.removeChild(styleTag);
      window.removeEventListener("resize", resize);
      document.removeEventListener("mousemove",   onMove);
      document.removeEventListener("mouseleave",  onLeave);
      document.removeEventListener("mouseenter",  onEnter);
      document.removeEventListener("pointerover", onPtrOver);
      document.removeEventListener("mousedown",   onDown);
      document.removeEventListener("mouseup",     onUp);
    };
  }, []);

  return (
    <canvas
      ref={cvRef}
      aria-hidden="true"
      style={{
        position:      "fixed",
        top:           0,
        left:          0,
        pointerEvents: "none",
        zIndex:        9999,
        // difference blend = cursor inverts whatever is beneath it.
        // White on dark starfield → appears white. White on bright star → appears dark.
        // Guaranteed contrast against any background without a shadow hack.
        mixBlendMode:  "difference",
      }}
    />
  );
}
