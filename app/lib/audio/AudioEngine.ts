/**
 * AudioEngine — Web Audio API manager for spatial audio.
 *
 * Singleton pattern matching voidState/workModels convention.
 * User gesture gate: AudioContext only starts after first interaction.
 * Volume modulated by scroll speed for immersive experience.
 *
 * Used by:
 *   - ambientDrone.ts — low-frequency void drone
 *   - sfx.ts — weapon approach chimes, hover clicks, transition swooshes
 */

type AudioState = {
  ctx: AudioContext | null;
  masterGain: GainNode | null;
  initialized: boolean;
  userGestureReceived: boolean;
  muted: boolean;
  masterVolume: number;
};

const audioState: AudioState = {
  ctx: null,
  masterGain: null,
  initialized: false,
  userGestureReceived: false,
  muted: false,
  masterVolume: 0.3,
};

/**
 * Initialize AudioContext on first user interaction.
 * Must be called from a click/touch/keydown handler.
 */
export function initAudio(): AudioContext | null {
  if (audioState.initialized && audioState.ctx) return audioState.ctx;
  if (typeof window === "undefined") return null;

  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const master = ctx.createGain();
    master.gain.value = audioState.masterVolume;
    master.connect(ctx.destination);

    audioState.ctx = ctx;
    audioState.masterGain = master;
    audioState.initialized = true;
    audioState.userGestureReceived = true;

    // Resume if suspended (autoplay policy)
    if (ctx.state === "suspended") {
      ctx.resume();
    }

    return ctx;
  } catch {
    console.warn("[AudioEngine] Web Audio API not available");
    return null;
  }
}

/**
 * Get the AudioContext (null if not yet initialized).
 */
export function getAudioContext(): AudioContext | null {
  return audioState.ctx;
}

/**
 * Get the master GainNode for routing audio.
 */
export function getMasterGain(): GainNode | null {
  return audioState.masterGain;
}

/**
 * Set master volume (0-1).
 */
export function setMasterVolume(vol: number): void {
  audioState.masterVolume = Math.max(0, Math.min(1, vol));
  if (audioState.masterGain) {
    audioState.masterGain.gain.setTargetAtTime(
      audioState.muted ? 0 : audioState.masterVolume,
      audioState.ctx?.currentTime ?? 0,
      0.05,
    );
  }
}

/**
 * Toggle mute on/off.
 */
export function toggleMute(): boolean {
  audioState.muted = !audioState.muted;
  if (audioState.masterGain && audioState.ctx) {
    audioState.masterGain.gain.setTargetAtTime(
      audioState.muted ? 0 : audioState.masterVolume,
      audioState.ctx.currentTime,
      0.05,
    );
  }
  return audioState.muted;
}

/**
 * Check if audio has been initialized (user gesture received).
 */
export function isAudioReady(): boolean {
  return audioState.initialized;
}

/**
 * Modulate master volume based on scroll velocity.
 * Call this from a rAF loop.
 */
export function modulateByScroll(scrollVel: number): void {
  if (!audioState.masterGain || !audioState.ctx || audioState.muted) return;
  // Subtle volume boost during fast scrolling
  const boost = 1 + Math.min(scrollVel * 0.3, 0.4);
  const target = audioState.masterVolume * boost;
  audioState.masterGain.gain.setTargetAtTime(
    Math.min(target, 1),
    audioState.ctx.currentTime,
    0.1,
  );
}
