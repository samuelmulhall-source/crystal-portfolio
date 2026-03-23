export type DisplayMode = "auto" | "reduced" | "enhanced";
export type EffectiveDisplayMode = "reduced" | "enhanced";

export const DISPLAY_MODE_STORAGE_KEY = "multiscatter-display-mode";

export function parseDisplayMode(value: string | null | undefined): DisplayMode | null {
  if (value === "auto" || value === "reduced" || value === "enhanced") {
    return value;
  }

  return null;
}

export function detectEffectiveDisplayMode(
  preferred: DisplayMode,
  constraints?: {
    enhancedMinDeviceMemory?: number;
    enhancedMinHardwareConcurrency?: number;
  },
): EffectiveDisplayMode {
  if (preferred === "reduced") return "reduced";
  if (preferred === "enhanced") return "enhanced";

  if (typeof window === "undefined") return "enhanced";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const saveData = Boolean(
    (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData,
  );
  const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  const hardwareConcurrency = navigator.hardwareConcurrency ?? 8;

  if (reduceMotion || saveData) return "reduced";
  if (deviceMemory < (constraints?.enhancedMinDeviceMemory ?? 8)) return "reduced";
  if (hardwareConcurrency < (constraints?.enhancedMinHardwareConcurrency ?? 8)) return "reduced";

  return "enhanced";
}
