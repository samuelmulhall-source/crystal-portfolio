"use client";

/**
 * SpecimenViewer — progressive-enhancement wrapper for the interactive 3D viewer.
 *
 *   reduced / low-tier / SSR → static poster image (no Three.js loaded)
 *   enhanced                 → lazy-loaded WebGL viewer over the poster
 *
 * The poster always renders first so there is never a blank frame or layout
 * shift; the canvas fades in on top once the model is ready. Once running, the
 * viewer doubles as a technical inspector: a channel selector (shaded material,
 * wireframe, or any individual PBR map), and — for rigged characters — an
 * animation clip selector plus a drag-to-pose mode that exposes IK handles.
 */

import dynamic from "next/dynamic";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useDisplayMode } from "./DisplayModeProvider";
import type { Specimen } from "../../lib/content";
import type { SpecimenChannel, SpecimenStats } from "./SpecimenScene";

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

/** Channel buttons in pipeline order, label → texture key. Only the maps a
 *  specimen actually has are offered. */
const TEX_CHANNELS: { id: SpecimenChannel; label: string }[] = [
  { id: "map", label: "Albedo" },
  { id: "normalMap", label: "Normal" },
  { id: "roughnessMap", label: "Rough" },
  { id: "metalnessMap", label: "Metal" },
  { id: "transmissionMap", label: "Transmit" },
];

/** Clip names from the FBX are noise ("...animation_1.004"); label them cleanly:
 *  a T-pose/bind clip becomes "Rest", the rest become sequential "Loop N". */
function labelClips(names: string[]): { idx: number; label: string }[] {
  let n = 0;
  return names.map((name, idx) => {
    const rest = /t-?pose|rest|bind|a-?pose|(^|\|)0_/i.test(name);
    return { idx, label: rest ? "Rest" : `Loop ${++n}` };
  });
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
  const [channel, setChannel] = useState<SpecimenChannel>("material");
  const [stats, setStats] = useState<SpecimenStats | null>(null);
  const [clips, setClips] = useState<string[]>([]);
  const [clipIndex, setClipIndex] = useState(0);
  const [poseMode, setPoseMode] = useState(false);

  // Client-mount guard: keeps the first client render matching SSR (poster
  // only), then enables the WebGL stage. Matches the codebase convention.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  // A new specimen (asset stepping) streams in fresh geometry — drop the old
  // readout/state and fade the poster back in until ready. (Render-time state
  // adjustment per react.dev — avoids an effect cascade.)
  const [prevModelPath, setPrevModelPath] = useState(specimen.modelPath);
  if (prevModelPath !== specimen.modelPath) {
    setPrevModelPath(specimen.modelPath);
    setSceneReady(false);
    setStats(null);
    setChannel("material");
    setClips([]);
    setClipIndex(0);
    setPoseMode(false);
  }

  const rigged = !!specimen.rigged;
  const enhanced = mounted && effectiveMode === "enhanced";
  const format = (specimen.modelPath.split(".").pop() ?? "").toUpperCase();
  const texLabel = stats && stats.maps > 0 ? `${fmtTexSize(stats.maxTextureSize)} PBR ×${stats.maps}` : null;

  // Build the channel options from the maps this specimen actually carries.
  const channels: { id: SpecimenChannel; label: string }[] = [
    { id: "material", label: "Shaded" },
    ...TEX_CHANNELS.filter((c) => specimen.textures[c.id as keyof Specimen["textures"]]),
    { id: "wireframe", label: "Wire" },
  ];
  const clipLabels = useMemo(() => labelClips(clips), [clips]);

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
            channel={channel}
            clipIndex={clipIndex}
            poseMode={poseMode}
            allowZoom={allowZoom}
            onReady={() => setSceneReady(true)}
            onStats={setStats}
            onClips={setClips}
          />
          <span className="specimen-viewer__hint" aria-hidden="true">
            {poseMode
              ? "Drag the handles to pose the rig"
              : allowZoom
                ? "Drag to rotate · scroll to zoom"
                : "Drag to rotate"}
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

      {/* Inspector controls — channel, and (rigged) animation + pose mode */}
      {enhanced && sceneReady ? (
        <div className="specimen-viewer__controls">
          <div className="specimen-viewer__chips" role="group" aria-label="Inspect channel">
            {channels.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`specimen-viewer__channel${channel === c.id ? " is-active" : ""}`}
                onClick={() => setChannel(c.id)}
                aria-pressed={channel === c.id}
              >
                <span>{c.label}</span>
              </button>
            ))}
          </div>

          {rigged ? (
            <div className="specimen-viewer__chips" role="group" aria-label="Rig mode">
              <button
                type="button"
                className={`specimen-viewer__channel${!poseMode ? " is-active" : ""}`}
                onClick={() => setPoseMode(false)}
                aria-pressed={!poseMode}
              >
                <span>Animate</span>
              </button>
              <button
                type="button"
                className={`specimen-viewer__channel${poseMode ? " is-active" : ""}`}
                onClick={() => setPoseMode(true)}
                aria-pressed={poseMode}
              >
                <span>Pose</span>
              </button>
            </div>
          ) : null}

          {rigged && !poseMode && clipLabels.length > 1 ? (
            <div className="specimen-viewer__chips" role="group" aria-label="Animation clip">
              {clipLabels.map((c) => (
                <button
                  key={c.idx}
                  type="button"
                  className={`specimen-viewer__channel${clipIndex === c.idx ? " is-active" : ""}`}
                  onClick={() => setClipIndex(c.idx)}
                  aria-pressed={clipIndex === c.idx}
                >
                  <span>{c.label}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
