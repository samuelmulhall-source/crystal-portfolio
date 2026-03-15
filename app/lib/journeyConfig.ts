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
    worldPosition: [3, 0, -20],
    loreName: "THE IGNIS CORE",
    loreTag: "Deep-space navigation vessel",
    loreSpec: "THERMAL OUTPUT: 4.2 × 10⁷ K",
    designation: "STATION 01",
    scrollStart: 0.18,
    scrollEnd: 0.30,
  },
  {
    id: "ornate-dagger",
    modelId: "proj-2",
    modelIndex: 2,
    worldPosition: [-3, 0, -45],
    loreName: "VOID-SLIVER",
    loreTag: "Collapsed star matter blade",
    loreSpec: "DENSITY: 2.8 × 10¹⁴ kg/m³",
    designation: "STATION 02",
    scrollStart: 0.32,
    scrollEnd: 0.44,
  },
  {
    id: "shield",
    modelId: "proj-3",
    modelIndex: 3,
    worldPosition: [2, 0, -70],
    loreName: "NEBULA AEGIS",
    loreTag: "Reactive starfield mirror",
    loreSpec: "REFLECTIVITY: 99.97% λ 380-780nm",
    designation: "STATION 03",
    scrollStart: 0.46,
    scrollEnd: 0.58,
  },
  {
    id: "sword",
    modelId: "proj-4",
    modelIndex: 4,
    worldPosition: [-2, 0, -95],
    loreName: "EVENT HORIZON",
    loreTag: "Gravitational-lensing edge",
    loreSpec: "CURVATURE: Δg 10⁶ m/s² ACROSS EDGE",
    designation: "STATION 04",
    scrollStart: 0.60,
    scrollEnd: 0.72,
  },
  {
    id: "bow",
    modelId: "proj-1",
    modelIndex: 1,
    worldPosition: [0, 0, -120],
    loreName: "PHOTON STRINGER",
    loreTag: "Concentrated light launcher",
    loreSpec: "YIELD: 3.1 × 10²⁶ W FOCUSED BEAM",
    designation: "STATION 05",
    scrollStart: 0.74,
    scrollEnd: 0.86,
  },
];

/** Total page height in viewport units to accommodate the full journey */
export const TOTAL_SCROLL_VH = 900;

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

  // ── Station 1: Torch at [3, 0, -20] (scroll 0.18-0.30) ───────────────
  [1, 0, -12],       // approach
  [7, 1.5, -19],      // orbit offset right-up
  [0, -0.8, -23],     // orbit offset left-down

  // ── Transit to Station 2 ──────────────────────────────────────────────
  [0, 0, -32],

  // ── Station 2: Dagger at [-3, 0, -45] (scroll 0.32-0.44) ─────────────
  [-1, 0, -38],       // approach
  [-7, 1.5, -44],      // orbit offset left-up
  [0, -0.8, -48],      // orbit offset right-down

  // ── Transit to Station 3 ──────────────────────────────────────────────
  [0, 0, -57],

  // ── Station 3: Shield at [2, 0, -70] (scroll 0.46-0.58) ──────────────
  [1, 0, -63],        // approach
  [6, 1.5, -69],       // orbit offset right-up
  [-1, -0.8, -73],     // orbit offset left-down

  // ── Transit to Station 4 ──────────────────────────────────────────────
  [0, 0, -82],

  // ── Station 4: Sword at [-2, 0, -95] (scroll 0.60-0.72) ──────────────
  [-1, 0, -88],       // approach
  [-6, 1.5, -94],      // orbit offset left-up
  [1, -0.8, -98],      // orbit offset right-down

  // ── Transit to Station 5 ──────────────────────────────────────────────
  [0, 0, -107],

  // ── Station 5: Bow at [0, 0, -120] (scroll 0.74-0.86) ────────────────
  [0, 0, -113],       // approach
  [5, 1.5, -119],      // orbit offset right-up
  [-3, -0.8, -123],    // orbit offset left-down

  // ── About / Contact zone (scroll 0.86-1.0) ───────────────────────────
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

  // ── Corridor Transit — looking forward ────────────────────────────────
  [0, 0, -10],
  [0, 0, -15],

  // ── Station 1: Torch at [3, 0, -20] ──────────────────────────────────
  [3, 0, -20],
  [3, 0, -20],
  [3, 0, -20],

  // ── Transit — look ahead ──────────────────────────────────────────────
  [0, 0, -40],

  // ── Station 2: Dagger at [-3, 0, -45] ────────────────────────────────
  [-3, 0, -45],
  [-3, 0, -45],
  [-3, 0, -45],

  // ── Transit ───────────────────────────────────────────────────────────
  [0, 0, -65],

  // ── Station 3: Shield at [2, 0, -70] ─────────────────────────────────
  [2, 0, -70],
  [2, 0, -70],
  [2, 0, -70],

  // ── Transit ───────────────────────────────────────────────────────────
  [0, 0, -90],

  // ── Station 4: Sword at [-2, 0, -95] ─────────────────────────────────
  [-2, 0, -95],
  [-2, 0, -95],
  [-2, 0, -95],

  // ── Transit ───────────────────────────────────────────────────────────
  [0, 0, -115],

  // ── Station 5: Bow at [0, 0, -120] ───────────────────────────────────
  [0, 0, -120],
  [0, 0, -120],
  [0, 0, -120],

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
