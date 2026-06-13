"use client";

import { useEffect } from "react";
import Lenis from "lenis";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { layerOff } from "../lib/debugFlags";

gsap.registerPlugin(ScrollTrigger);

/** Exported for programmatic scrolling (header anchors, hero scroll cue). */
export let lenisInstance: Lenis | null = null;

/**
 * Re-land on the URL hash after hydration. The server HTML has no `.is-pinned`
 * hero margin, so the browser's native hash jump on a hard load of
 * /#selected-work lands short — inside the pin range, under the smoke. Once
 * the pin has mounted (two frames is enough), re-resolve the target position
 * and jump instantly (no animation: the user never sees the correction).
 */
function correctHashLanding() {
  const { hash } = window.location;
  if (!hash) return;
  let el: Element | null = null;
  try {
    el = document.querySelector(hash);
  } catch {
    return; // not a valid selector (e.g. #/legacy-route)
  }
  if (!el) return;
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: "auto", block: "start" });
      ScrollTrigger.update();
    }),
  );
}

export default function SmoothScroll({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    correctHashLanding();

    if (layerOff("scroll")) return; // debug: ?off=scroll
    // Reduced motion: keep native scrolling — no smoothing, no eased anchors.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const lenis = new Lenis({
      lerp: 0.08,
      smoothWheel: true,
      // Smooth-scroll same-page anchor links (header Work/Contact, scroll cue)
      // instead of the native single-frame teleport.
      anchors: true,
    });
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
