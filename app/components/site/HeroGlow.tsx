"use client";

/**
 * HeroGlow — a soft ice bloom behind the wordmark that drifts toward the
 * cursor. Reads the shared voidState mouse signal (already tracked globally),
 * so it adds no listeners of its own. Purely decorative; aria-hidden.
 */

import { useEffect, useRef } from "react";
import { voidState } from "../../lib/voidState";

export function HeroGlow() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    let gx = 50;
    let gy = 44;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const tx = 50 + voidState.mouseNX * 14;
      const ty = 44 + voidState.mouseNY * 9;
      gx += (tx - gx) * 0.05;
      gy += (ty - gy) * 0.05;
      const el = ref.current;
      if (el) {
        el.style.setProperty("--gx", `${gx}%`);
        el.style.setProperty("--gy", `${gy}%`);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return <div ref={ref} className="hero-glow" aria-hidden="true" />;
}
