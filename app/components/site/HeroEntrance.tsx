"use client";

/**
 * HeroEntrance — GSAP staggered reveal for the hero.
 *
 * Targets via data-hero-entrance attributes:
 *   hud        → corner HUD readouts (fade from edges)
 *   title      → massive title (de-blur + slide)
 *   subtitle   → terse descriptor line
 *   viewport   → video reel (scale in)
 *   hud-bottom → bottom bar (fade up)
 *
 * Falls back gracefully: reduced motion = everything visible immediately.
 */

import { useEffect, useRef } from "react";
import { gsap } from "gsap";

export function HeroEntrance({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = gsap.context(() => {
      gsap.set("[data-hero-entrance='title']", { opacity: 0, y: 28, filter: "blur(14px)" });
      gsap.set("[data-hero-entrance='lede']", { opacity: 0, y: 14 });
      gsap.set("[data-hero-entrance='readout'] .hero-readout__row", { opacity: 0, y: 8 });
      gsap.set("[data-hero-entrance='viewport']", { opacity: 0, y: 30, scale: 0.97 });
      gsap.set("[data-hero-entrance='hud-bottom']", { opacity: 0, y: 12 });

      const tl = gsap.timeline({ delay: 0.12 });

      // Title de-blurs and rises into place (igloo-style settle)
      tl.to("[data-hero-entrance='title']", {
        opacity: 1, y: 0, filter: "blur(0px)", duration: 1.1, ease: "power3.out",
      })
      .to("[data-hero-entrance='lede']", {
        opacity: 1, y: 0, duration: 0.6, ease: "power2.out",
      }, "-=0.55")
      .to("[data-hero-entrance='readout'] .hero-readout__row", {
        opacity: 1, y: 0, duration: 0.5, ease: "power2.out", stagger: 0.06,
      }, "-=0.4")
      .to("[data-hero-entrance='viewport']", {
        opacity: 1, y: 0, scale: 1, duration: 1.0, ease: "power2.out",
      }, "-=0.7")
      .to("[data-hero-entrance='hud-bottom']", {
        opacity: 1, y: 0, duration: 0.6, ease: "power2.out",
      }, "-=0.5");
    }, el);

    return () => ctx.revert();
  }, []);

  return <div ref={ref}>{children}</div>;
}
