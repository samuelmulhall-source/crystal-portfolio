"use client";

/**
 * EffectsOverlay — 2D Canvas layer for all special visual effects.
 *
 * Why 2D canvas instead of Three.js materials:
 *   Three.js PointsMaterial / MeshBasicMaterial with AdditiveBlending works,
 *   but achieving *holographic color* requires precise control over hue,
 *   opacity, and radial gradients that Three.js materials abstract away.
 *   Canvas2D gives us createRadialGradient + globalCompositeOperation:'lighter'
 *   (= additive blending) which makes iridescent color trivial and guaranteed.
 *
 * Effects rendered here:
 *   1. Holographic hover glow  — prismatic spectral rings + diffractive spikes
 *      at each hovered star's screen position (thin-film iridescence aesthetic).
 *   2. Meteor trail            — tapered gradient line (tail=transparent, head=white)
 *      with shadowBlur glow. Drawn from voidState.meteorSlots screen coords.
 *   3. Meteor head spark       — bright radial burst at head position.
 */

import { useEffect, useRef } from "react";
import { voidState } from "../lib/voidState";

// ─── 6 symbol shape functions ───────────────────────────────────────────────
// Each sets up a canvas path (caller does ctx.stroke() afterward).
// They're deterministically assigned per star so each star always shows
// the same variant — giving the illusion of "individual transformation".

// 0 — Ice shard: elongated spear diamond
function drawIceShard(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, rot: number) {
  ctx.beginPath();
  ctx.moveTo(cx + Math.cos(rot)              * r * 1.9,  cy + Math.sin(rot)              * r * 1.9);
  ctx.lineTo(cx + Math.cos(rot + Math.PI/2)  * r * 0.25, cy + Math.sin(rot + Math.PI/2)  * r * 0.25);
  ctx.lineTo(cx + Math.cos(rot + Math.PI)    * r * 0.6,  cy + Math.sin(rot + Math.PI)    * r * 0.6);
  ctx.lineTo(cx + Math.cos(rot - Math.PI/2)  * r * 0.25, cy + Math.sin(rot - Math.PI/2)  * r * 0.25);
  ctx.closePath();
}

// 1 — Node: small circle with 4 radial spokes
function drawNode(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, rot: number) {
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.32, 0, Math.PI * 2); // inner ring
  for (let i = 0; i < 4; i++) {
    const a = rot + i * (Math.PI / 2);
    ctx.moveTo(cx + Math.cos(a) * r * 0.48, cy + Math.sin(a) * r * 0.48);
    ctx.lineTo(cx + Math.cos(a) * r,         cy + Math.sin(a) * r);
  }
}

// 2 — Diamond: classic 4-pointed rhombus
function drawDiamond(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, rot: number) {
  ctx.beginPath();
  ctx.moveTo(cx + Math.cos(rot)             * r,        cy + Math.sin(rot)             * r);
  ctx.lineTo(cx + Math.cos(rot + Math.PI/2) * r * 0.30, cy + Math.sin(rot + Math.PI/2) * r * 0.30);
  ctx.lineTo(cx + Math.cos(rot + Math.PI)   * r,        cy + Math.sin(rot + Math.PI)   * r);
  ctx.lineTo(cx + Math.cos(rot - Math.PI/2) * r * 0.30, cy + Math.sin(rot - Math.PI/2) * r * 0.30);
  ctx.closePath();
}

// 3 — Spark: 4-line asterisk with small crossbar ticks
function drawSpark(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, rot: number) {
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const a  = rot + i * (Math.PI / 2);
    const tp = a + Math.PI / 2;
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    // small crossbar at 60% out
    ctx.moveTo(cx + Math.cos(a) * r * 0.6 + Math.cos(tp) * r * 0.18,
               cy + Math.sin(a) * r * 0.6 + Math.sin(tp) * r * 0.18);
    ctx.lineTo(cx + Math.cos(a) * r * 0.6 - Math.cos(tp) * r * 0.18,
               cy + Math.sin(a) * r * 0.6 - Math.sin(tp) * r * 0.18);
  }
}

