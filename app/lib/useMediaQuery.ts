"use client";

/**
 * useMediaQuery — shared media query hook with SSR-safe defaults.
 *
 * Returns `true` when the media query matches. Listens for changes.
 * Used by Nav, HUDCorners, WorkGrid, VoidBackground, etc.
 * to avoid duplicating matchMedia boilerplate across components.
 */

import { useState, useEffect } from "react";

export function useMediaQuery(query: string, defaultValue = false): boolean {
  const [matches, setMatches] = useState(defaultValue);

  useEffect(() => {
    const mq = window.matchMedia(query);
    const update = () => setMatches(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [query]);

  return matches;
}

/** Convenience: true on mobile-width screens (≤768px). */
export function useIsMobile(): boolean {
  return useMediaQuery("(max-width: 768px)");
}

/** Convenience: true on desktop with mouse input. */
export function useIsDesktop(): boolean {
  return useMediaQuery("(min-width: 769px) and (hover: hover) and (pointer: fine)", true);
}
