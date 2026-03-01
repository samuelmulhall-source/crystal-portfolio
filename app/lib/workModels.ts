/**
 * Module-level bridge between WorkGrid (DOM) and VoidBackground (Three.js).
 *
 * WorkGrid writes model paths + per-item scroll progress and hover state.
 * VoidBackground reads these in useFrame and renders FBXs inside the void scene.
 * No React re-renders required for hover — reads happen in useFrame.
 */

/** PBR texture map — keys match Three.js MeshStandardMaterial property names. */
export interface TextureSet {
  map?:             string; // albedo / colour
  normalMap?:       string;
  roughnessMap?:    string;
  metalnessMap?:    string;
  transmissionMap?: string;
  alphaMap?:        string;
}

export interface WorkModelEntry {
  id:             string;
  modelPath:      string;
  title:          string;
  category:       string;
  year:           string;
  /** PBR texture paths resolved from the same folder as the model */
  textures:       TextureSet;
  /** 0–1: scrollProgress at which this item's DOM center is at the viewport center */
  scrollProgress: number;
  /** True while the mouse is over the DOM card */
  hovered:        boolean;
  labelSet:       number;
  /** Euler rotation accumulated from drag + auto-spin (radians) */
  rotX:           number;
  rotY:           number;
  /** Post-release angular velocity for momentum (radians per frame, decays each frame) */
  velX:           number;
  velY:           number;
  /** True while the pointer is held down on this item's DOM area */
  isDragging:     boolean;
  /** True if the last pointer sequence involved meaningful movement (suppresses click-to-open) */
  wasDragged:     boolean;
}

export const workModels = {
  entries: [] as WorkModelEntry[],
  /** Incremented whenever entries array changes — VoidBackground polls this */
  version: 0,
  /** ID of the model currently selected in the left-side menu (null = none) */
  activeModelId: null as string | null,
  /** IntersectionObserver ratio (0–1) of the Work section — used to slide the
   *  model into view as the section scrolls into the viewport from below. */
  sectionRatio: 0,
  /** Set by Nav to request a specific tab; WorkSection reads + clears it. */
  pendingTab: null as 'models' | 'videos' | 'images' | null,
  /** When set, expanded view reuses VoidBackground — no new canvas/model. */
  expandedModelId: null as string | null,
};
