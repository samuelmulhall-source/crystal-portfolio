"use client";

/**
 * StationInfo — orchestrator for in-world HUD per weapon station.
 *
 * Groups WeaponLabel + ScanLines for a single station.
 * Rendered by VoidScene for each station.
 */

import WeaponLabel from "./WeaponLabel";
import ScanLines from "./ScanLines";
import type { WeaponStation } from "../../lib/journeyConfig";

interface Props {
  station: WeaponStation;
  stationIndex: number;
}

export default function StationInfo({ station, stationIndex }: Props) {
  return (
    <group>
      <ScanLines station={station} stationIndex={stationIndex} />
      <WeaponLabel station={station} stationIndex={stationIndex} />
    </group>
  );
}
