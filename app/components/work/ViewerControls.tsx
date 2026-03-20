"use client";

import { useEffect, useState, useCallback } from "react";
import { voidState } from "../../lib/voidState";
import { workModels } from "../../lib/workModels";
import { trackWireframeToggle } from "../../lib/analytics";

// ─── Viewer controls — wireframe, auto-rotate, reset ──────────────────────
export function ViewerControls({ mobile }: { mobile: boolean }) {
  const [wireframe, setWireframe] = useState(voidState.showWireframe);
  const [autoRot, setAutoRot] = useState(voidState.autoRotate);

  const toggleWireframe = useCallback(() => {
    voidState.showWireframe = !voidState.showWireframe;
    setWireframe(voidState.showWireframe);
    trackWireframeToggle(voidState.showWireframe);
  }, []);

  const toggleAutoRotate = useCallback(() => {
    voidState.autoRotate = !voidState.autoRotate;
    setAutoRot(voidState.autoRotate);
  }, []);

  const resetView = useCallback(() => {
    // Reset rotation on all entries
    workModels.entries.forEach(e => {
      e.rotX = 0;
      e.rotY = 0;
      e.velX = 0;
      e.velY = 0;
    });
  }, []);

  // Keyboard shortcuts: W=wireframe, R=auto-rotate
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "w" || e.key === "W") toggleWireframe();
      if (e.key === "r" || e.key === "R") toggleAutoRotate();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleWireframe, toggleAutoRotate]);

  const btnStyle: React.CSSProperties = {
    background: "rgba(4,8,20,0.75)",
    border: "1px solid rgba(184,240,255,0.1)",
    borderRadius: "3px",
    color: "rgba(184,240,255,0.5)",
    cursor: "pointer",
    padding: "0.35rem 0.6rem",
    fontFamily: "var(--font-geist-mono), monospace",
    fontSize: "0.5rem",
    letterSpacing: "0.14em",
    textTransform: "uppercase" as const,
    transition: "all 0.25s ease",
    display: "flex",
    alignItems: "center",
    gap: "0.35rem",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
  };

  const activeStyle: React.CSSProperties = {
    ...btnStyle,
    borderColor: "rgba(184,240,255,0.3)",
    color: "rgba(184,240,255,0.8)",
    boxShadow: "0 0 8px rgba(184,240,255,0.15)",
  };

  return (
    <div
      style={{
        position: "fixed",
        zIndex: 102,
        pointerEvents: "auto",
        display: "flex",
        gap: "0.4rem",
        ...(mobile
          ? { bottom: "1.2rem", left: "50%", transform: "translateX(-50%)" }
          : { bottom: "1.5rem", left: "50%", transform: "translateX(-50%)" }),
      }}
    >
      <button
        onClick={toggleWireframe}
        style={wireframe ? activeStyle : btnStyle}
        onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(184,240,255,0.35)"; e.currentTarget.style.color = "rgba(184,240,255,0.9)"; }}
        onMouseLeave={e => {
          if (!wireframe) { e.currentTarget.style.borderColor = "rgba(184,240,255,0.1)"; e.currentTarget.style.color = "rgba(184,240,255,0.5)"; }
          else { e.currentTarget.style.borderColor = "rgba(184,240,255,0.3)"; e.currentTarget.style.color = "rgba(184,240,255,0.8)"; }
        }}
        title="Toggle wireframe [W]"
      >
        <span style={{ fontSize: "0.55rem" }}>◇</span>
        WIRE {wireframe ? "ON" : "OFF"}
      </button>

      <button
        onClick={toggleAutoRotate}
        style={autoRot ? activeStyle : btnStyle}
        onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(184,240,255,0.35)"; e.currentTarget.style.color = "rgba(184,240,255,0.9)"; }}
        onMouseLeave={e => {
          if (!autoRot) { e.currentTarget.style.borderColor = "rgba(184,240,255,0.1)"; e.currentTarget.style.color = "rgba(184,240,255,0.5)"; }
          else { e.currentTarget.style.borderColor = "rgba(184,240,255,0.3)"; e.currentTarget.style.color = "rgba(184,240,255,0.8)"; }
        }}
        title="Toggle auto-rotate [R]"
      >
        <span style={{ fontSize: "0.55rem" }}>↻</span>
        SPIN {autoRot ? "ON" : "OFF"}
      </button>

      <button
        onClick={resetView}
        style={btnStyle}
        onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(184,240,255,0.35)"; e.currentTarget.style.color = "rgba(184,240,255,0.9)"; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(184,240,255,0.1)"; e.currentTarget.style.color = "rgba(184,240,255,0.5)"; }}
        title="Reset rotation"
      >
        <span style={{ fontSize: "0.55rem" }}>⟲</span>
        RESET
      </button>
    </div>
  );
}
