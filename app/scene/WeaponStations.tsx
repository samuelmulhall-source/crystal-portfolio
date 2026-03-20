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

import { useState, useRef, useCallback, useEffect, Suspense } from "react";
import { useFrame } from "@react-three/fiber";
import { useFBX } from "@react-three/drei";
import * as THREE from "three";
import { voidState } from "../lib/voidState";
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
  const [renderLoaded, setRenderLoaded] = useState<Set<string>>(new Set());
  const entriesRef = useRef<WorkModelEntry[]>([]);
  const versionRef = useRef(-1);
  const loadedRef = useRef<Set<string>>(new Set());
  const pendingUpdate = useRef(false);

  // Grace period: don't mount ANY stations until either:
  //   a) User scrolls past hero (scrollProgress > 0.05), OR
  //   b) 3 seconds after loading screen dismisses (preloads have had time)
  // This prevents FBX parsing + shader compilation from stuttering the hero.
  const graceRef = useRef(false);

  // Defer FBX preloading until loading screen dismisses — prevents FBX
  // downloads from competing with critical smoke frame loading.
  // Also starts the station-mounting grace timer.
  useEffect(() => {
    const startPreload = () => {
      useFBX.preload(PRELOAD_PATHS[0]);
      PRELOAD_PATHS.slice(1).forEach((path, i) => {
        setTimeout(() => useFBX.preload(path), (i + 1) * 2000);
      });
    };

    const startGraceTimer = () => {
      setTimeout(() => { graceRef.current = true; }, 3000);
    };

    if (loadGate.dismissed) {
      startPreload();
      startGraceTimer();
      return;
    }

    const unsub = loadGate.subscribe(() => {
      if (loadGate.dismissed) {
        unsub();
        // Small delay to let loading screen fadeout finish and scene settle
        setTimeout(startPreload, 400);
        startGraceTimer();
      }
    });
    return unsub;
  }, []);

  const bump = useCallback(() => {
    if (!pendingUpdate.current) {
      pendingUpdate.current = true;
      // Use setTimeout to yield to the browser between the decision to load
      // and the actual React re-render. queueMicrotask runs before paint,
      // which can stack FBX parse into an already-busy frame.
      setTimeout(() => {
        pendingUpdate.current = false;
        setRenderEntries([...entriesRef.current]);
        setRenderLoaded(new Set(loadedRef.current));
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

    // Don't mount stations until user scrolls past hero OR grace period elapsed.
    // Prevents FBX parsing + shader compilation from causing frame drops
    // during the hero presentation.
    const shouldLoad = graceRef.current || voidState.scrollProgress > 0.05;
    if (!shouldLoad) return;

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

  if (renderEntries.length === 0) return null;

  return (
    <>
      {STATIONS.filter(s => renderLoaded.has(s.id)).map(station => {
        const entry = renderEntries.find(e => e.id === station.modelId);
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
