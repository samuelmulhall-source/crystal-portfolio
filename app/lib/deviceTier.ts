/**
 * Device capability detection — runs once at startup, cached module-level.
 *
 * Tiers:
 *   "low"  — mobile / low RAM / few cores (≤4) / low-end GPU
 *   "mid"  — tablet or mid-range laptop
 *   "high" — desktop with decent GPU
 *
 * Used to scale: star counts, smoke resolution, DPR caps, particle budgets.
 */

export type DeviceTier = "low" | "mid" | "high";

export interface DeviceProfile {
  tier: DeviceTier;
  isMobile: boolean;
  /** Max device pixel ratio to render at */
  maxDpr: number;
  /** Smoke frame folder suffix ("" for desktop, "_m" for mobile) */
  smokeSuffix: string;
  /** Total smoke frames to load */
  smokeFrames: number;
  /** Smoke canvas DPR cap */
  smokeDpr: number;
  /** Eager smoke preload count */
  smokeEager: number;
}

let cached: DeviceProfile | null = null;

function detect(): DeviceProfile {
  if (typeof window === "undefined") {
    // SSR fallback — assume high
    return { tier: "high", isMobile: false, maxDpr: 1.5, smokeSuffix: "", smokeFrames: 200, smokeDpr: 2, smokeEager: 20 };
  }

  const isMobile = window.matchMedia("(max-width: 768px)").matches;
  const isTouch = !window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const cores = navigator.hardwareConcurrency || 4;
  const memory = (navigator as unknown as { deviceMemory?: number }).deviceMemory || 8;
  const dpr = window.devicePixelRatio || 1;

  // GPU check via WebGL renderer string
  let gpuTier: "low" | "mid" | "high" = "mid";
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    if (gl) {
      const ext = (gl as WebGLRenderingContext).getExtension("WEBGL_debug_renderer_info");
      if (ext) {
        const renderer = (gl as WebGLRenderingContext).getParameter(ext.UNMASKED_RENDERER_WEBGL) as string;
        const lower = renderer.toLowerCase();
        // Low-end indicators
        if (/mali-[gt]|adreno\s*(3|4|5[0-2])|powervr|intel\s*(hd|uhd)\s*(4|5|6)[0-9]{2}/i.test(renderer)) {
          gpuTier = "low";
        }
        // High-end indicators
        if (/rtx|rx\s*[567]|radeon\s*(pro|rx)|nvidia.*[34][0-9]{3}|apple\s*m[1-9]/i.test(renderer) || lower.includes("geforce")) {
          gpuTier = "high";
        }
      }
    }
  } catch { /* WebGL unavailable — stay mid */ }

  // Score: 0-6
  let score = 0;
  if (!isMobile && !isTouch) score += 2;
  if (cores >= 8) score += 1;
  if (memory >= 8) score += 1;
  if (gpuTier === "high") score += 2;
  else if (gpuTier === "low") score -= 1;
  if (dpr > 2.5) score -= 1; // Ultra-high DPR = more fill rate needed

  let tier: DeviceTier;
  if (isMobile || isTouch || score <= 1) tier = "low";
  else if (score <= 3) tier = "mid";
  else tier = "high";

  const profile: DeviceProfile = {
    tier,
    isMobile,
    maxDpr: tier === "low" ? 1.0 : tier === "mid" ? 1.5 : 1.5,
    smokeSuffix: tier === "low" ? "_m" : "",
    smokeFrames: 200,
    smokeDpr: tier === "low" ? 1.0 : Math.min(dpr, 2),
    smokeEager: tier === "low" ? 12 : 20,
  };

  if (typeof console !== "undefined") {
    console.log(
      `[deviceTier] ${tier} | cores=${cores} mem=${memory}GB gpu=${gpuTier} mobile=${isMobile} dpr=${dpr.toFixed(1)}`
    );
  }

  return profile;
}

export function getDeviceProfile(): DeviceProfile {
  if (!cached) cached = detect();
  return cached;
}
