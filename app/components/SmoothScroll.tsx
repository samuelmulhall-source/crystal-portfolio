"use client";

/**
 * SmoothScroll — Lenis-powered smooth scroll with GSAP ScrollTrigger sync.
 *
 * Content-first version: provides smooth interpolated scrolling without
 * the station snap-to-center logic (that's for the optional /experience route).
 * Updates voidState.scrollProgress and scrollVel for the decorative starfield.
 */

import { useEffect, useRef } from "react";
import Lenis from "lenis";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { voidState } from "../lib/voidState";

gsap.registerPlugin(ScrollTrigger);

/** Global Lenis instance — exported for programmatic scrolling. */
export let lenisInstance: Lenis | null = null;

export default function SmoothScroll({ children }: { children: React.ReactNode }) {
  const lastScrollY = useRef(0);
  const lastTime = useRef(0);

  useEffect(() => {
    const lenis = new Lenis({ lerp: 0.11, smoothWheel: true });
    lenisInstance = lenis;

    // Sync Lenis with GSAP ScrollTrigger
    lenis.on("scroll", ScrollTrigger.update);
    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    // Update voidState for decorative starfield
    const onScroll = () => {
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      if (maxScroll <= 0) return;

      const progress = window.scrollY / maxScroll;
      voidState.scrollProgress = progress;

      const now = performance.now();
      const dt = (now - lastTime.current) / 1000;
      if (dt > 0.001) {
        const dy = Math.abs(window.scrollY - lastScrollY.current) / maxScroll;
        voidState.scrollVel = Math.max(voidState.scrollVel, dy / dt);
      }
      lastScrollY.current = window.scrollY;
      lastTime.current = now;
    };

    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      lenisInstance = null;
      window.removeEventListener("scroll", onScroll);
      lenis.destroy();
      gsap.ticker.remove(tick);
    };
  }, []);

  return <>{children}</>;
}
