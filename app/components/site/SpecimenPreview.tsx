"use client";

import Image from "next/image";
import type { MediaAsset } from "../../lib/content";
import { useDisplayMode } from "./DisplayModeProvider";

export function SpecimenPreview({
  posterAsset,
  motionAsset,
  priority = false,
}: {
  posterAsset: MediaAsset;
  motionAsset: MediaAsset;
  priority?: boolean;
}) {
  const { effectiveMode } = useDisplayMode();
  const shouldAnimate = effectiveMode === "enhanced" && motionAsset.kind === "video";

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
          <source src={motionAsset.src} />
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
