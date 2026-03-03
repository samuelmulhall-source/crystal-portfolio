"use client";

/**
 * CursorFollower — custom ice-void cursor for desktop.
 *
 * Two layers:
 *   Dot  — 4px ice circle, snaps quickly to mouse position.
 *   Ring — 26px circle, lags behind (spring physics), expands 1.65× on
 *          hover of interactive elements (a, button, [role=button], etc.).
 *
 * System cursor is hidden while this component is mounted (desktop only).
 * Fades out when the mouse leaves the document window.
 * No-op on touch-primary devices (matchMedia pointer:coarse).
 */

import { useEffect, useRef } from "react";

// CSS selector for elements that trigger the ring expansion
const INTERACTIVE = "a, button, [role=button], input, textarea, label, select, [data-cursor=expand]";

export default function CursorFollower() {
  const dotRef  = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Only run on desktop (hover-capable, fine pointer)
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

    // Hide system cursor
    document.documentElement.style.cursor = "none";

    let raf: number;
    const W = window.innerWidth, H = window.innerHeight;
    let mouseX = W / 2, mouseY = H / 2;
    let dotX   = mouseX, dotY = mouseY;
    let ringX  = mouseX, ringY = mouseY;
    let ringScale = 1, ringTargetScale = 1;
    let onPage = false;
    let hovering = false;

    const onMove = (e: MouseEvent) => { mouseX = e.clientX; mouseY = e.clientY; onPage = true; };
    const onLeave = () => { onPage = false; };
    const onEnter = () => { onPage = true; };

    // Delegated hover detection — avoids attaching listeners to every interactive element
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

      // Dot follows quickly
      dotX  += (mouseX - dotX)  * 0.22;
      dotY  += (mouseY - dotY)  * 0.22;

      // Ring lags further
      ringX += (mouseX - ringX) * 0.09;
      ringY += (mouseY - ringY) * 0.09;

      // Ring scale lerps toward target
      ringTargetScale = hovering ? 1.65 : 1;
      ringScale += (ringTargetScale - ringScale) * 0.12;

      const vis = onPage ? 1 : 0;
      dot.style.transform  = `translate(${dotX}px,${dotY}px)`;
      dot.style.opacity    = String(vis);
      ring.style.transform = `translate(${ringX}px,${ringY}px) scale(${ringScale})`;
      ring.style.opacity   = String(vis * (hovering ? 0.55 : 0.72));
    }

    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      document.documentElement.style.cursor = "";
      document.removeEventListener("mousemove",   onMove);
      document.removeEventListener("mouseleave",  onLeave);
      document.removeEventListener("mouseenter",  onEnter);
      document.removeEventListener("pointerover", onPointerOver);
      document.removeEventListener("pointerout",  onPointerOut);
    };
  }, []);

  return (
    <>
      {/* Dot — snaps quickly */}
      <div
        ref={dotRef}
        aria-hidden="true"
        style={{
          position:      "fixed",
          top:           0,
          left:          0,
          width:         "4px",
          height:        "4px",
          marginLeft:    "-2px",
          marginTop:     "-2px",
          borderRadius:  "50%",
          background:    "rgba(184,240,255,0.92)",
          boxShadow:     "0 0 6px rgba(184,240,255,0.55), 0 0 12px rgba(184,240,255,0.25)",
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
          width:         "26px",
          height:        "26px",
          marginLeft:    "-13px",
          marginTop:     "-13px",
          borderRadius:  "50%",
          border:        "1px solid rgba(184,240,255,0.45)",
          pointerEvents: "none",
          zIndex:        9998,
          willChange:    "transform",
          opacity:       0,
        }}
      />
    </>
  );
}
