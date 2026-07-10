"use client";

import { useEffect, useRef, useState } from "react";
import { useHeroFocus } from "./HeroFocus";

/**
 * HeroEyebrow — the capability line ("3D Generalist & Technical Artist"), which
 * gains a TYPED "Multiscatter ·" preface while the wordmark's letters are away at
 * the lantern (focusing). So the brand never vanishes from the hero: as the
 * wordmark flies off to become the lantern label, its name types itself back in
 * as a prefix to the descriptor, and un-types when the letters return. A caret
 * blinks while typing. Fine-pointer/focus driven; snaps under reduced motion.
 */
const PREFACE = "Multiscatter  ·  ";

export function HeroEyebrow({ text }: { text: string }) {
  const { focusing } = useHeroFocus();
  const [typed, setTyped] = useState("");
  const lenRef = useRef(0);
  const timer = useRef(0);

  useEffect(() => {
    window.clearTimeout(timer.current);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      lenRef.current = focusing ? PREFACE.length : 0;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTyped(focusing ? PREFACE : "");
      return;
    }
    const step = () => {
      if (focusing) {
        if (lenRef.current >= PREFACE.length) return;
        lenRef.current += 1;
      } else {
        if (lenRef.current <= 0) return;
        lenRef.current -= 1;
      }
      setTyped(PREFACE.slice(0, lenRef.current));
      timer.current = window.setTimeout(step, focusing ? 52 : 26);
    };
    // brief hold so the wordmark letters are visibly in flight before it types in
    timer.current = window.setTimeout(step, focusing ? 240 : 0);
    return () => window.clearTimeout(timer.current);
  }, [focusing]);

  return (
    <p className="hero-capabilities" data-hero-entrance="eyebrow">
      {/* aria-hidden: types in/out per-character and duplicates the brand the
          h1 already announces — churn a screen reader shouldn't narrate. */}
      {typed ? <span className="hero-eyebrow-preface" aria-hidden="true">{typed}</span> : null}
      {text}
    </p>
  );
}
