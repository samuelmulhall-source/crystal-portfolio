"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

type HeroFocusValue = { focusing: boolean; setFocusing: (v: boolean) => void };

const HeroFocusContext = createContext<HeroFocusValue>({
  focusing: false,
  setFocusing: () => {},
});

export function useHeroFocus() {
  return useContext(HeroFocusContext);
}

/**
 * HeroFocusProvider — coordinates the "focus on the lantern" state between the
 * lantern doorway (HeroSpecimenCue, buried inside the parallaxed viewport wrap)
 * and a hero-level dimming scrim, which it renders here as a sibling of the
 * hero content — OUTSIDE the transformed wrap, so it can recede the WHOLE hero
 * (wordmark, starfield) rather than just the lantern's own box.
 *
 * The scrim is purely decorative (pointer-events: none) and driven entirely by
 * React state inside this provider's own subtree — no document/global side
 * effects, per the components contract. It layers ABOVE the wordmark (z 2) but
 * BELOW the lantern (wrap z 6) and scroll cue (z 5), so those stay lit while
 * everything else falls back.
 */
export function HeroFocusProvider({ children }: { children: ReactNode }) {
  const [focusing, setFocusing] = useState(false);
  return (
    <HeroFocusContext.Provider value={{ focusing, setFocusing }}>
      {children}
      <div className={`hero-focus-scrim${focusing ? " is-on" : ""}`} aria-hidden="true" />
    </HeroFocusContext.Provider>
  );
}
