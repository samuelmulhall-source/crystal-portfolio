"use client";

/**
 * MediaPanels — floating image/video panels alongside weapon stations.
 *
 * Each station has an optional media config with a panel on the opposite
 * side from the weapon model. Uses drei <Html> for DOM-in-3D rendering.
 * Opacity driven by station proximity (same as WeaponStation).
 */

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { voidState } from "../lib/voidState";
import { STATIONS, type WeaponStation } from "../lib/journeyConfig";

function MediaPanel({ station, stationIndex }: { station: WeaponStation; stationIndex: number }) {
  const media = station.media;
  if (!media) return null;

  const opRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useFrame((_, dt) => {
    const proximity = voidState.stationProximity[stationIndex] ?? 0;
    const target = proximity > 0.15 ? proximity : 0;
    opRef.current += (target - opRef.current) * Math.min(dt * 2.5, 1);

    if (containerRef.current) {
      containerRef.current.style.opacity = String(Math.max(opRef.current, 0));
      containerRef.current.style.display = opRef.current < 0.01 ? "none" : "block";
    }
  });

  const [wx, wy, wz] = station.worldPosition;

  return (
    <group position={[media.panelX, wy + 0.3, wz]}>
      <Html
        center
        distanceFactor={8}
        transform
        occlude={false}
        style={{ pointerEvents: "none" }}
      >
        <div
          ref={containerRef}
          style={{
            opacity: 0,
            width: "320px",
            background: "linear-gradient(145deg, rgba(8,14,32,0.85) 0%, rgba(4,8,20,0.92) 100%)",
            border: "1px solid rgba(184,240,255,0.12)",
            borderRadius: "3px",
            overflow: "hidden",
            boxShadow: "0 8px 32px rgba(0,0,12,0.6), inset 0 1px 0 rgba(255,255,255,0.04)",
            pointerEvents: "auto",
          }}
        >
          {/* Header */}
          <div style={{
            padding: "8px 12px 6px",
            borderBottom: "1px solid rgba(184,240,255,0.06)",
          }}>
            <span style={{
              fontFamily: "var(--font-geist-mono), monospace",
              fontSize: "0.42rem",
              letterSpacing: "0.24em",
              textTransform: "uppercase",
              color: "rgba(255,160,60,0.5)",
            }}>
              {media.type === "video" ? "◆ DATA LOG" : "◆ MEMORY CARD"}
            </span>
          </div>

          {/* Content */}
          {media.type === "video" ? (
            <video
              src={media.path}
              muted
              loop
              autoPlay
              playsInline
              style={{
                width: "100%",
                display: "block",
              }}
            />
          ) : (
            <img
              src={media.path}
              alt={media.title}
              loading="lazy"
              style={{
                width: "100%",
                display: "block",
              }}
            />
          )}

          {/* Title bar */}
          <div style={{
            padding: "6px 12px",
            borderTop: "1px solid rgba(184,240,255,0.06)",
          }}>
            <span style={{
              fontFamily: "var(--font-geist-mono), monospace",
              fontSize: "0.5rem",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "rgba(184,240,255,0.55)",
            }}>
              {media.title}
            </span>
          </div>
        </div>
      </Html>
    </group>
  );
}

export default function MediaPanels() {
  return (
    <>
      {STATIONS.map((station, i) =>
        station.media ? (
          <MediaPanel key={station.id} station={station} stationIndex={i} />
        ) : null
      )}
    </>
  );
}
