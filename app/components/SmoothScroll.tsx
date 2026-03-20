"use client";

import { useEffect, useRef } from "react";
import Lenis from "lenis";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { STATIONS, findActiveStation } from "../lib/journeyConfig";

gsap.registerPlugin(ScrollTrigger);

/** Global Lenis instance — used by jumpToStation for reliable scrolling. */
export let lenisInstance: Lenis | null = null;

export default function SmoothScroll({ children }: { children: React.ReactNode }) {
  const snapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSnappingRef = useRef(false);

  useEffect(() => {
    const lenis = new Lenis({ lerp: 0.08, smoothWheel: true });
    lenisInstance = lenis;

    // sync Lenis with GSAP ScrollTrigger
    lenis.on("scroll", ScrollTrigger.update);
    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    // ── Station snap: when user stops scrolling inside a station, gently
    //    snap to the station's scrollViewCenter so the model is centered. ──
    const onScroll = () => {
      // Clear previous snap timer (user is still scrolling)
      if (snapTimerRef.current) clearTimeout(snapTimerRef.current);
      if (isSnappingRef.current) return; // don't re-snap during a snap

      snapTimerRef.current = setTimeout(() => {
        const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
        if (maxScroll <= 0) return;
        const progress = window.scrollY / maxScroll;
        const stationIdx = findActiveStation(progress);
        if (stationIdx < 0) return; // in transit — no snap

        const station = STATIONS[stationIdx];
        const target = station.scrollViewCenter * maxScroll;
        const delta = Math.abs(window.scrollY - target);

        // Snap within the full station range — wider catch (15% stations)
        if (delta > 20 && delta < maxScroll * 0.15) {
          isSnappingRef.current = true;
          lenis.scrollTo(target, {
            duration: 0.5,
            onComplete: () => { isSnappingRef.current = false; },
          });
        }
      }, 300); // 300ms idle = user stopped scrolling (faster catch)
    };

    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      lenisInstance = null;
      if (snapTimerRef.current) clearTimeout(snapTimerRef.current);
      window.removeEventListener("scroll", onScroll);
      lenis.destroy();
      gsap.ticker.remove(tick);
    };
  }, []);

  return <>{children}</>;
}
