"use client";

/**
 * AudioController — mounts the audio system.
 *
 * Renders nothing. Initializes Web Audio on first user gesture,
 * starts ambient drone, and plays approach chimes on station entry.
 */

import { useAudio } from "../lib/audio/useAudio";

export default function AudioController() {
  useAudio();
  return null;
}
