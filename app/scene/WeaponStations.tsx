"use client";

/**
 * WeaponStations — orchestrator that lazy-loads weapon models
 * based on camera proximity. Pre-loads 1 station ahead.
 *
 * Each station is wrapped in its own Suspense boundary so that
 * loading one model does not unmount/suspend already-visible siblings.
 *
 * Loading decisions are tracked in a ref (not state) to avoid
 * re-renders on every animation frame. A state bump is scheduled
 * only when the loaded set actually grows.
 */

import { useState, useRef, useCallback, useEffect, useMemo, useSyncExternalStore, Suspense } from "react";
import { useFrame } from "@react-three/fiber";
import { useFBX } from "@react-three/drei";
import * as THREE from "three";
import { workModels, type WorkModelEntry } from "../lib/workModels";
import { STATIONS } from "../lib/journeyConfig";
import { loadGate } from "../lib/loadingOrchestrator";

/**
 * Redirect .png/.jpg/.tga texture requests to .webp — FBX files embed
 * original texture references (e.g. Torch_color.png) but we only ship .webp.
 * This prevents dozens of 404 errors during FBX parsing and lets the browser
 * cache shared textures between FBXLoader and our custom PBR pipeline.
 */
if (typeof window !== "undefined") {
  THREE.DefaultLoadingManager.setURLModifier((url) => {
    if (/\.(png|jpg|jpeg|tga|bmp)$/i.test(url)) {
      return url.replace(/\.(png|jpg|jpeg|tga|bmp)$/i, ".webp");
    }
    return url;
  });
}
import WeaponStation from "./WeaponStation";

function createFallbackEntry(station: typeof STATIONS[number], index: number): WorkModelEntry {
  return {
    id: station.modelId,
    modelPath: station.modelPath,
    title: station.loreName,
    category: "3D Model",
    year: "2026",
    textures: station.textures,
    scrollProgress: station.scrollViewCenter,
    hovered: false,
    labelSet: index,
    rotX: 0,
    rotY: 0,
    velX: 0,
    velY: 0,
    isDragging: false,
    wasDragged: false,
  };
}

// FBX preloading — DEFERRED until loading screen dismisses so FBX downloads
// don't compete for bandwidth with critical smoke frame decoding.
// Staggered to avoid concurrent FBX parses blocking the main thread.
const PRELOAD_PATHS = [
  "/models/Torch/torch.fbx",           // 103KB - Station 0, visible first
  "/models/Weapons/bow/Bow.fbx",        // 579KB - Station 4
  "/models/Weapons/Shield/Shield.fbx",  // 89KB  - Station 2
  "/models/Weapons/Sword/sword.fbx",    // 81KB  - Station 3
  "/models/Weapons/Ornate Dagger/Ornate Dagger.fbx", // 20MB - Station 1, last!
];

export default function WeaponStations() {
  const [renderEntries, setRenderEntries] = useState<WorkModelEntry[]>([]);
  const entriesRef = useRef<WorkModelEntry[]>([]);
  const versionRef = useRef(-1);
  const pendingUpdate = useRef(false);
  const sceneActive = useSyncExternalStore(
    loadGate.subscribe.bind(loadGate),
    () => loadGate.dismissed,
    () => false,
  );
  const fallbackEntries = useMemo(
    () => STATIONS.map((station, index) => createFallbackEntry(station, index)),
    [],
  );

  const bump = useCallback(() => {
    if (!pendingUpdate.current) {
      pendingUpdate.current = true;
      setTimeout(() => {
        pendingUpdate.current = false;
        setRenderEntries([...entriesRef.current]);
      }, 0);
    }
  }, []);

  // Once the loading screen has cleared, start all model fetches immediately.
  // There are only five stations and the user needs deterministic availability.
  useEffect(() => {
    const startPreload = () => {
      PRELOAD_PATHS.forEach((path) => useFBX.preload(path));
    };

    if (loadGate.dismissed) {
      startPreload();
      return;
    }

    const unsub = loadGate.subscribe(() => {
      if (loadGate.dismissed) {
        unsub();
        startPreload();
      }
    });
    return unsub;
  }, []);

  useFrame(() => {
    // Sync entries from workModels (only when version changes)
    if (workModels.version !== versionRef.current) {
      versionRef.current = workModels.version;
      entriesRef.current = [...workModels.entries];
      bump();
    }
  });

  if (!sceneActive) return null;

  return (
    <>
      {STATIONS.map(station => {
        const entry =
          renderEntries.find(e => e.id === station.modelId) ??
          fallbackEntries.find(e => e.id === station.modelId);
        if (!entry) return null;
        return (
          <Suspense key={station.id} fallback={null}>
            <WeaponStation
              station={station}
              entry={entry}
            />
          </Suspense>
        );
      })}
    </>
  );
}
