"use client";

/**
 * SpecimenScene — the heavy R3F internals for the interactive 3D viewer.
 *
 * Self-contained: no journey/voidState/station coupling. Driven entirely by
 * the content `specimen` field (model path + PBR texture set). Dynamically
 * imported by SpecimenViewer so the Three.js bundle never loads in reduced
 * mode or during SSR.
 */

import { Suspense, useEffect, useMemo, useState } from "react";
import { Canvas, useLoader } from "@react-three/fiber";
import { Environment, Lightformer, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import type { Specimen } from "../../lib/content";

type TexKey = "map" | "normalMap" | "roughnessMap" | "metalnessMap" | "transmissionMap";

/** What the inspector renders on the model. "material" = full PBR; "wireframe"
 *  = ice line-art; the rest show that raw texture map flat on the surface. */
export type SpecimenChannel = "material" | "wireframe" | TexKey;

/** Technical readout computed from the loaded geometry + texture set. */
export type SpecimenStats = {
  triangles: number;
  vertices: number;
  meshes: number;
  maps: number;
  /** Largest texture dimension in px (e.g. 2048). */
  maxTextureSize: number;
};

/** Encode a public path so spaces in filenames resolve correctly. */
function enc(p: string) {
  return p.split("/").map(encodeURIComponent).join("/");
}

function SpecimenModel({
  specimen,
  channel = "material",
  onReady,
  onStats,
}: {
  specimen: Specimen;
  channel?: SpecimenChannel;
  onReady?: () => void;
  onStats?: (stats: SpecimenStats) => void;
}) {
  // Stable path array → no conditional hooks. useLoader with an array returns
  // results in order; primary is always [0], optional extra is [1].
  const paths = useMemo(() => {
    const list = [enc(specimen.modelPath)];
    if (specimen.extraModelPath) list.push(enc(specimen.extraModelPath));
    return list;
  }, [specimen.modelPath, specimen.extraModelPath]);
  const loaded = useLoader(FBXLoader, paths) as THREE.Group[];

  // Load PBR maps via Suspense (useLoader) so textures are ready BEFORE
  // materials are built — avoids any async-apply desync. useLoader with a
  // stable array mirrors the FBX pattern above.
  const t = specimen.textures;
  const texEntries = useMemo(() => {
    const e: Array<[TexKey, string]> = [];
    if (t.map) e.push(["map", enc(t.map)]);
    if (t.normalMap) e.push(["normalMap", enc(t.normalMap)]);
    if (t.roughnessMap) e.push(["roughnessMap", enc(t.roughnessMap)]);
    if (t.metalnessMap) e.push(["metalnessMap", enc(t.metalnessMap)]);
    if (t.transmissionMap) e.push(["transmissionMap", enc(t.transmissionMap)]);
    return e;
  }, [t.map, t.normalMap, t.roughnessMap, t.metalnessMap, t.transmissionMap]);
  // Stable URL array reference — a fresh array each render makes useLoader
  // re-suspend forever.
  const texUrls = useMemo(() => texEntries.map((e) => e[1]), [texEntries]);
  const texList = useLoader(THREE.TextureLoader, texUrls);
  const tex = useMemo(() => {
    const out = {} as Record<TexKey, THREE.Texture | undefined>;
    texEntries.forEach((e, i) => { out[e[0]] = texList[i]; });
    return out;
  }, [texEntries, texList]);

  // Build a merged group, replace materials (with maps already loaded),
  // auto-center + normalize scale — all in one synchronous pass.
  const { object, normScale, centreOffset, stats } = useMemo(() => {
    // Clone the colour map so its colour space can be set without mutating the
    // shared loader-cached texture (other maps default to NoColorSpace, which
    // is already correct for normal/roughness/metalness/transmission).
    const colorMap = tex.map ? tex.map.clone() : null;
    if (colorMap) colorMap.colorSpace = THREE.SRGBColorSpace;

    // Build the ONE material the chosen channel renders. For a raw texture
    // channel, show that map flat + unlit on the surface (cloned to sRGB so it
    // reads like the source file); fall back to PBR if the map is absent.
    function rawMap(key: TexKey): THREE.Texture | null {
      const src = key === "map" ? colorMap : tex[key];
      if (!src) return null;
      const disp = src.clone();
      disp.colorSpace = THREE.SRGBColorSpace;
      disp.needsUpdate = true;
      return disp;
    }
    function buildMaterial(): THREE.Material {
      if (channel === "wireframe") {
        // Tech view — ice line-art wireframe, matches the site's HUD language.
        return new THREE.MeshBasicMaterial({
          color: 0x9fdcff,
          wireframe: true,
          transparent: true,
          opacity: 0.5,
        });
      }
      if (channel !== "material") {
        const m = rawMap(channel);
        if (m) return new THREE.MeshBasicMaterial({ map: m, side: THREE.FrontSide });
        // map not present on this specimen → fall through to PBR
      }
      const hasGlass = !!tex.transmissionMap;
      return new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        map: colorMap,
        normalMap: tex.normalMap ?? null,
        normalMapType: THREE.TangentSpaceNormalMap,
        roughnessMap: tex.roughnessMap ?? null,
        // Lower roughness overall, and lower still where there's glass, so the
        // transmission refraction (IOR) reads sharp instead of frosted.
        roughness: tex.roughnessMap ? (hasGlass ? 0.55 : 0.85) : hasGlass ? 0.12 : 0.55,
        metalnessMap: tex.metalnessMap ?? null,
        metalness: tex.metalnessMap ? 0.95 : 0.1,
        transmissionMap: tex.transmissionMap ?? null,
        transmission: hasGlass ? 0.92 : 0,
        thickness: hasGlass ? 0.9 : 0,
        ior: 1.5,
        envMapIntensity: 1.05,
        clearcoat: 0.12,
        clearcoatRoughness: 0.1,
        side: THREE.FrontSide,
      });
    }
    const channelMat = buildMaterial();

    const group = new THREE.Group();
    loaded.forEach((g) => group.add(g.clone()));

    const labelLike = /(normal\s*map|tangent|tris|polygon|vertex|uv\s*map|debug|label)/i;

    let triangles = 0;
    let vertices = 0;
    let meshes = 0;

    group.traverse((o) => {
      if (labelLike.test(o.name)) {
        o.visible = false;
        return;
      }
      if ((o as THREE.Mesh).isMesh) {
        const mesh = o as THREE.Mesh;
        const geo = mesh.geometry as THREE.BufferGeometry;
        meshes += 1;
        vertices += geo.attributes.position?.count ?? 0;
        triangles += Math.round(
          (geo.index ? geo.index.count : geo.attributes.position?.count ?? 0) / 3,
        );
        const prev = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        prev.forEach((m) => (m as THREE.Material)?.dispose());
        // One shared material across meshes — same treatment, cheaper.
        mesh.material = channelMat;
      }
    });

    const maxTextureSize = texList.reduce((max, texture) => {
      const img = texture.image as { width?: number; height?: number } | undefined;
      return Math.max(max, img?.width ?? 0, img?.height ?? 0);
    }, 0);

    const box = new THREE.Box3().setFromObject(group);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const maxDim = Math.max(size.x, size.y, size.z);
    const ns = maxDim > 0 ? 2.4 / maxDim : 1;
    const off = center.clone().negate().multiplyScalar(ns);
    off.y += specimen.yOffset ?? 0;
    return {
      object: group,
      normScale: ns,
      centreOffset: off,
      stats: {
        triangles,
        vertices,
        meshes,
        maps: texList.length,
        maxTextureSize,
      } satisfies SpecimenStats,
    };
  }, [loaded, tex, texList, specimen.yOffset, channel]);

  // Signal readiness once the model is mounted (assets resolved via Suspense).
  useEffect(() => {
    onStats?.(stats);
    const id = requestAnimationFrame(() => onReady?.());
    return () => cancelAnimationFrame(id);
  }, [onReady, onStats, stats]);

  return (
    <group position={[centreOffset.x, centreOffset.y, centreOffset.z]}>
      <group scale={normScale}>
        <primitive object={object} />
      </group>
    </group>
  );
}

