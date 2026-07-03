"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

type HeroFocusValue = {
  /** Binary engagement (hover/keyboard focus) — drives the cue chip + descent
   *  trail classes, and floors the scrim at fully-on. */
  focusing: boolean;
  setFocusing: (v: boolean) => void;
  /** Continuous 0..1 pointer-proximity — drives the scrim opacity directly
   *  (no re-render per pointermove). */
  setProximity: (v: number) => void;
};

const HeroFocusContext = createContext<HeroFocusValue>({
  focusing: false,
  setFocusing: () => {},
  setProximity: () => {},
});

export function useHeroFocus() {
  return useContext(HeroFocusContext);
}

/**
 * HeroFocusProvider — coordinates the "focus on the lantern" effect between the
 * lantern doorway (HeroSpecimenCue, buried inside the parallaxed viewport wrap)
 * and a hero-level dimming scrim, rendered here as a sibling of the hero
 * content — OUTSIDE the transformed wrap, so it can recede the WHOLE hero
 * (wordmark, starfield) rather than just the lantern's own box.
 *
 * The scrim is graded, not binary: HeroSpecimenCue feeds a continuous 0..1
 * pointer-proximity value and the surroundings recede in proportion as the
 * cursor approaches the lantern. Writes go straight to the scrim node's style
 * (React state would re-render the hero per pointermove); a short CSS
 * transition on the node smooths between events. Keyboard focus and hover
 * floor the value at 1 so the full effect never depends on pointer geometry.
 *
 * The scrim is purely decorative (pointer-events: none) and scoped to this
 * provider's subtree — no document/global side effects, per the components
 * contract. It layers ABOVE the wordmark (z 2) but BELOW the lantern (wrap
 * z 6) and scroll cue (z 5), so those stay lit while everything else falls
 * back.
 */
export function HeroFocusProvider({ children }: { children: ReactNode }) {
  const [focusing, setFocusingState] = useState(false);
  const scrimRef = useRef<HTMLDivElement>(null);
  const proximityRef = useRef(0);
  const focusRef = useRef(false);

  const write = useCallback(() => {
    const el = scrimRef.current;
    if (!el) return;
    const eff = focusRef.current ? 1 : proximityRef.current;
    el.style.opacity = eff.toFixed(3);
    // Mirror for tooling/tests — style.opacity alone is ambiguous mid-transition.
    el.dataset.focus = eff.toFixed(2);
  }, []);

  const setFocusing = useCallback(
    (v: boolean) => {
      focusRef.current = v;
      setFocusingState(v);
      write();
    },
    [write],
  );

  const setProximity = useCallback(
    (v: number) => {
      proximityRef.current = v < 0 ? 0 : v > 1 ? 1 : v;
      write();
    },
    [write],
  );

  const value = useMemo(
    () => ({ focusing, setFocusing, setProximity }),
    [focusing, setFocusing, setProximity],
  );

  return (
    <HeroFocusContext.Provider value={value}>
      {children}
      <div ref={scrimRef} className="hero-focus-scrim" aria-hidden="true" />
    </HeroFocusContext.Provider>
  );
}
