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

// Per-slot spring state for smooth hover entrance (lives outside React render cycle)
const _springs: Array<{ pos: number; vel: number }> =
  Array.from({ length: 14 }, () => ({ pos: 0, vel: 0 }));

// Spectral ring wavelengths for thin-film iridescence (hue, radial multiplier)
const SPECTRAL: Array<{ hue: number; rMul: number; sat: number }> = [
  { hue: 188, rMul: 0.70, sat: 100 }, // aqua-ice   (innermost — tight halo)
  { hue: 200, rMul: 1.10, sat: 100 }, // ice-cyan
  { hue: 218, rMul: 1.60, sat: 100 }, // blue
  { hue: 242, rMul: 2.15, sat: 100 }, // indigo
  { hue: 268, rMul: 2.75, sat: 100 }, // violet
  { hue: 295, rMul: 3.40, sat: 100 }, // magenta
  { hue: 320, rMul: 4.10, sat: 95  }, // pink (outermost)
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
        const r   = 20 * ease;
        const rot = t * 0.9 + i * 1.05;

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
          const shimmer = 0.60 + 0.40 * Math.sin(t * 3.8 + si * 0.85 + i * 0.65);
          const a = ease * 0.32 * shimmer;
          const ring = ctx!.createRadialGradient(sx, sy, rInner, sx, sy, rOuter);
          ring.addColorStop(0.0, `hsla(${hue}, ${sat}%, 88%, 0)`);
          ring.addColorStop(0.4, `hsla(${hue}, ${sat}%, 88%, ${a})`);
          ring.addColorStop(0.6, `hsla(${hue}, ${sat}%, 96%, ${a * 0.65})`);
          ring.addColorStop(1.0, "rgba(0,0,0,0)");
          ctx!.fillStyle = ring;
          ctx!.beginPath();
          ctx!.arc(sx, sy, rOuter, 0, Math.PI * 2);
          ctx!.fill();
        });

        // ── Diffractive spikes: sharp radial rays cycling through spectrum ─
        const spikeCount = variant % 2 === 0 ? 6 : 8;
        const spikeR     = r * 5.2;
        for (let si = 0; si < spikeCount; si++) {
          const a      = rot + (si / spikeCount) * Math.PI * 2;
          // Each spike cycles through the full visible spectrum
          const hue    = (188 + si * (310 / spikeCount) + t * 28) % 360;
          const sAlpha = ease * (0.75 + 0.22 * Math.sin(t * 4.2 + si * 1.3));
          const sGrad  = ctx!.createLinearGradient(sx, sy, sx + Math.cos(a) * spikeR, sy + Math.sin(a) * spikeR);
          sGrad.addColorStop(0.0, `hsla(${hue}, 100%, 95%, ${sAlpha})`);
          sGrad.addColorStop(0.35, `hsla(${(hue + 25) % 360}, 100%, 85%, ${sAlpha * 0.55})`);
          sGrad.addColorStop(1.0, "rgba(0,0,0,0)");
          ctx!.strokeStyle = sGrad;
          ctx!.lineWidth   = 1.1;
          ctx!.beginPath();
          ctx!.moveTo(sx + Math.cos(a) * r * 0.18, sy + Math.sin(a) * r * 0.18);
          ctx!.lineTo(sx + Math.cos(a) * spikeR,   sy + Math.sin(a) * spikeR);
          ctx!.stroke();
        }

        // ── Crystallisation core: pure white-hot point → ice bloom ───────
        const core = ctx!.createRadialGradient(sx, sy, 0, sx, sy, r * 1.1);
        core.addColorStop(0.0,  `rgba(255, 255, 255, ${ease})`);
        core.addColorStop(0.18, `rgba(240, 252, 255, ${ease * 0.90})`);
        core.addColorStop(0.50, `rgba(190, 235, 255, ${ease * 0.55})`);
        core.addColorStop(1.0,  "rgba(0,0,0,0)");
        ctx!.fillStyle = core;
        ctx!.beginPath();
        ctx!.arc(sx, sy, r * 1.1, 0, Math.PI * 2);
        ctx!.fill();

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