/** Studio lighting tuned for a CLOSE specimen viewer (toned down from the
 *  far-field void rig so PBR albedo reads instead of clipping to white). */
function StudioLights() {
  return (
    <>
      <ambientLight intensity={0.32} color="#e0e0e0" />
      <hemisphereLight args={["#b8d0ff", "#141a2c", 0.4]} />
      <directionalLight position={[-4, 8, 6]} intensity={1.3} color="#ffffff" />
      <directionalLight position={[5, 3, 5]} intensity={0.7} color="#f8f8f8" />
      <directionalLight position={[0, 2, 9]} intensity={0.8} color="#f4f4f4" />
      <directionalLight position={[0, -3, -8]} intensity={0.8} color="#a9c8ee" />
      <directionalLight position={[3, 4, -6]} intensity={0.7} color="#bcd8f5" />
      <directionalLight position={[0, 10, 2]} intensity={0.35} color="#f0f0f0" />
      <pointLight position={[2, 1, 5]} intensity={0.6} color="#ffffff" distance={30} />
      {/* Local procedural environment (no external HDR fetch → keeps the canvas
          untainted for toDataURL, and removes a CDN dependency on deploy). */}
      <Environment resolution={256} environmentIntensity={0.55}>
        <Lightformer intensity={2.4} position={[0, 2.5, 3]} scale={[6, 5, 1]} color="#ffffff" />
        <Lightformer intensity={1.1} position={[-4, 1, 2]} scale={[4, 4, 1]} color="#cfe6ff" />
        <Lightformer intensity={0.9} position={[4, -1, 1]} scale={[4, 4, 1]} color="#ffffff" />
        <Lightformer intensity={0.7} position={[0, -2, -3]} scale={[6, 4, 1]} color="#9fb8d8" />
      </Environment>
    </>
  );
}

