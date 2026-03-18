/**
 * SFX — procedural sound effects for interactions.
 *
 * All sounds are procedurally generated (no audio files needed):
 *   - Weapon approach: ascending chime (sine + harmonic)
 *   - Hover click: short filtered noise burst
 *   - Transition swoosh: filtered noise sweep
 *
 * Uses AudioEngine for routing through master gain.
 */

import { getAudioContext, getMasterGain } from "./AudioEngine";

/**
 * Play a crystalline chime when approaching a weapon station.
 * @param stationIndex  0-4, used to vary the pitch
 */
export function playApproachChime(stationIndex: number): void {
  const ctx = getAudioContext();
  const master = getMasterGain();
  if (!ctx || !master) return;

  const now = ctx.currentTime;
  const baseFreq = 440 + stationIndex * 80; // Each station has a different pitch

  // Main tone
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.value = baseFreq;

  // Harmonic overtone
  const osc2 = ctx.createOscillator();
  osc2.type = "sine";
  osc2.frequency.value = baseFreq * 1.5; // Perfect fifth

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.06, now + 0.05);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);

  const gain2 = ctx.createGain();
  gain2.gain.setValueAtTime(0, now);
  gain2.gain.linearRampToValueAtTime(0.03, now + 0.05);
  gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.8);

  osc.connect(gain);
  osc2.connect(gain2);
  gain.connect(master);
  gain2.connect(master);

  osc.start(now);
  osc2.start(now);
  osc.stop(now + 1.5);
  osc2.stop(now + 1.0);
}

