"use client";

/**
 * useAudio — React hook for initializing and managing the audio system.
 *
 * Listens for first user gesture (click/touch/keydown) to init AudioContext.
 * Connects ambient drone and modulates volume based on scroll velocity.
 * Plays approach chimes when entering weapon stations.
 */

import { useEffect, useRef } from "react";
import { initAudio, isAudioReady, modulateByScroll } from "./AudioEngine";
import { startDrone, modulateDrone } from "./ambientDrone";
import { playApproachChime } from "./sfx";
import { voidState } from "../voidState";

export function useAudio(): void {
  const lastStationRef = useRef(-1);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Wait for user gesture to init audio
    const onGesture = () => {
      if (isAudioReady()) return;
      initAudio();
      startDrone();
    };

    window.addEventListener("click", onGesture, { once: false });
    window.addEventListener("touchstart", onGesture, { once: false });
    window.addEventListener("keydown", onGesture, { once: false });

    // rAF loop for audio modulation
    const tick = () => {
      if (isAudioReady()) {
        // Scroll velocity modulation
        modulateByScroll(voidState.scrollVel);

        // Drone proximity modulation
        const maxProx = Math.max(...(voidState.stationProximity ?? [0, 0, 0, 0, 0]));
        modulateDrone(maxProx);

        // Approach chime on station entry
        const currentStation = voidState.activeStationIndex;
        if (currentStation >= 0 && currentStation !== lastStationRef.current) {
          playApproachChime(currentStation);
        }
        lastStationRef.current = currentStation;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("click", onGesture);
      window.removeEventListener("touchstart", onGesture);
      window.removeEventListener("keydown", onGesture);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);
}
