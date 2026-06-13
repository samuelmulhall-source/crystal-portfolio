"use client";

/**
 * PackViewer — detail-page browser for collection entries (asset packs).
 *
 * A selector row of the pack's named assets above the full technical
 * inspector (SpecimenViewer with zoom enabled). Selection is lightweight
 * client state; everything else stays server-rendered.
 */

import { useState } from "react";
import type { PackAsset } from "../../lib/content";
import { SpecimenViewer } from "./SpecimenViewer";

export function PackViewer({ assets, packTitle }: { assets: PackAsset[]; packTitle: string }) {
  const [activeId, setActiveId] = useState(assets[0]?.id);
  const active = assets.find((a) => a.id === activeId) ?? assets[0];

  if (!active) return null;

  return (
    <div className="pack-viewer">
      <div className="pack-viewer__select" role="group" aria-label={`${packTitle} assets`}>
        {assets.map((asset) => (
          <button
            key={asset.id}
            type="button"
            className={`pack-viewer__pill${asset.id === active.id ? " is-active" : ""}`}
            onClick={() => setActiveId(asset.id)}
            aria-pressed={asset.id === active.id}
          >
            {asset.title}
          </button>
        ))}
      </div>

      <SpecimenViewer
        specimen={active.specimen}
        alt={`${active.title} interactive 3D model`}
        allowZoom
      />

      {active.summary ? <p className="pack-viewer__note">{active.summary}</p> : null}
    </div>
  );
}
