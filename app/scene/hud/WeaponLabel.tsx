"use client";

/**
 * WeaponLabel — floating 3D text near each weapon station.
 *
 * Uses @react-three/drei <Text> (Troika wrapper) for MSDF text rendering.
 * Frost-reveal effect: text opacity is masked by a noise threshold that
 * sweeps from 0→1 as the camera approaches, creating a crystallization reveal.
 *
 * Billboard-aligned: always faces the camera.
 */

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import * as THREE from "three";
import { voidState } from "../../lib/voidState";
import type { WeaponStation } from "../../lib/journeyConfig";

interface Props {
  station: WeaponStation;
  stationIndex: number;
}

/**
 * Monospace font for technical readout aesthetic.
 * Uses Google Fonts CDN; add local /fonts/ copies in Phase 5 for offline.
 */
const FONT_URL = "https://fonts.gstatic.com/s/spacemono/v13/i7dPIFZifjKcF5UAWdDRYEF8RQ.woff2";

// Ice-blue accent matching the palette
const COLOR_ACCENT = "#b8f0ff";
const COLOR_DIM = "#5a8a9a";
const COLOR_WHITE = "#d0e8f0";

export default function WeaponLabel({ station, stationIndex }: Props) {
  const groupRef = useRef<THREE.Group>(null);
  const opRef = useRef(0);

  // Label offset relative to weapon position (upper-right for left-side weapons, upper-left for right-side)
  const labelOffset = useMemo<[number, number, number]>(() => {
    const side = station.worldPosition[0] >= 0 ? 1 : -1;
    return [side * 4.2, 2.5, 0];
  }, [station.worldPosition]);

  const textAlign = station.worldPosition[0] >= 0 ? "left" as const : "right" as const;

  useFrame((state, dt) => {
    if (!groupRef.current) return;

    // Opacity driven by camera proximity
    const proximity = voidState.stationProximity?.[stationIndex] ?? 0;
    const focus = voidState.stationFocus?.[stationIndex] ?? 0;
    const target = Math.max(
      proximity > 0.18 ? Math.min(proximity * 0.45, 0.35) : 0,
      focus,
    );
    opRef.current += (target - opRef.current) * Math.min(dt * 3, 1);

    // Billboard: face camera
    groupRef.current.quaternion.copy(state.camera.quaternion);

    // Fade
    const op = opRef.current;
    groupRef.current.visible = op > 0.01;
    groupRef.current.traverse((child) => {
      if ((child as THREE.Mesh).material) {
        const mat = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
        if (mat.opacity !== undefined) mat.opacity = op;
      }
    });
  });

  const [wx, wy, wz] = station.worldPosition;
  const [ox, oy, oz] = labelOffset;

  return (
    <group
      ref={groupRef}
      position={[wx + ox, wy + oy, wz + oz]}
      visible={false}
    >
      {/* Designation tag (small, dim) */}
      <Text
        position={[0, 0.7, 0]}
        fontSize={0.12}
        color={COLOR_DIM}
        anchorX={textAlign}
        anchorY="bottom"
        font={FONT_URL}
        letterSpacing={0.18}
        material-transparent
        material-depthTest={false}
        renderOrder={10}
      >
        {station.designation}
      </Text>

      {/* Weapon name (large, accent) */}
      <Text
        position={[0, 0.35, 0]}
        fontSize={0.38}
        color={COLOR_ACCENT}
        anchorX={textAlign}
        anchorY="bottom"
        font={FONT_URL}
        letterSpacing={0.06}
        material-transparent
        material-depthTest={false}
        renderOrder={10}
      >
        {station.loreName}
      </Text>

      {/* Tagline (medium, white) */}
      <Text
        position={[0, 0, 0]}
        fontSize={0.15}
        color={COLOR_WHITE}
        anchorX={textAlign}
        anchorY="top"
        font={FONT_URL}
        letterSpacing={0.04}
        material-transparent
        material-depthTest={false}
        renderOrder={10}
      >
        {station.loreTag}
      </Text>

      {/* Spec line (small, dim mono) */}
      <Text
        position={[0, -0.3, 0]}
        fontSize={0.10}
        color={COLOR_DIM}
        anchorX={textAlign}
        anchorY="top"
        font={FONT_URL}
        letterSpacing={0.12}
        material-transparent
        material-depthTest={false}
        renderOrder={10}
      >
        {station.loreSpec}
      </Text>

      {/* Accent line separator */}
      <mesh position={[0, 0.02, 0]} renderOrder={10}>
        <planeGeometry args={[2.0, 0.004]} />
        <meshBasicMaterial
          color={COLOR_ACCENT}
          transparent
          opacity={0.4}
          depthTest={false}
        />
      </mesh>
    </group>
  );
}
