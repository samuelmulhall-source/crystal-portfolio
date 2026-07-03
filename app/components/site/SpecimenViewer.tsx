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
import { useEffect, useMemo, useRef, useState } from "react";
import { useDisplayMode } from "./DisplayModeProvider";
import type { Specimen } from "../../lib/content";
import type { HandPose, SpecimenChannel, SpecimenStats } from "./SpecimenScene";

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

/** Label clips for the selector. Clean names (the procedural set, or a tidy
 *  DCC export) pass through verbatim; exporter noise ("...animation_1.004")
 *  becomes sequential "Loop N"; a T-pose/bind clip becomes "Rest". */
function labelClips(names: string[]): { idx: number; label: string }[] {
  let n = 0;
  return names.map((name, idx) => {
    if (/^[A-Za-z][A-Za-z ]{1,13}$/.test(name)) return { idx, label: name };
    const rest = /t-?pose|rest|bind|a-?pose|(^|\|)0_/i.test(name);
    return { idx, label: rest ? "Rest" : `Loop ${++n}` };
  });
}

/** A flat segmented control with a sliding selection indicator — the active
 *  segment's fill physically slides between positions instead of just
 *  toggling per-chip (Apple HIG segmented-control pattern: one container,
 *  a single moving selection mark). Ids are plain strings so one component
 *  serves the channel/rig-mode/clip racks without generics. */
function ChipRack({
  items,
  activeId,
  onSelect,
  ariaLabel,
}: {
  items: { id: string; label: string }[];
  activeId: string;
  onSelect: (id: string) => void;
  ariaLabel: string;
}) {
  const btnRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [indicator, setIndicator] = useState<{ x: number; w: number } | null>(null);

  useEffect(() => {
    const btn = btnRefs.current.get(activeId);
    if (!btn) return;
    setIndicator({ x: btn.offsetLeft, w: btn.offsetWidth });
  }, [activeId, items]);

  return (
    <div className="specimen-viewer__chips" role="group" aria-label={ariaLabel}>
      {indicator ? (
        <span
          className="specimen-viewer__chip-indicator"
          style={{ left: indicator.x, width: indicator.w }}
          aria-hidden="true"
        />
      ) : null}
      {items.map((c) => (
        <button
          key={c.id}
          ref={(el) => {
            if (el) btnRefs.current.set(c.id, el);
            else btnRefs.current.delete(c.id);
          }}
          type="button"
          className={`specimen-viewer__channel${activeId === c.id ? " is-active" : ""}`}
          onClick={() => onSelect(c.id)}
          aria-pressed={activeId === c.id}
        >
          <span>{c.label}</span>
        </button>
      ))}
    </div>
  );
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
  const [poseable, setPoseable] = useState(false);
  const [handPose, setHandPose] = useState<HandPose>("rest");
  // Two-stage hint: "drag to rotate" until the user grabs the viewer, then a
  // brief "scroll to zoom" coach line, then gone.
  const [hintStage, setHintStage] = useState<0 | 1 | 2>(0);
  useEffect(() => {
    if (hintStage !== 1) return;
    const t = setTimeout(() => setHintStage(2), 4500);
    return () => clearTimeout(t);
  }, [hintStage]);

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
    setPoseable(false);
    setHandPose("rest");
    setHintStage(0);
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
        <div
          className={`specimen-viewer__stage${sceneReady ? " is-ready" : ""}`}
          onPointerDown={() => setHintStage((s) => (s === 0 ? 1 : s))}
          onKeyDown={() => setHintStage((s) => (s === 0 ? 1 : s))}
        >
          <SpecimenScene
            specimen={specimen}
            channel={channel}
            clipIndex={clipIndex}
            poseMode={poseMode}
            allowZoom={allowZoom}
            handPose={handPose}
            onReady={() => setSceneReady(true)}
            onStats={setStats}
            onClips={setClips}
            onPoseable={setPoseable}
          />
        </div>
      ) : null}

      {/* Loading state — visible over the poster while geometry streams in */}
      {enhanced && !sceneReady ? (
        <span className="specimen-viewer__loading" role="status">
          Loading model
        </span>
      ) : null}

      {/* Technical readout — bare text, no panel (Blender's viewport-overlay
          convention: plain top-left stats, no box/border/background). */}
      {enhanced ? (
        <span className="specimen-viewer__stats">
          <span className="specimen-viewer__stats-glyph" aria-hidden="true">◊</span>{" "}
          {stats
            ? [format, `${fmtCount(stats.triangles)} tris`, texLabel]
                .filter(Boolean)
                .join(" · ")
            : "realtime · webgl"}
        </span>
      ) : null}

      {/* Control toolbar — docked to the bottom edge (Sketchfab/Blender split
          controls from the info readout, which stays at the top). */}
      {enhanced && sceneReady ? (
        <div className="specimen-viewer__toolbar">
          <span
            className={`specimen-viewer__toolbar-hint${hintStage === 2 ? " is-dismissed" : ""}`}
            aria-hidden="true"
          >
            {poseMode
              ? "Drag the handles to pose the rig"
              : hintStage === 1
                ? "Scroll to zoom · double-click resets"
                : allowZoom
                  ? "Drag to rotate · scroll to zoom"
                  : "Drag to rotate"}
          </span>
          <div className="specimen-viewer__toolbar-racks">
            <ChipRack
              ariaLabel="Inspect channel"
              items={channels}
              activeId={channel}
              onSelect={(id) => setChannel(id as SpecimenChannel)}
            />

            {rigged && poseable ? (
              <ChipRack
                ariaLabel="Rig mode"
                items={[
                  { id: "animate", label: "Animate" },
                  { id: "pose", label: "Pose" },
                ]}
                activeId={poseMode ? "pose" : "animate"}
                onSelect={(id) => setPoseMode(id === "pose")}
              />
            ) : null}

            {rigged && poseable && poseMode ? (
              <ChipRack
                ariaLabel="Hand pose"
                items={[
                  { id: "open", label: "Open" },
                  { id: "rest", label: "Rest" },
                  { id: "fist", label: "Fist" },
                ]}
                activeId={handPose}
                onSelect={(id) => setHandPose(id as HandPose)}
              />
            ) : null}

            {rigged && !poseMode && clipLabels.length > 1 ? (
              <ChipRack
                ariaLabel="Animation clip"
                items={clipLabels.map((c) => ({ id: String(c.idx), label: c.label }))}
                activeId={String(clipIndex)}
                onSelect={(id) => setClipIndex(Number(id))}
              />
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
