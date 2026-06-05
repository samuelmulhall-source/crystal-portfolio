"use client";

/**
 * SmokeLayersGate — mounts the hero smoke corridor on the home route only.
 *
 * The scroll-driven smoke is a home-hero composition; on /work and detail
 * pages it has no narrative role and would float over unrelated content.
 */

import { useState } from "react";
import { usePathname } from "next/navigation";
import SmokeLayers from "./SmokeLayers";
import { layerOff } from "../lib/debugFlags";

export default function SmokeLayersGate() {
  const pathname = usePathname();
  const [off] = useState(() => layerOff("smoke")); // debug: ?off=smoke
  if (pathname !== "/" || off) return null;
  return <SmokeLayers />;
}
