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

// ─── Seeded random ─────────────────────────────────────────────────────────
function sr(seed: number) {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

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

  // ── Replace materials + compute normScale + centreOffset ──────────────────
  const { normScale, centreOffset } = useMemo(() => {
    matRefs.current = [];
    const T = webgpu || THREE;
    scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        const mesh = o as THREE.Mesh;
        const prev = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        prev.forEach(m => (m as THREE.Material)?.dispose());
        let mat: THREE.Material;
        if (webgpu && webgpu.MeshPhysicalNodeMaterial) {
          const W = webgpu as Record<string, unknown>;
          const MeshPhysicalNodeMaterial = W.MeshPhysicalNodeMaterial as new (p: object) => THREE.Material;
          const texture = W.texture as (tex: THREE.Texture, uv?: unknown) => unknown;
          const uv = W.uv as (i?: number) => unknown;
          const vec3 = W.vec3 as (x: number, y?: number, z?: number) => unknown;
          const float = W.float as (x: number) => unknown;
          const time = W.time as { mul: (n: number) => unknown };
          const sin = W.sin as (x: unknown) => { mul: (n: number) => unknown; add: (n: number) => unknown };
          mat = new MeshPhysicalNodeMaterial({
            side: T.FrontSide,
            roughness: 0.72,
            metalness: 0.05,
            envMapIntensity: 1.4,
          });
          const matNode = mat as { roughnessNode?: unknown; metalnessNode?: unknown; emissiveNode?: unknown; colorNode?: unknown };
          matNode.roughnessNode = float(0.72);
          matNode.metalnessNode = float(0.05);
          const pulse = (sin(time.mul(0.65)) as { mul: (n: number) => { add: (n: number) => unknown } }).mul(0.5).add(0.5);
          matNode.emissiveNode = (vec3(0.05, 0.07, 0.1) as { mul: (x: unknown) => unknown }).mul(pulse);
          matNode.colorNode = vec3(1, 1, 1);
        } else {
          mat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            emissive: new THREE.Color(0x000000),
            emissiveIntensity: 0,
            roughness: 0.72,
            metalness: 0.05,
            envMapIntensity: 1.4,
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
          if (normalTex) mat.normalNode = texture(normalTex, uvNode);
          if (roughTex) mat.roughnessNode = texture(roughTex, uvNode);
          if (metalTex) mat.metalnessNode = texture(metalTex, uvNode);
        });
      });
    } else {
      const apply = (fn: (m: THREE.MeshStandardMaterial) => void) =>
        matRefs.current.forEach(m => { if (m && "map" in m) { fn(m as THREE.MeshStandardMaterial); (m as THREE.MeshStandardMaterial).needsUpdate = true; } });
      if (t.map)          loader.loadAsync(t.map).then(tx => { tx.colorSpace = THREE.SRGBColorSpace; apply(m => { m.map = tx; }); }).catch(() => {});
      if (t.normalMap)    loader.loadAsync(t.normalMap).then(tx => { apply(m => { m.normalMap = tx; }); }).catch(() => {});
      if (t.roughnessMap) loader.loadAsync(t.roughnessMap).then(tx => { apply(m => { m.roughnessMap = tx; m.roughness = 1; }); }).catch(() => {});
      if (t.metalnessMap) loader.loadAsync(t.metalnessMap).then(tx => { apply(m => { m.metalnessMap = tx; m.metalness = 1; }); }).catch(() => {});
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
function AtmosphericParticles({ hoveredRef }: { hoveredRef: React.RefObject<boolean> }) {
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
    const mat = ref.current.material as THREE.PointsMaterial;
    if (mat) {
      const target = hoveredRef.current ? 0.25 : 0.07;
      mat.opacity  += (target - mat.opacity) * 0.04;
    }
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
function CoreLight({ hoveredRef }: { hoveredRef: React.RefObject<boolean> }) {
  const ref = useRef<THREE.PointLight>(null);
  useFrame((s) => {
    if (!ref.current) return;
    const t    = s.clock.elapsedTime;
    const base = hoveredRef.current ? 4.0 : 2.2;
    ref.current.intensity += (base + 0.9 * Math.sin(t * 0.7) - ref.current.intensity) * 0.05;
  });
  return <pointLight ref={ref} position={[0, 0, 2.5]} color="#66ccff" intensity={2.2} distance={18} />;
}

// ─── Full scene ─────────────────────────────────────────────────────────────
function ShowcaseScene({
  modelPath,
  textures,
  hoveredRef,
  fullscreen,
}: {
  modelPath:  string;
  textures:   TextureSet;
  hoveredRef: React.RefObject<boolean>;
  fullscreen: boolean;
}) {
  const matRef    = useRef<THREE.MeshStandardMaterial>(null);
  // normScale is computed inside ShowcaseModel; we pass it up so labels can
  // place themselves at the correct visual radius.
  const [normScaleState, setNormScaleState] = useState(1);

  return (
    <>
      {/* Studio three-point lighting — matches VoidBackground void scene */}
      <ambientLight intensity={0.32} color="#c0d8ee" />
      <directionalLight position={[-4, 10,  7]}  intensity={2.2} color="#f0f8ff" />
      <directionalLight position={[ 5,  3,  5]}  intensity={1.8} color="#d8eeff" />
      <directionalLight position={[ 0, -4, -10]} intensity={0.9} color="#7ab8e8" />
      <directionalLight position={[ 0, 12,  2]}  intensity={0.8} color="#e4f4ff" />
      <pointLight position={[0, 0, 5]} intensity={1.4} color="#a0d0f0" distance={18} />
      <CoreLight hoveredRef={hoveredRef} />
      <Environment preset="studio" environmentIntensity={0.85} />
      <AtmosphericParticles hoveredRef={hoveredRef} />
      <Suspense fallback={<ShowcaseLoading />}>
        {/* Bounds auto-fits camera to the model only — labels are outside so
            they don't distort the camera framing. */}
        <Bounds fit clip margin={fullscreen ? 1.15 : 1.25}>
          {/* ShowcaseModel now applies centreOffset internally — no <Center> needed */}
          <ShowcaseModel
            modelPath={modelPath}
            textures={textures}
            matRef={matRef}
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
  hoveredRef,
  containerRef,
  fullscreen = false,
}: {
  modelPath:    string;
  textures?:    TextureSet;
  hoveredRef:   React.RefObject<boolean>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  fullscreen?:  boolean;
}) {
  const [mounted, setMounted] = useState(fullscreen);
  const [webgpuModule, setWebgpuModule] = useState<WebGPUModule>(null);

  useEffect(() => {
    import("three/webgpu")
      .then((T) => setWebgpuModule(T))
      .catch(() => {
        console.warn("WebGPU not supported, using WebGL.");
        setWebgpuModule(false);
      });
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

  if (!mounted) {
    return (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontFamily: "var(--font-geist-mono), monospace", fontSize: "0.5rem", letterSpacing: "0.3em", color: "rgba(184,240,255,0.10)", textTransform: "uppercase" }}>·</span>
      </div>
    );
  }

  const camPos: [number, number, number] = fullscreen ? [0, 0, 10] : [0, 0.1, 11.0];
  const camFov = fullscreen ? 44 : 36;
  const useWebGPU = webgpuModule && typeof webgpuModule.WebGPURenderer === "function";

  const glProp = useWebGPU
    ? async (defaultProps: { canvas: HTMLCanvasElement | OffscreenCanvas; antialias?: boolean; alpha?: boolean }) => {
        const r = new webgpuModule!.WebGPURenderer(defaultProps as { canvas: HTMLCanvasElement; antialias?: boolean; alpha?: boolean });
        await r.init();
        return r;
      }
    : { alpha: true, premultipliedAlpha: false, antialias: true };

  const onCreated = useCallback((state: { gl: THREE.WebGLRenderer & { domElement?: HTMLCanvasElement } }) => {
    const canvas = state.gl?.domElement;
    if (!canvas?.addEventListener) return;
    const onContextLost = (e: Event) => {
      (e as { preventDefault?: () => void }).preventDefault?.();
    };
    canvas.addEventListener("webglcontextlost", onContextLost, false);
  }, []);

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
          hoveredRef={hoveredRef}
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
          minDistance={fullscreen ? 0.5 : 0.8}
          maxDistance={fullscreen ? 40  : 35}
        />
      </Canvas>
    </WebGPUContext.Provider>
  );
}
