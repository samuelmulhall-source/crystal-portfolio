"use client";

/**
 * SpecimenScene — the heavy R3F internals for the interactive 3D viewer.
 *
 * Self-contained: no journey/voidState/station coupling. Driven entirely by
 * the content `specimen` field (model path + PBR texture set). Dynamically
 * imported by SpecimenViewer so the Three.js bundle never loads in reduced
 * mode or during SSR.
 */

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import { Environment, Lightformer, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { clone as skeletonClone } from "three/examples/jsm/utils/SkeletonUtils.js";
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

/** 1px transparent PNG — placeholder so useLoader never gets an empty array
 *  (it suspends forever on []), e.g. for texture-less rigged characters. */
const TRANSPARENT_PX =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

function SpecimenModel({
  specimen,
  channel = "material",
  clipIndex = 0,
  poseMode = false,
  onReady,
  onStats,
  onClips,
  setDragLock,
}: {
  specimen: Specimen;
  channel?: SpecimenChannel;
  /** Which embedded animation clip to play (rigged characters). */
  clipIndex?: number;
  /** Pose mode: pause animation and enable drag-to-pose IK handles. */
  poseMode?: boolean;
  onReady?: () => void;
  onStats?: (stats: SpecimenStats) => void;
  /** Report the rig's clip names so the viewer can build a selector. */
  onClips?: (names: string[]) => void;
  /** Freeze OrbitControls while a pose handle is dragged. */
  setDragLock?: (v: boolean) => void;
}) {
  // Stable path array → no conditional hooks. useLoader with an array returns
  // results in order; primary is always [0], optional extra is [1].
  const paths = useMemo(() => {
    const list = [enc(specimen.modelPath)];
    if (specimen.extraModelPath) list.push(enc(specimen.extraModelPath));
    return list;
  }, [specimen.modelPath, specimen.extraModelPath]);
  const loaded = useLoader(FBXLoader, paths) as THREE.Group[];
  const isRigged = !!specimen.rigged;

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
  // re-suspend forever. NEVER pass an empty array: useLoader suspends forever on
  // [] (this is why texture-less rigged characters hung) — fall back to a 1px
  // transparent so it always resolves; the placeholder is ignored below.
  const texUrls = useMemo(
    () => (texEntries.length ? texEntries.map((e) => e[1]) : [TRANSPARENT_PX]),
    [texEntries],
  );
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
      return new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        map: colorMap,
        normalMap: tex.normalMap ?? null,
        normalMapType: THREE.TangentSpaceNormalMap,
        roughnessMap: tex.roughnessMap ?? null,
        roughness: tex.roughnessMap ? 0.95 : 0.7,
        metalnessMap: tex.metalnessMap ?? null,
        metalness: tex.metalnessMap ? 0.95 : 0.1,
        transmissionMap: tex.transmissionMap ?? null,
        transmission: tex.transmissionMap ? 0.5 : 0,
        thickness: tex.transmissionMap ? 0.5 : 0,
        ior: 1.5,
        envMapIntensity: 0.9,
        clearcoat: 0.12,
        clearcoatRoughness: 0.14,
        side: THREE.FrontSide,
      });
    }
    const channelMat = buildMaterial();

    // Rigged characters: skeleton-safe clone (a naive .clone() breaks skinning)
    // and keep the model's own materials. Props: merge + replace materials.
    let group: THREE.Object3D;
    if (isRigged) {
      group = skeletonClone(loaded[0]);
    } else {
      const g = new THREE.Group();
      loaded.forEach((m) => g.add(m.clone()));
      group = g;
    }

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
        if (channel === "wireframe") {
          // Wireframe applies to every model, rigged or not (skinning is
          // auto-handled by three for SkinnedMesh).
          mesh.material = channelMat;
        } else if (isRigged) {
          // Keep the character's authored materials for the shaded view.
        } else {
          const prev = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          prev.forEach((m) => (m as THREE.Material)?.dispose());
          mesh.material = channelMat;
        }
      }
    });

    const realTex = texList.slice(0, texEntries.length);
    const maxTextureSize = realTex.reduce((max, texture) => {
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
        maps: texEntries.length,
        maxTextureSize,
      } satisfies SpecimenStats,
    };
  }, [loaded, tex, texList, texEntries, specimen.yOffset, channel, isRigged]);

  // Report the rig's animation clips once so the viewer can build a selector.
  const anims = useMemo(
    () => (isRigged ? ((loaded[0] as THREE.Group).animations ?? []) : []),
    [isRigged, loaded],
  );
  useEffect(() => {
    if (anims.length) onClips?.(anims.map((a) => a.name));
  }, [anims, onClips]);

  // Play the selected clip so the rig reads as alive. Paused in pose mode so the
  // IK solver (below) can drive the bones without the mixer fighting it. Mixer
  // resolves clip tracks by bone name within the cloned object.
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  useEffect(() => {
    if (!isRigged || !anims.length || poseMode) return;
    const mixer = new THREE.AnimationMixer(object);
    const clip = anims[Math.min(clipIndex, anims.length - 1)] ?? anims[0];
    mixer.clipAction(clip).reset().play();
    mixerRef.current = mixer;
    return () => {
      mixer.stopAllAction();
      mixer.uncacheRoot(object as THREE.Object3D);
      mixerRef.current = null;
    };
  }, [object, isRigged, anims, clipIndex, poseMode]);
  useFrame((_, dt) => mixerRef.current?.update(dt));

  // Signal readiness once the model is mounted (assets resolved via Suspense).
  useEffect(() => {
    onStats?.(stats);
    const id = requestAnimationFrame(() => onReady?.());
    return () => cancelAnimationFrame(id);
  }, [onReady, onStats, stats]);

  return (
    <>
      <group position={[centreOffset.x, centreOffset.y, centreOffset.z]}>
        <group scale={normScale}>
          <primitive object={object} />
        </group>
      </group>
      {isRigged && poseMode ? <RigPoser root={object} setDragLock={setDragLock} /> : null}
    </>
  );
}

