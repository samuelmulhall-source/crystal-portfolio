"use client";

/**
 * CursorFollower — multi-state canvas cursor for desktop.
 *
 * States (priority high → low):
 *  nebula  — mousedown: localized glow + scatter pixel burst
 *  vector  — scrolling (scrollVel > 0.25): triangular needle, rotates 180° downward
 *  sight   — interactive hover: 4-arm crosshair; gap closes + turns cyan on nav links
 *  pulsar  — default: core dot + breathing hairline ring + motion trail
 *
 * Idle > 1.5s: cursor scales down to 0.88 (depth cue), springs back on movement.
 * No-op on touch-primary devices (pointer:coarse).
 */

import { useEffect, useRef } from "react";
import { voidState } from "../lib/voidState";

const NAV_SEL  = "nav a, nav button";
const INTERACT = "a, button, [role=button], input, textarea, label, select, [data-cursor=expand]";

type Particle = { x: number; y: number; vx: number; vy: number; life: number; hue: number };

export default function CursorFollower() {
  const cvRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

    // ── Inject cursor: none to beat OrbitControls inline style ──────────────
    const styleTag = document.createElement("style");
    styleTag.textContent = "*, *::before, *::after { cursor: none !important; }";
    document.head.appendChild(styleTag);

    // ── Canvas setup ─────────────────────────────────────────────────────────
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

    // ── Mouse state ───────────────────────────────────────────────────────────
    let mouseX = window.innerWidth / 2, mouseY = window.innerHeight / 2;
    let curX   = mouseX, curY = mouseY;
    let onPage   = false;
    let hovering = false;
    let onNav    = false;
    let pressing = false;

    // ── Animated values ───────────────────────────────────────────────────────
    let sightGap  = 6;   // crosshair center gap px (target: 3 on nav, 6 otherwise)
    let sightCyan = 0;   // 0=white, 1=cyan (lerped)
    let vectorAng = 0;   // triangle rotation: 0=up, π=down
    let idleScale = 1;   // 1.0 → 0.88 after 1.5s idle
    let breathPh  = 0;   // ring breath phase (2π / 9s period)
    let lastMove  = performance.now();

    // ── Trail ring buffer ──────────────────────────────────────────────────────
    const TLEN  = 18;
    const trlX  = new Float32Array(TLEN);
    const trlY  = new Float32Array(TLEN);
    trlX.fill(mouseX); trlY.fill(mouseY);

    // ── Nebula scatter particles ───────────────────────────────────────────────
    const particles: Particle[] = [];

    // ── Event listeners ───────────────────────────────────────────────────────
    const onMove = (e: MouseEvent) => {
      mouseX = e.clientX; mouseY = e.clientY;
      onPage = true; lastMove = performance.now();
    };
    const onLeave = () => { onPage = false; };
    const onEnter = () => { onPage = true; };

    // pointerover bubbles — fires every time pointer enters any element
    const onPtrOver = (e: PointerEvent) => {
      const el = e.target as Element;
      hovering = !!el.closest(INTERACT);
      onNav    = !!el.closest(NAV_SEL);
    };

    const onDown = (e: MouseEvent) => {
      pressing = true;
      for (let i = 0; i < 9; i++) {
        const a = (Math.PI * 2 * i / 9) + (Math.random() - 0.5) * 0.7;
        const s = 1.8 + Math.random() * 3.2;
        particles.push({ x: e.clientX, y: e.clientY, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
                         life: 1, hue: 175 + Math.random() * 85 });
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
      const f  = Math.min(dt * 60, 6);   // frame factor ≈ 1 at 60fps

      // Lerp cursor position (CSS px space, independent of DPR)
      const posLerp = Math.min(0.18 * f, 1);
      curX += (mouseX - curX) * posLerp;
      curY += (mouseY - curY) * posLerp;

      // Trail ring buffer — shift and write
      for (let i = TLEN - 1; i > 0; i--) { trlX[i] = trlX[i-1]; trlY[i] = trlY[i-1]; }
      trlX[0] = curX; trlY[0] = curY;

      // Sight lerps
      const sightGapT  = onNav ? 3 : 6;
      const sightCyanT = onNav ? 1 : 0;
      sightGap  += (sightGapT  - sightGap)  * Math.min(0.12 * f, 1);
      sightCyan += (sightCyanT - sightCyan) * Math.min(0.10 * f, 1);

      // Vector angle: 0 (up) → π (down) when scrolling
      const vAngT = voidState.scrollVel > 0.25 ? Math.PI : 0;
      vectorAng  += (vAngT - vectorAng) * Math.min(0.07 * f, 1);

      // Idle depth scale
      const idleT = performance.now() - lastMove > 1500 ? 0.88 : 1.0;
      idleScale  += (idleT - idleScale) * Math.min(0.04 * f, 1);

      // Breath phase: full cycle every 9s
      breathPh += dt * (Math.PI * 2 / 9);

      // Determine state (priority: nebula > vector > sight > pulsar)
      // Particles always render separately; isPulsar visible during particle decay
      const isVector = voidState.scrollVel > 0.25;
      const isSight  = hovering && !isVector && !pressing;
      const isPulsar = !pressing && !isVector && !isSight;

      const W  = window.innerWidth, H = window.innerHeight;
      const cx = curX, cy = curY;
      const sc = idleScale;

      // ── Clear ──────────────────────────────────────────────────────────────
      ctx.clearRect(0, 0, W, H);
      if (!onPage) return;

      // ── Helper: reset shadow ───────────────────────────────────────────────
      const noShadow = () => { ctx.shadowBlur = 0; ctx.shadowColor = "transparent"; };

      // ══ Pulsar ══════════════════════════════════════════════════════════════
      if (isPulsar) {
        // Star trail
        noShadow();
        for (let i = 1; i < TLEN; i++) {
          const t = 1 - i / TLEN;
          const r = 2.2 * t * sc;
          if (r < 0.2) continue;
          ctx.fillStyle = `rgba(184,240,255,${(t * 0.32).toFixed(3)})`;
          ctx.beginPath(); ctx.arc(trlX[i], trlY[i], r, 0, Math.PI * 2); ctx.fill();
        }
        // Breathing hairline ring
        const ringR = (15 + 2.2 * Math.sin(breathPh)) * sc;
        ctx.shadowColor = "rgba(184,240,255,0.30)"; ctx.shadowBlur = 5;
        ctx.strokeStyle = "rgba(184,240,255,0.52)";
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(cx, cy, ringR, 0, Math.PI * 2); ctx.stroke();
        // Core dot with glow
        ctx.shadowColor = "rgba(184,240,255,0.85)"; ctx.shadowBlur = 14;
        ctx.fillStyle = "rgba(205,250,255,0.97)";
        ctx.beginPath(); ctx.arc(cx, cy, 2.5 * sc, 0, Math.PI * 2); ctx.fill();
      }

      // ══ Sight (crosshair) ═══════════════════════════════════════════════════
      if (isSight) {
        const arm = 9 * sc, gap = sightGap * sc;
        // Interpolate white → cyan
        const rC = Math.round(255 - 115 * sightCyan);
        const gC = Math.round(255 -  35 * sightCyan);
        const col = `rgba(${rC},${gC},255,0.90)`;

        ctx.strokeStyle = col;
        ctx.lineWidth = 1.5;
        ctx.lineCap = "round";
        ctx.shadowColor = `rgba(${rC},${gC},255,0.55)`; ctx.shadowBlur = 8;

        ctx.beginPath(); ctx.moveTo(cx, cy - gap); ctx.lineTo(cx, cy - gap - arm); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx, cy + gap); ctx.lineTo(cx, cy + gap + arm); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx - gap, cy); ctx.lineTo(cx - gap - arm, cy); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx + gap, cy); ctx.lineTo(cx + gap + arm, cy); ctx.stroke();

        // Small center dot
        noShadow();
        ctx.fillStyle = `rgba(${rC},${gC},255,${(0.45 + 0.45 * sightCyan).toFixed(3)})`;
        ctx.beginPath(); ctx.arc(cx, cy, 1.8 * sc, 0, Math.PI * 2); ctx.fill();
      }

      // ══ Vector (triangle needle) ══════════════════════════════════════════════
      if (isVector) {
        const h = 14 * sc, w = 7 * sc;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(vectorAng);
        // tip at -h (up), base at +h*0.45
        ctx.beginPath();
        ctx.moveTo(0, -h);
        ctx.lineTo( w * 0.5,  h * 0.45);
        ctx.lineTo(-w * 0.5,  h * 0.45);
        ctx.closePath();
        ctx.fillStyle = "rgba(200,245,255,0.92)";
        ctx.shadowColor = "rgba(184,240,255,0.65)"; ctx.shadowBlur = 10;
        ctx.fill();
        ctx.restore();
      }

      // ══ Nebula (glow + particles) ════════════════════════════════════════════
      if (pressing) {
        // Central glow disc
        const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, 22 * sc);
        grd.addColorStop(0,   "rgba(200,248,255,0.50)");
        grd.addColorStop(0.4, "rgba(160,220,255,0.16)");
        grd.addColorStop(1,   "rgba(0,0,0,0)");
        noShadow();
        ctx.fillStyle = grd;
        ctx.beginPath(); ctx.arc(cx, cy, 22 * sc, 0, Math.PI * 2); ctx.fill();
        // White nucleus
        ctx.shadowColor = "rgba(200,248,255,0.80)"; ctx.shadowBlur = 10;
        ctx.fillStyle = "rgba(215,252,255,0.96)";
        ctx.beginPath(); ctx.arc(cx, cy, 2.5 * sc, 0, Math.PI * 2); ctx.fill();
      }

      // ── Scatter particles (always — persist after mouseup) ──────────────────
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x  += p.vx; p.y  += p.vy;
        p.vx *= 0.91; p.vy *= 0.91;
        p.life -= dt * 1.8;
        if (p.life <= 0) { particles.splice(i, 1); continue; }
        const a = p.life * 0.88;
        ctx.shadowColor = `hsla(${p.hue},100%,82%,${(a * 0.4).toFixed(3)})`; ctx.shadowBlur = 5;
        ctx.fillStyle   = `hsla(${p.hue},100%,82%,${a.toFixed(3)})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.3, 1.6 * p.life), 0, Math.PI * 2); ctx.fill();
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
      }}
    />
  );
}
