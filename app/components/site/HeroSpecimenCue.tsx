"use client";

import type { ReactNode } from "react";
import { useHeroFocus } from "./HeroFocus";

/**
 * HeroSpecimenCue — a considered "doorway" from the hero lantern into its own
 * entry in the work showcase.
 *
 * On hover/focus the surroundings recede (a hero-level scrim, owned by
 * HeroFocusProvider) and a line-art descent trail flows downward from the
 * object — signalling that selecting it takes you DOWN into the work. Clicking
 * smooth-scrolls to #selected-work (Lenis handles same-page anchors) AND asks
 * the showcase to open THIS specimen's own category/slide via a `work:focus`
 * event, so you land on the piece, not the default Models tab.
 *
 * It renders as an <a>, inheriting `.hero-intro a { pointer-events: auto }`
 * without re-enabling pointer events on any larger container. Like the lantern
 * it overlays, it lives inside the wrap the intro dive transforms off-screen,
 * so it never overlays (and eats clicks meant for) the work section rising
 * behind the pinned hero. The always-visible scroll cue + header link remain
 * the primary path; this is an additive affordance.
 */
export const WORK_FOCUS_EVENT = "work:focus";

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
  const { focusing, setFocusing } = useHeroFocus();

  return (
    <div className={`hero-specimen${focusing ? " is-focusing" : ""}`}>
      {children}

      <a
        className="hero-specimen__link"
        href="#selected-work"
        aria-label={`See ${title} in selected work`}
        onPointerEnter={() => setFocusing(true)}
        onPointerLeave={() => setFocusing(false)}
        onFocus={() => setFocusing(true)}
        onBlur={() => setFocusing(false)}
        onClick={() => {
          setFocusing(false);
          window.dispatchEvent(new CustomEvent(WORK_FOCUS_EVENT, { detail: { slug } }));
        }}
      >
        <span className="hero-specimen__cue">
          <span className="hero-specimen__cue-tick" aria-hidden="true" />
          <span className="hero-specimen__cue-label">{title}</span>
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
