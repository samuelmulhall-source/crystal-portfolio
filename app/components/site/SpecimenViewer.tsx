"use client";

/**
 * SpecimenViewer — progressive-enhancement wrapper for the interactive 3D viewer.
 *
 *   reduced / low-tier / SSR → static poster image (no Three.js loaded)
 *   enhanced                 → lazy-loaded WebGL viewer over the poster
 *
 * The poster always renders first so there is never a blank frame or layout
 * shift; the canvas fades in on top once the model is ready. Once running,
 * the viewer doubles as a technical inspector: wireframe view plus a mesh /
 * texture readout computed from the loaded production files.
 */

import dynamic from "next/dynamic";
import Image from "next/image";
import { useEffect, useState } from "react";
import { useDisplayMode } from "./DisplayModeProvider";
import type { Specimen } from "../../lib/content";
import type { SpecimenStats } from "./SpecimenScene";

const SpecimenScene = dynamic(() => import("./SpecimenScene"), { ssr: false });

/** "12403" → "12,403"; mono labels stay compact and tabular. */
function fmtCount(n: number) {
  return n.toLocaleString("en-US");
}

/** 4096 → "4K", 2048 → "2K", 1024 → "1K", smaller → raw px. */
function fmtTexSize(px: number) {
  if (px >= 1024) return `${Math.round(px / 1024)}K`;
  return px > 0 ? `${px}px` : "";
}

export function SpecimenViewer({
  specimen,
  alt,
  className,
  allowZoom = false,
}: {
  specimen: Specimen;
  alt: string;
  className?: string;
  /** Enable wheel zoom — detail pages only, never mid-scroll surfaces. */
  allowZoom?: boolean;
}) {
  const { effectiveMode } = useDisplayMode();
  const [mounted, setMounted] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);
  const [wireframe, setWireframe] = useState(false);
  const [stats, setStats] = useState<SpecimenStats | null>(null);

  // Client-mount guard: keeps the first client render matching SSR (poster
  // only), then enables the WebGL stage. Matches the codebase convention.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  // A new specimen (asset stepping) streams in fresh geometry — drop the old
  // readout and fade the poster back in until the next model is ready.
  // (Render-time state adjustment per react.dev — avoids an effect cascade.)
  const [prevModelPath, setPrevModelPath] = useState(specimen.modelPath);
  if (prevModelPath !== specimen.modelPath) {
    setPrevModelPath(specimen.modelPath);
    setSceneReady(false);
    setStats(null);
  }

  const enhanced = mounted && effectiveMode === "enhanced";
  const format = (specimen.modelPath.split(".").pop() ?? "").toUpperCase();
  const texLabel = stats && stats.maps > 0 ? `${fmtTexSize(stats.maxTextureSize)} PBR ×${stats.maps}` : null;

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
          <SpecimenScene
            specimen={specimen}
            wireframe={wireframe}
            allowZoom={allowZoom}
            onReady={() => setSceneReady(true)}
            onStats={setStats}
          />
          <span className="specimen-viewer__hint" aria-hidden="true">
            {allowZoom ? "Drag to rotate · scroll to zoom" : "Drag to rotate"}
          </span>
        </div>
      ) : null}

      {/* Loading state — visible over the poster while geometry streams in */}
      {enhanced && !sceneReady ? (
        <span className="specimen-viewer__loading" role="status">
          Loading model
        </span>
      ) : null}

      {/* Targeting-reticle frame to match the hero aesthetic */}
      <div className="specimen-viewer__frame" aria-hidden="true">
        <span className="specimen-viewer__corner specimen-viewer__corner--tl" />
        <span className="specimen-viewer__corner specimen-viewer__corner--tr" />
        <span className="specimen-viewer__corner specimen-viewer__corner--bl" />
        <span className="specimen-viewer__corner specimen-viewer__corner--br" />
      </div>

      {/* Technical readout — real numbers from the loaded production files */}
      {enhanced ? (
        <span className="specimen-viewer__badge">
          {stats
            ? [format, `${fmtCount(stats.triangles)} tris`, texLabel]
                .filter(Boolean)
                .join(" · ")
            : "◊ realtime · webgl"}
        </span>
      ) : null}

      {/* Wireframe toggle — the inspector's tech view */}
      {enhanced && sceneReady ? (
        <button
          type="button"
          className={`specimen-viewer__wire${wireframe ? " is-active" : ""}`}
          onClick={() => setWireframe((w) => !w)}
          aria-pressed={wireframe}
        >
          Wireframe
        </button>
      ) : null}
    </div>
  );
}
