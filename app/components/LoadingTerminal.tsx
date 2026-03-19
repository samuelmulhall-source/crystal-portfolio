"use client";

/**
 * LoadingTerminal — premium console boot sequence gated on REAL milestones.
 *
 * Each boot line appears only when:
 *   1. A minimum display time has elapsed (for pacing on fast machines), AND
 *   2. Its readiness gate (if any) has been met by the loading orchestrator.
 *
 * This ensures the scene is genuinely ready — shaders compiled, smoke frames
 * decoded — before the loading screen fades. No more decorative loading
 * followed by stutter.
 *
 * Safety timeout: 10s hard limit forces dismissal regardless.
 */

import { useEffect, useRef, useState } from "react";
import { loadGate } from "../lib/loadingOrchestrator";

type Gate = "sceneWarmed" | "smokeReady" | "allReady" | null;

const BOOT_LINES: { text: string; minTime: number; gate: Gate }[] = [
  { text: "INITIALIZING VOID RENDERER",     minTime: 0,    gate: null },
  { text: "COMPILING STELLAR SHADERS",       minTime: 300,  gate: "sceneWarmed" },
  { text: "MAPPING NAVIGATION SPLINE",       minTime: 600,  gate: null },
  { text: "DECODING NEBULA SEQUENCES",       minTime: 900,  gate: "smokeReady" },
  { text: "CALIBRATING PARALLAX ENGINE",     minTime: 1200, gate: null },
  { text: "CONSOLE ONLINE",                  minTime: 1500, gate: "allReady" },
];

function isGateMet(gate: Gate): boolean {
  if (!gate) return true;
  if (gate === "sceneWarmed") return loadGate.sceneWarmed;
  if (gate === "smokeReady") return loadGate.smokeReady;
  if (gate === "allReady") return loadGate.ready;
  return true;
}