// ─── Drag-to-pose IK ────────────────────────────────────────────────────────
// A hand-rolled CCD (cyclic coordinate descent) over each limb chain: rotate the
// chain bones so the effector reaches the dragged handle. Operates purely on
// bone quaternions + world matrices — no skeleton mutation, works on any rig.
const CORRECTIVE = /twist|share|roll|helper|\bik\b|_end$|end$/i;
const EFFECTOR = /(hand|foot)/i;
const NON_EFFECTOR = /toe|finger|thumb|index|middle|ring|pinky|ball|twist|share|roll|end/i;

type Chain = { effector: THREE.Bone; bones: THREE.Bone[]; name: string };

function buildChains(root: THREE.Object3D): { primary: THREE.SkinnedMesh; chains: Chain[] } | null {
  let primary: THREE.SkinnedMesh | null = null;
  root.traverse((o) => {
    const sm = o as THREE.SkinnedMesh;
    if (sm.isSkinnedMesh && (!primary || sm.skeleton.bones.length > primary.skeleton.bones.length)) {
      primary = sm;
    }
  });
  if (!primary) return null;
  const bones = (primary as THREE.SkinnedMesh).skeleton.bones;
  const seen = new Set<string>();
  const chains: Chain[] = [];
  for (const eff of bones) {
    if (!EFFECTOR.test(eff.name) || NON_EFFECTOR.test(eff.name)) continue;
    if (seen.has(eff.name)) continue;
    seen.add(eff.name);
    const chain: THREE.Bone[] = [eff];
    let cur = eff.parent as THREE.Bone | null;
    let real = 0;
    while (cur && (cur as THREE.Bone).isBone && real < 2) {
      if (!CORRECTIVE.test(cur.name)) {
        chain.unshift(cur);
        real += 1;
      }
      cur = cur.parent as THREE.Bone | null;
    }
    if (chain.length >= 2) chains.push({ effector: eff, bones: chain, name: eff.name });
  }
  return { primary, chains };
}

const _effPos = new THREE.Vector3();
const _bonePos = new THREE.Vector3();
const _toEff = new THREE.Vector3();
const _toTarget = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _q = new THREE.Quaternion();

/** One CCD pass: rotate chain bones (root→effector) toward a world-space target. */
function solveCCD(chain: THREE.Bone[], target: THREE.Vector3, iterations = 6) {
  const effector = chain[chain.length - 1];
  for (let it = 0; it < iterations; it++) {
    for (let i = chain.length - 2; i >= 0; i--) {
      const bone = chain[i];
      _effPos.setFromMatrixPosition(effector.matrixWorld);
      _bonePos.setFromMatrixPosition(bone.matrixWorld);
      _toEff.subVectors(_effPos, _bonePos);
      _toTarget.subVectors(target, _bonePos);
      if (_toEff.lengthSq() < 1e-8 || _toTarget.lengthSq() < 1e-8) continue;
      _toEff.normalize();
      _toTarget.normalize();
      let angle = Math.acos(Math.min(1, Math.max(-1, _toEff.dot(_toTarget))));
      if (angle < 1e-4) continue;
      angle = Math.min(angle, 0.25); // clamp per-step to keep it stable/smooth
      _axis.crossVectors(_toEff, _toTarget);
      if (_axis.lengthSq() < 1e-8) continue;
      _axis.normalize();
      // world axis → bone-local
      bone.getWorldQuaternion(_q).invert();
      _axis.applyQuaternion(_q).normalize();
      bone.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(_axis, angle));
      bone.updateWorldMatrix(false, true); // refresh effector under this bone
    }
  }
}

