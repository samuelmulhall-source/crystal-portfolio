"use client";

import { useDisplayMode } from "./DisplayModeProvider";

/**
 * ScanLine — animated CRT scan-line sweep.
 *
 * A single bright horizontal line that slowly travels down the viewport,
 * layered above the starfield but below page content. Enhanced mode only.
 */
export function ScanLine() {
  const { effectiveMode } = useDisplayMode();
  if (effectiveMode === "reduced") return null;

  return <div className="scan-line" aria-hidden="true" />;
}
