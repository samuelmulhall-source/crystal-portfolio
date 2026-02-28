"use client";

/**
 * WorkItemCanvas — transparent WebGL canvas for each work showcase item.
 *
 * Preview mode:  OrbitControls (drag + scroll zoom) + auto-rotate + subtle labels on hover.
 * Fullscreen mode: same controls, wider labels, richer lighting.
 */

import { Suspense, useRef, useMemo, useEffect, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { useFBX, Environment, OrbitControls, Html, Bounds } from "@react-three/drei";
import * as THREE from "three";
import type { TextureSet } from "../lib/workModels";

// ─── Seeded random ─────────────────────────────────────────────────────────
function sr(seed: number) {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

// ─── Filler label data (per-model index, cycles through 9 presets) ─────────
const LABEL_SETS = [
  [
    { text: "SURFACE ALBEDO",    pos: [ 0.90,  0.45,  0.30] as [number,number,number], sub: "4096px · PBR · SRGB"        },
    { text: "NORMAL MAP",        pos: [-0.90,  0.10,  0.20] as [number,number,number], sub: "TANGENT SPACE · 16-BIT"      },
    { text: "ROUGHNESS",         pos: [ 0.20, -0.80,  0.35] as [number,number,number], sub: "R CHANNEL · LINEAR"          },
  ],
  [
    { text: "METALNESS",         pos: [-0.85,  0.55,  0.25] as [number,number,number], sub: "B CHANNEL · 0.0–1.0"         },
    { text: "GEOMETRY",          pos: [ 0.80, -0.15,  0.20] as [number,number,number], sub: "TRIS OPTIMISED · LOD 0"       },
    { text: "UV LAYOUT",         pos: [-0.15, -0.75,  0.30] as [number,number,number], sub: "0 OVERLAPS · PACKED"          },
  ],
  [
    { text: "MATERIAL",          pos: [ 0.85,  0.30,  0.25] as [number,number,number], sub: "PRINCIPLED BSDF · BLENDER 4.3"},
    { text: "POLY COUNT",        pos: [-0.80,  0.20,  0.20] as [number,number,number], sub: "GAME-READY · OPTIMISED"       },
    { text: "EXPORT",            pos: [ 0.10, -0.85,  0.30] as [number,number,number], sub: "FBX · EMBEDDED NORMALS"       },
  ],
] as const;

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

// ─── Model labels (HTML text + Three.js line connectors) ─────────────────
// Labels are placed at bounding-SPHERE radius + margin so they stay outside
// the model at every rotation angle.  The connector line is a genuine Three.js
// LINE anchored at the bbox surface — it never passes through the model.
function ModelLabels({
  modelPath,
  hoveredRef,
  fullscreen,
  labelSet,
}: {
  modelPath:  string;
  hoveredRef: React.RefObject<boolean>;
  fullscreen: boolean;
  labelSet:   number;
}) {
  const scene   = useFBX(modelPath);
  const domRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Compute safe label positions accounting for normScale so labels sit just
  // outside the VISUAL bounding sphere (post-normalisation), not the raw FBX one.
  const computedLabels = useMemo(() => {
    const rawBox = new THREE.Box3().setFromObject(scene);
    const center = new THREE.Vector3();
    rawBox.getCenter(center);

    const cBox = new THREE.Box3(
      rawBox.min.clone().sub(center),
      rawBox.max.clone().sub(center),
    );
    const sphere = new THREE.Sphere();
    cBox.getBoundingSphere(sphere);

    // Derive the same normScale used by ShowcaseModel so positions match
    const rawSz  = new THREE.Vector3();
    rawBox.getSize(rawSz);
    const maxDim = Math.max(rawSz.x, rawSz.y, rawSz.z);
    const ns     = maxDim > 0 ? 4.5 / maxDim : 1;

    // Scale bbox to visual size
    const visualCBox = new THREE.Box3(
      cBox.min.clone().multiplyScalar(ns),
      cBox.max.clone().multiplyScalar(ns),
    );
    const visualSphere = new THREE.Sphere();
    visualCBox.getBoundingSphere(visualSphere);

    // Real geometry stats from the loaded scene
    let tris = 0, verts = 0;
    scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        const geo = (o as THREE.Mesh).geometry;
        if (geo.index)                    tris  += geo.index.count / 3;
        else if (geo.attributes.position) tris  += geo.attributes.position.count / 3;
        if (geo.attributes.position)      verts += geo.attributes.position.count;
      }
    });
    const fmtK = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}K` : `${Math.round(n)}`;
    const fallback = LABEL_SETS[labelSet % LABEL_SETS.length];

    // Two labels: geometry stats top-right, material info bottom-left
    const templates = [
      { text: `${fmtK(tris)} TRIS`,              pos: [ 0.90,  0.45, 0.25] as [number,number,number], sub: `${fmtK(verts)} VERTS · FBX` },
      { text: fallback[1]?.text ?? "PBR SURFACE", pos: [-0.85, -0.35, 0.25] as [number,number,number], sub: fallback[1]?.sub ?? "BLENDER 4.3" },
    ];

    // Keep labels closer in fullscreen mode so they stay within the viewport
    const safeR     = visualSphere.radius + (fullscreen ? 1.2 : 1.5);
    const rayOrigin = new THREE.Vector3(0, 0, 0);
    const hit       = new THREE.Vector3();

    return templates.map((label) => {
      const dir    = new THREE.Vector3(...label.pos).normalize();
      const isLeft = dir.x < -0.10;
      const ray    = new THREE.Ray(rayOrigin, dir);
      const result = ray.intersectBox(visualCBox, hit);

      const surfaceD = result ? result.length() : visualSphere.radius * 0.85;
      const surface: [number, number, number] = [dir.x * surfaceD, dir.y * surfaceD, dir.z * surfaceD];
      const pos:     [number, number, number] = [dir.x * safeR,    dir.y * safeR,    dir.z * safeR];

      return { ...label, pos, surface, isLeft };
    });
  }, [scene, labelSet, fullscreen]);

  // Three.js Line objects — one per label, disposed when computedLabels changes.
  const lineObjs = useMemo(() =>
    computedLabels.map(({ surface, pos }) => {
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(...surface),
        new THREE.Vector3(...pos),
      ]);
      const mat = new THREE.LineBasicMaterial({
        color:      new THREE.Color(0x5fc8e8),
        transparent: true,
        opacity:     0,
        depthWrite:  false,
      });
      return new THREE.Line(geo, mat);
    }),
  [computedLabels]);

  useEffect(() => () => {
    lineObjs.forEach(({ geometry, material }) => {
      geometry.dispose();
      (material as THREE.LineBasicMaterial).dispose();
    });
  }, [lineObjs]);

  // Slide-in animation directions: text slides OUT from the model on reveal.
  const slideIn = computedLabels.map((l) =>
    l.isLeft ? "translateX(6px)" : "translateX(-6px)",
  );

  useFrame(() => {
    const visible  = hoveredRef.current || fullscreen;
    const lerpK    = 0.085;

    // Animate text opacity + slide
    domRefs.current.forEach((el, i) => {
      if (!el) return;
      const tgt = visible ? "1" : "0";
      const shift = visible ? "translateX(0px)" : slideIn[i];
      if (el.style.opacity !== tgt) {
        el.style.opacity   = tgt;
        el.style.transform = shift;
      }
    });

    // Animate line opacity (smooth, no snap)
    const tgtAlpha = visible ? 0.52 : 0;
    lineObjs.forEach((obj) => {
      const mat = obj.material as THREE.LineBasicMaterial;
      const cur = mat.opacity;
      if (Math.abs(cur - tgtAlpha) > 0.002) {
        mat.opacity       = cur + (tgtAlpha - cur) * lerpK;
        mat.needsUpdate   = true;
      }
    });
  });

  const sz    = fullscreen ? 11  : 9;
  const subSz = fullscreen ? 9   : 7.5;

  return (
    <>
      {/* 3D connector lines — anchored at bbox surface, end at text anchor */}
      {lineObjs.map((obj, i) => (
        <primitive key={`ln-${i}`} object={obj} />
      ))}

      {/* HTML text labels — fixed pixel size (no distanceFactor) for legibility.
          drei's <Html> centers content at the projection: applies translate(-50%,-50%).
          We counter-shift with an outer wrapper so text extends AWAY from the model:
            right-side → translateX(+50%) shifts left edge to the anchor point  (extends right)
            left-side  → translateX(-50%) shifts right edge to the anchor point (extends left)  */}
      {computedLabels.map((label, i) => {
        const wrapStyle: React.CSSProperties = label.isLeft
          ? { transform: "translateX(-50%)", textAlign: "right" as const }
          : { transform: "translateX(50%)",  textAlign: "left"  as const };

        return (
          <Html
            key={`lbl-${i}`}
            position={label.pos}
            style={{ pointerEvents: "none" }}
          >
            <div style={{ ...wrapStyle, pointerEvents: "none" }}>
              <div
                ref={(el) => { domRefs.current[i] = el; }}
                style={{
                  opacity:       "0",
                  transform:     slideIn[i],
                  transition:    `opacity 0.38s ${i * 0.10}s ease, transform 0.38s ${i * 0.10}s ease`,
                  fontFamily:    "var(--font-geist-mono), monospace",
                  fontSize:      `${sz}px`,
                  fontWeight:    400,
                  color:         "rgba(255,255,255,0.92)",
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  whiteSpace:    "nowrap",
                  userSelect:    "none",
                  lineHeight:    1.45,
                  textShadow:    "0 0 12px rgba(0,0,0,0.9), 0 1px 3px rgba(0,0,0,0.85)",
                }}
              >
                <div>{label.text}</div>
                <div style={{
                  opacity:       0.52,
                  fontSize:      `${subSz}px`,
                  letterSpacing: "0.10em",
                  marginTop:     "3px",
                  fontWeight:    300,
                }}>
                  {label.sub}
                </div>
              </div>
            </div>
          </Html>
        );
      })}
    </>
  );
}

// ─── 3D model ──────────────────────────────────────────────────────────────
// Uses the same primitive+normScale strategy as VoidBackground's VoidModel so
// FBXLoader's cm→m root transform is preserved and models render at the right
// size without the blue-emissive "ghost" look of cloned geometries.
function ShowcaseModel({
  modelPath,
  textures,
  matRef: extMatRef,
  onNormScale,
}: {
  modelPath:   string;
  textures:    TextureSet;
  matRef:      React.RefObject<THREE.MeshStandardMaterial | null>;
  onNormScale: (n: number) => void;
}) {
  const rawScene = useFBX(modelPath);
  // Clone so VoidBackground and WorkItemCanvas don't share materials
  const scene    = useMemo(() => rawScene.clone(true), [rawScene]);
  const groupRef = useRef<THREE.Group>(null);
  const matRefs  = useRef<THREE.MeshStandardMaterial[]>([]);

  // ── Replace materials + compute normScale + centreOffset ──────────────────
  const { normScale, centreOffset } = useMemo(() => {
    matRefs.current = [];
    scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        const mesh = o as THREE.Mesh;
        const prev = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        prev.forEach(m => (m as THREE.Material)?.dispose());
        const mat = new THREE.MeshStandardMaterial({
          color:            0xffffff,
          emissive:         new THREE.Color(0x000000),
          emissiveIntensity: 0,
          roughness:        0.72,
          metalness:        0.05,
          envMapIntensity:  1.4,
          side:             THREE.FrontSide,
        });
        mesh.material = mat;
        matRefs.current.push(mat);
        if (matRefs.current.length === 1 && extMatRef) {
          (extMatRef as React.MutableRefObject<THREE.MeshStandardMaterial | null>).current = mat;
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
    // centreOffset in post-normScale world space: moves bounding-box centre to origin
    return { normScale: ns, centreOffset: center.clone().negate().multiplyScalar(ns) };
  }, [scene]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── PBR texture loading ──────────────────────────────────────────────────
  const texSig = [textures.map, textures.normalMap, textures.roughnessMap, textures.metalnessMap]
    .filter(Boolean).join("|");

  useEffect(() => {
    if (!texSig) return;
    const loader = new THREE.TextureLoader();
    const t      = textures;
    const apply  = (fn: (m: THREE.MeshStandardMaterial) => void) =>
      matRefs.current.forEach(m => { if (m) { fn(m); m.needsUpdate = true; } });

    if (t.map)          loader.loadAsync(t.map).then(tx => { tx.colorSpace = THREE.SRGBColorSpace; apply(m => { m.map = tx; }); }).catch(() => {});
    if (t.normalMap)    loader.loadAsync(t.normalMap).then(tx => { apply(m => { m.normalMap = tx; }); }).catch(() => {});
    if (t.roughnessMap) loader.loadAsync(t.roughnessMap).then(tx => { apply(m => { m.roughnessMap = tx; m.roughness = 1; }); }).catch(() => {});
    if (t.metalnessMap) loader.loadAsync(t.metalnessMap).then(tx => { apply(m => { m.metalnessMap = tx; m.metalness = 1; }); }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texSig]);

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

  // ── Subtle emissive pulse (rim glow when hovered) ────────────────────────
  useFrame((s) => {
    const ref = extMatRef.current as THREE.MeshStandardMaterial | null;
    if (!ref) return;
    if (ref.emissive.r === 0 && ref.emissive.g === 0 && ref.emissive.b === 0) {
      ref.emissive.set(0x112233);
    }
    const t = s.clock.elapsedTime;
    ref.emissiveIntensity += (0.06 + 0.03 * Math.sin(t * 0.65) - ref.emissiveIntensity) * 0.04;
    matRefs.current.forEach(m => { if (m && m !== ref) m.emissiveIntensity = ref.emissiveIntensity; });
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
  labelSet,
}: {
  modelPath:  string;
  textures:   TextureSet;
  hoveredRef: React.RefObject<boolean>;
  fullscreen: boolean;
  labelSet:   number;
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
        {/* Labels outside Bounds so they don't push the camera back */}
        <ModelLabels
          modelPath={modelPath}
          hoveredRef={hoveredRef}
          fullscreen={fullscreen}
          labelSet={labelSet}
        />
      </Suspense>
    </>
  );
}

// ─── Exported component ────────────────────────────────────────────────────
export default function WorkItemCanvas({
  modelPath,
  textures   = {},
  hoveredRef,
  containerRef,
  fullscreen = false,
  labelSet   = 0,
}: {
  modelPath:    string;
  textures?:    TextureSet;
  hoveredRef:   React.RefObject<boolean>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  fullscreen?:  boolean;
  labelSet?:    number;
}) {
  const [mounted, setMounted] = useState(fullscreen);

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

  // In fullscreen, <Bounds> repositions the camera automatically,
  // so the starting camPos is just an initial guess.
  const camPos: [number, number, number] = fullscreen ? [0, 0, 10] : [0, 0.1, 11.0];
  const camFov = fullscreen ? 44 : 36;

  return (
    <Canvas
      gl={{ alpha: true, premultipliedAlpha: false, antialias: true }}
      camera={{ position: camPos, fov: camFov }}
      dpr={fullscreen ? [1, 2] : [1, 1.5]}
      style={{ width: "100%", height: "100%", display: "block" }}
    >
      <ShowcaseScene
        modelPath={modelPath}
        textures={textures}
        hoveredRef={hoveredRef}
        fullscreen={fullscreen}
        labelSet={labelSet}
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
  );
}
