"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import EffectsOverlay from "../EffectsOverlay";
import { useDisplayMode } from "./DisplayModeProvider";
import { voidState } from "../../lib/voidState";
import { getDeviceProfile } from "../../lib/deviceTier";
import DustParticles from "../../scene/DustParticles";
import { StarLayer } from "../../scene/Starfield";
import StarHoverSystem from "../../scene/StarHoverSystem";
import { VoidContext } from "../../scene/VoidContext";

const LAYERS_DESKTOP = [
  { count: 2200, rMin: 18, rMax: 55, rotSpd: 0.007, size: 0.18, seed: 11111 },
  { count: 1600, rMin: 35, rMax: 70, rotSpd: 0.011, size: 0.22, seed: 22222 },
  { count: 950, rMin: 50, rMax: 92, rotSpd: 0.017, size: 0.26, seed: 33333 },
] as const;

const LAYERS_REDUCED = [
  { count: 700, rMin: 18, rMax: 52, rotSpd: 0.008, size: 0.2, seed: 11111 },
  { count: 520, rMin: 34, rMax: 68, rotSpd: 0.012, size: 0.24, seed: 22222 },
  { count: 340, rMin: 48, rMax: 86, rotSpd: 0.018, size: 0.28, seed: 33333 },
] as const;

function BackgroundCameraRig({
  interactive,
}: {
  interactive: boolean;
}) {
  const target = useMemo(() => new THREE.Vector3(), []);
  const lookAt = useMemo(() => new THREE.Vector3(), []);
  const smoothMouse = useRef(new THREE.Vector2());

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    const mouseLerp = Math.min(dt * (interactive ? 2.2 : 1.2), 1);
    const targetMouseX = voidState.isOnPage ? voidState.mouseNX : 0;
    const targetMouseY = voidState.isOnPage ? voidState.mouseNY : 0;

    smoothMouse.current.x += (targetMouseX - smoothMouse.current.x) * mouseLerp;
    smoothMouse.current.y += (targetMouseY - smoothMouse.current.y) * mouseLerp;

    const x =
      smoothMouse.current.x * (interactive ? 0.075 : 0.035) +
      Math.sin(t * 0.08) * 0.018;
    const y =
      -smoothMouse.current.y * (interactive ? 0.055 : 0.028) +
      Math.cos(t * 0.1) * 0.014;

    target.set(x, y, 14);
    state.camera.position.lerp(target, Math.min(dt * 1.15, 1));

    lookAt.set(x * 0.08, y * 0.06, -36);
    state.camera.lookAt(lookAt);
    voidState.journeyMode = "hero";  // content-first hero mode
    voidState.transitFactor = 0;
  });

  return null;
}

function BackgroundScene({
  isMobile,
  interactive,
}: {
  isMobile: boolean;
  interactive: boolean;
}) {
  const pts0 = useRef<THREE.Points | null>(null);
  const pts1 = useRef<THREE.Points | null>(null);
  const pts2 = useRef<THREE.Points | null>(null);
  const layers = interactive ? LAYERS_DESKTOP : LAYERS_REDUCED;

  return (
    <VoidContext.Provider value={{ isMobile, layers }}>
      <color attach="background" args={["#000005"]} />
      <StarLayer li={0} pointsRef={pts0} />
      <StarLayer li={1} pointsRef={pts1} />
      <StarLayer li={2} pointsRef={pts2} />
      {interactive ? <DustParticles /> : null}
      {interactive ? (
        <StarHoverSystem
          pts={[pts0, pts1, pts2]}
        />
      ) : null}
      <BackgroundCameraRig interactive={interactive} />
    </VoidContext.Provider>
  );
}

export function StarfieldBackground() {
  const { effectiveMode } = useDisplayMode();
  const [isMobile, setIsMobile] = useState(false);
  const deviceProfile = useMemo(() => (typeof window !== "undefined" ? getDeviceProfile() : null), []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const media = window.matchMedia("(max-width: 880px)");
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let previousX = 0;
    let previousY = 0;
    let previousT = performance.now();

    const onMove = (event: MouseEvent) => {
      const nx = (event.clientX / window.innerWidth) * 2 - 1;
      const ny = (event.clientY / window.innerHeight) * 2 - 1;
      const now = performance.now();
      const dt = Math.max(now - previousT, 8) * 0.001;
      const rawVelocity = Math.min(Math.hypot(nx - previousX, ny - previousY) / dt, 6);

      previousX = nx;
      previousY = ny;
      previousT = now;

      voidState.mouseNX = nx;
      voidState.mouseNY = ny;
      voidState.mouseVel = voidState.mouseVel * 0.72 + rawVelocity * 0.28;
      voidState.isOnPage = true;
    };

    const onLeave = () => {
      voidState.mouseNX = 0;
      voidState.mouseNY = 0;
      voidState.mouseVel = 0;
      voidState.isOnPage = false;
    };

    const onTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch) return;
      voidState.mouseNX = (touch.clientX / window.innerWidth) * 2 - 1;
      voidState.mouseNY = (touch.clientY / window.innerHeight) * 2 - 1;
      voidState.isOnPage = true;
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("mouseleave", onLeave);
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onLeave);

    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseleave", onLeave);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onLeave);
    };
  }, []);

  const onCanvasCreated = useCallback((state: { gl: THREE.WebGLRenderer }) => {
    const canvas = state.gl.domElement;
    const onContextLost = (event: Event) => {
      (event as { preventDefault?: () => void }).preventDefault?.();
    };

    canvas.addEventListener("webglcontextlost", onContextLost, false);

    // R3F's internal ResizeObserver can miss the initial mount sizing,
    // leaving the canvas stuck at 300×150. Force a resize event so the
    // renderer picks up the actual container dimensions.
    requestAnimationFrame(() => {
      window.dispatchEvent(new Event("resize"));
    });
  }, []);

  const interactive = effectiveMode === "enhanced" && !isMobile;

  return (
    <>
      <div className="site-starfield" aria-hidden="true">
        <Canvas
          gl={{
            antialias: !deviceProfile || deviceProfile.tier !== "low",
            alpha: false,
            powerPreference: "high-performance",
          }}
          camera={{ position: [0, 0, 14], fov: 50 }}
          dpr={[1, deviceProfile?.maxDpr ?? 1.5]}
          frameloop="always"
          onCreated={onCanvasCreated}
          style={{ width: "100%", height: "100%", display: "block" }}
        >
          <BackgroundScene isMobile={isMobile} interactive={interactive} />
        </Canvas>
      </div>
      {interactive ? (
        <EffectsOverlay />
      ) : null}
    </>
  );
}
