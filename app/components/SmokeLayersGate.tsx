"use client";

/**
 * SmokeLayersGate — mounts the hero smoke corridor on the home route only.
 *
 * The scroll-driven smoke is a home-hero composition; on /work and detail
 * pages it has no narrative role and would float over unrelated content.
 */

import { usePathname } from "next/navigation";
import SmokeLayers from "./SmokeLayers";

export default function SmokeLayersGate() {
  const pathname = usePathname();
  if (pathname !== "/") return null;
  return <SmokeLayers />;
}
