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
import VoidBackground from "../VoidBackground";
import SmokeLayersGate from "../SmokeLayersGate";
import EffectsOverlay from "../EffectsOverlay";
import CursorFollower from "../CursorFollower";
import StaticStarfield from "./StaticStarfield";
import { useQuality } from "./QualityProvider";

const noopSubscribe = () => () => {};
/** false on the server + first hydration pass, true thereafter — no mismatch. */
function useIsClient() {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

export default function EnhancementLayers() {
  const isClient = useIsClient();
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

  return (
    <>
      {tier <= 1 ? <StaticStarfield /> : <VoidBackground tier={tier} />}
      {tier >= 2 && <SmokeLayersGate />}
      {tier >= 3 && <EffectsOverlay />}
      {tier >= 2 && <CursorFollower />}
    </>
  );
}
