/**
 * Loading orchestrator — tracks real asset-readiness milestones.
 *
 * The loading screen gates on these milestones so the user never sees
 * an under-prepared scene. Each milestone maps to a boot-line in the
 * loading terminal, giving genuine progress feedback.
 *
 * Milestones:
 *   sceneWarmed — Three.js rendered 5+ frames (GPU shaders compiled)
 *   smokeReady  — CrystalCorridor eager smoke frames decoded
 *   dismissed   — Loading terminal has started its fadeout
 *
 * `ready` = sceneWarmed AND smokeReady. Loading screen fades only when
 * ready is true (with a minimum display time for polish).
 */

import { voidState } from "./voidState";

export const loadGate = {
  sceneWarmed: false,
  smokeReady: false,
  dismissed: false,

  /** All critical milestones met — safe to reveal scene */
  get ready(): boolean {
    return this.sceneWarmed && this.smokeReady;
  },

  // ── Subscriber pattern ───────────────────────────────────────────────────
  _cbs: new Set<() => void>(),

  subscribe(fn: () => void): () => void {
    this._cbs.add(fn);
    return () => { this._cbs.delete(fn); };
  },

  _emit(): void {
    // Side-effect: sync legacy firstModelReady flag when all gates met
    if (this.ready) voidState.firstModelReady = true;
    this._cbs.forEach(fn => fn());
  },

  // ── Milestone setters ────────────────────────────────────────────────────
  markSceneWarmed(): void {
    if (!this.sceneWarmed) { this.sceneWarmed = true; this._emit(); }
  },

  markSmokeReady(): void {
    if (!this.smokeReady) { this.smokeReady = true; this._emit(); }
  },

  markDismissed(): void {
    if (!this.dismissed) { this.dismissed = true; this._emit(); }
  },
};
