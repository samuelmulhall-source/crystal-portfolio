/**
 * Shared module-level state updated by DOM events and consumed by
 * Three.js useFrame callbacks without triggering React re-renders.
 *
 * hoverSlots / meteorSlots are written by Three.js components (in useFrame)
 * and read by the EffectsOverlay 2D canvas to draw holographic glow and
 * meteor trails. This decouples visual quality from Three.js material limits.
 */
export const voidState = {
  ready:          false,   // set true by VoidBackground after first rendered frame
  firstModelReady: false,  // set when first model opacity > 0.3 (canvas + first FBX loaded)
  mouseNX:        0,       // cursor NDC-X  (−1..+1, +1 = right)
  mouseNY:        0,       // cursor screen-Y (−1..+1, +1 = bottom — INVERTED vs NDC)
  scrollProgress: 0,       // 0 (top) → 1 (bottom of page)
  isOnPage:       false,   // false when cursor leaves the document
  mouseVel:       0,       // cursor speed in NDC units / second (decays in VoidMotion)
  scrollVel:      0,       // scroll speed in progress units / second (decays in VoidMotion)

  // ── Hover star screen positions ──────────────────────────────────────────
  // Written by StarHoverSystem (inside Three.js canvas, has camera access).
  // Read by EffectsOverlay (2D canvas) to draw holographic crystal glow.
  hoverSlots: Array.from({ length: 14 }, () => ({
    ease:    0,  // 0→1 lerped, drives glow opacity + size
    sx:      0,  // screen X px
    sy:      0,  // screen Y px
    hue:     195, // cycling hue degrees (195=ice-cyan → 250=violet)
    variant: 0,  // 0–5: which of the 6 symbol shapes to draw (stable per star)
  })),

  // ── Meteor screen positions ───────────────────────────────────────────────
  // Written by ShootingStars (inside Three.js canvas).
  // Read by EffectsOverlay to draw gradient comet trail + head spark.
  meteorSlots: Array.from({ length: 5 }, () => ({
    active: false,
    env:    0,    // lifecycle envelope 0→1→0
    hsx:    0,    // head screen X px
    hsy:    0,    // head screen Y px
    tsx:    0,    // tail screen X px
    tsy:    0,    // tail screen Y px
  })),

  // ── Active model screen region ────────────────────────────────────────────
  // Written by the active VoidModel each frame. EffectsOverlay and
  // StarHoverSystem suppress hover effects inside this circle.
  modelRegion: { x: 0, y: 0, rPx: 0 },

  // ── Model entrance progress ───────────────────────────────────────────────
  // Written by VoidModel's useFrame as the model materialises (0=start, 1=done).
  // Read by EffectsOverlay to draw the scan-line sweep.
  modelEntranceProgress: 0,
};
