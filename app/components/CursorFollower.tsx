"use client";

/**
 * CursorFollower — refractive glass arrow cursor + click particles.
 *
 * Arrow   — SVG classic pointer with gradient glass body, bright edge
 *           highlights (simulating a beveled glass prism), tip sparkle,
 *           and a layered CSS filter glow in ice-blue.
 *
 * States:
 *   Default — 1× scale, base glow
 *   Hover   — 1.28× scale (from tip), glow brightens
 *   Click   — particles burst from tip; glow pulses to 3× then decays
 *
 * Canvas  — particles only (screen blend-mode for additive brightness).
 * Desktop-only (no-op on pointer:coarse / touch).
 */

import { useEffect, useRef } from "react";

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

    // ── Canvas setup ────────────────────────────────────────────────────────
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

    // Lerped animation values
    let cScale    = 1.0;   // 1.0 → 1.28 on hover
    let cOpacity  = 0;
    let cBaseGlow = 1.0;   // 1.0 default, 1.6 on hover
    let cFlash    = 0;     // extra glow from click — decays exponentially

    const particles: Particle[] = [];

    // ── Events ───────────────────────────────────────────────────────────────
    const onMove    = (e: MouseEvent) => { mouseX = e.clientX; mouseY = e.clientY; onPage = true; };
    const onLeave   = () => { onPage = false; };
    const onEnter   = () => { onPage = true; };
    const onPtrOver = (e: PointerEvent) => { hovering = !!(e.target as Element).closest(INTERACT); };
    const onDown    = (e: MouseEvent) => {
      // Glow pulse
      cFlash = 2.4;
      // Scatter burst from exact click point
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

      const svg = svgRef.current;
      if (!svg) return;

      // Lerp cursor state
      const tScale = hovering ? 1.28 : 1.0;
      const tGlow  = hovering ? 1.6  : 1.0;
      cScale    += (tScale            - cScale)    * Math.min(0.12 * f, 1);
      cOpacity  += ((onPage ? 1 : 0)  - cOpacity)  * Math.min(0.15 * f, 1);
      cBaseGlow += (tGlow             - cBaseGlow)  * Math.min(0.11 * f, 1);
      // Flash decays exponentially — ~200ms half-life
      cFlash    *= Math.pow(0.82, f);

      // Apply SVG transform (scale from tip = origin 0,0)
      svg.style.transform = `translate(${mouseX}px,${mouseY}px) scale(${cScale.toFixed(4)})`;
      svg.style.opacity   = cOpacity.toFixed(3);

      // Layered ice-blue drop-shadow glow — three radii for soft falloff
      const g = Math.max(cBaseGlow + cFlash, 0);
      svg.style.filter = [
        `drop-shadow(0 0 ${(4  * g).toFixed(1)}px rgba(215,240,255,${Math.min(0.70 * g, 1.00).toFixed(2)}))`,
        `drop-shadow(0 0 ${(14 * g).toFixed(1)}px rgba(184,240,255,${Math.min(0.38 * g, 0.90).toFixed(2)}))`,
        `drop-shadow(0 0 ${(38 * g).toFixed(1)}px rgba(184,240,255,${Math.min(0.14 * g, 0.45).toFixed(2)}))`,
      ].join(" ");

      // ── Canvas: scatter particles ─────────────────────────────────────────
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

  // Classic cursor shape — tip at (0,0), pointing upper-left.
  // viewBox "0 0 12 19.5" rendered at 24×39 CSS px (2× for sharpness).
  // Three overlaid paths:
  //   1. Gradient fill  — glassy translucent body
  //   2. Spec fill      — radial highlight near tip (refracted light pool)
  //   3. Edge highlight — bright leading edges (lit side of the glass prism)
  //   4. Tip sparkle    — white dot at the hotspot
  return (
    <>
      <svg
        ref={svgRef}
        aria-hidden="true"
        width="15"
        height="24"
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
          {/* Gradient fill: bright ice at tip, dims toward tail */}
          <linearGradient id="gc-body" x1="0" y1="0" x2="12" y2="19.5" gradientUnits="userSpaceOnUse">
            <stop offset="0%"   stopColor="#cce8ff" stopOpacity="0.24" />
            <stop offset="50%"  stopColor="#9ec8f0" stopOpacity="0.10" />
            <stop offset="100%" stopColor="#78aae0" stopOpacity="0.03" />
          </linearGradient>
          {/* Radial spec: refracted-light pool near the tip */}
          <radialGradient id="gc-spec" cx="1.8" cy="1.8" r="6.5" gradientUnits="userSpaceOnUse">
            <stop offset="0%"   stopColor="white" stopOpacity="0.20" />
            <stop offset="70%"  stopColor="white" stopOpacity="0.04" />
            <stop offset="100%" stopColor="white" stopOpacity="0"    />
          </radialGradient>
        </defs>

        {/* Glass body */}
        <path
          d="M 0,0 L 0,17 L 4.5,13 L 7,18.5 L 9,17.5 L 6.5,12 L 12,12 Z"
          fill="url(#gc-body)"
          stroke="rgba(255,255,255,0.55)"
          strokeWidth="0.65"
          strokeLinejoin="round"
        />
        {/* Refracted-light spec overlay */}
        <path
          d="M 0,0 L 0,17 L 4.5,13 L 7,18.5 L 9,17.5 L 6.5,12 L 12,12 Z"
          fill="url(#gc-spec)"
          stroke="none"
        />
        {/* Lit leading edges — top + left face the implied light source */}
        <path
          d="M 12,12 L 0,0 L 0,17 L 4.5,13"
          fill="none"
          stroke="rgba(255,255,255,0.86)"
          strokeWidth="0.80"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Tip sparkle at the hotspot */}
        <circle cx="0" cy="0" r="0.90" fill="white" opacity="0.90" />
      </svg>

      {/* Canvas — particles only, screen-blended for additive brightness */}
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