export default function SpecimenScene({
  specimen,
  channel = "material",
  allowZoom = false,
  onReady,
  onStats,
}: {
  specimen: Specimen;
  channel?: SpecimenChannel;
  /** Wheel-zoom hijacks page scroll — only enable in deliberate inspection
   *  contexts (detail pages), never mid-scroll surfaces like the showcase. */
  allowZoom?: boolean;
  onReady?: () => void;
  onStats?: (stats: SpecimenStats) => void;
}) {
  const [interacting, setInteracting] = useState(false);

  return (
    <Canvas
      camera={{ position: [0, 0, 4.6], fov: 34 }}
      dpr={[1, 1.75]}
      gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}
      style={{ width: "100%", height: "100%" }}
      onPointerDown={() => setInteracting(true)}
      onPointerUp={() => setInteracting(false)}
      onCreated={() => {
        // R3F can measure the container before layout settles (canvas stuck at
        // 300×150). A deferred resize forces a correct re-measure.
        requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
      }}
    >
      <StudioLights />
      <Suspense fallback={null}>
        <SpecimenModel
          specimen={specimen}
          channel={channel}
          onReady={onReady}
          onStats={onStats}
        />
      </Suspense>
      <OrbitControls
        enablePan={false}
        enableZoom={allowZoom}
        minDistance={2.8}
        maxDistance={7}
        autoRotate={!interacting}
        autoRotateSpeed={0.9}
        enableDamping
        dampingFactor={0.08}
        minPolarAngle={Math.PI * 0.18}
        maxPolarAngle={Math.PI * 0.82}
      />
    </Canvas>
  );
}
