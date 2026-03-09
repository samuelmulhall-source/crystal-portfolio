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

/**
 * Play a short click sound for hover interactions.
 */
export function playHoverClick(): void {
  const ctx = getAudioContext();
  const master = getMasterGain();
  if (!ctx || !master) return;

  const now = ctx.currentTime;

  // Filtered noise burst
  const bufferSize = ctx.sampleRate * 0.05; // 50ms
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.15));
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 3000;
  filter.Q.value = 3;

  const gain = ctx.createGain();
  gain.gain.value = 0.04;

  source.connect(filter);
  filter.connect(gain);
  gain.connect(master);

  source.start(now);
}

/**
 * Play a swoosh sound for station transitions.
 */
export function playTransitionSwoosh(): void {
  const ctx = getAudioContext();
  const master = getMasterGain();
  if (!ctx || !master) return;

  const now = ctx.currentTime;
  const duration = 0.6;

  // Noise source
  const bufferSize = ctx.sampleRate * duration;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;

  // Sweeping filter
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(200, now);
  filter.frequency.exponentialRampToValueAtTime(4000, now + duration * 0.5);
  filter.frequency.exponentialRampToValueAtTime(200, now + duration);
  filter.Q.value = 2;

  // Envelope
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.05, now + 0.05);
  gain.gain.setValueAtTime(0.05, now + duration * 0.4);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  source.connect(filter);
  filter.connect(gain);
  gain.connect(master);

  source.start(now);
  source.stop(now + duration);
}
