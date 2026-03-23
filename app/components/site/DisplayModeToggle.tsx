"use client";

import { useDisplayMode } from "./DisplayModeProvider";

const LABELS = {
  auto: "Auto",
  reduced: "Reduced",
  enhanced: "Enhanced",
} as const;

export function DisplayModeToggle() {
  const { mode, effectiveMode, setMode } = useDisplayMode();

  return (
    <div className="display-toggle" role="group" aria-label="Visual quality mode">
      {(["auto", "reduced", "enhanced"] as const).map((value) => (
        <button
          key={value}
          type="button"
          className={`display-toggle__button${mode === value ? " is-active" : ""}`}
          aria-pressed={mode === value}
          aria-label={
            value === "auto"
              ? `${LABELS[value]} mode, currently rendering ${effectiveMode}`
              : `${LABELS[value]} mode`
          }
          onClick={() => setMode(value)}
        >
          {LABELS[value]}
        </button>
      ))}
    </div>
  );
}
