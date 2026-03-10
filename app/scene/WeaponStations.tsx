"use client";

/**
 * WeaponStations — orchestrator that lazy-loads weapon models
 * based on camera proximity. Pre-loads 1 station ahead.
 */

import { useState, useRef, Suspense } from "react";
import { useFrame } from "@react-three/fiber";
import { voidState } from "../lib/voidState";
import { workModels, type WorkModelEntry } from "../lib/workModels";
import { STATIONS } from "../lib/journeyConfig";
import WeaponStation from "./WeaponStation";

export default function WeaponStations() {
  const [loadedStations, setLoadedStations] = useState<Set<string>>(new Set());
  const [entries, setEntries] = useState<WorkModelEntry[]>([]);
  const versionRef = useRef(-1);

  useFrame(() => {
    // Sync entries from workModels
    if (workModels.version !== versionRef.current) {
      versionRef.current = workModels.version;
      setEntries([...workModels.entries]);
    }

    // Determine which stations to load
    const current = voidState.activeStationIndex;
    const expanded = workModels.expandedModelId;
    const toLoad = new Set(loadedStations);

    // Always load first station
    toLoad.add(STATIONS[0].id);

    // Load current station
    if (current >= 0) toLoad.add(STATIONS[current].id);

    // Pre-load adjacent stations
    if (current >= 0 && current + 1 < STATIONS.length) toLoad.add(STATIONS[current + 1].id);
    if (current > 0) toLoad.add(STATIONS[current - 1].id);

    // Load expanded station
    if (expanded) {
      const expandedStation = STATIONS.find(s => s.modelId === expanded || s.id === expanded);
      if (expandedStation) toLoad.add(expandedStation.id);
    }

    if (toLoad.size !== loadedStations.size) setLoadedStations(toLoad);
  });

  if (entries.length === 0) return null;

  return (
    <Suspense fallback={null}>
      {STATIONS.filter(s => loadedStations.has(s.id)).map(station => {
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
