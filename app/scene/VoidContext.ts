"use client";

import { createContext } from "react";

type LayerConfig = readonly {
  count: number;
  rMin: number;
  rMax: number;
  rotSpd: number;
  size: number;
  seed: number;
}[];

const LAYERS_DESKTOP = [
  { count: 1800, rMin: 14, rMax: 30, rotSpd: 0.007, size: 0.22, seed: 11111 },
  { count: 1400, rMin: 26, rMax: 44, rotSpd: 0.011, size: 0.28, seed: 22222 },
  { count:  900, rMin: 36, rMax: 58, rotSpd: 0.017, size: 0.36, seed: 33333 },
] as const;

export type { LayerConfig };
export { LAYERS_DESKTOP };

export const VoidContext = createContext<{ isMobile: boolean; layers: LayerConfig }>({
  isMobile: false,
  layers: LAYERS_DESKTOP,
});
