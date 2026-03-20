"use client";

/**
 * ScanLines — animated dashed line segments from weapon to floating labels.
 *
 * Creates thin connector lines from the weapon's world position to the label
 * position. Lines use dashed material with animated dash offset for a
 * crawling scan effect. Opacity driven by camera proximity.
 */

import { useRef, useMemo, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { voidState } from "../../lib/voidState";
import type { WeaponStation } from "../../lib/journeyConfig";

interface Props {
  station: WeaponStation;
  stationIndex: number;
}

const LINE_COLOR = new THREE.Color("#4a8a9a");
const DASH_SIZE = 0.15;
const GAP_SIZE = 0.12;

export default function ScanLines({ station, stationIndex }: Props) {
  const groupRef = useRef<THREE.Group>(null);
  const matRefs = useRef<THREE.LineDashedMaterial[]>([]);
  const opRef = useRef(0);

  // Generate scan line endpoints: weapon center → label anchor points
  const lines = useMemo(() => {
    const [wx, wy, wz] = station.worldPosition;
    const side = wx >= 0 ? 1 : -1;
    const labelX = wx + side * 4.2;
    const labelY = wy + 2.5;

    return [
      // Main connector: weapon top → label bottom
      {
        start: new THREE.Vector3(wx, wy + 1.5, wz),
        end: new THREE.Vector3(labelX, labelY - 0.4, wz),
      },
      // Secondary: weapon mid → label left/right edge
      {
        start: new THREE.Vector3(wx + side * 0.8, wy + 0.5, wz),
        end: new THREE.Vector3(labelX, labelY + 0.1, wz),
      },
      // Tertiary: short horizontal bracket at label
      {
        start: new THREE.Vector3(labelX - side * 0.1, labelY + 0.75, wz),
        end: new THREE.Vector3(labelX + side * 1.5, labelY + 0.75, wz),
      },
    ];
  }, [station]);

  // Build geometries
  const geometries = useMemo(() => {
    return lines.map(({ start, end }) => {
      const g = new THREE.BufferGeometry().setFromPoints([start, end]);
      // computeLineDistances required for dashed materials
      const line = new THREE.Line(g, new THREE.LineBasicMaterial());
      line.computeLineDistances();
      const distances = line.geometry.attributes.lineDistance;
      g.setAttribute("lineDistance", distances);
      line.geometry = new THREE.BufferGeometry(); // release
      return g;
    });
  }, [lines]);

  // Create materials
  const materials = useMemo(() => {
    const mats = lines.map(() => {
      const mat = new THREE.LineDashedMaterial({
        color: LINE_COLOR,
        dashSize: DASH_SIZE,
        gapSize: GAP_SIZE,
        transparent: true,
        opacity: 0,
        depthTest: false,
      });
      return mat;
    });
    return mats;
  }, [lines]);

  // Sync ref after render (not during useMemo)
  useEffect(() => { matRefs.current = materials; }, [materials]);

  useFrame((_, dt) => {
    if (!groupRef.current) return;

    const proximity = voidState.stationProximity?.[stationIndex] ?? 0;
    const target = proximity > 0.2 ? Math.min((proximity - 0.1) * 1.2, 0.6) : 0;
    opRef.current += (target - opRef.current) * Math.min(dt * 3, 1);

    const op = opRef.current;
    groupRef.current.visible = op > 0.01;

    // Animate dash offset (crawl effect) — wrap to prevent float overflow
    const cycle = (DASH_SIZE + GAP_SIZE) * 100;
    matRefs.current.forEach((mat, i) => {
      mat.opacity = op * (i === 0 ? 1 : 0.6);
      const m = mat as unknown as { dashOffset: number };
      m.dashOffset -= dt * 0.8;
      if (m.dashOffset < -cycle) m.dashOffset += cycle;
    });
  });

  return (
    <group ref={groupRef} visible={false}>
      {geometries.map((geo, i) => (
        <lineSegments key={i} geometry={geo} material={materials[i]} renderOrder={9} />
      ))}
    </group>
  );
}
