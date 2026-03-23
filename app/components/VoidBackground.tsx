"use client";

/**
 * VoidBackground — fixed full-screen starfield canvas.
 *
 * Content-first version: renders only the atmospheric starfield (stars,
 * dust, hover system) without weapon stations or the cinematic journey.
 * Mouse/scroll/touch events bridge to voidState for decorative parallax.
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { voidState } from "../lib/voidState";
import { VoidContext } from "../scene/VoidContext";
import { StarLayer } from "../scene/Starfield";
import DustParticles from "../scene/DustParticles";
import StarHoverSystem from "../scene/StarHoverSystem";

// ─── Star layer config ─────────────────────────────────────────────────────
const LAYERS_DESKTOP = [
  { count: 1800, rMin: 14, rMax: 30, rotSpd: 0.007, size: 0.22, seed: 11111 },
  { count: 1400, rMin: 26, rMax: 44, rotSpd: 0.011, size: 0.28, seed: 22222 },
  { count:  900, rMin: 36, rMax: 58, rotSpd: 0.017, size: 0.36, seed: 33333 },
] as const;
const LAYERS_MOBILE = [
  { count: 600, rMin: 14, rMax: 30, rotSpd: 0.008, size: 0.24, seed: 11111 },
  { count: 500, rMin: 26, rMax: 44, rotSpd: 0.012, size: 0.30, seed: 22222 },
  { count: 350, rMin: 36, rMax: 58, rotSpd: 0.018, size: 0.36, seed: 33333 },
] as const;

/** Simple mouse-parallax camera rig for the content-first starfield. */
function BackgroundCameraRig() {
  const target = React.useMemo(() => new THREE.Vector3(), []);
  const lookAt = React.useMemo(() => new THREE.Vector3(), []);
  const smoothMouse = useRef(new THREE.Vector2());

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    const mouseLerp = Math.min(dt * 2, 1);
    const tmx = voidState.isOnPage ? voidState.mouseNX : 0;
    const tmy = voidState.isOnPage ? voidState.mouseNY : 0;

    smoothMouse.current.x += (tmx - smoothMouse.current.x) * mouseLerp;
    smoothMouse.current.y += (tmy - smoothMouse.current.y) * mouseLerp;

    const x = smoothMouse.current.x * 0.06 + Math.sin(t * 0.08) * 0.018;
    const y = -smoothMouse.current.y * 0.045 + Math.cos(t * 0.1) * 0.014;

    // Scroll parallax — camera drifts down as page scrolls
    const scrollY = -voidState.scrollProgress * 6;

    target.set(x, y + scrollY, 14);
    state.camera.position.lerp(target, Math.min(dt * 1.15, 1));

    lookAt.set(x * 0.08, (y + scrollY) * 0.06, -36);
    state.camera.lookAt(lookAt);
  });

  return null;
}

function BackgroundScene({ isMobile }: { isMobile: boolean }) {
  const pts0 = useRef<THREE.Points | null>(null);
  const pts1 = useRef<THREE.Points | null>(null);
  const pts2 = useRef<THREE.Points | null>(null);
  const layers = isMobile ? LAYERS_MOBILE : LAYERS_DESKTOP;

  return (
    <VoidContext.Provider value={{ isMobile, layers }}>
      <color attach="background" args={["#000005"]} />
      <StarLayer li={0} pointsRef={pts0} />
      <StarLayer li={1} pointsRef={pts1} />
      <StarLayer li={2} pointsRef={pts2} />
      <DustParticles />
      {!isMobile && <StarHoverSystem pts={[pts0, pts1, pts2]} />}
      <BackgroundCameraRig />
    </VoidContext.Provider>
  );
}

export default function VoidBackground() {
  const [mounted, setMounted] = useState(false);
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
    const onTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (!touch) return;
      voidState.mouseNX  = (touch.clientX / window.innerWidth)  * 2 - 1;
      voidState.mouseNY  = (touch.clientY / window.innerHeight) * 2 - 1;
      voidState.isOnPage = true;
    };
    const onTouchEnd = () => { voidState.isOnPage = false; };

    document.addEventListener("mousemove",  onMove,     { passive: true });
    document.addEventListener("mouseleave", onLeave);
    document.addEventListener("touchmove",  onTouchMove, { passive: true });
    document.addEventListener("touchend",   onTouchEnd);
    window.addEventListener("scroll",       onScroll,    { passive: true });
    return () => {
      document.removeEventListener("mousemove",  onMove);
      document.removeEventListener("mouseleave", onLeave);
      document.removeEventListener("touchmove",  onTouchMove);
      document.removeEventListener("touchend",   onTouchEnd);
      window.removeEventListener("scroll",       onScroll);
    };
  }, [mounted]);

  const onCanvasCreated = useCallback((state: { gl: THREE.WebGLRenderer }) => {
    const canvas = state.gl?.domElement;
    if (!canvas?.addEventListener) return;
    const onContextLost = (e: Event) => {
      (e as { preventDefault?: () => void }).preventDefault?.();
    };
    canvas.addEventListener("webglcontextlost", onContextLost, false);
    // Force resize to fix R3F ResizeObserver initial mount bug
    requestAnimationFrame(() => {
      window.dispatchEvent(new Event("resize"));
    });
  }, []);

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
      style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" }}
      role="presentation"
      aria-hidden="true"
    >
      <Canvas
        gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
        camera={{ position: [0, 0, 14], fov: 50 }}
        dpr={[1, 1.5]}
        frameloop="always"
        style={{ width: "100%", height: "100%", display: "block" }}
        onCreated={onCanvasCreated}
      >
        <BackgroundScene isMobile={isMobile} />
      </Canvas>
    </div>
  );
}