// 4 — Triangle crystal: equilateral with inner centroid line
function drawTriCrystal(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, rot: number) {
  ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    const a = rot - Math.PI / 2 + i * (Math.PI * 2 / 3);
    if (i === 0) {
      ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    } else {
      ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
  }
  ctx.closePath();
  // Inner centroid detail line
  ctx.moveTo(cx + Math.cos(rot - Math.PI / 2) * r, cy + Math.sin(rot - Math.PI / 2) * r);
  ctx.lineTo(cx, cy);
}

// 5 — Hex crystal: 6-pointed star with alternating long/short tips
function drawHexCrystal(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, rot: number) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a  = rot + (i / 6) * Math.PI * 2;
    const ri = i % 2 === 0 ? r : r * 0.50;
    ctx.lineTo(cx + Math.cos(a) * ri, cy + Math.sin(a) * ri);
  }
  ctx.closePath();
}

// Dispatch to the correct shape by variant index
function drawVariant(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  r: number, rot: number,
  variant: number,
) {
  switch (variant % 6) {
    case 0: drawIceShard(ctx, cx, cy, r, rot);  break;
    case 1: drawNode(ctx, cx, cy, r, rot);      break;
    case 2: drawDiamond(ctx, cx, cy, r, rot);   break;
    case 3: drawSpark(ctx, cx, cy, r, rot);     break;
    case 4: drawTriCrystal(ctx, cx, cy, r, rot);break;
    case 5: drawHexCrystal(ctx, cx, cy, r, rot);break;
  }
}

// Per-slot spring state for bouncy symbol entrance (lives outside React render cycle)
const _springs: Array<{ pos: number; vel: number }> =
  Array.from({ length: 14 }, () => ({ pos: 0, vel: 0 }));

// Spectral ring wavelengths for thin-film iridescence (hue, radial multiplier)
const SPECTRAL: Array<{ hue: number; rMul: number; sat: number }> = [
  { hue: 195, rMul: 1.0, sat: 100 }, // ice-cyan   (innermost)
  { hue: 210, rMul: 1.4, sat: 95  },
  { hue: 230, rMul: 1.85, sat: 95 }, // blue
  { hue: 255, rMul: 2.3, sat: 90  }, // indigo
  { hue: 280, rMul: 2.8, sat: 88  }, // violet
  { hue: 300, rMul: 3.3, sat: 85  }, // magenta (outermost)
];

