import Image from "next/image";
import type { MediaAsset } from "../../lib/content";
import { GlassVideo } from "./GlassVideo";

export function MediaBlock({
  asset,
  priority = false,
  className = "",
}: {
  asset: MediaAsset;
  priority?: boolean;
  className?: string;
}) {
  if (asset.kind === "video") {
    return (
      <div className={`media-block media-block--video ${className}`.trim()}>
        <GlassVideo src={asset.src} poster={asset.poster} />
      </div>
    );
  }

  return (
    <div className={`media-block ${className}`.trim()}>
      <Image
        className="media-block__image"
        src={asset.src}
        alt={asset.alt}
        width={asset.width ?? 1600}
        height={asset.height ?? 1000}
        priority={priority}
        sizes="(max-width: 720px) 100vw, (max-width: 1180px) 85vw, 48vw"
      />
    </div>
  );
}
