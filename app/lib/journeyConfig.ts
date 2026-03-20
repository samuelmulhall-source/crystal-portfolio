/**
 * Journey configuration: weapon station definitions and camera spline control points.
 *
 * Z-Forward Journey: camera starts at the crystal corridor entrance (z=14),
 * flies forward through the corridor into the starfield, visiting weapon
 * stations placed along the -Z axis. Ends with a downward drop to About/Contact.
 *
 * TWO DISTINCT PHASES per model:
 *   1. TRANSIT (2% scroll) — camera warps through space, hyperspace star streaks
 *   2. STATION (15% scroll) — camera LOCKED on model, centered, well-framed
 *
 * A scroll→spline remap compresses transit into tiny scroll windows (camera
 * flies fast) and expands stations into wide scroll windows (camera barely moves).
 */

export interface WeaponStation {
  /** Kebab-case unique ID matching data.json model entry */
  id: string;
  /** Model entry ID from workModels (e.g. "proj-0") */
  modelId: string;
  /** Index into data.json models array */
  modelIndex: number;
  /** Direct FBX path — authoritative, bypasses entries lookup */
  modelPath: string;
  /** PBR texture paths — hardcoded from data.json, no entries dependency */
  textures: {
    map?: string;
    normalMap?: string;
    roughnessMap?: string;
    metalnessMap?: string;
    transmissionMap?: string;
  };
  /** Fixed world position [x, y, z] */
  worldPosition: [number, number, number];
  /** Narrative name displayed in HUD */
  loreName: string;
  /** Short lore tagline */
  loreTag: string;
  /** Technical spec line for HUD display */
  loreSpec: string;
  /** Station designation (e.g. "STATION 01") */
  designation: string;
  /** Scroll fraction (0-1) where this station begins */
  scrollStart: number;
  /** Scroll fraction (0-1) where this station ends */
  scrollEnd: number;
  /** Optimal scroll fraction where the camera frames the model best. */
  scrollViewCenter: number;
}

/**
 * Five weapon stations placed along the Z-forward corridor.
 * Each station gets 15% of scroll — wide locked-in viewing windows.
 * Transits between are compressed to 2% — dramatic warp travel.
 *
 * Layout:
 *   Hero:      0.00 – 0.07  (7%)
 *   Transit 1: 0.07 – 0.09  (2%)
 *   Station 1: 0.09 – 0.24  (15%)  ← TORCH
 *   Transit 2: 0.24 – 0.26  (2%)
 *   Station 2: 0.26 – 0.41  (15%)  ← DAGGER
 *   Transit 3: 0.41 – 0.43  (2%)
 *   Station 3: 0.43 – 0.58  (15%)  ← SHIELD
 *   Transit 4: 0.58 – 0.60  (2%)
 *   Station 4: 0.60 – 0.75  (15%)  ← SWORD
 *   Transit 5: 0.75 – 0.77  (2%)
 *   Station 5: 0.77 – 0.90  (13%)  ← BOW
 *   About:     0.90 – 1.00  (10%)
 */
