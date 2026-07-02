"use client";

import Image from "next/image";
import { useEffect, useRef, useSyncExternalStore } from "react";
import type { MediaAsset } from "../../lib/content";
import { useDisplayMode } from "./DisplayModeProvider";
import { useQuality } from "./QualityProvider";

const noopSubscribe = () => () => {};

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
  // false on the server + first hydration pass — the server can't know the
  // tier/display mode, so it always renders the poster and the video upgrades
  // in after mount (also paints the poster faster).
  const isClient = useSyncExternalStore(noopSubscribe, () => true, () => false);
  // At Lite (tier 1) skip video decode entirely and show the poster image.
  const shouldAnimate =
    isClient && tier >= 2 && effectiveMode === "enhanced" && motionAsset.kind === "video";

  // Keep the looping clip alive. Browsers pause muted-autoplay video once it
  // scrolls out of view — and the pinned hero transforms the asset off-screen
  // during the dive — then don't reliably resume, which left the lantern frozen
  // mid-animation (it "cut off" early vs the source). Resume when the clip
  // COMES BACK on screen or the tab is re-shown — but never fight a pause that
  // lands while the clip is visible: that one is deliberate (browser
  // power-saving UI, a media-control extension, OS media keys) and auto-
  // replaying it makes the motion un-stoppable (WCAG 2.2.2).
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    let visible = false;
    const play = () => {
      v.play().catch(() => {});
    };
    play();
    const io = new IntersectionObserver(
      (entries) => {
        const nowVisible = entries.some((e) => e.isIntersecting);
        const cameBack = nowVisible && !visible;
        visible = nowVisible;
        if (cameBack && v.paused) play();
      },
      { threshold: 0.05 },
    );
    io.observe(v);
    const onVisibility = () => {
      if (!document.hidden && visible && v.paused) play();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [shouldAnimate]);

  if (shouldAnimate && motionAsset.kind === "video") {
    return (
      <div className="specimen-preview">
        <video
          ref={videoRef}
          className="specimen-preview__media"
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          poster={motionAsset.poster ?? posterAsset.src}
          // Decorative loop: no accessible name of its own — the poster's alt
          // (reduced tiers) and the HeroSpecimenCue link name the object.
          aria-hidden="true"
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
