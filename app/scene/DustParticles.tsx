"use client";

/**
 * Volumetric dust motes — slow-drifting ice-blue particles.
 *
 * Soft bokeh discs with per-mote brightness + size variation.
 * Desktop: 320 motes, Mobile: 160 (context-driven).
 */

import { useRef, useMemo, useEffect, useContext } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { makeDustMat } from "./dustShader";
import { sr } from "../lib/seededRandom";
import { VoidContext } from "./VoidScene";

export default function DustParticles() {
  const { isMobile } = useContext(VoidContext);
  const groupRef = useRef<THREE.Group>(null);

  const count = isMobile ? 160 : 320;

  const geo = useMemo(() => {
    const seed   = 77777;
    const pos    = new Float32Array(count * 3);
    const bright = new Float32Array(count);
    const sizes  = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const theta = sr(seed + i * 5 + 0) * Math.PI * 2;
      const phi   = Math.acos(2 * sr(seed + i * 5 + 1) - 1);
      const r     = 8 + sr(seed + i * 5 + 2) * 30;
      pos[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = r * Math.cos(phi);
      bright[i]      = 0.35 + sr(seed + i * 5 + 3) * 0.65;
      sizes[i]       = 0.8 + sr(seed + i * 5 + 4) * 0.6; // 0.8x – 1.4x size variation
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos,    3));
    g.setAttribute("aBright",  new THREE.BufferAttribute(bright, 1));
    g.setAttribute("aSize",    new THREE.BufferAttribute(sizes,  1));
    return g;
  }, [count]);

  const mat = useMemo(() => makeDustMat(), []);

  useEffect(() => () => { geo.dispose(); mat.dispose(); }, [geo, mat]);

  useFrame((_, dt) => {
    if (!groupRef.current) return;
    groupRef.current.rotation.y += dt * 0.0048;
    groupRef.current.rotation.x += dt * 0.002;
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
