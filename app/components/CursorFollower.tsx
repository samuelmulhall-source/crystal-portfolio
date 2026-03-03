"use client";

/**
 * CursorFollower — custom ice-void cursor for desktop.
 *
 * Dot  — 7px ice circle, snaps quickly to cursor.
 * Ring — 32px circle, lags behind, expands 1.6× on hover of interactive elements.
 *
 * Injects `* { cursor: none !important }` while mounted so OrbitControls
 * and other inline cursor styles cannot override the hidden system cursor.
 * No-op on touch-primary devices (matchMedia pointer:coarse).
 */

import { useEffect, useRef } from "react";

const INTERACTIVE = "a, button, [role=button], input, textarea, label, select, [data-cursor=expand]";

export default function CursorFollower() {
  const dotRef  = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

    // Inject `cursor: none !important` for all elements (overrides OrbitControls canvas cursor)
    const style = document.createElement("style");
    style.textContent = "*, *::before, *::after { cursor: none !important; }";
    document.head.appendChild(style);

    let raf: number;
    const W = window.innerWidth, H = window.innerHeight;
    let mouseX = W / 2, mouseY = H / 2;
    let dotX   = mouseX, dotY = mouseY;
    let ringX  = mouseX, ringY = mouseY;
    let ringScale = 1, ringTargetScale = 1;
    let onPage = false;
    let hovering = false;

    const onMove  = (e: MouseEvent) => { mouseX = e.clientX; mouseY = e.clientY; onPage = true; };
    const onLeave = () => { onPage = false; };
    const onEnter = () => { onPage = true; };

    const onPointerOver = (e: PointerEvent) => {
      hovering = !!(e.target as Element).closest(INTERACTIVE);
    };
    const onPointerOut = (e: PointerEvent) => {
      if ((e.target as Element).closest(INTERACTIVE)) hovering = false;
    };

    document.addEventListener("mousemove",   onMove,        { passive: true });
    document.addEventListener("mouseleave",  onLeave);
    document.addEventListener("mouseenter",  onEnter);
    document.addEventListener("pointerover", onPointerOver, { passive: true });
    document.addEventListener("pointerout",  onPointerOut,  { passive: true });

    function tick() {
      raf = requestAnimationFrame(tick);
      const dot  = dotRef.current;
      const ring = ringRef.current;
      if (!dot || !ring) return;

      dotX  += (mouseX - dotX)  * 0.24;
      dotY  += (mouseY - dotY)  * 0.24;
      ringX += (mouseX - ringX) * 0.09;
      ringY += (mouseY - ringY) * 0.09;

      ringTargetScale = hovering ? 1.6 : 1;
      ringScale += (ringTargetScale - ringScale) * 0.13;

      const vis = onPage ? 1 : 0;
      dot.style.transform  = `translate(${dotX}px,${dotY}px)`;
      dot.style.opacity    = String(vis);
      ring.style.transform = `translate(${ringX}px,${ringY}px) scale(${ringScale})`;
      ring.style.opacity   = String(vis * (hovering ? 0.55 : 0.78));
    }

    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      document.head.removeChild(style);
      document.removeEventListener("mousemove",   onMove);
      document.removeEventListener("mouseleave",  onLeave);
      document.removeEventListener("mouseenter",  onEnter);
      document.removeEventListener("pointerover", onPointerOver);
      document.removeEventListener("pointerout",  onPointerOut);
    };
  }, []);

  return (
    <>
      {/* Dot — snaps quickly, ice glow */}
      <div
        ref={dotRef}
        aria-hidden="true"
        style={{
          position:      "fixed",
          top:           0,
          left:          0,
          width:         "7px",
          height:        "7px",
          marginLeft:    "-3.5px",
          marginTop:     "-3.5px",
          borderRadius:  "50%",
          background:    "rgba(200,245,255,0.95)",
          boxShadow:     "0 0 10px rgba(184,240,255,0.80), 0 0 20px rgba(184,240,255,0.40), 0 0 40px rgba(184,240,255,0.15)",
          pointerEvents: "none",
          zIndex:        9999,
          willChange:    "transform",
          opacity:       0,
        }}
      />

      {/* Ring — lags, expands on hover */}
      <div
        ref={ringRef}
        aria-hidden="true"
        style={{
          position:      "fixed",
          top:           0,
          left:          0,
          width:         "32px",
          height:        "32px",
          marginLeft:    "-16px",
          marginTop:     "-16px",
          borderRadius:  "50%",
          border:        "1px solid rgba(184,240,255,0.60)",
          boxShadow:     "0 0 8px rgba(184,240,255,0.18), inset 0 0 6px rgba(184,240,255,0.06)",
          pointerEvents: "none",
          zIndex:        9998,
          willChange:    "transform",
          opacity:       0,
        }}
      />
    </>
  );
}
