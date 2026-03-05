"use client";

/**
 * CursorFollower — tinted glass arrow cursor.
 *
 * Arrow  — SVG pointer with layered glass body:
 *            1. Linear gradient body (ice-blue tint, clearly opaque)
 *            2. Radial caustic near tip (refracted-light pool)
 *            3. Refraction fringe (slightly scaled path, chromatic stroke)
 *            4. Lit leading edges (bright white)
 *            5. Tip sparkle
 *
 * Holo-ring — appears on hover over interactive elements, cycles through
 *             spectral colours via CSS animation defined in globals.css.
 *
 * Drag tilt — CSS 3D perspective tilt driven by drag velocity via spring.
 *
 * Canvas    — click particles only (no trailing ring).
 */

import { useEffect, useRef } from "react";

type Particle = { x: number; y: number; vx: number; vy: number; life: number };

const INTERACT = "a, button, [role=button], input, textarea, label, select, [data-cursor=expand]";

export default function CursorFollower() {
  const svgRef      = useRef<SVGSVGElement>(null);
  const holoRingRef = useRef<HTMLDivElement>(null);
  const cvRef       = useRef<HTMLCanvasElement>(null);

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
    let lastMX = mouseX, lastMY = mouseY;
    let onPage = false, hovering = false;

    // Arrow state
    let cScale    = 1.0;
    let cOpacity  = 0;
    let cBaseGlow = 1.0;
    let cFlash    = 0;

    // Holo-ring state
    let hOpacity = 0;

    // Drag tilt state
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
    const onPtrOver = (e: PointerEvent) => { hovering = !!(e.target as Element).closest(INTERACT); };
    const onDown    = (e: MouseEvent) => {
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

    function tick(now: number) {
      raf = requestAnimationFrame(tick);
      const dt = Math.min((now - lastT) / 1000, 0.05);
      lastT = now;
      const f  = Math.min(dt * 60, 6);

      const svg      = svgRef.current;
      const holoRing = holoRingRef.current;
      if (!svg) return;

      // Arrow lerps
      const tScale = hovering ? 1.16 : 1.0;
      const tGlow  = hovering ? 1.55 : 1.0;
      cScale    += (tScale           - cScale)    * Math.min(0.14 * f, 1);
      cOpacity  += ((onPage ? 1 : 0) - cOpacity)  * Math.min(0.15 * f, 1);
      cBaseGlow += (tGlow            - cBaseGlow)  * Math.min(0.11 * f, 1);
      cFlash    *= Math.pow(0.82, f);

      // Drag velocity decay when not dragging
      if (!isDragging) {
        dragVX *= Math.pow(0.85, f);
        dragVY *= Math.pow(0.85, f);
      }

      // Drag tilt spring (K=180, D=14)
      const tRotX = isDragging ? Math.max(-22, Math.min(22, -dragVY * 0.06)) : 0;
      const tRotY = isDragging ? Math.max(-22, Math.min(22,  dragVX * 0.06)) : 0;
      rotVelX += (tRotX - curRotX) * 180 * dt;
      rotVelX -= rotVelX * 14 * dt;
      curRotX += rotVelX * dt;
      rotVelY += (tRotY - curRotY) * 180 * dt;
      rotVelY -= rotVelY * 14 * dt;
      curRotY += rotVelY * dt;

      // Holo-ring opacity lerp
      hOpacity += ((hovering ? 1 : 0) - hOpacity) * Math.min(0.12 * f, 1);

      // Apply arrow with optional 3D perspective tilt
      const hasTilt = Math.abs(curRotX) > 0.1 || Math.abs(curRotY) > 0.1;
      if (hasTilt) {
        svg.style.transform = `translate(${mouseX}px,${mouseY}px) scale(${cScale.toFixed(4)}) perspective(120px) rotateX(${curRotX.toFixed(2)}deg) rotateY(${curRotY.toFixed(2)}deg)`;
      } else {
        svg.style.transform = `translate(${mouseX}px,${mouseY}px) scale(${cScale.toFixed(4)})`;
      }
      svg.style.opacity = cOpacity.toFixed(3);

      const g = Math.max(cBaseGlow + cFlash, 0);
      svg.style.filter = [
        `drop-shadow(0 0 ${(3  * g).toFixed(1)}px rgba(215,240,255,${Math.min(0.65 * g, 1.00).toFixed(2)}))`,
        `drop-shadow(0 0 ${(12 * g).toFixed(1)}px rgba(184,240,255,${Math.min(0.35 * g, 0.90).toFixed(2)}))`,
        `drop-shadow(0 0 ${(28 * g).toFixed(1)}px rgba(184,240,255,${Math.min(0.12 * g, 0.45).toFixed(2)}))`,
      ].join(" ");

      // Holo-ring — centres on cursor tip
      if (holoRing) {
        const hr = 13; // half of 26px diameter
        holoRing.style.transform = `translate(${(mouseX - hr).toFixed(1)}px,${(mouseY - hr).toFixed(1)}px)`;
        holoRing.style.opacity   = (cOpacity * hOpacity).toFixed(3);
      }

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
      document.removeEventListener("mouseup",     onUp);
    };
  }, []);

  return (
    <>
      {/* ── Holo-ring — spectral colour cycle on interactive hover ───────── */}
      <div
        ref={holoRingRef}
        aria-hidden="true"
        style={{
          position:      "fixed",
          top:           0,
          left:          0,
          width:         "26px",
          height:        "26px",
          borderRadius:  "50%",
          border:        "1px solid transparent",
          background:    "transparent",
          pointerEvents: "none",
          zIndex:        9998,
          willChange:    "transform, opacity",
          opacity:       0,
          animation:     "holo-ring-cycle 1.8s linear infinite",
        }}
      />

      {/* ── Glass arrow — tip at (0,0), pointing upper-left ─────────────── */}
      {/*    viewBox 0 0 12 19.5 → rendered at 16×26 CSS px                  */}
      {/*    Five layers: gradient body, caustic, refraction fringe,           */}
      {/*                 lit edges, tip sparkle                               */}
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
          {/* Layer 1 — tinted glass body: ice-blue, clearly visible */}
          <linearGradient id="gc-body" x1="0" y1="0" x2="12" y2="19.5" gradientUnits="userSpaceOnUse">
            <stop offset="0%"   stopColor="#a8d8f8" stopOpacity="0.58" />
            <stop offset="42%"  stopColor="#7ab8e8" stopOpacity="0.26" />
            <stop offset="100%" stopColor="#5090c0" stopOpacity="0.06" />
          </linearGradient>
          {/* Layer 2 — inner light caustic: refracted-light pool near tip */}
          <radialGradient id="gc-caustic" cx="2" cy="2.5" r="7" gradientUnits="userSpaceOnUse">
            <stop offset="0%"   stopColor="white" stopOpacity="0.45" />
            <stop offset="60%"  stopColor="white" stopOpacity="0.08" />
            <stop offset="100%" stopColor="white" stopOpacity="0"    />
          </radialGradient>
        </defs>

        {/* Layer 1 — glass body */}
        <path
          d="M 0,0 L 0,17 L 4.5,13 L 7,18.5 L 9,17.5 L 6.5,12 L 12,12 Z"
          fill="url(#gc-body)"
          stroke="rgba(255,255,255,0.75)"
          strokeWidth="0.65"
          strokeLinejoin="round"
        />
        {/* Layer 2 — caustic light pool */}
        <path
          d="M 0,0 L 0,17 L 4.5,13 L 7,18.5 L 9,17.5 L 6.5,12 L 12,12 Z"
          fill="url(#gc-caustic)"
          stroke="none"
        />
        {/* Layer 3 — refraction fringe: slightly scaled path, chromatic edge */}
        <path
          d="M 0,0 L 0,17 L 4.5,13 L 7,18.5 L 9,17.5 L 6.5,12 L 12,12 Z"
          transform="scale(1.06) translate(-0.2,-0.1)"
          fill="none"
          stroke="rgba(150,230,255,0.18)"
          strokeWidth="0.6"
          strokeLinejoin="round"
        />
        {/* Layer 4 — lit leading edges: top + left face the light source */}
        <path
          d="M 12,12 L 0,0 L 0,17 L 4.5,13"
          fill="none"
          stroke="rgba(255,255,255,0.92)"
          strokeWidth="0.82"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Layer 5 — tip sparkle */}
        <circle cx="0" cy="0" r="1.1" fill="white" opacity="0.95" />
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