export const STATIONS: WeaponStation[] = [
  {
    id: "torch",
    modelId: "proj-0",
    modelIndex: 0,
    modelPath: "/models/Torch/torch.fbx",
    textures: {
      map: "/models/Torch/Torch_color.webp",
      metalnessMap: "/models/Torch/torch_metallic.webp",
      normalMap: "/models/Torch/torch_normal.webp",
      roughnessMap: "/models/Torch/torch_roughness.webp",
    },
    worldPosition: [5, 0, -20],
    loreName: "TORCH",
    loreTag: "Hand-crafted fantasy torch — layered metal wrap",
    loreSpec: "PBR PIPELINE: COLOUR · METALNESS · ROUGHNESS · NORMAL",
    designation: "STATION 01",
    scrollStart: 0.09,
    scrollEnd: 0.24,
    scrollViewCenter: 0.165,
  },
  {
    id: "ornate-dagger",
    modelId: "proj-2",
    modelIndex: 2,
    modelPath: "/models/Weapons/Ornate Dagger/Ornate Dagger.fbx",
    textures: {
      map: "/models/Weapons/Ornate Dagger/ornate_dagger_color.webp",
      metalnessMap: "/models/Weapons/Ornate Dagger/ornate_dagger_metallic.webp",
      normalMap: "/models/Weapons/Ornate Dagger/ornate_dagger_normal.webp",
      roughnessMap: "/models/Weapons/Ornate Dagger/ornate_dagger_roughness.webp",
    },
    worldPosition: [-5, 0, -45],
    loreName: "ORNATE DAGGER",
    loreTag: "Ceremonial dagger — filigree crossguard, gemstone pommel",
    loreSpec: "TEXTURE DENSITY: 4K MAPS · CHASED SURFACE DETAIL",
    designation: "STATION 02",
    scrollStart: 0.26,
    scrollEnd: 0.41,
    scrollViewCenter: 0.335,
  },
  {
    id: "shield",
    modelId: "proj-3",
    modelIndex: 3,
    modelPath: "/models/Weapons/Shield/Shield.fbx",
    textures: {
      map: "/models/Weapons/Shield/Shield_color.webp",
      metalnessMap: "/models/Weapons/Shield/Shield_metallic.webp",
      normalMap: "/models/Weapons/Shield/Shield_normal.webp",
      roughnessMap: "/models/Weapons/Shield/shield_roughness.webp",
    },
    worldPosition: [4.5, 0, -70],
    loreName: "SHIELD",
    loreTag: "Kite shield — riveted iron rim, aged leather facing",
    loreSpec: "SURFACE: BAKED WEAR · NORMAL + ROUGHNESS CHANNELS",
    designation: "STATION 03",
    scrollStart: 0.43,
    scrollEnd: 0.58,
    scrollViewCenter: 0.505,
  },
  {
    id: "sword",
    modelId: "proj-4",
    modelIndex: 4,
    modelPath: "/models/Weapons/Sword/sword.fbx",
    textures: {
      map: "/models/Weapons/Sword/sword_color.webp",
      metalnessMap: "/models/Weapons/Sword/sword_metallic.webp",
      normalMap: "/models/Weapons/Sword/sword_normal.webp",
      roughnessMap: "/models/Weapons/Sword/sword_roughness.webp",
      transmissionMap: "/models/Weapons/Sword/sword_transmission.webp",
    },
    worldPosition: [-4.5, 0, -95],
    loreName: "SWORD",
    loreTag: "Arming sword — glass-and-metal guard, translucent blade",
    loreSpec: "MATERIAL: TRANSMISSION MAP · CRYSTAL FULLER REFRACTION",
    designation: "STATION 04",
    scrollStart: 0.60,
    scrollEnd: 0.75,
    scrollViewCenter: 0.675,
  },
  {
    id: "bow",
    modelId: "proj-1",
    modelIndex: 1,
    modelPath: "/models/Weapons/bow/Bow.fbx",
    textures: {
      map: "/models/Weapons/bow/bow_color.webp",
      normalMap: "/models/Weapons/bow/bow_normal.webp",
      roughnessMap: "/models/Weapons/bow/bow_roughness.webp",
    },
    worldPosition: [4, 0, -120],
    loreName: "BOW",
    loreTag: "Recurve longbow — laminated limbs, sinew wrapping",
    loreSpec: "TOPOLOGY: GAME-READY · HERO-ASSET RESOLUTION",
    designation: "STATION 05",
    scrollStart: 0.77,
    scrollEnd: 0.90,
    scrollViewCenter: 0.835,
  },
];

/** Total page height in viewport units — increased for more physical scroll room */
export const TOTAL_SCROLL_VH = 900;

/**
 * Camera position spline control points.
 * Centripetal CatmullRom — naturally smooth through all points.
 *
 * Z-forward journey: camera starts at z=14 (corridor entrance),
 * pushes through to z=-130, then drops Y for the about/contact zone.
 *
 * NOTE: The scroll→spline remap in cameraSpline.ts controls HOW FAST
 * the camera traverses this path. Stations get slow traversal (locked),
 * transits get fast traversal (warp). The control points define the
 * physical path only.
 */
