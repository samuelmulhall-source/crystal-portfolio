/**
 * Journey configuration: weapon station definitions and camera spline control points.
 *
 * Each weapon is placed at a fixed world position along the camera's scroll path.
 * The camera visits stations in sequence as the user scrolls. Scroll ranges define
 * when each weapon is "active" (camera orbiting nearby).
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
  /** Scroll fraction (0-1) where this station begins */
  scrollStart: number;
  /** Scroll fraction (0-1) where this station ends */
  scrollEnd: number;
}

/**
 * Five weapon stations placed in a descending spiral through the void.
 * Alternating left/right creates a dramatic camera weave.
 */
export const STATIONS: WeaponStation[] = [
  {
    id: "torch",
    modelId: "proj-0",
    modelIndex: 0,
    worldPosition: [8, -8, 0],
    loreName: "THE IGNIS CORE",
    loreTag: "Deep-space navigation vessel",
    scrollStart: 0.12,
    scrollEnd: 0.24,
  },
  {
    id: "ornate-dagger",
    modelId: "proj-2",
    modelIndex: 2,
    worldPosition: [-7, -20, 0],
    loreName: "VOID-SLIVER",
    loreTag: "Collapsed star matter blade",
    scrollStart: 0.26,
    scrollEnd: 0.38,
  },
  {
    id: "shield",
    modelId: "proj-3",
    modelIndex: 3,
    worldPosition: [6, -32, 0],
    loreName: "NEBULA AEGIS",
    loreTag: "Reactive starfield mirror",
    scrollStart: 0.40,
    scrollEnd: 0.52,
  },
  {
    id: "sword",
    modelId: "proj-4",
    modelIndex: 4,
    worldPosition: [-8, -44, 0],
    loreName: "EVENT HORIZON",
    loreTag: "Gravitational-lensing edge",
    scrollStart: 0.54,
    scrollEnd: 0.66,
  },
  {
    id: "bow",
    modelId: "proj-1",
    modelIndex: 1,
    worldPosition: [0, -56, 0],
    loreName: "PHOTON STRINGER",
    loreTag: "Concentrated light launcher",
    scrollStart: 0.68,
    scrollEnd: 0.80,
  },
];

/** Total page height in viewport units to accommodate the full journey */
export const TOTAL_SCROLL_VH = 800;

/**
 * Camera position spline control points.
 * Centripetal CatmullRom — naturally smooth through all points.
 * The camera starts at hero position and weaves between weapon stations.
 */
export const CAMERA_POSITION_POINTS: [number, number, number][] = [
  // Hero region (scroll 0-0.10)
  [0, 0, 14],
  [0, -2, 12],

  // Approach Torch (scroll ~0.12)
  [4, -5, 8],
  // Orbit Torch at (8, -8, 0)
  [6, -7, 5],
  [10, -9, 4],
  [6, -8, 6],

  // Transit to Dagger
  [0, -14, 8],

  // Orbit Dagger at (-7, -20, 0)
  [-4, -18, 5],
  [-9, -21, 4],
  [-5, -20, 6],

  // Transit to Shield
  [0, -26, 8],

  // Orbit Shield at (6, -32, 0)
  [3, -30, 5],
  [8, -33, 4],
  [4, -32, 6],

  // Transit to Sword
  [0, -38, 8],

  // Orbit Sword at (-8, -44, 0)
  [-5, -42, 5],
  [-10, -45, 4],
  [-6, -44, 6],

  // Transit to Bow
  [0, -50, 8],

  // Orbit Bow at (0, -56, 0)
  [-2, -54, 5],
  [2, -57, 4],
  [0, -56, 6],

  // End / About section
  [0, -60, 10],
];

/**
 * Camera lookAt spline control points.
 * Parallels the position spline but targets weapon world positions during stations
 * and void center during transits.
 */
export const CAMERA_LOOKAT_POINTS: [number, number, number][] = [
  // Hero — looking at origin
  [0, 0, 0],
  [0, -2, 0],

  // Approaching Torch — start turning toward it
  [6, -7, 0],
  // At Torch
  [8, -8, 0],
  [8, -8, 0],
  [8, -8, 0],

  // Transit — look ahead
  [0, -16, 0],

  // At Dagger
  [-7, -20, 0],
  [-7, -20, 0],
  [-7, -20, 0],

  // Transit
  [0, -28, 0],

  // At Shield
  [6, -32, 0],
  [6, -32, 0],
  [6, -32, 0],

  // Transit
  [0, -40, 0],

  // At Sword
  [-8, -44, 0],
  [-8, -44, 0],
  [-8, -44, 0],

  // Transit
  [0, -52, 0],

  // At Bow
  [0, -56, 0],
  [0, -56, 0],
  [0, -56, 0],

  // End
  [0, -60, 0],
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
