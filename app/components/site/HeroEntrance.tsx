"use client";

/**
 * HeroEntrance — GSAP staggered reveal for the content-first hero.
 *
 * Wraps children and applies a coordinated entrance sequence:
 *   1. Eyebrow fades + slides up
 *   2. Title de-blurs + slides up (cinematic feel)
 *   3. Body copy fades in
 *   4. CTAs slide up
 *   5. Specimen card scales in from slight offset
 *
 * Uses data-hero-entrance="<name>" attributes on children to target them.
 * Falls back gracefully: if GSAP fails or reduced motion is preferred,
 * everything is visible by default.
 */

import { useEffect, useRef } from "react";
import { gsap } from "gsap";

export function HeroEntrance({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Respect reduced motion
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = gsap.context(() => {
      // Set initial states
      gsap.set("[data-hero-entrance='eyebrow']", { opacity: 0, y: 12 });
      gsap.set("[data-hero-entrance='title']", { opacity: 0, y: 28, filter: "blur(14px)" });
      gsap.set("[data-hero-entrance='body']", { opacity: 0, y: 14 });
      gsap.set("[data-hero-entrance='actions']", { opacity: 0, y: 16 });
      gsap.set("[data-hero-entrance='specimen']", { opacity: 0, y: 30, scale: 0.97 });

      const tl = gsap.timeline({ delay: 0.15 });

      tl.to("[data-hero-entrance='eyebrow']", {
        opacity: 1, y: 0, duration: 0.55, ease: "power2.out",
      })
      .to("[data-hero-entrance='title']", {
        opacity: 1, y: 0, filter: "blur(0px)", duration: 1.0, ease: "power3.out",
      }, "-=0.25")
      .to("[data-hero-entrance='body']", {
        opacity: 1, y: 0, duration: 0.6, ease: "power2.out",
      }, "-=0.5")
      .to("[data-hero-entrance='actions']", {
        opacity: 1, y: 0, duration: 0.5, ease: "power2.out",
      }, "-=0.3")
      .to("[data-hero-entrance='specimen']", {
        opacity: 1, y: 0, scale: 1, duration: 0.85, ease: "power2.out",
      }, "-=0.35");
    }, el);

    return () => ctx.revert();
  }, []);

  return <div ref={ref}>{children}</div>;
}
