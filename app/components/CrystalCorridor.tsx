"use client";

/**
 * CrystalCorridor — pre-rendered PNG layer system for the hero crystal stairway.
 *
 * Three layers composited over the starfield canvas:
 *   1. Back smoke (behind pillars)
 *   2. Crystal steps (the pillar corridor)
 *   3. Front smoke (foreground fog)
 *
 * Scroll-driven parallax: each layer scales/translates at a different rate
 * to simulate the camera pushing forward through the corridor.
 *
 * Layers fade out by scrollProgress ~0.20, revealing the starfield void.
 */

import { useEffect, useRef, useState } from "react";
import { voidState } from "../lib/voidState";

/** Scroll fraction at which the corridor is fully invisible */
const CORRIDOR_END = 0.22;

interface LayerDef {
  src: string;
  alt: string;
  /** Scale multiplier per unit of corridorProgress */
  scaleRate: number;
  /** TranslateY rate (% of viewport) per unit of corridorProgress */
  translateYRate: number;
  /** Mouse parallax magnitude in px */
  parallaxPx: number;
  /** Scroll fraction at which layer starts fading */
  fadeStart: number;
  /** Scroll fraction at which layer is fully transparent */
  fadeEnd: number;
  /** z-index order within the corridor stack */
  z: number;
}

const LAYERS: LayerDef[] = [
  {
    src: "/hero/Back_smoke_still.png",
    alt: "Volumetric cloud backdrop",
    scaleRate: 0.3,
    translateYRate: -5,
    parallaxPx: 3,
    fadeStart: 0.12,
    fadeEnd: 0.20,
    z: 1,
  },
  {
    src: "/hero/crystalsteps.png",
    alt: "Crystal pillar corridor",
    scaleRate: 0.6,
    translateYRate: -10,
    parallaxPx: 6,
    fadeStart: 0.14,
    fadeEnd: 0.22,
    z: 2,
  },
  {
    src: "/hero/Front_smoke_still.png",
    alt: "Foreground fog layer",
    scaleRate: 1.2,
    translateYRate: -20,
    parallaxPx: 10,
    fadeStart: 0.08,
    fadeEnd: 0.18,
    z: 3,
  },
];

export default function CrystalCorridor() {
  const [mounted, setMounted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const layerRefs = useRef<(HTMLImageElement | null)[]>([]);
  const rafRef = useRef(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    const tick = () => {
      rafRef.current = requestAnimationFrame(tick);

      const p = voidState.scrollProgress;
      if (p > CORRIDOR_END + 0.05) {
        // Past corridor — hide container entirely for perf
        if (containerRef.current) containerRef.current.style.display = "none";
        return;
      }
      if (containerRef.current) containerRef.current.style.display = "";

      const mx = voidState.mouseNX; // -1..+1
      const my = voidState.mouseNY; // -1..+1

      for (let i = 0; i < LAYERS.length; i++) {
        const el = layerRefs.current[i];
        if (!el) continue;

        const layer = LAYERS[i];

        // Scroll-driven parallax
        const corridorP = Math.min(p / CORRIDOR_END, 1);
        const scale = 1 + corridorP * layer.scaleRate;
        const ty = corridorP * layer.translateYRate; // vh units

        // Mouse parallax
        const px = mx * layer.parallaxPx;
        const py = my * layer.parallaxPx * 0.5;

        // Opacity fade
        let opacity = 1;
        if (p >= layer.fadeStart) {
          opacity = Math.max(0, 1 - (p - layer.fadeStart) / (layer.fadeEnd - layer.fadeStart));
        }

        el.style.transform = `translate(${px}px, calc(${ty}vh + ${py}px)) scale(${scale})`;
        el.style.opacity = String(opacity);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [mounted]);

  if (!mounted) return null;

  return (
    <div
      ref={containerRef}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1,
        pointerEvents: "none",
        overflow: "hidden",
      }}
      aria-hidden="true"
    >
      {LAYERS.map((layer, i) => (
        <img
          key={layer.src}
          ref={(el) => { layerRefs.current[i] = el; }}
          src={layer.src}
          alt={layer.alt}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: "center bottom",
            zIndex: layer.z,
            willChange: "transform, opacity",
            transformOrigin: "center center",
          }}
          loading="eager"
          draggable={false}
        />
      ))}
    </div>
  );
}
