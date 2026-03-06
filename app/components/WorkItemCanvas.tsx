"use client";

/**
 * WorkItemCanvas — 3D canvas for each work showcase item.
 *
 * Uses WebGPURenderer + TSL when supported (better PBR, node materials),
 * with WebGL fallback. TSL post (vignette/bloom) can be added via the
 * WebGPU renderer's node-based post stack if needed. Preview/fullscreen: OrbitControls + auto-rotate.
 */

import { Suspense, useRef, useMemo, useEffect, useState, useCallback, createContext, useContext } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { useFBX, Environment, OrbitControls, Bounds } from "@react-three/drei";
import * as THREE from "three";
import type { TextureSet } from "../lib/workModels";

/** When set, renderer is WebGPU and we use node materials from this module. */
type WebGPUThree = typeof import("three/webgpu") & {
  texture?: (tex: THREE.Texture, uv?: unknown) => unknown;
  uv?: (index?: number) => unknown;
  vec3?: (x: number, y?: number, z?: number) => unknown;
  float?: (x: number) => unknown;
  time?: unknown;
  sin?: (x: unknown) => unknown;
};
const WebGPUContext = createContext<WebGPUThree | null>(null);

import { sr } from "../lib/seededRandom";

// ─── Loading fallback ───────────────────────────────────────────────────────
function ShowcaseLoading() {
  const ref = useRef<THREE.Points>(null);
  const geo = useMemo(() => {
    const count = 100;
    const pos   = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const theta = sr(i * 7 + 1) * Math.PI * 2;
      const phi   = Math.acos(2 * sr(i * 7 + 2) - 1);
      const r     = 0.7 + sr(i * 7 + 3) * 1.2;
      pos[i*3]     = r * Math.sin(phi) * Math.cos(theta);
      pos[i*3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pos[i*3 + 2] = r * Math.cos(phi);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return g;
  }, []);

  useFrame((s) => {
    if (!ref.current) return;
    ref.current.rotation.y = s.clock.elapsedTime * 0.35;
    ref.current.rotation.x = s.clock.elapsedTime * 0.18;
    const mat = ref.current.material as THREE.PointsMaterial;
    if (mat) mat.opacity = 0.22 + 0.15 * Math.sin(s.clock.elapsedTime * 1.8);
  });

  return (
    <points ref={ref}>
      <primitive object={geo} attach="geometry" />
      <pointsMaterial
        attach="material"
        color="#88d4ff"
        size={0.025}
        transparent
        opacity={0.22}
        sizeAttenuation
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
}

// ─── 3D model ──────────────────────────────────────────────────────────────
// Uses the same primitive+normScale strategy as VoidBackground's VoidModel so
// FBXLoader's cm→m root transform is preserved. With WebGPU: TSL node materials.
function ShowcaseModel({
  modelPath,
  textures,
  matRef: extMatRef,
  onNormScale,
}: {
  modelPath:   string;
  textures:    TextureSet;
  matRef:      React.RefObject<THREE.MeshStandardMaterial | THREE.Material | null>;
  onNormScale: (n: number) => void;
}) {
  const webgpu   = useContext(WebGPUContext);
  const rawScene = useFBX(modelPath);
  const scene    = useMemo(() => rawScene.clone(true), [rawScene]);
  const groupRef = useRef<THREE.Group>(null);
  const matRefs  = useRef<THREE.Material[]>([]);

  // ── Replace materials + compute normScale + centreOffset; hide any FBX debug labels ──
  const { normScale, centreOffset } = useMemo(() => {
    matRefs.current = [];
    const T = webgpu || THREE;
    const labelLike = /(normal\s*map|tangent|tris|polygon|vertex|uv\s*map|specular|roughness\s*map|metalness|debug|label)/i;
    scene.traverse((o) => {
      if (labelLike.test(o.name)) {
        o.visible = false;
        return;
      }
      if ((o as THREE.Mesh).isMesh) {
        const mesh = o as THREE.Mesh;
        const prev = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        prev.forEach(m => (m as THREE.Material)?.dispose());
        let mat: THREE.Material;
        const useWebGPUMaterial = webgpu && typeof (webgpu as Record<string, unknown>).MeshPhysicalNodeMaterial === "function";
        if (useWebGPUMaterial) {
          try {
            const W = webgpu as Record<string, unknown>;
            const MeshPhysicalNodeMaterial = W.MeshPhysicalNodeMaterial as new (p: object) => THREE.Material;
            const float = W.float;
            const vec3 = W.vec3;
            if (typeof float !== "function" || typeof vec3 !== "function") {
              throw new Error("WebGPU TSL exports missing");
            }
            mat = new MeshPhysicalNodeMaterial({
              side: T.FrontSide,
              roughness: 0.65,
              metalness: 0.08,
              envMapIntensity: 2.4,
              iridescence: 0,
              clearcoat: 0.18,
              clearcoatRoughness: 0.08,
            });
            const matNode = mat as { roughnessNode?: unknown; metalnessNode?: unknown; colorNode?: unknown };
            matNode.roughnessNode = (float as (x: number) => unknown)(0.65);
            matNode.metalnessNode = (float as (x: number) => unknown)(0.08);
            matNode.colorNode = (vec3 as (a: number, b?: number, c?: number) => unknown)(1, 1, 1);
          } catch {
            mat = new THREE.MeshPhysicalMaterial({
              color: 0xffffff,
              roughness: 0.65,
              metalness: 0.08,
              envMapIntensity: 2.4,
              iridescence: 0,
              clearcoat: 0.18,
              clearcoatRoughness: 0.08,
              side: THREE.FrontSide,
            });
          }
        } else {
          mat = new THREE.MeshPhysicalMaterial({
            color: 0xffffff,
            roughness: 0.65,
            metalness: 0.08,
            envMapIntensity: 2.4,
            iridescence: 0,
            clearcoat: 0.18,
            clearcoatRoughness: 0.08,
            side: THREE.FrontSide,
          });
        }
        mesh.material = mat;
        matRefs.current.push(mat);
        if (matRefs.current.length === 1 && extMatRef) {
          (extMatRef as React.MutableRefObject<THREE.Material | null>).current = mat;
        }
      }
    });
    const box    = new THREE.Box3().setFromObject(scene);
    const sz     = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(sz);
    box.getCenter(center);
    const maxDim = Math.max(sz.x, sz.y, sz.z);
    const ns     = maxDim > 0 ? 4.5 / maxDim : 1;
    onNormScale(ns);
    return { normScale: ns, centreOffset: center.clone().negate().multiplyScalar(ns) };
  }, [scene, webgpu]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── PBR texture loading (WebGL: map/normalMap etc.; WebGPU: colorNode/normalNode) ──
  const texSig = [textures.map, textures.normalMap, textures.roughnessMap, textures.metalnessMap]
    .filter(Boolean).join("|");

  useEffect(() => {
    if (!texSig) return;
    const loader = new THREE.TextureLoader();
    const t      = textures;
    const isNode = webgpu && "colorNode" in (matRefs.current[0] || {});
    if (isNode && webgpu) {
      const W = webgpu as Record<string, unknown>;
      const texture = W.texture as (tex: THREE.Texture, uv?: unknown) => unknown;
      const uv = W.uv as (i?: number) => unknown;
      const load = (url: string) => loader.loadAsync(url).catch(() => null);
      Promise.all([
        t.map ? load(t.map) : null,
        t.normalMap ? load(t.normalMap) : null,
        t.roughnessMap ? load(t.roughnessMap) : null,
        t.metalnessMap ? load(t.metalnessMap) : null,
      ]).then(([mapTex, normalTex, roughTex, metalTex]) => {
        if (!texture || !uv) return;
        const uvNode = uv();
        matRefs.current.forEach((m) => {
          if (!m || !("colorNode" in m)) return;
          const mat = m as { colorNode?: unknown; normalNode?: unknown; roughnessNode?: unknown; metalnessNode?: unknown };
          if (mapTex) {
            mapTex.colorSpace = THREE.SRGBColorSpace;
            mat.colorNode = texture(mapTex, uvNode);
          }
          if (normalTex) {
            normalTex.colorSpace = THREE.NoColorSpace; // linear, not sRGB
            mat.normalNode = texture(normalTex, uvNode);
          }
          if (roughTex) mat.roughnessNode = texture(roughTex, uvNode);
          if (metalTex) mat.metalnessNode = texture(metalTex, uvNode);
        });
      });
    } else {
      const apply = (fn: (m: THREE.MeshStandardMaterial) => void) =>
        matRefs.current.forEach(m => { if (m && "map" in m) { fn(m as THREE.MeshStandardMaterial); (m as THREE.MeshStandardMaterial).needsUpdate = true; } });
      if (t.map)          loader.loadAsync(t.map).then(tx => { tx.colorSpace = THREE.SRGBColorSpace; apply(m => { m.map = tx; }); }).catch(() => {});
      if (t.normalMap)    loader.loadAsync(t.normalMap).then(tx => { tx.colorSpace = THREE.NoColorSpace; apply(m => { m.normalMap = tx; m.normalMapType = THREE.TangentSpaceNormalMap; }); }).catch(() => {});
      if (t.roughnessMap) loader.loadAsync(t.roughnessMap).then(tx => { apply(m => { m.roughnessMap = tx; m.roughness = 0.88; }); }).catch(() => {});
      if (t.metalnessMap) loader.loadAsync(t.metalnessMap).then(tx => { apply(m => { m.metalnessMap = tx; m.metalness = 0.85; }); }).catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texSig, webgpu]);

  // ── Scale-in entrance ────────────────────────────────────────────────────
  useEffect(() => {
    if (!groupRef.current) return;
    groupRef.current.scale.setScalar(0.001);
    const start = performance.now();
    const enter = () => {
      if (!groupRef.current) return;
      const tt = Math.min((performance.now() - start) / 1400, 1);
      const e  = tt < 0.5 ? 2 * tt * tt : -1 + (4 - 2 * tt) * tt;
      groupRef.current.scale.setScalar(Math.max(0.001, e));
      if (tt < 1) requestAnimationFrame(enter);
    };
    requestAnimationFrame(enter);
  }, []);

  // ── Subtle emissive pulse (WebGL only; WebGPU uses TSL time in emissiveNode) ──
  useFrame((s) => {
    const ref = extMatRef.current;
    if (!ref || "emissiveIntensity" in ref === false) return;
    const std = ref as THREE.MeshStandardMaterial;
    if (std.emissive.r === 0 && std.emissive.g === 0 && std.emissive.b === 0) {
      std.emissive.set(0x112233);
    }
    const t = s.clock.elapsedTime;
    std.emissiveIntensity += (0.06 + 0.03 * Math.sin(t * 0.65) - std.emissiveIntensity) * 0.04;
    matRefs.current.forEach(m => {
      if (m && m !== ref && "emissiveIntensity" in m) (m as THREE.MeshStandardMaterial).emissiveIntensity = std.emissiveIntensity;
    });
  });

  return (
    <group ref={groupRef}>
      {/* centreOffset OUTSIDE normScale — same approach as VoidBackground */}
      <group position={[centreOffset.x, centreOffset.y, centreOffset.z]}>
        <group scale={normScale}>
          <primitive object={scene} />
        </group>
      </group>
    </group>
  );
}

// ─── Atmospheric particles ─────────────────────────────────────────────────
function AtmosphericParticles() {
  const ref = useRef<THREE.Points>(null);
  const geo = useMemo(() => {
    const count = 80;
    const pos   = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i*3]     = (sr(i * 5 + 1) - 0.5) * 9;
      pos[i*3 + 1] = (sr(i * 5 + 2) - 0.5) * 6;
      pos[i*3 + 2] = (sr(i * 5 + 3) - 0.5) * 9;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return g;
  }, []);

  useFrame((_, dt) => {
    if (!ref.current) return;
    ref.current.rotation.y += dt * 0.012;
  });

  return (
    <points ref={ref}>
      <primitive object={geo} attach="geometry" />
      <pointsMaterial
        attach="material"
        color="#b8f0ff"
        size={0.020}
        transparent
        opacity={0.07}
        sizeAttenuation
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
}

// ─── Pulsing key light ─────────────────────────────────────────────────────
function CoreLight() {
  const ref = useRef<THREE.PointLight>(null);
  useFrame((s) => {
    if (!ref.current) return;
    const t = s.clock.elapsedTime;
    ref.current.intensity += (2.2 + 0.9 * Math.sin(t * 0.7) - ref.current.intensity) * 0.05;
  });
  return <pointLight ref={ref} position={[0, 0, 2.5]} color="#66ccff" intensity={2.2} distance={18} />;
}

// ─── Full scene ─────────────────────────────────────────────────────────────
function ShowcaseScene({
  modelPath,
  textures,
  fullscreen,
}: {
  modelPath:  string;
  textures:   TextureSet;
  fullscreen: boolean;
}) {
  const matRef = useRef<THREE.MeshPhysicalMaterial>(null);
  const [, setNormScaleState] = useState(1);

  return (
    <>
      {/* Lighting — synced with VoidBackground VoidScene rig */}
      <ambientLight intensity={0.40} color="#e0e0e0" />
      <hemisphereLight args={["#b8d0ff", "#1a2035", 0.85]} />
      <directionalLight position={[-4, 10,  7]}  intensity={2.2} color="#ffffff" />
      <directionalLight position={[ 5,  3,  5]}  intensity={1.8} color="#f8f8f8" />
      <directionalLight position={[ 0,  2, 12]}  intensity={2.2} color="#f4f4f4" />
      <directionalLight position={[ 0, -4, -10]} intensity={0.9} color="#b0c8e0" />
      <directionalLight position={[ 0, 12,  2]}  intensity={0.8} color="#f0f0f0" />
      <directionalLight position={[ 0, -8,  4]}  intensity={0.55} color="#8aa8d0" />
      <pointLight position={[0, 0, 5]} intensity={2.5} color="#ffffff" distance={22} />
      <CoreLight />
      <Environment preset="studio" environmentIntensity={1.1} />
      <AtmosphericParticles />
      <Suspense fallback={<ShowcaseLoading />}>
        <Bounds fit clip margin={fullscreen ? 1.15 : 1.25}>
          {/* ShowcaseModel now applies centreOffset internally — no <Center> needed */}
          <ShowcaseModel
            modelPath={modelPath}
            textures={textures}
            matRef={matRef as React.RefObject<THREE.MeshStandardMaterial | THREE.Material | null>}
            onNormScale={setNormScaleState}
          />
        </Bounds>
      </Suspense>
    </>
  );
}

// ─── Exported component ────────────────────────────────────────────────────
type WebGPUModule = typeof import("three/webgpu") | false | null;

export default function WorkItemCanvas({
  modelPath,
  textures   = {},
  containerRef,
  fullscreen = false,
}: {
  modelPath:    string;
  textures?:    TextureSet;
  containerRef: React.RefObject<HTMLDivElement | null>;
  fullscreen?:  boolean;
}) {
  const [mounted, setMounted] = useState(fullscreen);
  const [webgpuModule, setWebgpuModule] = useState<WebGPUModule>(null);

  // Client-only: never run WebGPU import on server (avoid hydration mismatch)
  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;
    import("three/webgpu")
      .then((T) => { if (!cancelled) setWebgpuModule(T); })
      .catch(() => {
        if (!cancelled) {
          console.warn("WebGPU not supported, using WebGL.");
          setWebgpuModule(false);
        }
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (fullscreen) { setMounted(true); return; }
    const el = containerRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setMounted(true); },
      { threshold: 0.05 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [containerRef, fullscreen]);

  const onCreated = useCallback((state: { gl: THREE.WebGLRenderer & { domElement?: HTMLCanvasElement } }) => {
    const canvas = state.gl?.domElement;
    if (!canvas?.addEventListener) return;
    const onContextLost = (e: Event) => {
      (e as { preventDefault?: () => void }).preventDefault?.();
    };
    canvas.addEventListener("webglcontextlost", onContextLost, false);
  }, []);

  // Server / pre-mount: avoid any Canvas or browser APIs (hydration safety)
  if (typeof window === "undefined" || !mounted) {
    return (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "transparent" }}>
        <span style={{ fontFamily: "var(--font-geist-mono), monospace", fontSize: "0.5rem", letterSpacing: "0.3em", color: "rgba(184,240,255,0.10)", textTransform: "uppercase" }}>·</span>
      </div>
    );
  }

  const camPos: [number, number, number] = fullscreen ? [0, 0, 10] : [0, 0.1, 11.0];
  const camFov = fullscreen ? 44 : 36;
  // WebGPU where supported (preview + fullscreen), fallback to WebGL on failure or unsupported.
  const useWebGPU = !!webgpuModule && typeof webgpuModule.WebGPURenderer === "function";

  // Future: TSL post-processing (bloom, vignette) can be added via the WebGPU renderer's node-based post stack.
  const glProp = useWebGPU
    ? async (defaultProps: { canvas: HTMLCanvasElement | OffscreenCanvas; antialias?: boolean; alpha?: boolean }) => {
        const r = new webgpuModule!.WebGPURenderer(defaultProps as { canvas: HTMLCanvasElement; antialias?: boolean; alpha?: boolean });
        await r.init();
        return r;
      }
    : { alpha: true, premultipliedAlpha: false, antialias: true };

  return (
    <WebGPUContext.Provider value={useWebGPU ? webgpuModule : null}>
      <Canvas
        key={useWebGPU ? "webgpu" : "webgl"}
        gl={glProp as React.ComponentProps<typeof Canvas>["gl"]}
        onCreated={onCreated}
        camera={{ position: camPos, fov: camFov }}
        dpr={fullscreen ? [1, 2] : [1, 1.5]}
        style={{ width: "100%", height: "100%", display: "block" }}
      >
        <ShowcaseScene
          modelPath={modelPath}
          textures={textures}
          fullscreen={fullscreen}
        />
        <OrbitControls
          enablePan={false}
          enableZoom
          enableRotate
          autoRotate
          autoRotateSpeed={fullscreen ? 0.4 : 0.8}
          dampingFactor={0.08}
          enableDamping
          minDistance={fullscreen ? 2.5 : 2.0}
          maxDistance={fullscreen ? 20  : 18}
          minPolarAngle={Math.PI * 0.08}
          maxPolarAngle={Math.PI * 0.92}
        />
      </Canvas>
    </WebGPUContext.Provider>
  );
}
