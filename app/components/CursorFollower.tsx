"use client";

/**
 * CursorFollower — glass arrow cursor + trailing ring.
 *
 * Arrow  — SVG pointer with visible glass body, bright lit edges, tip sparkle.
 * Ring   — thin ice-blue circle that springs behind the arrow tip.
 *          Contracts on hover (20px → 13px), flashes on click.
 *
 * States:
 *   Default — ring 20px, 0.28 opacity; arrow 1.0×
 *   Hover   — ring 13px, 0.62 opacity; arrow 1.16×; glow brightens
 *   Click   — ring flash-expand; particles burst; arrow glow pulse
 */

import { useEffect, useRef } from "react";

type Particle = { x: number; y: number; vx: number; vy: number; life: number };

const INTERACT = "a, button, [role=button], input, textarea, label, select, [data-cursor=expand]";

export default function CursorFollower() {
  const svgRef  = useRef<SVGSVGElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const cvRef   = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

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

    // ── State ────────────────────────────────────────────────────────────────
    let mouseX = window.innerWidth  / 2;
    let mouseY = window.innerHeight / 2;
    let onPage = false, hovering = false;

    // Arrow state
    let cScale    = 1.0;
    let cOpacity  = 0;
    let cBaseGlow = 1.0;
    let cFlash    = 0;

    // Ring state — lags behind mouse for spring feel
    let rX = mouseX, rY = mouseY;
    let rRadius  = 20.0;  // px
    let rOpacity = 0.0;
    let rFlash   = 0;

    const particles: Particle[] = [];

    // ── Events ───────────────────────────────────────────────────────────────
    const onMove    = (e: MouseEvent) => { mouseX = e.clientX; mouseY = e.clientY; onPage = true; };
    const onLeave   = () => { onPage = false; };
    const onEnter   = () => { onPage = true; };
    const onPtrOver = (e: PointerEvent) => { hovering = !!(e.target as Element).closest(INTERACT); };
    const onDown    = (e: MouseEvent) => {
      cFlash = 2.4;
      rFlash = 1.8;
      for (let i = 0; i < 10; i++) {
        const a = (Math.PI * 2 * i / 10) + (Math.random() - 0.5) * 0.6;
        const s = 2.4 + Math.random() * 3.4;
        particles.push({ x: e.clientX, y: e.clientY, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1 });
      }
    };

    document.addEventListener("mousemove",   onMove,    { passive: true });
    document.addEventListener("mouseleave",  onLeave);
    document.addEventListener("mouseenter",  onEnter);
    document.addEventListener("pointerover", onPtrOver, { passive: true });
    document.addEventListener("mousedown",   onDown,    { passive: true });

    // ── Render loop ──────────────────────────────────────────────────────────
    let raf: number;
    let lastT = performance.now();

    function tick(now: number) {
      raf = requestAnimationFrame(tick);
      const dt = Math.min((now - lastT) / 1000, 0.05);
      lastT = now;
      const f  = Math.min(dt * 60, 6);

      const svg  = svgRef.current;
      const ring = ringRef.current;
      if (!svg || !ring) return;

      // Arrow lerps
      const tScale = hovering ? 1.16 : 1.0;
      const tGlow  = hovering ? 1.55 : 1.0;
      cScale    += (tScale           - cScale)    * Math.min(0.14 * f, 1);
      cOpacity  += ((onPage ? 1 : 0) - cOpacity)  * Math.min(0.15 * f, 1);
      cBaseGlow += (tGlow            - cBaseGlow)  * Math.min(0.11 * f, 1);
      cFlash    *= Math.pow(0.82, f);

      // Ring lerps — slower for spring feel
      rX += (mouseX - rX) * Math.min(0.080 * f, 1);
      rY += (mouseY - rY) * Math.min(0.080 * f, 1);
      const tRadius   = hovering ? 13.0 : 20.0;
      const tROpacity = onPage ? (hovering ? 0.62 : 0.28) : 0;
      rRadius  += (tRadius   - rRadius)   * Math.min(0.13 * f, 1);
      rOpacity += (tROpacity - rOpacity)  * Math.min(0.13 * f, 1);
      rFlash   *= Math.pow(0.76, f);

      // Apply arrow
      svg.style.transform = `translate(${mouseX}px,${mouseY}px) scale(${cScale.toFixed(4)})`;
      svg.style.opacity   = cOpacity.toFixed(3);

      const g = Math.max(cBaseGlow + cFlash, 0);
      svg.style.filter = [
        `drop-shadow(0 0 ${(3  * g).toFixed(1)}px rgba(215,240,255,${Math.min(0.65 * g, 1.00).toFixed(2)}))`,
        `drop-shadow(0 0 ${(12 * g).toFixed(1)}px rgba(184,240,255,${Math.min(0.35 * g, 0.90).toFixed(2)}))`,
        `drop-shadow(0 0 ${(32 * g).toFixed(1)}px rgba(184,240,255,${Math.min(0.12 * g, 0.45).toFixed(2)}))`,
      ].join(" ");

      // Apply ring — offset by radius so ring is centered on cursor
      const rop = Math.min(rOpacity + rFlash * 0.7, 1.0);
      const rr  = rFlash > 0.1 ? rRadius + rFlash * 7 : rRadius;
      const rd  = rr * 2;
      ring.style.transform    = `translate(${(rX - rr).toFixed(1)}px,${(rY - rr).toFixed(1)}px)`;
      ring.style.width        = `${rd.toFixed(1)}px`;
      ring.style.height       = `${rd.toFixed(1)}px`;
      ring.style.opacity      = (cOpacity * rop).toFixed(3);
      ring.style.borderColor  = `rgba(184,240,255,${Math.min(rop + 0.1, 1).toFixed(2)})`;

      // Canvas — particles
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x  += p.vx; p.y  += p.vy;
        p.vx *= 0.91; p.vy *= 0.91;
        p.life -= dt * 1.6;
        if (p.life <= 0) { particles.splice(i, 1); continue; }
        ctx.fillStyle = `rgba(200,240,255,${(p.life * 0.90).toFixed(3)})`;
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
    };
  }, []);

  return (
    <>
      {/* ── Trailing ring — springs behind arrow, contracts on hover ─────── */}
      <div
        ref={ringRef}
        aria-hidden="true"
        style={{
          position:      "fixed",
          top:           0,
          left:          0,
          borderRadius:  "50%",
          border:        "1px solid rgba(184,240,255,0)",
          pointerEvents: "none",
          zIndex:        9998,
          willChange:    "transform, width, height, border-color, opacity",
          opacity:       0,
        }}
      />

      {/* ── Glass arrow — tip at (0,0), pointing upper-left ─────────────── */}
      {/*    viewBox 0 0 12 19.5 → rendered at 16×26 CSS px                  */}
      {/*    Three layers: gradient body, radial spec, lit edges, tip dot      */}
      <svg
        ref={svgRef}
        aria-hidden="true"
        width="16"
        height="26"
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
          {/* Gradient fill — visible glass body, bright at tip */}
          <linearGradient id="gc-body" x1="0" y1="0" x2="12" y2="19.5" gradientUnits="userSpaceOnUse">
            <stop offset="0%"   stopColor="#cce8ff" stopOpacity="0.70" />
            <stop offset="45%"  stopColor="#9ec8f0" stopOpacity="0.32" />
            <stop offset="100%" stopColor="#78aae0" stopOpacity="0.09" />
          </linearGradient>
          {/* Radial spec — refracted-light pool near tip */}
          <radialGradient id="gc-spec" cx="1.8" cy="1.8" r="6.5" gradientUnits="userSpaceOnUse">
            <stop offset="0%"   stopColor="white" stopOpacity="0.35" />
            <stop offset="70%"  stopColor="white" stopOpacity="0.07" />
            <stop offset="100%" stopColor="white" stopOpacity="0"    />
          </radialGradient>
        </defs>

        {/* Glass body */}
        <path
          d="M 0,0 L 0,17 L 4.5,13 L 7,18.5 L 9,17.5 L 6.5,12 L 12,12 Z"
          fill="url(#gc-body)"
          stroke="rgba(255,255,255,0.75)"
          strokeWidth="0.65"
          strokeLinejoin="round"
        />
        {/* Refracted-light spec overlay */}
        <path
          d="M 0,0 L 0,17 L 4.5,13 L 7,18.5 L 9,17.5 L 6.5,12 L 12,12 Z"
          fill="url(#gc-spec)"
          stroke="none"
        />
        {/* Lit leading edges — top + left face the light source */}
        <path
          d="M 12,12 L 0,0 L 0,17 L 4.5,13"
          fill="none"
          stroke="rgba(255,255,255,0.92)"
          strokeWidth="0.82"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Tip sparkle */}
        <circle cx="0" cy="0" r="1.0" fill="white" opacity="0.95" />
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
