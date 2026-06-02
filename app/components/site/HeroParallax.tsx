"use client";

/**
 * HeroParallax — scroll-scrubbed depth between the hero layers. Elements with
 * [data-parallax="rate"] translate at a fraction of scroll, so the wordmark,
 * the lantern, and the fixed smoke each drift at their own speed. Pure rAF,
 * only active while the hero is on screen; disabled under reduced motion.
 */

import { useEffect } from "react";

export function HeroParallax() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const els = Array.from(document.querySelectorAll<HTMLElement>("[data-parallax]"));
    if (!els.length) return;

    let raf = 0;
    let last = -1;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const y = window.scrollY;
      if (y === last) return;
      last = y;
      if (y > window.innerHeight * 1.3) return; // past the hero — stop moving
      for (const el of els) {
        const rate = parseFloat(el.dataset.parallax || "0");
        el.style.transform = `translate3d(0, ${y * rate}px, 0)`;
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return null;
}
