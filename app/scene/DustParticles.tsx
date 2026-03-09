"use client";

/**
 * Volumetric dust motes — 220 slow-drifting ice-blue particles.
 *
 * Extracted from VoidBackground.tsx lines 1497-1538.
 * Soft bokeh discs with per-mote brightness variation.
 */

import { useRef, useMemo, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { makeDustMaterialTSL } from "./tsl/dustMaterial";
import { sr } from "../lib/seededRandom";

export default function DustParticles() {
  const groupRef = useRef<THREE.Group>(null);

  const geo = useMemo(() => {
    const count  = 220;
    const seed   = 77777;
    const pos    = new Float32Array(count * 3);
    const bright = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const theta = sr(seed + i * 5 + 0) * Math.PI * 2;
      const phi   = Math.acos(2 * sr(seed + i * 5 + 1) - 1);
      const r     = 8 + sr(seed + i * 5 + 2) * 30;
      pos[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = r * Math.cos(phi);
      bright[i]      = 0.35 + sr(seed + i * 5 + 3) * 0.65;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos,    3));
    g.setAttribute("aBright",  new THREE.BufferAttribute(bright, 1));
    return g;
  }, []);

  const mat = useMemo(() => makeDustMaterialTSL(), []);

  useEffect(() => () => { geo.dispose(); mat.dispose(); }, [geo, mat]);

  useFrame((_, dt) => {
    if (!groupRef.current) return;
    groupRef.current.rotation.y += dt * 0.0038;
    groupRef.current.rotation.x += dt * 0.0016;
  });

  return (
    <group ref={groupRef}>
      <points renderOrder={-2} frustumCulled={false}>
        <primitive object={geo} attach="geometry" />
        <primitive object={mat} attach="material" />
      </points>
    </group>
  );
}
