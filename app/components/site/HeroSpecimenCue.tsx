"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useHeroFocus } from "./HeroFocus";

/**
 * HeroSpecimenCue — a considered "doorway" from the hero lantern into its own
 * entry in the work showcase.
 *
 * As the pointer nears the lantern the surroundings recede in proportion — a
 * continuous proximity field (nearest-edge distance to the lantern, eased),
 * not an on/off hover. On actual hover/focus the name chip and a line-art
 * descent trail commit fully — signalling that selecting the object takes you
 * DOWN into the work. Clicking smooth-scrolls to #selected-work (Lenis handles
 * same-page anchors) AND asks the showcase to open THIS specimen's own
 * category/slide via a `work:focus` event, so you land on the piece, not the
 * default Models tab.
 *
 * It renders as an <a>, inheriting `.hero-intro a { pointer-events: auto }`
 * without re-enabling pointer events on any larger container. Like the lantern
 * it overlays, it lives inside the wrap the intro dive transforms off-screen,
 * so it never overlays (and eats clicks meant for) the work section rising
 * behind the pinned hero. The always-visible scroll cue + header link remain
 * the primary path; this is an additive affordance.
 */
export const WORK_FOCUS_EVENT = "work:focus";

/** Distance (px) from the lantern's edge at which the recede begins. */
const PROXIMITY_RADIUS = 360;

export function HeroSpecimenCue({
  slug,
  title,
  children,
}: {
  slug: string;
  title: string;
  /** The masked .hero-viewport (lantern). Wrapped so the overlay link can size
   *  to the lantern exactly, while staying OUTSIDE the viewport's dissolve mask. */
  children: ReactNode;
}) {
  const { focusing, setFocusing, setProximity } = useHeroFocus();
  const linkRef = useRef<HTMLAnchorElement>(null);

  // Pointer-proximity field: 0 beyond PROXIMITY_RADIUS from the lantern's
  // nearest edge, easing (smoothstep) to 1 at the edge. Fine pointers only —
  // touch has no meaningful proximity (and the doorway itself is hidden
  // there via CSS). Handler-direct style writes (via context) keep this off
  // React's render path; one getBoundingClientRect per move on one element is
  // the same class of work as the Magnetic hover effect.
  useEffect(() => {
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    const onMove = (e: PointerEvent) => {
      const el = linkRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      // Off-screen (the intro dive translates the wrap away) → no field.
      if (r.width === 0 || r.bottom < 0 || r.top > window.innerHeight) {
        setProximity(0);
        return;
      }
      const dx = e.clientX < r.left ? r.left - e.clientX : e.clientX > r.right ? e.clientX - r.right : 0;
      const dy = e.clientY < r.top ? r.top - e.clientY : e.clientY > r.bottom ? e.clientY - r.bottom : 0;
      const d = Math.hypot(dx, dy);
      const p = 1 - Math.min(d / PROXIMITY_RADIUS, 1);
      setProximity(p * p * (3 - 2 * p)); // smoothstep — gentle far, decisive near
    };
    const onLeave = () => setProximity(0);
    window.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      setProximity(0);
    };
  }, [setProximity]);

  // Layout shifts under a latched hover — a wheel scroll starting the pin-dive,
  // or a window resize — move the measured letter slots out from under the
  // flown wordmark (HeroWordmark measures once, at flight start), and an
  // element scrolled away from a stationary cursor never fires pointerleave.
  // Disengage instead: the letters fly home (a return lands at delta 0, which
  // is exact under ANY layout) and the chip hides with the state.
  useEffect(() => {
    if (!focusing) return;
    const release = () => {
      setFocusing(false);
      setProximity(0);
    };
    window.addEventListener("scroll", release, { passive: true });
    window.addEventListener("resize", release);
    return () => {
      window.removeEventListener("scroll", release);
      window.removeEventListener("resize", release);
    };
  }, [focusing, setFocusing, setProximity]);

  return (
    <div className={`hero-specimen${focusing ? " is-focusing" : ""}`}>
      {children}

      <a
        ref={linkRef}
        className="hero-specimen__link"
        href="#selected-work"
        aria-label={`See ${title} in selected work`}
        onPointerEnter={() => setFocusing(true)}
        onPointerLeave={() => setFocusing(false)}
        onFocus={() => setFocusing(true)}
        onBlur={() => setFocusing(false)}
        onClick={() => {
          // Don't drop `focusing` here: the link keeps keyboard focus after
          // Enter, and its only focus indicator rides the cue chip — hiding it
          // would leave a focused control with no visible ring. The scroll the
          // click triggers releases the state (listener above) instead.
          window.dispatchEvent(new CustomEvent(WORK_FOCUS_EVENT, { detail: { slug } }));
        }}
      >
        <span className="hero-specimen__cue">
          <span className="hero-specimen__cue-tick" aria-hidden="true" />
          {/* Target TEMPLATE the flying wordmark letters land on and morph into
              (HeroWordmark): the PIECE NAME, small. The real letters become the
              visible label; hidden except under reduced motion (static fallback).
              aria-hidden — the link's own aria-label carries the accessible name. */}
          <span className="hero-specimen__cue-label" aria-hidden="true">{title}</span>
        </span>
      </a>

      {/* Line-art descent current — a thin guide with geometric marks flowing
          down toward the work below. Decorative; pointer-events: none. */}
      <span className="hero-specimen__descent" aria-hidden="true">
        <span className="hero-specimen__descent-line" />
        <span className="hero-specimen__descent-mark" />
        <span className="hero-specimen__descent-mark" />
        <span className="hero-specimen__descent-mark" />
      </span>
    </div>
  );
}
