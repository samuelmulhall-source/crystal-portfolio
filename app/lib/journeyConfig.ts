/**
 * Journey configuration: weapon station definitions and camera spline control points.
 *
 * Z-Forward Journey: camera starts at the crystal corridor entrance (z=14),
 * flies forward through the corridor into the starfield, visiting weapon
 * stations placed along the -Z axis. Ends with a downward drop to About/Contact.
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
  /** Optimal scroll fraction where the camera frames the model best.
   *  Computed from the CatmullRom spline — NOT the arithmetic midpoint. */
  scrollViewCenter: number;
}

/**
 * Five weapon stations placed along the Z-forward corridor.
 * Alternating slight X offsets create a gentle weave as the camera travels.
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
    scrollStart: 0.18,
    scrollEnd: 0.28,
    scrollViewCenter: 0.23,
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
    scrollStart: 0.32,
    scrollEnd: 0.42,
    scrollViewCenter: 0.37,
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
    scrollStart: 0.46,
    scrollEnd: 0.56,
    scrollViewCenter: 0.51,
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
    scrollEnd: 0.70,
    scrollViewCenter: 0.65,
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
    scrollStart: 0.74,
    scrollEnd: 0.84,
    scrollViewCenter: 0.79,
  },
];

/** Total page height in viewport units to accommodate the full journey */
export const TOTAL_SCROLL_VH = 700;

/**
 * Camera position spline control points.
 * Centripetal CatmullRom — naturally smooth through all points.
 *
 * Z-forward journey: camera starts at z=14 (corridor entrance),
 * pushes through to z=-130, then drops Y for the about/contact zone.
 */
export const CAMERA_POSITION_POINTS: [number, number, number][] = [
  // ── Corridor Hero (scroll 0.00-0.12) ──────────────────────────────────
  [0, 0, 14],
  [0, 0, 10],

  // ── Corridor Transit (scroll 0.12-0.18): push through corridor ────────
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

  // ── About / Contact zone (scroll 0.87-1.0) ───────────────────────────
  [0, -4, -126],       // start descending
  [0, -10, -130],      // about zone — camera looking down into void
];

/**
 * Camera lookAt spline control points.
 * Targets weapon world positions during stations, forward horizon during transits.
 */
export const CAMERA_LOOKAT_POINTS: [number, number, number][] = [
  // ── Corridor Hero — looking forward into the corridor ─────────────────
  [0, 0, 0],
  [0, 0, -4],

  // ── Corridor Transit — looking forward toward first station ───────────
  [0, 0, -10],
  [0, 0, -18],

  // ── Station 1: Torch at [5, 0, -20] ──────────────────────────────────
  [5, 0, -20],
  [5, 0, -20],
  [1.5, 0, -30],      // blend toward next

  // ── Transit — look ahead ──────────────────────────────────────────────
  [-2.5, 0, -42],

  // ── Station 2: Dagger at [-5, 0, -45] ────────────────────────────────
  [-5, 0, -45],
  [-5, 0, -45],
  [-1.5, 0, -55],

  // ── Transit ───────────────────────────────────────────────────────────
  [2.5, 0, -66],

  // ── Station 3: Shield at [4.5, 0, -70] ──────────────────────────────
  [4.5, 0, -70],
  [4.5, 0, -70],
  [1, 0, -80],

  // ── Transit ───────────────────────────────────────────────────────────
  [-2.5, 0, -90],

  // ── Station 4: Sword at [-4.5, 0, -95] ──────────────────────────────
  [-4.5, 0, -95],
  [-4.5, 0, -95],
  [-1, 0, -105],

  // ── Transit ───────────────────────────────────────────────────────────
  [2, 0, -115],

  // ── Station 5: Bow at [4, 0, -120] ───────────────────────────────────
  [4, 0, -120],
  [4, 0, -120],
  [1, -1, -125],

  // ── About zone — looking down into void ──────────────────────────────
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
 */
export function getStationProximity(
  scrollProgress: number,
  station: WeaponStation,
): number {
  if (scrollProgress < station.scrollStart || scrollProgress > station.scrollEnd)
    return 0;
  const mid = (station.scrollStart + station.scrollEnd) / 2;
  const halfRange = (station.scrollEnd - station.scrollStart) / 2;
  const dist = Math.abs(scrollProgress - mid) / halfRange;
  return 1 - dist;
}