export default function LoadingTerminal() {
  const [visible, setVisible] = useState(true);
  const [fadingOut, setFadingOut] = useState(false);
  const [visibleLines, setVisibleLines] = useState(0);
  const dismissedRef = useRef(false);
  const startTimeRef = useRef(Date.now());

  useEffect(() => {
    const startTime = startTimeRef.current;
    const MAX_WAIT_MS = 10000;

    const dismiss = () => {
      if (dismissedRef.current) return;
      dismissedRef.current = true;
      loadGate.markDismissed();
      setFadingOut(true);
      setTimeout(() => setVisible(false), 800);
    };

    const update = () => {
      if (dismissedRef.current) return;
      const elapsed = Date.now() - startTime;

      // Safety timeout — force dismiss
      if (elapsed > MAX_WAIT_MS) {
        setVisibleLines(BOOT_LINES.length);
        dismiss();
        return;
      }

      // Count how many lines should be visible.
      // Each line requires:
      //   - All previous lines visible
      //   - Minimum elapsed time met
      //   - Readiness gate met (if any)
      let newVisible = 0;
      for (let i = 0; i < BOOT_LINES.length; i++) {
        const line = BOOT_LINES[i];
        if (elapsed < line.minTime) break;
        if (!isGateMet(line.gate)) break;
        newVisible = i + 1;
      }

      setVisibleLines(prev => {
        const next = Math.max(prev, newVisible);

        // All lines shown → dismiss after brief beat
        if (next >= BOOT_LINES.length && !dismissedRef.current) {
          setTimeout(dismiss, 350);
        }

        return next;
      });
    };

    // Poll on interval + re-check when milestones fire
    const interval = setInterval(update, 60);
    const unsub = loadGate.subscribe(update);
    update(); // initial check

    return () => {
      clearInterval(interval);
      unsub();
    };
  }, []);

  if (!visible) return null;

  const progress = Math.min((visibleLines / BOOT_LINES.length) * 100, 100);
  const isComplete = visibleLines >= BOOT_LINES.length;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "#03050c",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "var(--font-geist-mono, 'JetBrains Mono', monospace)",
        color: "#5a8a9a",
        opacity: fadingOut ? 0 : 1,
        transition: "opacity 0.8s ease-out",
        pointerEvents: fadingOut ? "none" : "auto",
      }}
    >
      {/* Subtle CRT scanlines over loading screen */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute", inset: 0,
          background: "repeating-linear-gradient(0deg, transparent 0px, transparent 2px, rgba(0,0,0,0.25) 2px, rgba(0,0,0,0.25) 4px)",
          opacity: 0.06,
          pointerEvents: "none",
        }}
      />

      {/* Console frame */}
      <div
        style={{
          width: "min(92vw, 480px)",
          padding: "2rem 2.2rem",
          border: "1px solid rgba(184, 240, 255, 0.08)",
          borderRadius: "3px",
          background: "linear-gradient(145deg, rgba(8,14,28,0.9) 0%, rgba(4,6,16,0.95) 100%)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04), 0 12px 48px rgba(0,0,10,0.8)",
          position: "relative",
        }}
      >
        {/* System ID header */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "0.6rem",
          marginBottom: "1.4rem",
        }}>
          <span style={{
            fontSize: "0.5rem",
            letterSpacing: "0.28em",
            color: "rgba(184,240,255,0.6)",
          }}>
            ε-9 RECOVERY CONSOLE
          </span>
          <span style={{
            flex: 1,
            height: "1px",
            background: "linear-gradient(90deg, rgba(184,240,255,0.2), transparent)",
          }} />
          <span style={{
            fontSize: "0.42rem",
            letterSpacing: "0.2em",
            color: "rgba(184,240,255,0.25)",
          }}>
            v3.7.1
          </span>
        </div>

        {/* Boot lines */}
        <div style={{ minHeight: "140px" }}>
          {BOOT_LINES.slice(0, visibleLines).map((line, i) => {
            const isCurrent = i === visibleLines - 1;
            const isReady = line.text === "CONSOLE ONLINE";

            return (
              <div
                key={i}
                style={{
                  fontSize: "0.68rem",
                  lineHeight: "1.9",
                  letterSpacing: "0.06em",
                  color: isReady
                    ? "rgba(120,255,160,0.85)"
                    : isCurrent
                    ? "rgba(184,240,255,0.85)"
                    : "rgba(90,138,154,0.65)",
                }}
              >
                <span style={{
                  color: isReady ? "rgba(120,255,160,0.4)" : "rgba(58,90,106,0.6)",
                  marginRight: "0.5rem",
                  fontSize: "0.55rem",
                }}>
                  {String(i).padStart(2, "0")}
                </span>
                {line.text}
                {isCurrent && !isReady && (
                  <span
                    style={{
                      display: "inline-block",
                      width: "5px",
                      height: "11px",
                      background: "rgba(184,240,255,0.7)",
                      marginLeft: "4px",
                      animation: "termBlink 0.8s step-end infinite",
                    }}
                  />
                )}
                {isReady && (
                  <span style={{
                    marginLeft: "0.5rem",
                    fontSize: "0.5rem",
                    color: "rgba(120,255,160,0.4)",
                  }}>
                    ✓
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Progress bar — metallic gradient */}
        <div style={{
          marginTop: "1.2rem",
          height: "2px",
          background: "rgba(184, 240, 255, 0.06)",
          borderRadius: "1px",
          overflow: "hidden",
          position: "relative",
        }}>
          <div style={{
            height: "100%",
            background: isComplete
              ? "linear-gradient(90deg, rgba(120,255,160,0.5), rgba(120,255,160,0.2))"
              : "linear-gradient(90deg, rgba(184,240,255,0.6), rgba(184,240,255,0.4), rgba(184,240,255,0.15))",
            width: `${progress}%`,
            transition: "width 0.35s ease-out, background 0.5s ease",
          }} />
        </div>

        {/* Footer system status */}
        <div style={{
          marginTop: "0.8rem",
          display: "flex",
          justifyContent: "space-between",
          fontSize: "0.4rem",
          letterSpacing: "0.2em",
          color: "rgba(184,240,255,0.2)",
        }}>
          <span>MULTISCATTER</span>
          <span>{Math.round(progress)}%</span>
        </div>
      </div>

      {/* Blink keyframes */}
      <style jsx>{`
        @keyframes termBlink {
          0%, 50% { opacity: 1; }
          51%, 100% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}
