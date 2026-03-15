"use client";

/**
 * ScrollTracker — Fires scroll milestone analytics events at 25%, 50%, 75%, 100%.
 * Reads from voidState.scrollProgress (already computed by VoidMotion).
 * Zero DOM output, runs entirely via rAF.
 */

import { useEffect } from "react";
import { voidState } from "../lib/voidState";
import { trackScrollMilestone } from "../lib/analytics";

const MILESTONES = [25, 50, 75, 100];

export default function ScrollTracker() {
  useEffect(() => {
    const reached = new Set<number>();

    const id = setInterval(() => {
      const pct = voidState.scrollProgress * 100;
      for (const m of MILESTONES) {
        if (pct >= m && !reached.has(m)) {
          reached.add(m);
          trackScrollMilestone(m);
        }
      }
    }, 500);

    return () => clearInterval(id);
  }, []);

  return null;
}
