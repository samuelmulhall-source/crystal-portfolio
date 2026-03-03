"use client";

/**
 * CursorFollower — dot + lagging ring cursor.
 *
 * Dot  — 5px, snaps to cursor exactly, mix-blend-mode: difference so it
 *         always inverts the background (white on dark, dark on stars).
 * Ring — 34px circle, follows with spring physics (~100ms lag).
 *         Grows and brightens on hover, cyan tint on nav links.
 *
 * Click — ring pulses outward + 10 scatter particles from the dot.
 * Scroll state removed (was cheap). Crosshair removed (was cheap).
 *
 * Canvas is particle-only with mix-blend-mode: difference.
 * Desktop-only (no-op on pointer:coarse / touch).
 */

import { useEffect, useRef } from "react";
import { voidState } from "../lib/voidState";

type Particle = { x: number; y: number; vx: number; vy: number; life: number };

const INTERACT = "a, button, [role=button], input, textarea, label, select, [data-cursor=expand]";
const NAV_SEL  = "nav a, nav button";

export default function CursorFollower() {
  const dotRef  = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const cvRef   = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

    const styleTag = document.createElement("style");
    styleTag.textContent = "*, *::before, *::after { cursor: none !important; }";
    document.head.appendChild(styleTag);

    // ── Particle canvas ───────────────────────────────────────────────────────
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

    // ── Mouse / hover state ───────────────────────────────────────────────────
    let mouseX = window.innerWidth  / 2;
    let mouseY = window.innerHeight / 2;
    let ringX  = mouseX, ringY = mouseY;
    let onPage = false, hovering = false, onNav = false;

    // ── Lerped values ─────────────────────────────────────────────────────────
    let cDotOpacity  = 0;
    let cRingSize    = 34;   // diameter px
    let cRingOpacity = 0;
    let cRingCyan    = 0;    // 0 = white, 1 = cyan
    let cModelHover  = 0;    // 0 → 1 when cursor is over the active 3D model

    const particles: Particle[] = [];

    // ── Events ────────────────────────────────────────────────────────────────
    const onMove = (e: MouseEvent) => {
      mouseX = e.clientX; mouseY = e.clientY; onPage = true;
    };
    const onLeave = () => { onPage = false; };
    const onEnter = () => { onPage = true;  };
    const onPtrOver = (e: PointerEvent) => {
      const el = e.target as Element;
      hovering = !!el.closest(INTERACT);
      onNav    = !!el.closest(NAV_SEL);
    };
    const onDown = (e: MouseEvent) => {
      // Pulse ring outward — lerp will pull it back
      cRingSize = 56;
      // Scatter burst from exact click point
      for (let i = 0; i < 10; i++) {
        const a = (Math.PI * 2 * i / 10) + (Math.random() - 0.5) * 0.6;
        const s = 2.4 + Math.random() * 3.4;
        particles.push({
          x: e.clientX, y: e.clientY,
          vx: Math.cos(a) * s, vy: Math.sin(a) * s,
          life: 1,
        });
      }
    };

    document.addEventListener("mousemove",   onMove,    { passive: true });
    document.addEventListener("mouseleave",  onLeave);
    document.addEventListener("mouseenter",  onEnter);
    document.addEventListener("pointerover", onPtrOver, { passive: true });
    document.addEventListener("mousedown",   onDown,    { passive: true });

    // ── Render loop ───────────────────────────────────────────────────────────
    let raf: number;
    let lastT = performance.now();

    function tick(now: number) {
      raf = requestAnimationFrame(tick);
      const dt = Math.min((now - lastT) / 1000, 0.05);
      lastT = now;
      const f = Math.min(dt * 60, 6);

      const dot  = dotRef.current;
      const ring = ringRef.current;
      if (!dot || !ring) return;

      // Ring spring — lags behind mouse
      ringX += (mouseX - ringX) * Math.min(0.09 * f, 1);
      ringY += (mouseY - ringY) * Math.min(0.09 * f, 1);

      // Model region hover detection
      const mr = voidState.modelRegion;
      const inModel = mr.rPx > 20 &&
        (mouseX - mr.x) ** 2 + (mouseY - mr.y) ** 2 < mr.rPx ** 2;
      cModelHover += ((inModel ? 1 : 0) - cModelHover) * Math.min(0.10 * f, 1);

      // Target states
      const tDotOpacity  = onPage ? 1 : 0;
      const tRingSize    = hovering ? (onNav ? 52 : 46) : (inModel ? 42 : 34);
      const tRingOpacity = onPage ? (hovering ? 0.82 : inModel ? 0.55 : 0.65) : 0;
      const tRingCyan    = onNav ? 1 : (hovering ? 0.22 : 0);

      // Lerp all values
      cDotOpacity  += (tDotOpacity  - cDotOpacity)  * Math.min(0.14 * f, 1);
      cRingSize    += (tRingSize    - cRingSize)    * Math.min(0.13 * f, 1);
      cRingOpacity += (tRingOpacity - cRingOpacity) * Math.min(0.11 * f, 1);
      cRingCyan    += (tRingCyan    - cRingCyan)    * Math.min(0.10 * f, 1);

      // ── Dot: exact mouse position, difference-blended ──────────────────────
      dot.style.transform = `translate(${mouseX}px,${mouseY}px)`;
      dot.style.opacity   = cDotOpacity.toFixed(3);

      // ── Ring: spring position, lerped size + tint ──────────────────────────
      const half = cRingSize / 2;
      const rC   = Math.round(255 - 115 * cRingCyan);
      const gC   = Math.round(255 -  35 * cRingCyan);
      ring.style.transform   = `translate(${(ringX - half).toFixed(2)}px,${(ringY - half).toFixed(2)}px)`;
      ring.style.width       = `${cRingSize.toFixed(2)}px`;
      ring.style.height      = `${cRingSize.toFixed(2)}px`;
      ring.style.borderColor = `rgba(${rC},${gC},255,${cRingOpacity.toFixed(3)})`;

      // ── Canvas: particles + model-hover rotation arc ───────────────────────
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

      // Scatter particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x  += p.vx; p.y  += p.vy;
        p.vx *= 0.91; p.vy *= 0.91;
        p.life -= dt * 1.6;
        if (p.life <= 0) { particles.splice(i, 1); continue; }
        ctx.fillStyle = `rgba(255,255,255,${(p.life * 0.92).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.4, 2.2 * p.life), 0, Math.PI * 2);
        ctx.fill();
      }

      // Rotation arc — fades in when cursor enters the 3D model region
      if (cModelHover > 0.01) {
        const arcR = 24;
        const startA = -Math.PI * 0.15;
        const endA   =  Math.PI * 1.55;
        ctx.save();
        ctx.translate(mouseX, mouseY);
        ctx.globalAlpha = cModelHover * 0.70;

        // Arc stroke
        ctx.beginPath();
        ctx.arc(0, 0, arcR, startA, endA);
        ctx.strokeStyle = "rgba(255,255,255,0.90)";
        ctx.lineWidth = 1.2;
        ctx.lineCap = "round";
        ctx.stroke();

        // Arrowhead at the end of the arc
        const ax = Math.cos(endA) * arcR;
        const ay = Math.sin(endA) * arcR;
        const tang = endA + Math.PI * 0.5;
        ctx.beginPath();
        ctx.moveTo(ax + Math.cos(tang - 0.5) * 5, ay + Math.sin(tang - 0.5) * 5);
        ctx.lineTo(ax, ay);
        ctx.lineTo(ax + Math.cos(tang + 0.5) * 5, ay + Math.sin(tang + 0.5) * 5);
        ctx.strokeStyle = "rgba(255,255,255,0.90)";
        ctx.lineWidth = 1.2;
        ctx.stroke();

        ctx.globalAlpha = 1;
        ctx.restore();
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
      {/* Dot — exact cursor position, inverts background via difference */}
      <div
        ref={dotRef}
        aria-hidden="true"
        style={{
          position:      "fixed",
          top:           0,
          left:          0,
          width:         "5px",
          height:        "5px",
          marginLeft:    "-2.5px",
          marginTop:     "-2.5px",
          borderRadius:  "50%",
          background:    "white",
          boxShadow:     "0 0 8px rgba(255,255,255,0.85), 0 0 18px rgba(184,240,255,0.45)",
          pointerEvents: "none",
          zIndex:        9999,
          willChange:    "transform, opacity",
          opacity:       0,
          mixBlendMode:  "difference",
        }}
      />

      {/* Ring — springs behind, grows on hover, tints cyan on nav */}
      <div
        ref={ringRef}
        aria-hidden="true"
        style={{
          position:      "fixed",
          top:           0,
          left:          0,
          width:         "34px",
          height:        "34px",
          borderRadius:  "50%",
          border:        "1.5px solid rgba(255,255,255,0.65)",
          pointerEvents: "none",
          zIndex:        9998,
          willChange:    "transform, width, height, border-color",
        }}
      />

      {/* Canvas — scatter particles only, difference-blended */}
      <canvas
        ref={cvRef}
        aria-hidden="true"
        style={{
          position:      "fixed",
          top:           0,
          left:          0,
          pointerEvents: "none",
          zIndex:        9997,
          mixBlendMode:  "difference",
        }}
      />
    </>
  );
}
