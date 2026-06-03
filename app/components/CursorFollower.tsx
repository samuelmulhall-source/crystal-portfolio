"use client";

/**
 * CursorFollower — precision glass arrow cursor.
 *
 * Size: 12×20 CSS px (viewBox 0 0 12 19.5).
 *
 * Holographic stroke — the lit-edge highlight path uses a linearGradient
 *   whose 5 stops are updated each frame. At rest: all stops are white.
 *   On hover: stops cycle through the full visible spectrum (hue phases
 *   72° apart, shifting at ~80°/s). Saturation lerps 0→95%, lightness
 *   100→70%. Gives genuine thin-film iridescence, not RGB-shift cheapness.
 *
 * 3D tilt — two independent sources:
 *   • Model-region hover: tasteful 3D lean (±9°) as cursor moves over the
 *     active 3D model. Driven by normalised offset from model centre.
 *   • Drag: physical velocity tilt (±18°) when holding mousedown.
 *   Both use the same spring (K=180, D=14).
 *
 * Glow — subtle sine-wave pulse (±6%) on the drop-shadow radius.
 *
 * Canvas — click particles only.
 */

import { useEffect, useRef } from "react";
import { voidState } from "../lib/voidState";

type Particle = { x: number; y: number; vx: number; vy: number; life: number };

const INTERACT = "a, button, [role=button], input, textarea, label, select, [data-cursor=expand]";

