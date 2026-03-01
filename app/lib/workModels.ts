/**
 * Module-level bridge between WorkGrid (DOM) and VoidBackground (Three.js).
 *
 * WorkGrid writes model paths + per-item scroll progress and hover state.
 * VoidBackground reads these in useFrame and renders FBXs inside the void scene.
 * No React re-renders required for hover — reads happen in useFrame.
 *
 * Event emission: expandedModelId and pendingTab changes emit events so React
 * components can subscribe instead of polling with setInterval.
 */

type WorkModelsListener = () => void;
const expandedListeners = new Set<WorkModelsListener>();
const pendingTabListeners = new Set<WorkModelsListener>();

export function subscribeExpanded(fn: WorkModelsListener) {
  expandedListeners.add(fn);
  return () => expandedListeners.delete(fn);
}
export function subscribePendingTab(fn: WorkModelsListener) {
  pendingTabListeners.add(fn);
  return () => pendingTabListeners.delete(fn);
}
function emitExpanded() {
  expandedListeners.forEach((fn) => fn());
}
function emitPendingTab() {
  pendingTabListeners.forEach((fn) => fn());
}

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

  /** Set expandedModelId and notify subscribers (avoids setInterval polling). */
  setExpandedModelId(id: string | null) {
    if (this.expandedModelId === id) return;
    this.expandedModelId = id;
    emitExpanded();
  },
  /** Set pendingTab and notify subscribers. */
  setPendingTab(tab: 'models' | 'videos' | 'images' | null) {
    if (this.pendingTab === tab) return;
    this.pendingTab = tab;
    emitPendingTab();
  },
  /** Reset state on unmount/hot-reload to avoid stale accumulation. */
  reset() {
    this.entries = [];
    this.version = 0;
    this.activeModelId = null;
    this.pendingTab = null;
    this.expandedModelId = null;
  },
};
