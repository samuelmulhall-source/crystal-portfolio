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

import { useState, useRef, useCallback, Suspense } from "react";
import { useFrame } from "@react-three/fiber";
import { useFBX } from "@react-three/drei";
import { voidState } from "../lib/voidState";
import { workModels, type WorkModelEntry } from "../lib/workModels";
import { STATIONS } from "../lib/journeyConfig";
import WeaponStation from "./WeaponStation";

// Module-level FBX preloading — starts immediately when this module is imported.
// Staggered to avoid concurrent FBX parses blocking the main thread.
// The first model (torch, station 0) loads immediately since it's visible first.
// The dagger (20MB) loads last to avoid blocking other loads.
const PRELOAD_PATHS = [
  "/models/Torch/torch.fbx",           // 103KB - Station 0, visible first
  "/models/Weapons/bow/Bow.fbx",        // 579KB - Station 4
  "/models/Weapons/Shield/Shield.fbx",  // 89KB  - Station 2
  "/models/Weapons/Sword/sword.fbx",    // 81KB  - Station 3
  "/models/Weapons/Ornate Dagger/Ornate Dagger.fbx", // 20MB - Station 1, last!
];

// Start first preload immediately, rest staggered
if (typeof window !== "undefined") {
  useFBX.preload(PRELOAD_PATHS[0]);
  PRELOAD_PATHS.slice(1).forEach((path, i) => {
    setTimeout(() => useFBX.preload(path), (i + 1) * 2000);
  });
}

export default function WeaponStations() {
  const [, setTick] = useState(0);
  const entriesRef = useRef<WorkModelEntry[]>([]);
  const versionRef = useRef(-1);
  const loadedRef = useRef<Set<string>>(new Set());
  const pendingUpdate = useRef(false);

  const bump = useCallback(() => {
    if (!pendingUpdate.current) {
      pendingUpdate.current = true;
      // Use setTimeout to yield to the browser between the decision to load
      // and the actual React re-render. queueMicrotask runs before paint,
      // which can stack FBX parse into an already-busy frame.
      setTimeout(() => {
        pendingUpdate.current = false;
        setTick(t => t + 1);
      }, 0);
    }
  }, []);

  useFrame(() => {
    // Sync entries from workModels (only when version changes)
    if (workModels.version !== versionRef.current) {
      versionRef.current = workModels.version;
      entriesRef.current = [...workModels.entries];
      bump();
    }

    // Determine which stations to load
    const current = voidState.activeStationIndex;
    const expanded = workModels.expandedModelId;
    const loaded = loadedRef.current;
    let changed = false;

    // Always load first two stations so station 1 is ready before user scrolls
    for (let i = 0; i < Math.min(2, STATIONS.length); i++) {
      if (!loaded.has(STATIONS[i].id)) { loaded.add(STATIONS[i].id); changed = true; }
    }

    // Load current + next 2 stations (mount cost happens before user arrives)
    if (current >= 0) {
      for (let i = current; i < Math.min(current + 3, STATIONS.length); i++) {
        if (!loaded.has(STATIONS[i].id)) { loaded.add(STATIONS[i].id); changed = true; }
      }
    }

    // Load expanded station
    if (expanded) {
      const es = STATIONS.find(s => s.modelId === expanded || s.id === expanded);
      if (es && !loaded.has(es.id)) { loaded.add(es.id); changed = true; }
    }

    if (changed) bump();
  });

  const entries = entriesRef.current;
  if (entries.length === 0) return null;

  return (
    <>
      {STATIONS.filter(s => loadedRef.current.has(s.id)).map(station => {
        const entry = entries.find(e => e.id === station.modelId);
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
