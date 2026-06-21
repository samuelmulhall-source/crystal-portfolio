"use client";

/**
 * GlassRefraction — real backdrop refraction for the glass UI chrome.
 *
 * An SVG feDisplacementMap warps whatever sits behind the glass, giving a true
 * IOR-like bend instead of a flat frost. It only renders correctly in Chromium;
 * Safari/Firefox drop or mis-render url() filters inside backdrop-filter, so we
 * feature-gate it and otherwise fall back to the plain clear-glass blur.
 *
 * Wiring: the glass rules read `backdrop-filter: var(--glass-refract, ) blur(…)`.
 * The empty fallback means lightningcss never sees a url() literal (which it
 * would strip), and SSR / unsupported browsers get plain glass. When supported,
 * this sets --glass-refract to the filter ref at runtime and the bend kicks in.
 */

import { useEffect } from "react";

const FILTER_ID = "ms-glass-refraction";

export default function GlassRefraction() {
  useEffect(() => {
    // url() inside backdrop-filter only renders properly in Chromium. CSS.supports
    // covers the capability; the engine check keeps WebKit/Gecko on the fallback
    // even if they report partial support (where it renders wrong).
    const ua = navigator.userAgent;
    const isChromium = /Chrome|Chromium|Edg\//.test(ua) && !/Firefox|FxiOS|CriOS|EdgiOS/.test(ua);
    const supportsUrlBackdrop =
      (typeof CSS !== "undefined" &&
        (CSS.supports?.("backdrop-filter", "url(#a) blur(1px)") ||
          CSS.supports?.("-webkit-backdrop-filter", "url(#a) blur(1px)"))) ||
      false;

    if (isChromium && supportsUrlBackdrop) {
      document.documentElement.style.setProperty("--glass-refract", `url(#${FILTER_ID})`);
    }
  }, []);

  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="0"
      height="0"
      style={{ position: "absolute", width: 0, height: 0, overflow: "hidden", pointerEvents: "none" }}
    >
      <defs>
        {/* Smooth, low-frequency displacement → gentle "thick glass" bend rather
            than watery noise. Subtle on purpose; it's chrome, not a lava lamp. */}
        <filter
          id={FILTER_ID}
          x="-25%"
          y="-25%"
          width="150%"
          height="150%"
          colorInterpolationFilters="sRGB"
        >
          <feTurbulence type="fractalNoise" baseFrequency="0.005" numOctaves="2" seed="11" result="noise" />
          <feGaussianBlur in="noise" stdDeviation="2.5" result="softNoise" />
          <feDisplacementMap
            in="SourceGraphic"
            in2="softNoise"
            scale="9"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </defs>
    </svg>
  );
}
