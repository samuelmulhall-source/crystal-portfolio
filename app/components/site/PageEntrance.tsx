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
      // Only animate roles that exist in this subtree — client-side navigation
      // can run the effect against pages missing some (or all) roles, and GSAP
      // warn-spams the console for every empty selector.
      const has = (role: string) => !!el.querySelector(`[data-entrance='${role}']`);

      if (has("eyebrow")) gsap.set("[data-entrance='eyebrow']", { opacity: 0, y: 10 });
      if (has("title")) gsap.set("[data-entrance='title']", { opacity: 0, y: 18, filter: "blur(8px)" });
      if (has("body")) gsap.set("[data-entrance='body']", { opacity: 0, y: 10 });
      if (has("content")) gsap.set("[data-entrance='content']", { opacity: 0, y: 14 });

      const tl = gsap.timeline({ delay: 0.15 });

      if (has("eyebrow")) tl.to("[data-entrance='eyebrow']", {
        opacity: 1, y: 0, duration: 0.5, ease: "power2.out",
      });
      if (has("title")) tl.to("[data-entrance='title']", {
        opacity: 1, y: 0, filter: "blur(0px)", duration: 0.7, ease: "power3.out",
      }, "-=0.25");
      if (has("body")) tl.to("[data-entrance='body']", {
        opacity: 1, y: 0, duration: 0.5, ease: "power2.out",
      }, "-=0.3");
      if (has("content")) tl.to("[data-entrance='content']", {
        opacity: 1, y: 0, duration: 0.6, ease: "power2.out", stagger: 0.08,
      }, "-=0.2");
    }, el);

    return () => ctx.revert();
  }, []);

  return <div ref={ref}>{children}</div>;
}
