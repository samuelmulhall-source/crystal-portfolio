"use client";

import { useEffect } from "react";
import Lenis from "lenis";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { layerOff } from "../lib/debugFlags";

gsap.registerPlugin(ScrollTrigger);

/** Exported for programmatic scrolling (Nav, WeaponHUD station snap). */
export let lenisInstance: Lenis | null = null;

export default function SmoothScroll({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (layerOff("scroll")) return; // debug: ?off=scroll
    const lenis = new Lenis({ lerp: 0.08, smoothWheel: true });
    lenisInstance = lenis;

    // sync Lenis with GSAP ScrollTrigger
    lenis.on("scroll", ScrollTrigger.update);
    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    return () => {
      lenisInstance = null;
      lenis.destroy();
      gsap.ticker.remove(tick);
    };
  }, []);

  return <>{children}</>;
}
