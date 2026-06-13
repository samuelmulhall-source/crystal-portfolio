"use client";

/**
 * EnhancementLayers — mounts the decorative layer stack according to the
 * active quality tier. A downgrade unmounts the heavier layers (clean WebGL
 * teardown / rAF cancel) and swaps in the lighter path.
 *
 *   tier 3 Full     — WebGL starfield (+hover/dust) · smoke · hover overlay · cursor
 *   tier 2 Balanced — WebGL starfield (lighter)      · smoke ·              · cursor
 *   tier 1 Lite     — static CSS starfield only · native cursor
 *
 * The whole stack is client-only (tier depends on runtime capability), so the
 * server renders just a flat void to avoid a hydration mismatch.
 */

import { useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import StaticStarfield from "./StaticStarfield";
import { useQuality } from "./QualityProvider";

// Lazy-loaded: VoidBackground pulls three.js (~220 KB gz) — keeping it out of
// the static import graph keeps first-load JS light on every route. The
// decorative layers only ever render client-side at tier >= 2 anyway.
const VoidBackground = dynamic(() => import("../VoidBackground"), { ssr: false });
const EffectsOverlay = dynamic(() => import("../EffectsOverlay"), { ssr: false });
const CursorFollower = dynamic(() => import("../CursorFollower"), { ssr: false });

const noopSubscribe = () => () => {};
/** false on the server + first hydration pass, true thereafter — no mismatch. */
function useIsClient() {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";
const subscribeReduced = (cb: () => void) => {
  const mq = window.matchMedia(REDUCED_QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};
function useReducedMotion() {
  return useSyncExternalStore(
    subscribeReduced,
    () => window.matchMedia(REDUCED_QUERY).matches,
    () => false,
  );
}

export default function EnhancementLayers() {
  const isClient = useIsClient();
  const reducedMotion = useReducedMotion();
  const { tier } = useQuality();

  if (!isClient) {
    return (
      <div
        style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none", background: "#000005" }}
        role="presentation"
        aria-hidden="true"
      />
    );
  }

  // Reduced motion: the calm static field, no animated decoration, native cursor.
  if (reducedMotion) {
    return <StaticStarfield />;
  }

  return (
    <>
      {tier <= 1 ? <StaticStarfield /> : <VoidBackground tier={tier} />}
      {/* Smoke now lives inside the hero (HeroIntro) so its front layer can sit
          in front of the lantern and scrub with the pinned intro. */}
      {tier >= 3 && <EffectsOverlay />}
      {tier >= 2 && <CursorFollower />}
    </>
  );
}
