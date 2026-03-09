/**
 * Ambient drone — low-frequency void background sound.
 *
 * Procedural oscillator-based drone:
 *   - 2 detuned sine oscillators (40Hz base, ±2Hz)
 *   - Slow LFO modulating filter cutoff (breathing effect)
 *   - Very subtle — barely audible, felt more than heard
 *
 * Starts on first user interaction via AudioEngine.
 */

import { getAudioContext, getMasterGain } from "./AudioEngine";

let droneGain: GainNode | null = null;
let osc1: OscillatorNode | null = null;
let osc2: OscillatorNode | null = null;
let lfo: OscillatorNode | null = null;
let filter: BiquadFilterNode | null = null;
let isPlaying = false;

/**
 * Start the ambient drone.
 * Safe to call multiple times — only starts once.
 */
export function startDrone(): void {
  if (isPlaying) return;
  const ctx = getAudioContext();
  const master = getMasterGain();
  if (!ctx || !master) return;

  // Low-pass filter with LFO-modulated cutoff
  filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 120;
  filter.Q.value = 1.5;

  // LFO: slow modulation of filter cutoff
  lfo = ctx.createOscillator();
  lfo.frequency.value = 0.08; // Very slow breathing
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 60; // ±60Hz cutoff sweep
  lfo.connect(lfoGain);
  lfoGain.connect(filter.frequency);
  lfo.start();

  // Main oscillators — detuned pair for thickness
  osc1 = ctx.createOscillator();
  osc1.type = "sine";
  osc1.frequency.value = 40;
  osc1.detune.value = -2;

  osc2 = ctx.createOscillator();
  osc2.type = "sine";
  osc2.frequency.value = 40;
  osc2.detune.value = 2;

  // Drone gain — very quiet
  droneGain = ctx.createGain();
  droneGain.gain.value = 0;

  // Chain: oscillators → filter → droneGain → master
  osc1.connect(filter);
  osc2.connect(filter);
  filter.connect(droneGain);
  droneGain.connect(master);

  // Start oscillators
  osc1.start();
  osc2.start();

  // Fade in slowly
  droneGain.gain.setTargetAtTime(0.12, ctx.currentTime, 2.0);

  isPlaying = true;
}

/**
 * Stop the ambient drone.
 */
export function stopDrone(): void {
  if (!isPlaying) return;
  const ctx = getAudioContext();

  if (droneGain && ctx) {
    droneGain.gain.setTargetAtTime(0, ctx.currentTime, 0.5);
  }

  // Clean up after fade out
  setTimeout(() => {
    osc1?.stop();
    osc2?.stop();
    lfo?.stop();
    osc1?.disconnect();
    osc2?.disconnect();
    lfo?.disconnect();
    filter?.disconnect();
    droneGain?.disconnect();
    osc1 = null;
    osc2 = null;
    lfo = null;
    filter = null;
    droneGain = null;
    isPlaying = false;
  }, 2000);
}

/**
 * Modulate drone based on camera proximity to a weapon.
 * Deeper resonance when near weapons.
 */
export function modulateDrone(proximity: number): void {
  if (!filter || !droneGain || !isPlaying) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  // Increase filter cutoff near weapons (more harmonics audible)
  const cutoff = 120 + proximity * 200;
  filter.frequency.setTargetAtTime(cutoff, ctx.currentTime, 0.3);

  // Slightly louder near weapons
  const vol = 0.12 + proximity * 0.08;
  droneGain.gain.setTargetAtTime(vol, ctx.currentTime, 0.3);
}
