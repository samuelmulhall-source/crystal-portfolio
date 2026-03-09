"use client";

/**
 * LoadingTerminal — sci-fi diagnostic loading screen.
 *
 * Monospace terminal aesthetic with animated readout lines, a progress bar,
 * and fake system diagnostics. Fades out once the first model is visible.
 *
 * Uses voidState.firstModelReady to detect when loading is complete.
 */

import { useEffect, useRef, useState } from "react";
import { voidState } from "../lib/voidState";

const BOOT_LINES = [
  { text: "INITIALIZING VOID RENDERER...", delay: 0 },
  { text: "MAPPING STELLAR COORDINATES...", delay: 400 },
  { text: "CALIBRATING NAVIGATION SPLINE...", delay: 800 },
  { text: "LOADING ARTIFACT GEOMETRY...", delay: 1200 },
  { text: "ESTABLISHING NEBULA FIELD...", delay: 1600 },
  { text: "SYSTEM READY", delay: 2000 },
];

export default function LoadingTerminal() {
  const [visible, setVisible] = useState(true);
  const [fadingOut, setFadingOut] = useState(false);
  const [visibleLines, setVisibleLines] = useState(0);
  const checkRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Animate boot lines
  useEffect(() => {
    BOOT_LINES.forEach((line, i) => {
      setTimeout(() => setVisibleLines(i + 1), line.delay);
    });
  }, []);

  // Check for model ready
  useEffect(() => {
    checkRef.current = setInterval(() => {
      if (voidState.firstModelReady) {
        setFadingOut(true);
        setTimeout(() => setVisible(false), 800);
        if (checkRef.current) clearInterval(checkRef.current);
      }
    }, 100);
    return () => {
      if (checkRef.current) clearInterval(checkRef.current);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "#05070f",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        color: "#5a8a9a",
        opacity: fadingOut ? 0 : 1,
        transition: "opacity 0.8s ease-out",
        pointerEvents: fadingOut ? "none" : "auto",
      }}
    >
      {/* Terminal frame */}
      <div
        style={{
          width: "min(90vw, 520px)",
          padding: "2rem",
          border: "1px solid rgba(184, 240, 255, 0.12)",
          borderRadius: "2px",
          background: "rgba(5, 7, 15, 0.9)",
        }}
      >
        {/* Header */}
        <div
          style={{
            fontSize: "0.65rem",
            letterSpacing: "0.2em",
            marginBottom: "1.5rem",
            color: "#b8f0ff",
            opacity: 0.6,
          }}
        >
          SHATTERED NEBULA // DIAGNOSTIC TERMINAL
        </div>

        {/* Boot lines */}
        <div style={{ minHeight: "150px" }}>
          {BOOT_LINES.slice(0, visibleLines).map((line, i) => (
            <div
              key={i}
              style={{
                fontSize: "0.72rem",
                lineHeight: "1.8",
                letterSpacing: "0.08em",
                color:
                  i === visibleLines - 1
                    ? "#b8f0ff"
                    : line.text === "SYSTEM READY"
                    ? "#6aff8a"
                    : "#5a8a9a",
                opacity: 0.85,
              }}
            >
              <span style={{ color: "#3a5a6a", marginRight: "0.5rem" }}>
                {String(i).padStart(2, "0")}
              </span>
              {line.text}
              {i === visibleLines - 1 && line.text !== "SYSTEM READY" && (
                <span
                  style={{
                    display: "inline-block",
                    width: "6px",
                    height: "12px",
                    background: "#b8f0ff",
                    marginLeft: "4px",
                    animation: "termBlink 0.8s step-end infinite",
                  }}
                />
              )}
            </div>
          ))}
        </div>

        {/* Progress bar */}
        <div
          style={{
            marginTop: "1.5rem",
            height: "2px",
            background: "rgba(184, 240, 255, 0.08)",
            borderRadius: "1px",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              background:
                "linear-gradient(90deg, rgba(184, 240, 255, 0.6), rgba(184, 240, 255, 0.2))",
              width: `${Math.min((visibleLines / BOOT_LINES.length) * 100, 100)}%`,
              transition: "width 0.4s ease-out",
            }}
          />
        </div>
      </div>

      {/* Blink keyframes */}
      <style jsx>{`
        @keyframes termBlink {
          0%,
          50% {
            opacity: 1;
          }
          51%,
          100% {
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}
