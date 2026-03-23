"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  DISPLAY_MODE_STORAGE_KEY,
  type DisplayMode,
  type EffectiveDisplayMode,
  detectEffectiveDisplayMode,
  parseDisplayMode,
} from "../../lib/display-mode";

interface DisplayModeContextValue {
  mode: DisplayMode;
  effectiveMode: EffectiveDisplayMode;
  setMode: (mode: DisplayMode) => void;
}

const DisplayModeContext = createContext<DisplayModeContextValue | null>(null);

export function DisplayModeProvider({
  children,
  enhancedMinDeviceMemory,
  enhancedMinHardwareConcurrency,
}: {
  children: React.ReactNode;
  enhancedMinDeviceMemory: number;
  enhancedMinHardwareConcurrency: number;
}) {
  const queryOverride =
    typeof window === "undefined"
      ? null
      : parseDisplayMode(new URLSearchParams(window.location.search).get("displayMode"));
  const [mode, setMode] = useState<DisplayMode>(() => {
    if (typeof window === "undefined") return "auto";

    const queryMode = parseDisplayMode(new URLSearchParams(window.location.search).get("displayMode"));
    if (queryMode) {
      return queryMode;
    }

    const stored = parseDisplayMode(window.localStorage.getItem(DISPLAY_MODE_STORAGE_KEY));
    if (stored) {
      return stored;
    }

    return "auto";
  });

  const effectiveMode: EffectiveDisplayMode = useMemo(
    () =>
      detectEffectiveDisplayMode(mode, {
        enhancedMinDeviceMemory,
        enhancedMinHardwareConcurrency,
      }),
    [enhancedMinDeviceMemory, enhancedMinHardwareConcurrency, mode],
  );

  useEffect(() => {
    document.documentElement.dataset.displayPreference = mode;
    document.documentElement.dataset.displayMode = effectiveMode;
    if (!queryOverride) {
      window.localStorage.setItem(DISPLAY_MODE_STORAGE_KEY, mode);
    }
  }, [effectiveMode, mode, queryOverride]);

  const value = useMemo(
    () => ({
      mode,
      effectiveMode,
      setMode,
    }),
    [effectiveMode, mode],
  );

  return (
    <DisplayModeContext.Provider value={value}>
      {children}
    </DisplayModeContext.Provider>
  );
}

export function useDisplayMode() {
  const context = useContext(DisplayModeContext);
  if (!context) {
    throw new Error("useDisplayMode must be used inside DisplayModeProvider");
  }
  return context;
}
