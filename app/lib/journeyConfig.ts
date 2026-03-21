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

export type JourneyMode = "hero" | "transit" | "station" | "about";

export interface JourneyPhase {
  mode: JourneyMode;
  stationIndex: number;
  phaseProgress: number;
}

const JOURNEY_PHASES = 12;
export const HERO_SCROLL_END = 1 / JOURNEY_PHASES;
export const ABOUT_SCROLL_START = 11 / JOURNEY_PHASES;

/**
 * Five weapon stations placed along the Z-forward corridor.
 * Each station gets 15% of scroll — wide locked-in viewing windows.
 * Transits between are compressed to 2% — dramatic warp travel.
 *
 * Layout is now viewport-snapped:
 *   Hero      0/12 → 1/12
 *   Transit   1/12 → 2/12
 *   Station 1 2/12 → 3/12
 *   Transit   3/12 → 4/12
 *   Station 2 4/12 → 5/12
 *   Transit   5/12 → 6/12
 *   Station 3 6/12 → 7/12
 *   Transit   7/12 → 8/12
 *   Station 4 8/12 → 9/12
 *   Transit   9/12 → 10/12
 *   Station 5 10/12 → 11/12
 *   About     11/12 → 1
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
    worldPosition: [0, 0, -20],
    loreName: "TORCH",
    loreTag: "Hand-crafted fantasy torch — layered metal wrap",
    loreSpec: "PBR PIPELINE: COLOUR · METALNESS · ROUGHNESS · NORMAL",
    designation: "STATION 01",
    scrollStart: 2 / JOURNEY_PHASES,
    scrollEnd: 3 / JOURNEY_PHASES,
    scrollViewCenter: 2.5 / JOURNEY_PHASES,
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
    worldPosition: [0, 0, -45],
    loreName: "ORNATE DAGGER",
    loreTag: "Ceremonial dagger — filigree crossguard, gemstone pommel",
    loreSpec: "TEXTURE DENSITY: 4K MAPS · CHASED SURFACE DETAIL",
    designation: "STATION 02",
    scrollStart: 4 / JOURNEY_PHASES,
    scrollEnd: 5 / JOURNEY_PHASES,
    scrollViewCenter: 4.5 / JOURNEY_PHASES,
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
    worldPosition: [0, 0, -70],
    loreName: "SHIELD",
    loreTag: "Kite shield — riveted iron rim, aged leather facing",
    loreSpec: "SURFACE: BAKED WEAR · NORMAL + ROUGHNESS CHANNELS",
    designation: "STATION 03",
    scrollStart: 6 / JOURNEY_PHASES,
    scrollEnd: 7 / JOURNEY_PHASES,
    scrollViewCenter: 6.5 / JOURNEY_PHASES,
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
    worldPosition: [0, 0, -95],
    loreName: "SWORD",
    loreTag: "Arming sword — glass-and-metal guard, translucent blade",
    loreSpec: "MATERIAL: TRANSMISSION MAP · CRYSTAL FULLER REFRACTION",
    designation: "STATION 04",
    scrollStart: 8 / JOURNEY_PHASES,
    scrollEnd: 9 / JOURNEY_PHASES,
    scrollViewCenter: 8.5 / JOURNEY_PHASES,
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
    worldPosition: [0, 0, -120],
    loreName: "BOW",
    loreTag: "Recurve longbow — laminated limbs, sinew wrapping",
    loreSpec: "TOPOLOGY: GAME-READY · HERO-ASSET RESOLUTION",
    designation: "STATION 05",
    scrollStart: 10 / JOURNEY_PHASES,
    scrollEnd: 11 / JOURNEY_PHASES,
    scrollViewCenter: 10.5 / JOURNEY_PHASES,
  },
];

/** Total scroll height in viewport units for the snapped journey track. */
export const TOTAL_SCROLL_VH = JOURNEY_PHASES * 100;

