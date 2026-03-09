"use client";

/**
 * VoidBackground — fixed full-screen canvas wrapper.
 *
 * Thin shell: handles mounting, event listeners (mouse/scroll/touch → voidState),
 * expanded state sync, and renders the R3F Canvas with VoidScene inside.
 *
 * All scene logic (starfield, camera, weapons, lighting) lives in app/scene/.
 */

import React, { useRef, useState, useEffect, useCallback } from "react";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import { voidState } from "../lib/voidState";
import { workModels, subscribeExpanded } from "../lib/workModels";
import VoidScene from "../scene/VoidScene";

export default function VoidBackground() {
  const [mounted, setMounted] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setMounted(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 768px)");
    const on = () => setIsMobile(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  // Mouse/scroll/touch → voidState bridge
  useEffect(() => {
    if (!mounted || typeof window === "undefined") return;
    let prevMX = 0, prevMY = 0, prevMT = performance.now();
    let prevSP = 0, prevST = performance.now();

    const onMove = (e: MouseEvent) => {
      const nx  = (e.clientX / window.innerWidth)  * 2 - 1;
      const ny  = (e.clientY / window.innerHeight) * 2 - 1;
      const now = performance.now();
      const dt  = Math.max(now - prevMT, 8) * 0.001;
      const raw = Math.min(Math.hypot(nx - prevMX, ny - prevMY) / dt, 10);
      voidState.mouseVel = voidState.mouseVel * 0.65 + raw * 0.35;
      prevMX = nx; prevMY = ny; prevMT = now;
      voidState.mouseNX  = nx;
      voidState.mouseNY  = ny;
      voidState.isOnPage = true;
    };
    const onLeave = () => {
      voidState.mouseNX  = 0;
      voidState.mouseNY  = 0;
      voidState.isOnPage = false;
      voidState.mouseVel = 0;
    };
    const onScroll = () => {
      const max  = document.documentElement.scrollHeight - window.innerHeight;
      const newP = max > 0 ? window.scrollY / max : 0;
      const now  = performance.now();
      const dt   = Math.max(now - prevST, 8) * 0.001;
      const raw  = Math.min(Math.abs(newP - prevSP) / dt, 5);
      voidState.scrollVel      = voidState.scrollVel * 0.60 + raw * 0.40;
      voidState.scrollProgress = newP;
      prevSP = newP;
      prevST = now;
    };
    const onTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (!touch) return;
      voidState.mouseNX  = (touch.clientX / window.innerWidth)  * 2 - 1;
      voidState.mouseNY  = (touch.clientY / window.innerHeight) * 2 - 1;
      voidState.isOnPage = true;
    };
    const onTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (!touch) return;
      voidState.mouseNX  = (touch.clientX / window.innerWidth)  * 2 - 1;
      voidState.mouseNY  = (touch.clientY / window.innerHeight) * 2 - 1;
      voidState.isOnPage = true;
    };
    const onTouchEnd = () => { voidState.isOnPage = false; };

    document.addEventListener("mousemove",  onMove);
    document.addEventListener("mouseleave", onLeave);
    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove",  onTouchMove,  { passive: true });
    document.addEventListener("touchend",   onTouchEnd);
    window.addEventListener("scroll",       onScroll, { passive: true });
    return () => {
      document.removeEventListener("mousemove",  onMove);
      document.removeEventListener("mouseleave", onLeave);
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove",  onTouchMove);
      document.removeEventListener("touchend",   onTouchEnd);
      window.removeEventListener("scroll",       onScroll);
    };
  }, [mounted]);

  // Sync expanded state
  useEffect(() => {
    const unsub = subscribeExpanded(() => setExpanded(!!workModels.expandedModelId));
    setExpanded(!!workModels.expandedModelId);
    return () => { unsub(); };
  }, []);

  const onCanvasCreated = useCallback((state: { gl: THREE.WebGLRenderer & { domElement?: HTMLCanvasElement } }) => {
    const canvas = state.gl?.domElement;
    if (!canvas?.addEventListener) return;
    const onContextLost = (e: Event) => {
      (e as { preventDefault?: () => void }).preventDefault?.();
    };
    canvas.addEventListener("webglcontextlost", onContextLost, false);
  }, []);

  // SSR fallback
  if (!mounted || typeof window === "undefined") {
    return (
      <div
        style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none", background: "#000005" }}
        role="presentation"
        aria-hidden="true"
      />
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: expanded ? 50 : 0,
        pointerEvents: expanded ? "auto" : "none",
      }}
      role="presentation"
      aria-hidden="true"
    >
      <Canvas
        camera={{ position: [0, 0, 14], fov: 50 }}
        dpr={[1, 1.5]}
        style={{ width: "100%", height: "100%", display: "block" }}
        aria-label="Interactive 3D cinematic weapon journey"
        onCreated={onCanvasCreated}
      >
        <VoidScene isMobile={isMobile} />
      </Canvas>
    </div>
  );
}