function RigPoser({
  root,
  setDragLock,
}: {
  root: THREE.Object3D;
  setDragLock?: (v: boolean) => void;
}) {
  const rig = useMemo(() => buildChains(root), [root]);
  const dragRef = useRef<{ chain: THREE.Bone[]; plane: THREE.Plane } | null>(null);
  const targetRef = useRef(new THREE.Vector3());
  const handleRefs = useRef<Array<THREE.Mesh | null>>([]);
  const { camera } = useThree();
  const camDir = useMemo(() => new THREE.Vector3(), []);

  // Keep handles parked on their effectors each frame; solve while dragging.
  useFrame(() => {
    if (!rig) return;
    rig.chains.forEach((c, i) => {
      const h = handleRefs.current[i];
      if (h && dragRef.current?.chain !== c.bones) {
        h.position.setFromMatrixPosition(c.effector.matrixWorld);
      }
    });
    if (dragRef.current) solveCCD(dragRef.current.chain, targetRef.current);
  });

  if (!rig || rig.chains.length === 0) return null;

  return (
    <group>
      {rig.chains.map((c, i) => (
        <mesh
          key={c.name}
          ref={(el) => {
            handleRefs.current[i] = el;
          }}
          onPointerDown={(e) => {
            e.stopPropagation();
            (e.target as Element).setPointerCapture?.(e.pointerId);
            camera.getWorldDirection(camDir);
            const origin = new THREE.Vector3().setFromMatrixPosition(c.effector.matrixWorld);
            dragRef.current = {
              chain: c.bones,
              plane: new THREE.Plane().setFromNormalAndCoplanarPoint(camDir.clone().negate(), origin),
            };
            targetRef.current.copy(origin);
            setDragLock?.(true);
          }}
          onPointerMove={(e) => {
            const d = dragRef.current;
            if (!d) return;
            const hit = e.ray.intersectPlane(d.plane, new THREE.Vector3());
            if (hit) targetRef.current.copy(hit);
          }}
          onPointerUp={(e) => {
            (e.target as Element).releasePointerCapture?.(e.pointerId);
            dragRef.current = null;
            setDragLock?.(false);
          }}
        >
          <sphereGeometry args={[0.07, 16, 16]} />
          <meshBasicMaterial color="#9fe6ff" transparent opacity={0.85} depthTest={false} />
        </mesh>
      ))}
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
  clipIndex = 0,
  poseMode = false,
  allowZoom = false,
  onReady,
  onStats,
  onClips,
}: {
  specimen: Specimen;
  channel?: SpecimenChannel;
  clipIndex?: number;
  poseMode?: boolean;
  /** Wheel-zoom hijacks page scroll — only enable in deliberate inspection
   *  contexts (detail pages), never mid-scroll surfaces like the showcase. */
  allowZoom?: boolean;
  onReady?: () => void;
  onStats?: (stats: SpecimenStats) => void;
  onClips?: (names: string[]) => void;
}) {
  const [interacting, setInteracting] = useState(false);
  // When a pose handle is being dragged, freeze orbit so the camera doesn't spin.
  const [dragLock, setDragLock] = useState(false);

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
          clipIndex={clipIndex}
          poseMode={poseMode}
          onReady={onReady}
          onStats={onStats}
          onClips={onClips}
          setDragLock={setDragLock}
        />
      </Suspense>
      <OrbitControls
        enablePan={false}
        enableZoom={allowZoom}
        enabled={!dragLock}
        minDistance={2.8}
        maxDistance={7}
        autoRotate={!interacting && !poseMode}
        autoRotateSpeed={0.9}
        enableDamping
        dampingFactor={0.08}
        minPolarAngle={Math.PI * 0.18}
        maxPolarAngle={Math.PI * 0.82}
      />
    </Canvas>
  );
}