export function getJourneyScrollMetrics() {
  if (typeof window === "undefined" || typeof document === "undefined") return null;
  const journey = document.getElementById("journey");
  if (!journey) return null;
  const rect = journey.getBoundingClientRect();
  const start = window.scrollY + rect.top;
  const max = Math.max(journey.offsetHeight - window.innerHeight, 1);
  return { start, max };
}

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
  [0.0, 0.10, -12.5],  // approach — align to frontal presentation
  [0.0, 0.18, -14.0],  // viewing — locked, centered frame
  [0.0, 0.05, -26.0],  // exit — clear the model plane before transit

  // ── Transit to Station 2 ──────────────────────────────────────────────
  [0, 0, -32],

  // ── Station 2: Dagger at [-5, 0, -45] ─────────────────────────────────
  [0.0, 0.10, -37.5],  // approach
  [0.0, 0.18, -39.0],  // viewing — frontal frame
  [0.0, 0.05, -51.0],  // exit

  // ── Transit to Station 3 ──────────────────────────────────────────────
  [0, 0, -57],

  // ── Station 3: Shield at [4.5, 0, -70] ─────────────────────────────────
  [0.0, 0.10, -62.5],  // approach
  [0.0, 0.18, -64.0],  // viewing
  [0.0, 0.05, -76.0],  // exit

  // ── Transit to Station 4 ──────────────────────────────────────────────
  [0, 0, -82],

  // ── Station 4: Sword at [-4.5, 0, -95] ─────────────────────────────────
  [0.0, 0.10, -87.5],  // approach
  [0.0, 0.18, -89.0],  // viewing
  [0.0, 0.05, -101.0], // exit

  // ── Transit to Station 5 ──────────────────────────────────────────────
  [0, 0, -107],

  // ── Station 5: Bow at [4, 0, -120] ─────────────────────────────────────
  [0.0, 0.10, -112.5], // approach
  [0.0, 0.18, -114.0], // viewing
  [0.0, 0.00, -126.0], // exit

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
  [0, 0, -20],
  [0, 0, -20],
  [0, 0, -32],        // blend toward next

  // ── Transit ──────────────────────────────────────────────────────────
  [0, 0, -40],

  // ── Station 2: Dagger at [-5, 0, -45] ────────────────────────────────
  [0, 0, -45],
  [0, 0, -45],
  [0, 0, -57],

  // ── Transit ──────────────────────────────────────────────────────────
  [0, 0, -65],

  // ── Station 3: Shield at [4.5, 0, -70] ──────────────────────────────
  [0, 0, -70],
  [0, 0, -70],
  [0, 0, -82],

  // ── Transit ──────────────────────────────────────────────────────────
  [0, 0, -90],

  // ── Station 4: Sword at [-4.5, 0, -95] ──────────────────────────────
  [0, 0, -95],
  [0, 0, -95],
  [0, 0, -107],

  // ── Transit ──────────────────────────────────────────────────────────
  [0, 0, -115],

  // ── Station 5: Bow at [4, 0, -120] ───────────────────────────────────
  [0, 0, -120],
  [0, 0, -120],
  [0, -1, -127],

  // ── About zone ──────────────────────────────────────────────────────
  [0, -6, -128],
  [0, -12, -132],
];

/**
 * Find which station the camera is nearest to (or -1 during transit).
 */
export function findActiveStation(scrollProgress: number): number {
  const phase = getJourneyPhase(scrollProgress);
  return phase.mode === "station" ? phase.stationIndex : -1;
}

export function getJourneyPhase(scrollProgress: number): JourneyPhase {
  const t = Math.max(0, Math.min(1, scrollProgress));

  if (t <= HERO_SCROLL_END) {
    return {
      mode: "hero",
      stationIndex: -1,
      phaseProgress: t / Math.max(HERO_SCROLL_END, 0.0001),
    };
  }

  let previousEnd = HERO_SCROLL_END;
  for (let i = 0; i < STATIONS.length; i++) {
    const station = STATIONS[i];
    if (t < station.scrollStart) {
      return {
        mode: "transit",
        stationIndex: i,
        phaseProgress: (t - previousEnd) / Math.max(station.scrollStart - previousEnd, 0.0001),
      };
    }
    if (t <= station.scrollEnd) {
      return {
        mode: "station",
        stationIndex: i,
        phaseProgress: (t - station.scrollStart) / Math.max(station.scrollEnd - station.scrollStart, 0.0001),
      };
    }
    previousEnd = station.scrollEnd;
  }

  if (t < ABOUT_SCROLL_START) {
    return {
      mode: "transit",
      stationIndex: STATIONS.length,
      phaseProgress: (t - previousEnd) / Math.max(ABOUT_SCROLL_START - previousEnd, 0.0001),
    };
  }

  return {
    mode: "about",
    stationIndex: -1,
    phaseProgress: (t - ABOUT_SCROLL_START) / Math.max(1 - ABOUT_SCROLL_START, 0.0001),
  };
}

/**
 * Compute proximity (0-1) of scrollProgress to a given station.
 * Station state is binary by design: either locked on the model or not.
 */
export function getStationProximity(
  scrollProgress: number,
  station: WeaponStation,
): number {
  const phase = getJourneyPhase(scrollProgress);
  return phase.mode === "station" && STATIONS[phase.stationIndex]?.id === station.id ? 1 : 0;
}

/**
 * Focus matches station lock. There is no soft focus band anymore.
 */
export function getStationFocusProximity(
  scrollProgress: number,
  station: WeaponStation,
): number {
  return getStationProximity(scrollProgress, station);
}
