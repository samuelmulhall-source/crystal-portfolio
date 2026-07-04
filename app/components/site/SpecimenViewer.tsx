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
import type { HandPose, SpecimenChannel, SpecimenStats, TexKey } from "./SpecimenScene";

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

type MenuItem = { id: string; label: string };

/** A side flyout menu group. A compact tab shows the group name + current
 *  selection; it expands on hover / keyboard focus (pointer users) or on click
 *  (touch, and a click-lock for pointer users) into a panel of options that
 *  flies out from the viewer's right edge. Options are real buttons so the
 *  whole thing is keyboard-operable. */
function FlyoutMenu({
  label,
  value,
  items,
  activeId,
  onSelect,
  open,
  onToggle,
  onRequestClose,
}: {
  label: string;
  value: string;
  items: MenuItem[];
  activeId: string;
  onSelect: (id: string) => void;
  open: boolean;
  onToggle: () => void;
  onRequestClose: () => void;
}) {
  return (
    <div
      className={`specimen-viewer__flyout${open ? " is-open" : ""}`}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) onRequestClose();
      }}
    >
      <button
        type="button"
        className="specimen-viewer__flyout-tab"
        onClick={onToggle}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span className="specimen-viewer__flyout-name">{label}</span>
        <span className="specimen-viewer__flyout-value">{value}</span>
      </button>
      <div className="specimen-viewer__flyout-panel" role="menu" aria-label={label}>
        {items.map((it) => (
          <button
            key={it.id}
            type="button"
            role="menuitemradio"
            aria-checked={activeId === it.id}
            className={`specimen-viewer__flyout-opt${activeId === it.id ? " is-active" : ""}`}
            onClick={() => onSelect(it.id)}
          >
            {it.label}
          </button>
        ))}
      </div>
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
  // Texture channels the rigged character's own GLB materials carry (reported
  // by the scene — a rigged character embeds its maps rather than listing them
  // in the content config).
  const [detectedChannels, setDetectedChannels] = useState<TexKey[]>([]);
  // Which side flyout is click-locked open (touch, and a click-toggle for
  // pointer users); pointer hover/focus also reveals via CSS.
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  // Engage-to-zoom (Sketchfab pattern): grabbing the viewer arms wheel zoom,
  // moving the pointer off it disarms — scrolling PAST the showcase never gets
  // hijacked. While armed, `data-lenis-prevent` keeps the Lenis smooth-scroll
  // from also consuming the wheel (it listens at the window level and ignores
  // OrbitControls' preventDefault — the "zooms AND scrolls the page" bug).
  const [zoomArmed, setZoomArmed] = useState(false);
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
    setDetectedChannels([]);
    setOpenMenu(null);
    setHintStage(0);
  }

  const rigged = !!specimen.rigged;
  const enhanced = mounted && effectiveMode === "enhanced";
  const format = (specimen.modelPath.split(".").pop() ?? "").toUpperCase();
  const texLabel = stats && stats.maps > 0 ? `${fmtTexSize(stats.maxTextureSize)} PBR ×${stats.maps}` : null;

  // Channel options: a rigged character's maps are detected from its GLB; a
  // prop lists them in its content textures. Shaded + Wire always bracket them.
  const texIds: TexKey[] = rigged
    ? detectedChannels
    : (TEX_CHANNELS.map((c) => c.id as TexKey).filter(
        (id) => specimen.textures[id as keyof Specimen["textures"]],
      ));
  const channels: { id: SpecimenChannel; label: string }[] = [
    { id: "material", label: "Shaded" },
    ...texIds.map((id) => ({ id, label: TEX_CHANNELS.find((c) => c.id === id)?.label ?? id })),
    { id: "wireframe", label: "Wire" },
  ];
  const clipLabels = useMemo(() => labelClips(clips), [clips]);
  const activeChannelLabel = channels.find((c) => c.id === channel)?.label ?? "Shaded";
  const activeClipLabel = clipLabels.find((c) => c.idx === clipIndex)?.label ?? clipLabels[0]?.label ?? "";
  const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  const toggleMenu = (id: string) => setOpenMenu((cur) => (cur === id ? null : id));
  const closeMenu = (id: string) => setOpenMenu((cur) => (cur === id ? null : cur));

  // The side flyout groups, in order. Channel is always present; the rig/motion/
  // hand groups appear for a poseable rigged character per mode.
  const groups: Array<{
    id: string;
    label: string;
    value: string;
    items: MenuItem[];
    activeId: string;
    onSelect: (id: string) => void;
  }> = [
    {
      id: "channel",
      label: "Channel",
      value: activeChannelLabel,
      items: channels,
      activeId: channel,
      onSelect: (id) => setChannel(id as SpecimenChannel),
    },
  ];
  if (rigged && poseable) {
    groups.push({
      id: "rig",
      label: "Rig",
      value: poseMode ? "Pose" : "Animate",
      items: [
        { id: "animate", label: "Animate" },
        { id: "pose", label: "Pose" },
      ],
      activeId: poseMode ? "pose" : "animate",
      onSelect: (id) => setPoseMode(id === "pose"),
    });
  }
  if (rigged && !poseMode && clipLabels.length > 1) {
    groups.push({
      id: "motion",
      label: "Motion",
      value: activeClipLabel,
      items: clipLabels.map((c) => ({ id: String(c.idx), label: c.label })),
      activeId: String(clipIndex),
      onSelect: (id) => setClipIndex(Number(id)),
    });
  }
  if (rigged && poseable && poseMode) {
    groups.push({
      id: "hand",
      label: "Hand",
      value: titleCase(handPose),
      items: [
        { id: "open", label: "Open" },
        { id: "rest", label: "Rest" },
        { id: "fist", label: "Fist" },
      ],
      activeId: handPose,
      onSelect: (id) => setHandPose(id as HandPose),
    });
  }

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
          data-lenis-prevent={allowZoom || zoomArmed ? "" : undefined}
          onPointerDown={() => {
            setZoomArmed(true);
            setHintStage((s) => (s === 0 ? 1 : s));
          }}
          onPointerLeave={() => setZoomArmed(false)}
          onKeyDown={() => setHintStage((s) => (s === 0 ? 1 : s))}
        >
          <SpecimenScene
            specimen={specimen}
            channel={channel}
            clipIndex={clipIndex}
            poseMode={poseMode}
            allowZoom={allowZoom || zoomArmed}
            handPose={handPose}
            onReady={() => setSceneReady(true)}
            onStats={setStats}
            onClips={setClips}
            onPoseable={setPoseable}
            onChannelsDetected={setDetectedChannels}
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

      {/* Side flyout menus — grouped controls docked to the right edge, each
          collapsed to a labelled tab that expands on hover / focus / tap. */}
      {enhanced && sceneReady ? (
        <div className="specimen-viewer__side" role="toolbar" aria-label="Viewer controls" aria-orientation="vertical">
          {groups.map((g) => (
            <FlyoutMenu
              key={g.id}
              label={g.label}
              value={g.value}
              items={g.items}
              activeId={g.activeId}
              onSelect={g.onSelect}
              open={openMenu === g.id}
              onToggle={() => toggleMenu(g.id)}
              onRequestClose={() => closeMenu(g.id)}
            />
          ))}
        </div>
      ) : null}

      {/* Interaction hint — bottom-centered, coaches then dismisses. */}
      {enhanced && sceneReady ? (
        <span
          className={`specimen-viewer__hint${hintStage === 2 ? " is-dismissed" : ""}`}
          aria-hidden="true"
        >
          {poseMode
            ? "Drag the handles to pose the rig"
            : hintStage === 1
              ? "Scroll to zoom · right-drag to pan · double-click resets"
              : "Drag to rotate · right-drag to pan"}
        </span>
      ) : null}
    </div>
  );
}
