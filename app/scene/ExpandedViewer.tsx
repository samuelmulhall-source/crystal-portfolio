"use client";

/**
 * Expanded view OrbitControls — activates when a weapon is expanded.
 *
 * Extracted from VoidBackground.tsx lines 377-423.
 * Centers OrbitControls on the active weapon's world position.
 */

import { useRef, useState, useEffect, useContext } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { workModels } from "../lib/workModels";
import { STATIONS } from "../lib/journeyConfig";
import { VoidContext } from "./VoidScene";

export default function ExpandedViewer() {
  const { camera, gl } = useThree();
  const prevExpandedRef = useRef<string | null>(null);
  const [hasInteracted, setHasInteracted] = useState(false);
  const { isMobile } = useContext(VoidContext);
  const [target, setTarget] = useState<[number, number, number]>([0, 0, 0]);

  useFrame(() => {
    const expanded = workModels.expandedModelId;
    if (expanded && prevExpandedRef.current !== expanded) {
      prevExpandedRef.current = expanded;
      setHasInteracted(false);

      // Find the world position of the expanded weapon
      const station = STATIONS.find(s => s.modelId === expanded || s.id === expanded);
      if (station) {
        const [wx, wy, wz] = station.worldPosition;
        setTarget([wx, wy, wz]);
        // Position camera at an orbit distance from the weapon
        camera.position.set(wx - 2, wy + 1, wz + 8);
        camera.lookAt(wx, wy, wz);
      } else {
        // Fallback to origin
        camera.position.set(0, 0, 10);
        camera.lookAt(0, 0, 2);
        setTarget([0, 0, 2]);
      }
    } else if (!expanded) {
      prevExpandedRef.current = null;
    }
  });

  useEffect(() => {
    if (!isMobile || !workModels.expandedModelId) return;
    const canvas = gl.domElement;
    const onInteract = () => setHasInteracted(true);
    canvas.addEventListener("pointerdown", onInteract, { once: true });
    return () => canvas.removeEventListener("pointerdown", onInteract);
  }, [isMobile, gl]);

  if (!workModels.expandedModelId) return null;
  return (
    <OrbitControls
      enablePan={false}
      enableZoom
      enableRotate
      autoRotate={!isMobile || hasInteracted}
      autoRotateSpeed={0.4}
      dampingFactor={0.08}
      enableDamping
      minDistance={2.5}
      maxDistance={20}
      minPolarAngle={Math.PI * 0.08}
      maxPolarAngle={Math.PI * 0.92}
      target={target}
    />
  );
}
