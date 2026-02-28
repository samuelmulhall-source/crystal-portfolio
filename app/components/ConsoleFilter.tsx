"use client";

import { useEffect } from "react";

/**
 * Filters known harmless console messages:
 * - FBXLoader "ShininessExponent / ReflectionFactor map not supported, skipping texture"
 *   (FBX materials often reference these; we replace materials anyway)
 * Optionally softens WebGL context-lost noise (we still log once).
 */
export default function ConsoleFilter() {
  useEffect(() => {
    const origWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      const msg = typeof args[0] === "string" ? args[0] : String(args[0]);
      if (
        msg.includes("THREE.FBXLoader") &&
        msg.includes("map is not supported in three.js, skipping texture")
      ) {
        return;
      }
      origWarn.apply(console, args);
    };
    return () => {
      console.warn = origWarn;
    };
  }, []);
  return null;
}