export default function CursorFollower() {
  const svgRef = useRef<SVGSVGElement>(null);
  const cvRef  = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

    const styleTag = document.createElement("style");
    styleTag.textContent = "*, *::before, *::after { cursor: none !important; }";
    document.head.appendChild(styleTag);

    // ── Canvas setup ─────────────────────────────────────────────────────────
    const cv  = cvRef.current!;
    const ctx = cv.getContext("2d")!;
    // Cap DPR — a full-screen cursor canvas at 3x is pure waste for a few px of art
    let dpr   = Math.min(window.devicePixelRatio || 1, 2);
    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.width  = window.innerWidth  * dpr;
      cv.height = window.innerHeight * dpr;
      cv.style.width  = window.innerWidth  + "px";
      cv.style.height = window.innerHeight + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener("resize", resize, { passive: true });

    // ── Cache holo gradient stops ─────────────────────────────────────────────
    const svgEl    = svgRef.current!;
    const holoStops = Array.from(svgEl.querySelectorAll<SVGStopElement>("#gc-holo stop"));

    // ── State ────────────────────────────────────────────────────────────────
    let mouseX = window.innerWidth  / 2;
    let mouseY = window.innerHeight / 2;
    let lastMX = mouseX, lastMY = mouseY;
    let onPage   = false;
    let hovering = false;

    let cScale    = 1.0;
    let cOpacity  = 0;
    let cBaseGlow = 1.0;
    let cFlash    = 0;
    let holoSat   = 0; // 0 = white, 100 = full spectral

    let isDragging = false;
    let dragVX = 0, dragVY = 0;
    let curRotX = 0, curRotY = 0;
    let rotVelX = 0, rotVelY = 0;

    const particles: Particle[] = [];

    // ── Events ───────────────────────────────────────────────────────────────
    const onMove = (e: MouseEvent) => {
      if (isDragging) {
        const dx = e.clientX - lastMX;
        const dy = e.clientY - lastMY;
        dragVX = dragVX * 0.55 + dx * 0.45;
        dragVY = dragVY * 0.55 + dy * 0.45;
      }
      lastMX = e.clientX; lastMY = e.clientY;
      mouseX = e.clientX; mouseY = e.clientY;
      onPage = true;
    };
    const onLeave   = () => { onPage = false; };
    const onEnter   = () => { onPage = true; };
    const onPtrOver = (e: PointerEvent) => {
      hovering = !!(e.target as Element).closest(INTERACT);
    };
    const onDown = (e: MouseEvent) => {
      isDragging = true;
      lastMX = e.clientX; lastMY = e.clientY;
      dragVX = 0; dragVY = 0;
      cFlash = 2.4;
      for (let i = 0; i < 10; i++) {
        const a = (Math.PI * 2 * i / 10) + (Math.random() - 0.5) * 0.6;
        const s = 2.4 + Math.random() * 3.4;
        particles.push({ x: e.clientX, y: e.clientY, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1 });
      }
    };
    const onUp = () => { isDragging = false; };

    document.addEventListener("mousemove",   onMove,    { passive: true });
    document.addEventListener("mouseleave",  onLeave);
    document.addEventListener("mouseenter",  onEnter);
    document.addEventListener("pointerover", onPtrOver, { passive: true });
    document.addEventListener("mousedown",   onDown,    { passive: true });
    document.addEventListener("mouseup",     onUp,      { passive: true });

    // ── Render loop ──────────────────────────────────────────────────────────
    let raf: number;
    let lastT = performance.now();
    const t0  = performance.now();

    function tick(now: number) {
      raf = requestAnimationFrame(tick);
      const dt = Math.min((now - lastT) / 1000, 0.05);
      lastT = now;
      const f = Math.min(dt * 60, 6);
      const t = (now - t0) * 0.001;

      const svg = svgRef.current;
      if (!svg) return;

      // ── Arrow lerps ───────────────────────────────────────────────────────
      const tScale = hovering ? 1.10 : 1.0;
      const tGlow  = hovering ? 1.45 : 1.0;
      cScale    += (tScale           - cScale)    * Math.min(0.14 * f, 1);
      cOpacity  += ((onPage ? 1 : 0) - cOpacity)  * Math.min(0.15 * f, 1);
      cBaseGlow += (tGlow            - cBaseGlow)  * Math.min(0.11 * f, 1);
      cFlash    *= Math.pow(0.82, f);

      // ── Holographic stroke ────────────────────────────────────────────────
      // Saturation lerps: 0 (white at rest) → 100 (full spectrum on hover)
      holoSat += ((hovering ? 100 : 0) - holoSat) * Math.min(0.14 * f, 1);

      if (holoStops.length >= 5) {
        // Faster sweep (100°/s) + stronger shimmer wobble = clearly visible iridescence
        const phase = t * 100 + Math.sin(t * 2.3) * 22;
        const sat   = holoSat;                     // 0% → 100% full saturation
        const lgt   = 100 - (holoSat / 100) * 38; // 100% (white) → 62% (vivid spectral)
        for (let i = 0; i < 5; i++) {
          const h = ((phase + i * 72) % 360).toFixed(0);
          holoStops[i].setAttribute("stop-color",
            `hsl(${h},${sat.toFixed(1)}%,${lgt.toFixed(1)}%)`);
        }
      }

      // ── 3D tilt — model hover (tasteful) + drag ───────────────────────────
      let tRotX = 0, tRotY = 0;

      const mr = voidState.modelRegion;
      if (mr.rPx > 30) {
        const dx = mouseX - mr.x;
        const dy = mouseY - mr.y;
        const overModel = dx * dx + dy * dy < mr.rPx * mr.rPx;
        if (overModel && !isDragging) {
          const nx = dx / mr.rPx; // −1..+1
          const ny = dy / mr.rPx;
          tRotX =  ny * 22;
          tRotY = -nx * 22;
        }
      }

      // Drag overrides model hover
      if (isDragging) {
        dragVX += 0; // keep drag vel live
        tRotX = Math.max(-18, Math.min(18, -dragVY * 0.05));
        tRotY = Math.max(-18, Math.min(18,  dragVX * 0.05));
      } else {
        dragVX *= Math.pow(0.88, f);
        dragVY *= Math.pow(0.88, f);
      }

      // Spring integration (K=220, D=16) — snappier response to model position
      rotVelX += (tRotX - curRotX) * 220 * dt; rotVelX -= rotVelX * 16 * dt;
      rotVelY += (tRotY - curRotY) * 220 * dt; rotVelY -= rotVelY * 16 * dt;
      curRotX += rotVelX * dt;
      curRotY += rotVelY * dt;

      // ── Apply transform ───────────────────────────────────────────────────
      const hasTilt = Math.abs(curRotX) > 0.05 || Math.abs(curRotY) > 0.05;
      svg.style.transform = hasTilt
        ? `translate(${mouseX}px,${mouseY}px) scale(${cScale.toFixed(4)}) perspective(55px) rotateX(${curRotX.toFixed(2)}deg) rotateY(${curRotY.toFixed(2)}deg)`
        : `translate(${mouseX}px,${mouseY}px) scale(${cScale.toFixed(4)})`;
      svg.style.opacity = cOpacity.toFixed(3);

      // Glow with subtle sine-wave pulse on the radius
      const pulse = 1 + Math.sin(t * 3.2) * 0.06;
      const g     = Math.max((cBaseGlow + cFlash) * pulse, 0);
      svg.style.filter = [
        `drop-shadow(0 0 ${(2.5 * g).toFixed(1)}px rgba(215,240,255,${Math.min(0.60 * g, 1).toFixed(2)}))`,
        `drop-shadow(0 0 ${(10  * g).toFixed(1)}px rgba(184,240,255,${Math.min(0.30 * g, 0.9).toFixed(2)}))`,
        `drop-shadow(0 0 ${(22  * g).toFixed(1)}px rgba(184,240,255,${Math.min(0.10 * g, 0.4).toFixed(2)}))`,
      ].join(" ");

      // ── Canvas — click particles ──────────────────────────────────────────
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx; p.y += p.vy;
        p.vx *= 0.91; p.vy *= 0.91;
        p.life -= dt * 1.6;
        if (p.life <= 0) { particles.splice(i, 1); continue; }
        ctx.fillStyle = `rgba(200,240,255,${(p.life * 0.9).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.4, 2.2 * p.life), 0, Math.PI * 2);
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
    <>
      {/* ── Glass arrow — tip at (0,0), pointing upper-left ─────────────── */}
      {/*    Rendered at 12×20 CSS px (viewBox 0 0 12 19.5).                  */}
      {/*    Lit-edge stroke uses #gc-holo gradient — white at rest, full      */}
      {/*    iridescent spectrum on hover. Stops updated each frame via JS.    */}
      <svg
        ref={svgRef}
        aria-hidden="true"
        width="12"
        height="20"
        viewBox="0 0 12 19.5"
        style={{
          position:        "fixed",
          top:             0,
          left:            0,
          pointerEvents:   "none",
          zIndex:          9999,
          willChange:      "transform, opacity, filter",
          opacity:         0,
          overflow:        "visible",
          transformOrigin: "0 0",
        }}
      >
        <defs>
          {/* Glass body fill — increased opacity so tint is visible on dark bg */}
          <linearGradient id="gc-body" x1="0" y1="0" x2="12" y2="19.5" gradientUnits="userSpaceOnUse">
            <stop offset="0%"   stopColor="#b8e4ff" stopOpacity="0.78" />
            <stop offset="42%"  stopColor="#88c4f0" stopOpacity="0.44" />
            <stop offset="100%" stopColor="#5090c0" stopOpacity="0.14" />
          </linearGradient>
          {/* Caustic light pool near tip */}
          <radialGradient id="gc-caustic" cx="2" cy="2.5" r="7" gradientUnits="userSpaceOnUse">
            <stop offset="0%"   stopColor="white" stopOpacity="0.58" />
            <stop offset="60%"  stopColor="white" stopOpacity="0.16" />
            <stop offset="100%" stopColor="white" stopOpacity="0"    />
          </radialGradient>
          {/* Holographic edge gradient — 5 stops updated per frame in JS.     */}
          {/* Runs diagonally tip→tail. At rest: all stops = pure white.       */}
          {/* On hover: stops phase-offset 72° apart through full hue wheel.   */}
          <linearGradient id="gc-holo" x1="12" y1="0" x2="0" y2="17" gradientUnits="userSpaceOnUse">
            <stop offset="0%"   stopColor="hsl(0,0%,100%)"   stopOpacity="0.92" />
            <stop offset="25%"  stopColor="hsl(72,0%,100%)"  stopOpacity="0.92" />
            <stop offset="50%"  stopColor="hsl(144,0%,100%)" stopOpacity="0.92" />
            <stop offset="75%"  stopColor="hsl(216,0%,100%)" stopOpacity="0.92" />
            <stop offset="100%" stopColor="hsl(288,0%,100%)" stopOpacity="0.92" />
          </linearGradient>
        </defs>

        {/* Glass body — tinted fill */}
        <path
          d="M 0,0 L 0,17 L 4.5,13 L 7,18.5 L 9,17.5 L 6.5,12 L 12,12 Z"
          fill="url(#gc-body)"
          stroke="none"
        />
        {/* Caustic light pool */}
        <path
          d="M 0,0 L 0,17 L 4.5,13 L 7,18.5 L 9,17.5 L 6.5,12 L 12,12 Z"
          fill="url(#gc-caustic)"
          stroke="none"
        />
        {/* Outer body outline — subtle fixed white, not holo */}
        <path
          d="M 0,0 L 0,17 L 4.5,13 L 7,18.5 L 9,17.5 L 6.5,12 L 12,12 Z"
          fill="none"
          stroke="rgba(255,255,255,0.45)"
          strokeWidth="0.55"
          strokeLinejoin="round"
        />
        {/* Lit leading edges — holographic on hover, white at rest */}
        <path
          d="M 12,12 L 0,0 L 0,17 L 4.5,13"
          fill="none"
          stroke="url(#gc-holo)"
          strokeWidth="0.85"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Tip sparkle */}
        <circle cx="0" cy="0" r="1.0" fill="white" opacity="0.90" />
      </svg>

      {/* Canvas — particles only, additive blend */}
      <canvas
        ref={cvRef}
        aria-hidden="true"
        style={{
          position:      "fixed",
          top:           0,
          left:          0,
          pointerEvents: "none",
          zIndex:        9997,
          mixBlendMode:  "screen",
        }}
      />
    </>
  );
}
