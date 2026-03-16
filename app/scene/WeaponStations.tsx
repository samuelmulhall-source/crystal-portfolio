"use client";

/**
 * WeaponStations — orchestrator that lazy-loads weapon models
 * based on camera proximity. Pre-loads 1 station ahead.
 *
 * Loading decisions are tracked in a ref (not state) to avoid
 * re-renders on every animation frame. A state bump is scheduled
 * only when the loaded set actually grows.
 */

import { useState, useRef, useCallback, Suspense } from "react";
import { useFrame } from "@react-three/fiber";
import { voidState } from "../lib/voidState";
import { workModels, type WorkModelEntry } from "../lib/workModels";
import { STATIONS } from "../lib/journeyConfig";
import WeaponStation from "./WeaponStation";

export default function WeaponStations() {
  const [, setTick] = useState(0);
  const entriesRef = useRef<WorkModelEntry[]>([]);
  const versionRef = useRef(-1);
  const loadedRef = useRef<Set<string>>(new Set());
  const pendingUpdate = useRef(false);

  const bump = useCallback(() => {
    if (!pendingUpdate.current) {
      pendingUpdate.current = true;
      // Schedule a single React re-render outside the rAF loop
      queueMicrotask(() => {
        pendingUpdate.current = false;
        setTick(t => t + 1);
      });
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

    // Always load first station
    if (!loaded.has(STATIONS[0].id)) { loaded.add(STATIONS[0].id); changed = true; }

    // Load current + next station only (skip previous to reduce concurrent loads)
    if (current >= 0) {
      if (!loaded.has(STATIONS[current].id)) { loaded.add(STATIONS[current].id); changed = true; }
      if (current + 1 < STATIONS.length && !loaded.has(STATIONS[current + 1].id)) {
        loaded.add(STATIONS[current + 1].id); changed = true;
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
    <Suspense fallback={null}>
      {STATIONS.filter(s => loadedRef.current.has(s.id)).map(station => {
        const entry = entries[station.modelIndex];
        if (!entry) return null;
        return (
          <WeaponStation
            key={station.id}
            station={station}
            entry={entry}
          />
        );
      })}
    </Suspense>
  );
}
