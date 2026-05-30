"use client";

/**
 * SpecimenViewer — progressive-enhancement wrapper for the interactive 3D viewer.
 *
 *   reduced / low-tier / SSR → static poster image (no Three.js loaded)
 *   enhanced                 → lazy-loaded WebGL viewer over the poster
 *
 * The poster always renders first so there is never a blank frame or layout
 * shift; the canvas fades in on top once the model is ready.
 */

import dynamic from "next/dynamic";
import Image from "next/image";
import { useEffect, useState } from "react";
import { useDisplayMode } from "./DisplayModeProvider";
import type { Specimen } from "../../lib/content";

const SpecimenScene = dynamic(() => import("./SpecimenScene"), { ssr: false });

export function SpecimenViewer({
  specimen,
  alt,
  className,
}: {
  specimen: Specimen;
  alt: string;
  className?: string;
}) {
  const { effectiveMode } = useDisplayMode();
  const [mounted, setMounted] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);

  // Client-mount guard: keeps the first client render matching SSR (poster
  // only), then enables the WebGL stage. Matches the codebase convention.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  const enhanced = mounted && effectiveMode === "enhanced";

  return (
    <div className={`specimen-viewer${className ? ` ${className}` : ""}`}>
      {/* Poster — always present underneath, fades out once the scene is ready */}
      <Image
        src={specimen.poster}
        alt={alt}
        fill
        sizes="(max-width: 720px) 100vw, (max-width: 1180px) 85vw, 48vw"
        className={`specimen-viewer__poster${sceneReady ? " is-hidden" : ""}`}
        priority
      />

      {enhanced ? (
        <div className={`specimen-viewer__stage${sceneReady ? " is-ready" : ""}`}>
          <SpecimenScene specimen={specimen} onReady={() => setSceneReady(true)} />
          <span className="specimen-viewer__hint" aria-hidden="true">
            Drag to rotate · scroll to zoom
          </span>
        </div>
      ) : null}

      {/* Targeting-reticle frame to match the hero aesthetic */}
      <div className="specimen-viewer__frame" aria-hidden="true">
        <span className="specimen-viewer__corner specimen-viewer__corner--tl" />
        <span className="specimen-viewer__corner specimen-viewer__corner--tr" />
        <span className="specimen-viewer__corner specimen-viewer__corner--bl" />
        <span className="specimen-viewer__corner specimen-viewer__corner--br" />
      </div>

      {enhanced ? (
        <span className="specimen-viewer__badge" aria-hidden="true">
          ◊ REALTIME · WEBGL
        </span>
      ) : null}
    </div>
  );
}