export default function EffectsOverlay() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf: number;
    const t0 = performance.now();
    let lastT = performance.now();

    const resize = () => {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    function draw() {
      raf = requestAnimationFrame(draw);
      const w   = canvas!.width;
      const h   = canvas!.height;
      ctx!.clearRect(0, 0, w, h);

      const now = performance.now();
      const dt  = Math.min((now - lastT) * 0.001, 0.05);
      lastT     = now;
      const t   = (now - t0) * 0.001;

      // Spring constants: high stiffness + medium damping → snappy with 1-2 bounces
      const SPRING_K  = 420;  // stiffness (larger = snappier)
      const SPRING_D  = 26;   // damping   (lower = bouncier)

      // ── 1. Holographic hover glow ────────────────────────────────────────
      for (let i = 0; i < voidState.hoverSlots.length; i++) {
        const slot   = voidState.hoverSlots[i];
        const spring = _springs[i];

        // Advance spring simulation
        const target = slot.ease;
        spring.vel  += (target - spring.pos) * SPRING_K * dt;
        spring.vel  -= spring.vel * SPRING_D * dt;
        spring.pos  += spring.vel * dt;
        // Hard-clamp spring to [0, 1] — prevents physics overshoot from blowing
        // out the "lighter" blended glow into a full-screen flare.
        spring.pos = Math.max(0, Math.min(spring.pos, 1.0));
        if (spring.pos < 0.005 && target < 0.01) {
          spring.pos = 0;
          spring.vel = 0;
        }
        if (spring.pos < 0.005) continue;
        // Slots 8+ are line-only; advance spring but skip all glow/symbol rendering
        if (i >= 8) continue;

        const { sx, sy, variant } = slot;
        const ease = Math.min(spring.pos, 1.0);
        // Larger base radius for more visible holographic rings
        const r   = 12 * ease;
        const rot = t * 1.2 + i * 1.05;

        ctx!.save();
        ctx!.globalCompositeOperation = "lighter";

        // ── Prismatic thin-film spectral rings ───────────────────────────
        // Each ring is a narrow annular glow at increasing radii, cycling
        // through the visible spectrum (ice-cyan → blue → indigo → violet → magenta).
        // Opacity is individually animated so the rings shimmer independently.
        SPECTRAL.forEach(({ hue, rMul, sat }, si) => {
          const rInner = r * rMul * 0.70;
          const rOuter = r * rMul * 1.30;
          // Each ring shimmers at its own phase — thin-film interference illusion
          const shimmer = 0.55 + 0.45 * Math.sin(t * 2.4 + si * 0.9 + i * 0.5);
          const a = ease * 0.16 * shimmer;
          const ring = ctx!.createRadialGradient(sx, sy, rInner, sx, sy, rOuter);
          ring.addColorStop(0.0, `hsla(${hue}, ${sat}%, 72%, 0)`);
          ring.addColorStop(0.4, `hsla(${hue}, ${sat}%, 72%, ${a})`);
          ring.addColorStop(0.6, `hsla(${hue}, ${sat}%, 80%, ${a * 0.7})`);
          ring.addColorStop(1.0, "rgba(0,0,0,0)");
          ctx!.fillStyle = ring;
          ctx!.beginPath();
          ctx!.arc(sx, sy, rOuter, 0, Math.PI * 2);
          ctx!.fill();
        });

        // ── Diffractive spikes: sharp radial rays cycling through spectrum ─
        const spikeCount = variant % 2 === 0 ? 6 : 8;
        const spikeR     = r * 3.5;
        for (let si = 0; si < spikeCount; si++) {
          const a    = rot + (si / spikeCount) * Math.PI * 2;
          // Each spike has a different spectral hue, cycling with time
          const hue  = (195 + si * (280 / spikeCount) + t * 18) % 360;
          const sAlpha = ease * (0.45 + 0.25 * Math.sin(t * 3.1 + si * 1.3));
          const sGrad  = ctx!.createLinearGradient(sx, sy, sx + Math.cos(a) * spikeR, sy + Math.sin(a) * spikeR);
          sGrad.addColorStop(0.0, `hsla(${hue}, 100%, 88%, ${sAlpha})`);
          sGrad.addColorStop(0.5, `hsla(${(hue + 30) % 360}, 100%, 78%, ${sAlpha * 0.4})`);
          sGrad.addColorStop(1.0, "rgba(0,0,0,0)");
          ctx!.strokeStyle = sGrad;
          ctx!.lineWidth   = 0.55;
          ctx!.beginPath();
          ctx!.moveTo(sx + Math.cos(a) * r * 0.25, sy + Math.sin(a) * r * 0.25);
          ctx!.lineTo(sx + Math.cos(a) * spikeR,   sy + Math.sin(a) * spikeR);
          ctx!.stroke();
        }

        // ── Ice-white core ───────────────────────────────────────────────
        const core = ctx!.createRadialGradient(sx, sy, 0, sx, sy, r * 0.85);
        core.addColorStop(0.0, `rgba(235, 250, 255, ${ease * 0.95})`);
        core.addColorStop(0.4, `rgba(200, 240, 255, ${ease * 0.55})`);
        core.addColorStop(1.0, "rgba(0,0,0,0)");
        ctx!.fillStyle = core;
        ctx!.beginPath();
        ctx!.arc(sx, sy, r * 0.85, 0, Math.PI * 2);
        ctx!.fill();

        // ── Spinning crystal shape outline (variant) ─────────────────────
        // Hue shifts with time for a prismatic sweep effect
        const shimHue = (200 + Math.sin(t * 1.8 + i * 0.8) * 80 + 360) % 360;
        ctx!.strokeStyle = `hsla(${shimHue}, 100%, 82%, ${ease * 0.75})`;
        ctx!.lineWidth   = 0.7;
        ctx!.shadowColor = `hsla(${shimHue}, 100%, 68%, 0.9)`;
        ctx!.shadowBlur  = 5 * ease;
        drawVariant(ctx!, sx, sy, r, rot, variant);
        ctx!.stroke();

        // Counter-rotating layer (offset hue, larger radius)
        ctx!.strokeStyle = `hsla(${(shimHue + 60) % 360}, 95%, 74%, ${ease * 0.28})`;
        ctx!.shadowBlur  = 2 * ease;
        ctx!.lineWidth   = 0.4;
        drawVariant(ctx!, sx, sy, r * 1.4, -rot * 0.55 + Math.PI / 6, (variant + 2) % 6);
        ctx!.stroke();

        ctx!.restore();
      }

      // ── 1b. Constellation paths between active hover stars ──────────────
      // Ice-white monochrome — no HSL color gradient, just pure frost lines.
      const active: Array<{ sx: number; sy: number; ease: number }> = [];
      for (let i = 0; i < voidState.hoverSlots.length; i++) {
        if (_springs[i].pos > 0.12) { // 0.12 catches line-only slots (max ease 0.28)
          const s = voidState.hoverSlots[i];
          active.push({ sx: s.sx, sy: s.sy, ease: _springs[i].pos });
        }
      }
      if (active.length >= 2) {
        ctx!.save();
        ctx!.globalCompositeOperation = "lighter";
        ctx!.lineCap = "round";
        for (let a = 0; a < active.length - 1; a++) {
          for (let b = a + 1; b < active.length; b++) {
            const sa = active[a], sb = active[b];
            const dist = Math.hypot(sa.sx - sb.sx, sa.sy - sb.sy);
            if (dist > 560 || dist < 6) continue;

            const minE = Math.min(sa.ease, sb.ease);
            const distFade = Math.max(0, 1 - dist / 560);
            const alpha    = minE * distFade * 0.55;

            // Animated dash for travelling-light effect
            const dashLen    = 8 + dist * 0.06;
            const dashOffset = (t * 45) % (dashLen * 2);
            ctx!.setLineDash([dashLen * 0.5, dashLen * 1.5]);
            ctx!.lineDashOffset = -dashOffset;

            // Ice-white monochrome — no hue cycling
            ctx!.strokeStyle = `rgba(184, 240, 255, ${alpha})`;
            ctx!.lineWidth   = 1.0;
            ctx!.shadowColor = `rgba(184, 240, 255, 0.45)`;
            ctx!.shadowBlur  = 3;
            ctx!.beginPath();
            ctx!.moveTo(sa.sx, sa.sy);
            ctx!.lineTo(sb.sx, sb.sy);
            ctx!.stroke();
          }
        }
        ctx!.setLineDash([]);
        ctx!.lineDashOffset = 0;
        ctx!.restore();
      }

      // ── 2. Meteor trails ────────────────────────────────────────────────
      for (let m = 0; m < voidState.meteorSlots.length; m++) {
        const met = voidState.meteorSlots[m];
        if (!met.active || met.env < 0.01) continue;

        const { hsx, hsy, tsx, tsy, env } = met;

        ctx!.save();
        ctx!.globalCompositeOperation = "lighter";
        ctx!.lineCap  = "round";
        ctx!.lineJoin = "round";

        // ── Glow pass: blue/ice — half of previous size ─────────────────
        const gGlow = ctx!.createLinearGradient(tsx, tsy, hsx, hsy);
        gGlow.addColorStop(0.00, "rgba(0,0,0,0)");
        gGlow.addColorStop(0.25, `rgba(20,  50, 180, ${env * 0.42})`);  // deep blue
        gGlow.addColorStop(0.60, `rgba(70, 140, 255, ${env * 0.68})`);  // sky blue
        gGlow.addColorStop(0.85, `rgba(180,220, 255, ${env * 0.84})`);  // ice blue
        gGlow.addColorStop(1.00, `rgba(255,255, 255, ${env * 0.92})`);  // white head

        ctx!.filter      = "blur(0.8px)";
        ctx!.strokeStyle = gGlow;
        ctx!.lineWidth   = 1.3 * env;
        ctx!.shadowColor = `rgba(80, 150, 255, ${env * 0.60})`;
        ctx!.shadowBlur  = 3 * env;
        ctx!.beginPath();
        ctx!.moveTo(tsx, tsy);
        ctx!.lineTo(hsx, hsy);
        ctx!.stroke();

        // ── Core pass: ice-white ─────────────────────────────────────────
        ctx!.filter = "none";
        ctx!.shadowBlur = 0;

        const gCore = ctx!.createLinearGradient(tsx, tsy, hsx, hsy);
        gCore.addColorStop(0.00, "rgba(0,0,0,0)");
        gCore.addColorStop(0.35, `rgba( 80, 140, 255, ${env * 0.65})`);
        gCore.addColorStop(0.75, `rgba(210, 235, 255, ${env * 0.88})`);
        gCore.addColorStop(1.00, `rgba(255, 255, 255, ${env})`);

        ctx!.strokeStyle = gCore;
        ctx!.lineWidth   = 0.6 * env;
        ctx!.beginPath();
        ctx!.moveTo(tsx, tsy);
        ctx!.lineTo(hsx, hsy);
        ctx!.stroke();

        // ── Holographic shimmer: violet-cyan prismatic overlay ────────────
        const gShimmer = ctx!.createLinearGradient(tsx, tsy, hsx, hsy);
        gShimmer.addColorStop(0.00, "rgba(0,0,0,0)");
        gShimmer.addColorStop(0.30, `rgba(160,  50, 240, ${env * 0.18})`);  // violet
        gShimmer.addColorStop(0.60, `rgba( 50, 220, 210, ${env * 0.18})`);  // cyan
        gShimmer.addColorStop(0.85, `rgba(220, 180, 255, ${env * 0.14})`);  // lilac
        gShimmer.addColorStop(1.00, "rgba(0,0,0,0)");

        ctx!.strokeStyle = gShimmer;
        ctx!.lineWidth   = 1.0 * env;
        ctx!.beginPath();
        ctx!.moveTo(tsx, tsy);
        ctx!.lineTo(hsx, hsy);
        ctx!.stroke();

        // ── Head spark: ice-white ────────────────────────────────────────
        const sparkR = 1.65 * env;
        const spark  = ctx!.createRadialGradient(hsx, hsy, 0, hsx, hsy, sparkR * 2.5);
        spark.addColorStop(0.00, `rgba(255, 255, 255, ${env})`);
        spark.addColorStop(0.30, `rgba(200, 230, 255, ${env * 0.80})`);  // ice blue
        spark.addColorStop(0.65, `rgba(100, 160, 255, ${env * 0.45})`);  // blue
        spark.addColorStop(1.00, "rgba(0,0,0,0)");

        ctx!.fillStyle   = spark;
        ctx!.shadowColor = "rgba(160, 210, 255, 0.72)";
        ctx!.shadowBlur  = 2.5 * env;
        ctx!.beginPath();
        ctx!.arc(hsx, hsy, sparkR * 2.5, 0, Math.PI * 2);
        ctx!.fill();

        ctx!.restore();
      }
    }

    draw();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position:      "fixed",
        top:           0,
        left:          0,
        width:         "100%",
        height:        "100%",
        pointerEvents: "none",
        zIndex:        1,
      }}
    />
  );
}
