"use client";

/**
 * PageEntrance — GSAP staggered reveal for subpage content.
 *
 * Lighter version of HeroEntrance. Applies a coordinated fade+slide
 * entrance to children with data-entrance attributes:
 *   data-entrance="eyebrow"  — small fade+slide
 *   data-entrance="title"    — de-blur reveal
 *   data-entrance="body"     — fade in
 *   data-entrance="content"  — staggered section reveal
 *
 * Falls back gracefully: if GSAP fails or reduced motion, everything visible.
 */

import { useEffect, useRef } from "react";
import { gsap } from "gsap";

export function PageEntrance({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = gsap.context(() => {
      gsap.set("[data-entrance='eyebrow']", { opacity: 0, y: 10 });
      gsap.set("[data-entrance='title']", { opacity: 0, y: 18, filter: "blur(8px)" });
      gsap.set("[data-entrance='body']", { opacity: 0, y: 10 });
      gsap.set("[data-entrance='content']", { opacity: 0, y: 14 });

      const tl = gsap.timeline({ delay: 0.15 });

      tl.to("[data-entrance='eyebrow']", {
        opacity: 1, y: 0, duration: 0.5, ease: "power2.out",
      })
      .to("[data-entrance='title']", {
        opacity: 1, y: 0, filter: "blur(0px)", duration: 0.7, ease: "power3.out",
      }, "-=0.25")
      .to("[data-entrance='body']", {
        opacity: 1, y: 0, duration: 0.5, ease: "power2.out",
      }, "-=0.3")
      .to("[data-entrance='content']", {
        opacity: 1, y: 0, duration: 0.6, ease: "power2.out", stagger: 0.08,
      }, "-=0.2");
    }, el);

    return () => ctx.revert();
  }, []);

  return <div ref={ref}>{children}</div>;
}
