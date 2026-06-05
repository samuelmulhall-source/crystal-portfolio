"use client";

import Image from "next/image";
import type { MediaAsset } from "../../lib/content";
import { useDisplayMode } from "./DisplayModeProvider";
import { useQuality } from "./QualityProvider";

export function SpecimenPreview({
  posterAsset,
  motionAsset,
  alphaSrc,
  priority = false,
}: {
  posterAsset: MediaAsset;
  motionAsset: MediaAsset;
  /** Optional alpha (VP9 webm) source served first; mp4 is the fallback. */
  alphaSrc?: string;
  priority?: boolean;
}) {
  const { effectiveMode } = useDisplayMode();
  const { tier } = useQuality();
  // At Lite (tier 1) skip video decode entirely and show the poster image.
  const shouldAnimate = tier >= 2 && effectiveMode === "enhanced" && motionAsset.kind === "video";

  if (shouldAnimate && motionAsset.kind === "video") {
    return (
      <div className="specimen-preview">
        <video
          className="specimen-preview__media"
          autoPlay
          loop
          muted
          playsInline
          preload="metadata"
          poster={motionAsset.poster ?? posterAsset.src}
        >
          {alphaSrc ? <source src={alphaSrc} type="video/webm" /> : null}
          <source src={motionAsset.src} type="video/mp4" />
        </video>
      </div>
    );
  }

  const imageAsset = motionAsset.kind === "image" ? motionAsset : posterAsset;

  return (
    <div className="specimen-preview">
      <Image
        className="specimen-preview__media"
        src={imageAsset.src}
        alt={imageAsset.alt}
        width={imageAsset.width ?? 1600}
        height={imageAsset.height ?? 1200}
        priority={priority}
        sizes="(max-width: 720px) 100vw, (max-width: 1180px) 42vw, 34vw"
      />
    </div>
  );
}
