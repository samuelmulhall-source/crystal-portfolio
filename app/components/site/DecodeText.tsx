"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * DecodeText — HUD micro-flare: the text resolves left→right through a short
 * ASCII dither (noise glyphs → real glyphs), like a readout locking on.
 *
 * MONO ELEMENTS ONLY (nav links, eyebrows, indices, captions): the noise set is
 * pure ASCII so every glyph shares the advance width and the line never
 * reflows — scrambling proportional text would jitter the layout (the same
 * reflow class of bug the hero letter-flight hit). Spaces and punctuation are
 * never scrambled, so the shape of the string holds while the letters churn.
 *
 * `on="change"` decodes when the text prop changes (slide stepping, tab
 * switches); `mount` also plays once on first mount (for subtrees that remount
 * per entry). `on="hover"` plays one pass on pointer-enter/focus of the
 * nearest interactive ancestor. Reduced motion: never animates.
 *
 * A11y: the churning glyphs are aria-hidden; a static sr-only span carries the
 * real text, so accessible names stay stable while the visual decodes.
 */
const NOISE = "#=+*<>/:.";
const LEAD = 110; // ms before the first letter locks
const PER = 24; // ms between letters locking
const FLICK = 42; // ms per noise reshuffle

function isScrambleable(ch: string) {
  return /[0-9A-Za-z]/.test(ch);
}

export function DecodeText({
  text,
  on = "change",
  mount = false,
  className,
}: {
  text: string;
  on?: "change" | "hover";
  mount?: boolean;
  className?: string;
}) {
  const [display, setDisplay] = useState(text);
  const [prev, setPrev] = useState(text);
  const ref = useRef<HTMLSpanElement>(null);
  const raf = useRef(0);
  const settle = useRef(0);
  const playing = useRef(false);
  const started = useRef(false);

  // Prop changed → snap the baseline in render (sanctioned derive-from-props
  // pattern). Any running pass is cancelled by the effects below re-running
  // (play is text-dependent), and change-mode then decodes from this baseline.
  if (prev !== text) {
    setPrev(text);
    setDisplay(text);
  }

  // All setDisplay calls happen inside rAF/timeout callbacks — never
  // synchronously in an effect (and a restart interrupts a running pass, so
  // rapid slide-stepping can't settle on stale text).
  const play = useCallback(
    (restart = false) => {
      if (playing.current && !restart) return;
      cancelAnimationFrame(raf.current);
      window.clearTimeout(settle.current);
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        playing.current = false;
        raf.current = requestAnimationFrame(() => setDisplay(text));
        return;
      }
      playing.current = true;
      const chars = [...text];
      const t0 = performance.now();
      const tick = (now: number) => {
        const t = now - t0;
        let done = true;
        const out = chars
          .map((ch, i) => {
            if (!isScrambleable(ch) || t >= LEAD + i * PER) return ch;
            done = false;
            return NOISE[(i * 7 + Math.floor(t / FLICK) * 3) % NOISE.length];
          })
          .join("");
        setDisplay(out);
        if (done) playing.current = false;
        else raf.current = requestAnimationFrame(tick);
      };
      raf.current = requestAnimationFrame(tick);
      // Hidden-tab safety: rAF suspends entirely in background tabs — make sure
      // the readout can never be left stuck mid-scramble.
      settle.current = window.setTimeout(() => {
        cancelAnimationFrame(raf.current);
        playing.current = false;
        setDisplay(text);
      }, LEAD + chars.length * PER + 250);
    },
    [text],
  );

  // change/mount mode — decode when the text changes (and optionally on mount).
  useEffect(() => {
    if (on !== "change") return;
    if (!started.current) {
      started.current = true;
      if (!mount) return;
    }
    play(true);
    return () => {
      cancelAnimationFrame(raf.current);
      window.clearTimeout(settle.current);
      playing.current = false;
    };
  }, [on, mount, play]);

  // hover mode — one pass per pointer-enter/keyboard-focus of the control.
  useEffect(() => {
    if (on !== "hover") return;
    const host = ref.current?.closest<HTMLElement>("a, button") ?? ref.current;
    if (!host) return;
    const enter = () => play();
    host.addEventListener("pointerenter", enter);
    host.addEventListener("focusin", enter);
    return () => {
      host.removeEventListener("pointerenter", enter);
      host.removeEventListener("focusin", enter);
      cancelAnimationFrame(raf.current);
      window.clearTimeout(settle.current);
      playing.current = false;
    };
  }, [on, play]);

  return (
    <span ref={ref} className={className}>
      <span aria-hidden="true">{display}</span>
      <span className="sr-only">{text}</span>
    </span>
  );
}