export const CAMERA_POSITION_POINTS: [number, number, number][] = [
  // ── Corridor Hero ──────────────────────────────────────────────────────
  [0, 0, 14],
  [0, 0, 10],

  // ── Corridor Transit: push through corridor ────────────────────────────
  [0, 0, 4],
  [0, 0, -5],

  // ── Station 1: Torch at [5, 0, -20] ───────────────────────────────────
  [1.2, 0, -14],       // approach — gentle lean toward model
  [1.2, 0.2, -20],     // viewing — 3.8 units from model
  [0.4, 0, -26],       // exit — drift back to center

  // ── Transit to Station 2 ──────────────────────────────────────────────
  [0, 0, -33],

  // ── Station 2: Dagger at [-5, 0, -45] ─────────────────────────────────
  [-1.2, 0, -38],      // approach
  [-1.2, 0.2, -45],    // viewing — 3.8 units from model
  [-0.4, 0, -51],      // exit

  // ── Transit to Station 3 ──────────────────────────────────────────────
  [0, 0, -58],

  // ── Station 3: Shield at [4.5, 0, -70] ─────────────────────────────────
  [1.0, 0, -64],       // approach
  [1.0, 0.2, -70],     // viewing — 3.5 units from model
  [0.3, 0, -76],       // exit

  // ── Transit to Station 4 ──────────────────────────────────────────────
  [0, 0, -83],

  // ── Station 4: Sword at [-4.5, 0, -95] ─────────────────────────────────
  [-1.0, 0, -89],      // approach
  [-1.0, 0.2, -95],    // viewing — 3.5 units from model
  [-0.3, 0, -101],     // exit

  // ── Transit to Station 5 ──────────────────────────────────────────────
  [0, 0, -108],

  // ── Station 5: Bow at [4, 0, -120] ─────────────────────────────────────
  [0.5, 0, -114],      // approach
  [0.5, 0.2, -120],    // viewing — 3.5 units from model
  [0, 0, -125],        // exit

  // ── About / Contact zone ───────────────────────────────────────────────
  [0, -4, -126],       // start descending
  [0, -10, -130],      // about zone — camera looking down into void
];

/**
 * Camera lookAt spline control points.
 * Targets weapon world positions during stations, forward horizon during transits.
 */
export const CAMERA_LOOKAT_POINTS: [number, number, number][] = [
  // ── Corridor Hero ─────────────────────────────────────────────────────
  [0, 0, 0],
  [0, 0, -4],

  // ── Corridor Transit ───────────────────────────────────────────────────
  [0, 0, -10],
  [0, 0, -18],

  // ── Station 1: Torch at [5, 0, -20] ──────────────────────────────────
  [5, 0, -20],
  [5, 0, -20],
  [1.5, 0, -30],      // blend toward next

  // ── Transit ──────────────────────────────────────────────────────────
  [-2.5, 0, -42],

  // ── Station 2: Dagger at [-5, 0, -45] ────────────────────────────────
  [-5, 0, -45],
  [-5, 0, -45],
  [-1.5, 0, -55],

  // ── Transit ──────────────────────────────────────────────────────────
  [2.5, 0, -66],

  // ── Station 3: Shield at [4.5, 0, -70] ──────────────────────────────
  [4.5, 0, -70],
  [4.5, 0, -70],
  [1, 0, -80],

  // ── Transit ──────────────────────────────────────────────────────────
  [-2.5, 0, -90],

  // ── Station 4: Sword at [-4.5, 0, -95] ──────────────────────────────
  [-4.5, 0, -95],
  [-4.5, 0, -95],
  [-1, 0, -105],

  // ── Transit ──────────────────────────────────────────────────────────
  [2, 0, -115],

  // ── Station 5: Bow at [4, 0, -120] ───────────────────────────────────
  [4, 0, -120],
  [4, 0, -120],
  [1, -1, -125],

  // ── About zone ──────────────────────────────────────────────────────
  [0, -6, -128],
  [0, -12, -132],
];

/**
 * Find which station the camera is nearest to (or -1 during transit).
 */
export function findActiveStation(scrollProgress: number): number {
  for (let i = 0; i < STATIONS.length; i++) {
    const s = STATIONS[i];
    if (scrollProgress >= s.scrollStart && scrollProgress <= s.scrollEnd) {
      return i;
    }
  }
  return -1;
}

/**
 * Compute proximity (0-1) of scrollProgress to a given station.
 * 1.0 = at the centre of the station's range.
 * 0.0 = outside the station's range.
 * Uses smoothstep for clean transitions.
 */
export function getStationProximity(
  scrollProgress: number,
  station: WeaponStation,
): number {
  if (scrollProgress < station.scrollStart || scrollProgress > station.scrollEnd)
    return 0;
  const mid = station.scrollViewCenter;
  const halfRange = (station.scrollEnd - station.scrollStart) / 2;
  const dist = Math.abs(scrollProgress - mid) / halfRange;
  const t = Math.max(0, 1 - dist);
  return t * t * (3 - 2 * t);
}

/**
 * Narrow station focus used for "lock-in" behavior.
 * Much tighter than general station proximity so arrival reads clearly.
 * This is aligned to the parked hold zone, not the full station range.
 */
export function getStationFocusProximity(
  scrollProgress: number,
  station: WeaponStation,
): number {
  const halfRange = (station.scrollEnd - station.scrollStart) / 2;
  const focusHalfRange = Math.max(halfRange * 0.56, 0.04);
  const dist = Math.abs(scrollProgress - station.scrollViewCenter) / focusHalfRange;
  const t = Math.max(0, 1 - dist);
  return t * t * (3 - 2 * t);
}
