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
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
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

/** Shared Draco decoder (self-hosted in /public/draco) — one instance avoids
 *  spawning duplicate decoder workers across loads. */
let _draco: DRACOLoader | null = null;
function getDracoLoader() {
  if (!_draco) {
    _draco = new DRACOLoader();
    _draco.setDecoderPath("/draco/");
  }
  return _draco;
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
  handPose = "rest",
  onReady,
  onStats,
  onClips,
  onPoseable,
  setDragLock,
}: {
  specimen: Specimen;
  channel?: SpecimenChannel;
  /** Which animation clip to play (rigged characters). */
  clipIndex?: number;
  /** Pose mode: pause animation and enable drag-to-pose IK handles. */
  poseMode?: boolean;
  /** Hand preset while posing (open / rest / fist). */
  handPose?: HandPose;
  onReady?: () => void;
  onStats?: (stats: SpecimenStats) => void;
  /** Report the rig's playable clip names for the selector. */
  onClips?: (names: string[]) => void;
  /** Report whether drag-to-pose is viable on this rig. */
  onPoseable?: (v: boolean) => void;
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
  // glb/gltf (rigged characters: a clean Blender re-export) load through
  // GLTFLoader + a self-hosted Draco decoder; everything else through FBXLoader.
  // Same useLoader call, just a different loader class + a one-time extension.
  const isGLB = /\.(glb|gltf)$/i.test(specimen.modelPath);
  const loadedRaw = useLoader(isGLB ? GLTFLoader : FBXLoader, paths, (loader) => {
    if (loader instanceof GLTFLoader) loader.setDRACOLoader(getDracoLoader());
  });
  // Normalize to a list of scene roots regardless of loader (GLTF wraps its
  // graph in `.scene`; FBX returns the group directly).
  const loaded = useMemo(
    () => (isGLB ? (loadedRaw as GLTF[]).map((g) => g.scene) : (loadedRaw as THREE.Group[])),
    [isGLB, loadedRaw],
  );
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
  const { object, normScale, centreOffset, groundY, stats } = useMemo(() => {
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

    // Rigged characters: drive the ORIGINAL loaded object (not a clone) so the
    // embedded animation clips bind correctly and the IK acts on the real
    // skinned bones. Props: merge clones + replace materials.
    let group: THREE.Object3D;
    if (isRigged) {
      group = loaded[0];
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
        // Cast onto the ground plane below and receive shadows from other
        // parts of the same asset (e.g. a character's arm shadowing its body).
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        vertices += geo.attributes.position?.count ?? 0;
        triangles += Math.round(
          (geo.index ? geo.index.count : geo.attributes.position?.count ?? 0) / 3,
        );
        if (isRigged) {
          // Keep the character's authored materials; toggle wireframe on them
          // non-destructively (no swap → nothing to restore, skinning intact).
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          mats.forEach((m) => {
            if (m) (m as THREE.MeshStandardMaterial).wireframe = channel === "wireframe";
          });
        } else if (channel === "wireframe") {
          mesh.material = channelMat;
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
    // Target ~2.0 units (of the ~2.8-unit visible frame height) so the asset
    // floats with gallery-style margin and tall props (sword/bow/torch) never
    // crowd the edges or bleed into the bottom caption/hint.
    const ns = maxDim > 0 ? 2.0 / maxDim : 1;
    const off = center.clone().negate().multiplyScalar(ns);
    off.y += specimen.yOffset ?? 0;
    // The asset's true base in WORLD space (for the shadow-catcher plane) —
    // derived from the real bounding box, not guessed. The object is centered
    // at world Y = yOffset (see the centreOffset math above), so its lowest
    // point sits half its scaled height below that.
    const groundY = (specimen.yOffset ?? 0) - (ns * size.y) / 2;
    return {
      object: group,
      normScale: ns,
      centreOffset: off,
      groundY,
      stats: {
        triangles,
        vertices,
        meshes,
        maps: texEntries.length,
        maxTextureSize,
      } satisfies SpecimenStats,
    };
  }, [loaded, tex, texList, texEntries, specimen.yOffset, channel, isRigged]);

  // This rig (a Reallusion/CC export) arrives as ~14 separate skinned meshes,
  // EACH with its own full clone of the skeleton (identical bone names). A single
  // mixer/IK solver can only drive one skeleton's bones — so the canonical
  // (densest) skeleton is the lead, and every frame its local bone transforms are
  // mirrored onto the same-named bones of the other skeletons so the whole
  // character moves as one. `groups` is empty for a normal single-skeleton rig.
  const rigSync = useMemo(() => buildRigSync(isRigged ? object : null), [object, isRigged]);

  const anims = useMemo(() => {
    if (!isRigged) return [];
    if (isGLB) return (loadedRaw as GLTF[])[0]?.animations ?? [];
    return (loaded[0] as THREE.Group).animations ?? [];
  }, [isRigged, isGLB, loadedRaw, loaded]);
  // Only the clips that carry REAL motion are playable. Many DCC exports ship
  // "animations" that are a single static pose duplicated across keyframes (this
  // character is one such — every embedded clip is the same frozen pose). Those
  // are filtered out so the viewer doesn't offer a meaningless clip selector and
  // instead falls back to the procedural idle below.
  const playable = useMemo(
    () => (isRigged ? anims.filter(clipHasMotion) : []),
    [isRigged, anims],
  );
  // Report clips for the selector: real motion clips when they exist, else the
  // procedural set (Idle / Wave / Look Around) so the rig still has functioning,
  // selectable animation.
  useEffect(() => {
    if (!isRigged) return;
    onClips?.(playable.length ? playable.map((a) => a.name) : PROC_CLIPS.map((c) => c.name));
  }, [isRigged, playable, onClips]);

  // Procedural clips — used when the rig has no real motion clips. Captures each
  // driver bone's base pose once (clean bind), then layers sine offsets on top.
  const idle = useMemo(() => (rigSync ? buildIdle(rigSync.primary) : null), [rigSync]);
  // Clip-switch cross-blend: remember the previous clip and ramp to the new one.
  const procSwitch = useRef({ from: 0, to: 0, start: -1 });
  useEffect(() => {
    if (playable.length) return; // real clips: the mixer handles switching
    const s = procSwitch.current;
    if (clipIndex !== s.to) {
      s.from = s.to;
      s.to = clipIndex;
      s.start = -1; // stamped with clock time on the next frame
    }
  }, [clipIndex, playable.length]);

  // Play the selected clip so the rig reads as alive. Rooted at the lead skinned
  // mesh so PropertyBinding resolves tracks via skeleton.getBoneByName (binds to
  // the real deform bones). Skipped when there are no real clips (idle takes over)
  // and in pose mode (the IK solver drives the bones instead).
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  useEffect(() => {
    if (!rigSync || !playable.length || poseMode) return;
    const root = rigSync.primary;
    const mixer = new THREE.AnimationMixer(root);
    const clip = playable[Math.min(clipIndex, playable.length - 1)] ?? playable[0];
    mixer.clipAction(clip).reset().play();
    mixerRef.current = mixer;
    return () => {
      mixer.stopAllAction();
      mixer.uncacheRoot(root);
      mixerRef.current = null;
    };
  }, [rigSync, playable, clipIndex, poseMode]);

  // Drive the rig (real clip OR procedural clip), then propagate the lead pose to
  // the duplicate skeletons. Pose mode is handled separately by RigPoser.
  useFrame((state, dt) => {
    if (!rigSync || poseMode) return;
    const m = mixerRef.current;
    if (m) m.update(dt);
    else if (idle) {
      const s = procSwitch.current;
      const t = state.clock.elapsedTime;
      if (s.start < 0) s.start = t;
      const raw = s.from === s.to ? 1 : Math.min(1, (t - s.start) / 0.7);
      const blend = raw * raw * (3 - 2 * raw); // smoothstep the cross-fade
      applyIdle(idle, t, s.from, s.to, blend);
    }
    mirrorRig(rigSync);
  });

  useEffect(() => {
    onPoseable?.(rigSync?.poseable ?? false);
  }, [rigSync, onPoseable]);

  // Signal readiness once the model is mounted (assets resolved via Suspense).
  // Defer one frame so the canvas paints before the poster fades, but fall back
  // to a timer so readiness still fires if rAF is throttled (backgrounded tab).
  useEffect(() => {
    onStats?.(stats);
    let done = false;
    const fire = () => {
      if (done) return;
      done = true;
      onReady?.();
    };
    const raf = requestAnimationFrame(fire);
    const timer = setTimeout(fire, 120);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }, [onReady, onStats, stats]);

  return (
    <>
      <group position={[centreOffset.x, centreOffset.y, centreOffset.z]}>
        <group scale={normScale}>
          <primitive object={object} />
        </group>
      </group>
      <ShadowCatcher y={groundY} />
      {rigSync && rigSync.poseable && poseMode ? (
        <RigPoser rig={rigSync} handPose={handPose} setDragLock={setDragLock} />
      ) : null}
    </>
  );
}

/** An invisible ground plane that shows ONLY the real-time shadow cast by the
 *  key light — THREE.ShadowMaterial renders nothing else, so it blends
 *  seamlessly with the transparent canvas and the CSS atmospheric backing
 *  behind it. Grounds the asset in real lit space instead of a painted
 *  backdrop (a flat gradient behind an already-lit object always looks a
 *  little disconnected, since the "light" in the backdrop has nothing to do
 *  with the light actually hitting the model). */
function ShadowCatcher({ y }: { y: number }) {
  return (
    <mesh position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[14, 14]} />
      <shadowMaterial transparent opacity={0.4} color="#000814" />
    </mesh>
  );
}

// ─── Multi-skeleton sync ─────────────────────────────────────────────────────
// CC/Reallusion FBX exports can arrive as many skinned meshes, each with its own
// full clone of the skeleton (identical bone names). One mixer/IK solver only
// drives one skeleton, so a RigSync designates the densest skeleton as the lead
// and mirrors its local bone pose onto the same-named bones of every other
// skeleton each frame. For a normal single-skeleton rig, `groups` is empty.
export type RigSync = {
  primary: THREE.SkinnedMesh;
  groups: Array<{ src: THREE.Bone; copies: THREE.Bone[] }>;
  /** Whether world-space drag-to-pose IK is viable. False for "segment scale
   *  compensate" exports whose bones carry large compounding scale — there,
   *  bone world positions explode and handles/IK can't be placed reliably. */
  poseable: boolean;
};

function buildRigSync(root: THREE.Object3D | null): RigSync | null {
  if (!root) return null;
  const meshes: THREE.SkinnedMesh[] = [];
  root.traverse((o) => {
    const sm = o as THREE.SkinnedMesh;
    if (sm.isSkinnedMesh) meshes.push(sm);
  });
  if (!meshes.length) return null;
  let primary = meshes[0];
  for (const m of meshes) {
    if (m.skeleton.bones.length > primary.skeleton.bones.length) primary = m;
  }
  // The lead bone for each name = the primary skeleton's bone.
  const leadByName = new Map<string, THREE.Bone>();
  for (const b of primary.skeleton.bones) if (!leadByName.has(b.name)) leadByName.set(b.name, b);
  // Collect every other skeleton's same-named bones as copy targets.
  const copies = new Map<string, THREE.Bone[]>();
  for (const m of meshes) {
    if (m === primary) continue;
    for (const b of m.skeleton.bones) {
      const lead = leadByName.get(b.name);
      if (!lead || lead === b) continue;
      let arr = copies.get(b.name);
      if (!arr) copies.set(b.name, (arr = []));
      arr.push(b);
    }
  }
  const groups: RigSync["groups"] = [];
  leadByName.forEach((src, name) => {
    const c = copies.get(name);
    if (c && c.length) groups.push({ src, copies: c });
  });

  // Drag-to-pose needs well-conditioned, single-skeleton bone transforms. Rigs
  // that arrive as many duplicate skeletons (groups present) and/or carry
  // far-from-unit "segment scale compensate" bone scale produce exploding bone
  // world positions — handles and IK can't be placed reliably there, so pose
  // mode is suppressed. A clean single-skeleton export re-enables it.
  const unitScale = primary.skeleton.bones.every((b) => {
    const s = b.scale;
    return Math.abs(s.x - 1) < 0.5 && Math.abs(s.y - 1) < 0.5 && Math.abs(s.z - 1) < 0.5;
  });
  const poseable = groups.length === 0 && unitScale;

  return { primary, groups, poseable };
}

/** Copy the lead skeleton's local bone transforms onto the duplicate skeletons. */
function mirrorRig(rig: RigSync) {
  for (const { src, copies } of rig.groups) {
    for (const c of copies) {
      c.quaternion.copy(src.quaternion);
      c.position.copy(src.position);
      c.scale.copy(src.scale);
    }
  }
}

/** True if any track in the clip actually changes value across its keyframes.
 *  Filters out "poses" exported as clips (identical keyframes → no motion). */
function clipHasMotion(clip: THREE.AnimationClip): boolean {
  for (const t of clip.tracks) {
    const n = t.times.length;
    if (n < 2) continue;
    const stride = t.values.length / n;
    for (let k = 1; k < n; k++) {
      for (let s = 0; s < stride; s++) {
        if (Math.abs(t.values[k * stride + s] - t.values[s]) > 1e-4) return true;
      }
    }
  }
  return false;
}

// ─── Procedural clips ────────────────────────────────────────────────────────
// Layered-sine motion applied as local-rotation offsets on top of each bone's
// authored base pose — a rig with no authored motion still gets a small set of
// selectable, believable clips (Idle / Wave / Look Around). Axis: 0=x
// (nod/breathe), 1=y (turn), 2=z (sway/tilt). Amplitudes in radians; `base` is
// a constant offset (posed limbs, e.g. the raised wave arm) under the sine.
type IdleComp = { axis: 0 | 1 | 2; amp: number; speed: number; phase: number; base?: number };
const IDLE_SPECS: Array<{ name: string; comps: IdleComp[] }> = [
  // Breathing — chest/upper spine ease back as the ribcage lifts.
  { name: "CC_Base_Spine02", comps: [{ axis: 0, amp: 0.03, speed: 1.5, phase: 0 }] },
  { name: "CC_Base_Spine01", comps: [{ axis: 0, amp: 0.018, speed: 1.5, phase: 0 }] },
  // Weight shift — torso sways gently, hips counter it.
  { name: "CC_Base_Waist", comps: [{ axis: 2, amp: 0.035, speed: 0.5, phase: 0 }] },
  { name: "CC_Base_Hip", comps: [{ axis: 2, amp: -0.022, speed: 0.5, phase: 0 }] },
  // Head — slow look-around with a slight nod, plus neck follow-through.
  {
    name: "CC_Base_Head",
    comps: [
      { axis: 1, amp: 0.09, speed: 0.33, phase: 1.0 },
      { axis: 0, amp: 0.045, speed: 0.5, phase: 0.5 },
    ],
  },
  { name: "CC_Base_NeckTwist02", comps: [{ axis: 1, amp: 0.04, speed: 0.33, phase: 1.0 }] },
  // Arms — shoulders drift, forearms ease, offset L/R so it isn't symmetrical.
  {
    name: "CC_Base_L_Upperarm",
    comps: [
      { axis: 2, amp: 0.055, speed: 0.5, phase: 0 },
      { axis: 0, amp: 0.03, speed: 0.42, phase: 0.7 },
    ],
  },
  {
    name: "CC_Base_R_Upperarm",
    comps: [
      { axis: 2, amp: -0.055, speed: 0.5, phase: 0.4 },
      { axis: 0, amp: 0.03, speed: 0.42, phase: 1.1 },
    ],
  },
  { name: "CC_Base_L_Forearm", comps: [{ axis: 0, amp: 0.05, speed: 0.55, phase: 0.2 }] },
  { name: "CC_Base_R_Forearm", comps: [{ axis: 0, amp: 0.05, speed: 0.55, phase: 0.95 }] },
];

// Wave — right arm raised (axes/signs empirically probed on this rig: shoulder
// raise = local +x on the right side, elbow flexion = local +z on the right),
// forearm + hand oscillate, head tips toward the wave. Breathing stays on.
const WAVE_SPECS: Array<{ name: string; comps: IdleComp[] }> = [
  { name: "CC_Base_Spine02", comps: [{ axis: 0, amp: 0.03, speed: 1.5, phase: 0 }] },
  { name: "CC_Base_Spine01", comps: [{ axis: 0, amp: 0.018, speed: 1.5, phase: 0 }] },
  { name: "CC_Base_Waist", comps: [{ axis: 2, amp: 0.02, speed: 0.5, phase: 0 }] },
  { name: "CC_Base_R_Clavicle", comps: [{ axis: 0, amp: 0, speed: 1, phase: 0, base: 0.18 }] },
  {
    name: "CC_Base_R_Upperarm",
    comps: [
      { axis: 0, amp: 0.05, speed: 4.2, phase: 0, base: 1.15 },
      { axis: 2, amp: 0, speed: 1, phase: 0, base: -0.25 },
    ],
  },
  {
    name: "CC_Base_R_Forearm",
    comps: [{ axis: 2, amp: 0.38, speed: 4.2, phase: 0.6, base: 0.85 }],
  },
  { name: "CC_Base_R_Hand", comps: [{ axis: 2, amp: 0.22, speed: 4.2, phase: 1.1 }] },
  {
    name: "CC_Base_Head",
    comps: [
      { axis: 2, amp: 0.02, speed: 1.2, phase: 0, base: -0.07 },
      { axis: 0, amp: 0.03, speed: 0.5, phase: 0.5 },
    ],
  },
  // The idle arm keeps its gentle drift so the body doesn't freeze.
  {
    name: "CC_Base_L_Upperarm",
    comps: [{ axis: 2, amp: 0.055, speed: 0.5, phase: 0 }],
  },
];

// Look Around — slow, wide head sweeps with torso follow-through.
const LOOK_SPECS: Array<{ name: string; comps: IdleComp[] }> = [
  { name: "CC_Base_Spine02", comps: [{ axis: 0, amp: 0.03, speed: 1.5, phase: 0 }, { axis: 1, amp: 0.1, speed: 0.21, phase: 0.4 }] },
  { name: "CC_Base_Spine01", comps: [{ axis: 0, amp: 0.018, speed: 1.5, phase: 0 }] },
  { name: "CC_Base_Waist", comps: [{ axis: 1, amp: 0.06, speed: 0.21, phase: 0.2 }] },
  {
    name: "CC_Base_Head",
    comps: [
      { axis: 1, amp: 0.46, speed: 0.21, phase: 1.0 },
      { axis: 0, amp: 0.07, speed: 0.34, phase: 0.5 },
      { axis: 2, amp: 0.04, speed: 0.27, phase: 1.4 },
    ],
  },
  { name: "CC_Base_NeckTwist02", comps: [{ axis: 1, amp: 0.2, speed: 0.21, phase: 1.0 }] },
  { name: "CC_Base_L_Upperarm", comps: [{ axis: 2, amp: 0.04, speed: 0.5, phase: 0 }] },
  { name: "CC_Base_R_Upperarm", comps: [{ axis: 2, amp: -0.04, speed: 0.5, phase: 0.4 }] },
];

/** Procedural clip registry — offered in the clip selector when the rig ships
 *  no real motion clips. */
const PROC_CLIPS: Array<{ name: string; specs: Array<{ name: string; comps: IdleComp[] }> }> = [
  { name: "Idle", specs: IDLE_SPECS },
  { name: "Wave", specs: WAVE_SPECS },
  { name: "Look Around", specs: LOOK_SPECS },
];

type IdleRig = {
  /** Union of every bone any clip drives, with its clean base pose captured at
   *  load (before any procedural motion ran) — switching clips can then blend
   *  through the base instead of compounding on a contaminated pose. */
  drivers: Array<{ bone: THREE.Bone; base: THREE.Quaternion }>;
  byName: Map<string, number>;
};

function buildIdle(primary: THREE.SkinnedMesh): IdleRig | null {
  const drivers: IdleRig["drivers"] = [];
  const byName = new Map<string, number>();
  const wanted = new Set<string>();
  for (const clip of PROC_CLIPS) for (const s of clip.specs) wanted.add(s.name);
  for (const name of wanted) {
    const bone = primary.skeleton.getBoneByName(name);
    if (!bone) continue;
    byName.set(name, drivers.length);
    drivers.push({ bone, base: bone.quaternion.clone() });
  }
  return drivers.length ? { drivers, byName } : null;
}

const _idleEuler = new THREE.Euler();
const _idleQ = new THREE.Quaternion();

function evalSpecs(
  specs: Array<{ name: string; comps: IdleComp[] }>,
  name: string,
  t: number,
): [number, number, number] {
  const spec = specs.find((s) => s.name === name);
  const out: [number, number, number] = [0, 0, 0];
  if (!spec) return out;
  for (const c of spec.comps) {
    out[c.axis] += (c.base ?? 0) + Math.sin(t * c.speed + c.phase) * c.amp;
  }
  return out;
}

/** Pose the driver bones from base pose + the active clip's offsets, blending
 *  from the previous clip across a switch (per-axis lerp — offsets are small
 *  or monotonic, so euler-space blending stays clean). */
function applyIdle(
  idle: IdleRig,
  t: number,
  from: number,
  to: number,
  blend: number,
) {
  const specsA = PROC_CLIPS[from]?.specs ?? PROC_CLIPS[0].specs;
  const specsB = PROC_CLIPS[to]?.specs ?? PROC_CLIPS[0].specs;
  idle.byName.forEach((idx, name) => {
    const d = idle.drivers[idx];
    const a = blend < 1 ? evalSpecs(specsA, name, t) : null;
    const b = evalSpecs(specsB, name, t);
    const rx = a ? a[0] + (b[0] - a[0]) * blend : b[0];
    const ry = a ? a[1] + (b[1] - a[1]) * blend : b[1];
    const rz = a ? a[2] + (b[2] - a[2]) * blend : b[2];
    _idleEuler.set(rx, ry, rz);
    _idleQ.setFromEuler(_idleEuler);
    d.bone.quaternion.copy(d.base).multiply(_idleQ);
  });
}

// ─── Drag-to-pose IK ────────────────────────────────────────────────────────
// A hand-rolled CCD (cyclic coordinate descent) over each limb chain: rotate the
// chain bones so the effector reaches the dragged handle. Operates purely on
// bone quaternions + world matrices — no skeleton mutation, works on any rig.
const CORRECTIVE = /twist|share|roll|helper|\bik\b|_end$|end$/i;
const EFFECTOR = /(hand|foot)/i;
const NON_EFFECTOR = /toe|finger|thumb|index|middle|ring|pinky|ball|twist|share|roll|end/i;

type Chain = { effector: THREE.Bone; bones: THREE.Bone[]; name: string };

/** Effector chains (hand/foot + 2 real parents, correctives skipped) from the
 *  lead skeleton's bones. */
function buildChains(primary: THREE.SkinnedMesh): Chain[] {
  const bones = primary.skeleton.bones;
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
  return chains;
}

// ─── Anatomical joint limits ────────────────────────────────────────────────
// Without limits, CCD happily bends elbows backwards and folds shoulders through
// the torso. Each chain bone is clamped after every CCD step, relative to its
// REST pose, via swing/twist decomposition (twist = rotation about the bone's
// own +Y axis, which points along the bone in this Blender-exported rig).
// Hinge joints keep ONLY rotation about their hinge axis, range-clamped; ball
// joints get a swing cone + twist budget. Axes/signs were probed empirically on
// the live rig (elbow = local Z, flexion L−/R+; knee = local X, flexion −).
type JointLimit =
  | { kind: "hinge"; axis: THREE.Vector3; min: number; max: number; twist: number }
  | { kind: "ball"; swing: number; twist: number };

const HINGE_Z = new THREE.Vector3(0, 0, 1);
const HINGE_X = new THREE.Vector3(1, 0, 0);

const JOINT_LIMITS: Array<{ match: RegExp; limit: JointLimit }> = [
  { match: /L_Forearm$/, limit: { kind: "hinge", axis: HINGE_Z, min: -2.4, max: 0.06, twist: 0.35 } },
  { match: /R_Forearm$/, limit: { kind: "hinge", axis: HINGE_Z, min: -0.06, max: 2.4, twist: 0.35 } },
  { match: /Calf$/, limit: { kind: "hinge", axis: HINGE_X, min: -2.3, max: 0.06, twist: 0.2 } },
  { match: /Upperarm$/, limit: { kind: "ball", swing: 1.7, twist: 0.6 } },
  { match: /Thigh$/, limit: { kind: "ball", swing: 1.5, twist: 0.5 } },
];

function limitFor(name: string): JointLimit | null {
  return JOINT_LIMITS.find((j) => j.match.test(name))?.limit ?? null;
}

type JointState = { rest: THREE.Quaternion; limit: JointLimit | null };
type JointMap = Map<THREE.Bone, JointState>;

const _delta = new THREE.Quaternion();
const _twist = new THREE.Quaternion();
const _swing = new THREE.Quaternion();
const _restInv = new THREE.Quaternion();

/** Clamp `bone.quaternion` to its joint limit, relative to the rest pose. */
function clampJoint(bone: THREE.Bone, js: JointState) {
  if (!js.limit) return;
  _restInv.copy(js.rest).invert();
  _delta.multiplyQuaternions(_restInv, bone.quaternion);
  // twist about the bone's own +Y (delta = swing ⊗ twist)
  const tw = Math.hypot(_delta.y, _delta.w);
  if (tw < 1e-8) _twist.identity();
  else _twist.set(0, _delta.y / tw, 0, _delta.w / tw);
  _swing.copy(_twist).invert().premultiply(_delta); // swing = delta * twist⁻¹
  // clamp twist
  let twistAngle = 2 * Math.atan2(_twist.y, _twist.w);
  if (twistAngle > Math.PI) twistAngle -= 2 * Math.PI;
  const tmax = js.limit.twist;
  twistAngle = Math.min(tmax, Math.max(-tmax, twistAngle));
  _twist.set(0, Math.sin(twistAngle / 2), 0, Math.cos(twistAngle / 2));
  if (js.limit.kind === "hinge") {
    // Project swing onto the hinge axis (kills off-axis bend), clamp range.
    const a = js.limit.axis;
    const proj = _swing.x * a.x + _swing.y * a.y + _swing.z * a.z;
    let hingeAngle = 2 * Math.atan2(proj, _swing.w);
    if (hingeAngle > Math.PI) hingeAngle -= 2 * Math.PI;
    if (hingeAngle < -Math.PI) hingeAngle += 2 * Math.PI;
    hingeAngle = Math.min(js.limit.max, Math.max(js.limit.min, hingeAngle));
    _swing.setFromAxisAngle(a, hingeAngle);
  } else {
    // Cone-clamp the swing magnitude.
    let swingAngle = 2 * Math.acos(Math.min(1, Math.abs(_swing.w)));
    if (swingAngle > js.limit.swing && swingAngle > 1e-6) {
      _q.identity();
      _swing.slerp(_q, 1 - js.limit.swing / swingAngle);
      swingAngle = js.limit.swing;
    }
  }
  bone.quaternion.copy(js.rest).multiply(_swing).multiply(_twist);
}

const _effPos = new THREE.Vector3();
const _bonePos = new THREE.Vector3();
const _toEff = new THREE.Vector3();
const _toTarget = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _hit = new THREE.Vector3();

/** One CCD pass: rotate chain bones (root→effector) toward a world-space
 *  target, keeping every joint inside its anatomical limit. */
function solveCCD(
  chain: THREE.Bone[],
  target: THREE.Vector3,
  joints?: JointMap,
  iterations = 6,
) {
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
      const js = joints?.get(bone);
      if (js) clampJoint(bone, js);
      bone.updateWorldMatrix(false, true); // refresh effector under this bone
    }
  }
}

/** Hand pose presets — curl scalar applied across the finger segments. */
export type HandPose = "open" | "rest" | "fist";
const HAND_CURL: Record<HandPose, number> = { open: -0.22, rest: 0, fist: 1 };
// Per-segment flex (radians at curl=1); axes probed on this rig: fingers curl
// about local −X (both sides), thumbs about local +Z.
const FINGER_SEG_FLEX = [0.85, 1.15, 0.9];
const THUMB_SEG_FLEX = [0.3, 0.55, 0.45];
const FINGER_RE = /_(Thumb|Index|Mid|Ring|Pinky)([123])$/;

type FingerJoint = { bone: THREE.Bone; rest: THREE.Quaternion; flex: number; isThumb: boolean };

function RigPoser({
  rig,
  handPose = "rest",
  setDragLock,
}: {
  rig: RigSync;
  handPose?: HandPose;
  setDragLock?: (v: boolean) => void;
}) {
  const chains = useMemo(() => buildChains(rig.primary), [rig]);
  const dragRef = useRef<{ chain: THREE.Bone[]; plane: THREE.Plane } | null>(null);
  const targetRef = useRef(new THREE.Vector3());
  const handleRefs = useRef<Array<THREE.Mesh | null>>([]);
  const { camera, gl } = useThree();
  const camDir = useMemo(() => new THREE.Vector3(), []);
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const ndc = useMemo(() => new THREE.Vector2(), []);
  const jointsRef = useRef<JointMap>(new Map());
  const fingersRef = useRef<FingerJoint[]>([]);
  const curlRef = useRef({ cur: 0 });

  // Start posing from a clean bind pose (and sync the duplicate skeletons to it)
  // so the rig doesn't freeze mid-animation. Capture every joint's REST pose
  // from that clean bind — the anchor both the limits and the finger curls
  // measure against.
  useEffect(() => {
    rig.primary.skeleton.pose();
    mirrorRig(rig);
    const joints: JointMap = new Map();
    for (const c of chains) {
      for (const bone of c.bones) {
        if (!joints.has(bone)) {
          joints.set(bone, { rest: bone.quaternion.clone(), limit: limitFor(bone.name) });
        }
      }
    }
    jointsRef.current = joints;
    const fingers: FingerJoint[] = [];
    for (const bone of rig.primary.skeleton.bones) {
      const m = FINGER_RE.exec(bone.name);
      if (!m) continue;
      const isThumb = m[1] === "Thumb";
      const seg = Number(m[2]) - 1;
      fingers.push({
        bone,
        rest: bone.quaternion.clone(),
        flex: (isThumb ? THUMB_SEG_FLEX : FINGER_SEG_FLEX)[seg] ?? 0.8,
        isThumb,
      });
    }
    fingersRef.current = fingers;
  }, [rig, chains]);

  // Drag is driven from window-level listeners (NOT the handle mesh) so motion is
  // tracked once the cursor leaves the small handle — manual raycast of the
  // pointer onto the camera-facing drag plane gives the IK target each move.
  useEffect(() => {
    const dom = gl.domElement;
    const onMove = (ev: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const rect = dom.getBoundingClientRect();
      ndc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      if (raycaster.ray.intersectPlane(d.plane, _hit)) targetRef.current.copy(_hit);
    };
    const onUp = () => {
      if (!dragRef.current) return;
      dragRef.current = null;
      setDragLock?.(false);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [gl, camera, raycaster, ndc, setDragLock]);

  // Park handles on their effectors, solve while dragging (joint-limited),
  // ease the hands toward the selected pose, then propagate the lead pose onto
  // the duplicate skeletons so the whole character poses as one.
  const _fq = useMemo(() => new THREE.Quaternion(), []);
  const _fx = useMemo(() => new THREE.Vector3(1, 0, 0), []);
  const _fz = useMemo(() => new THREE.Vector3(0, 0, 1), []);
  useFrame((_, dt) => {
    chains.forEach((c, i) => {
      const h = handleRefs.current[i];
      if (h && dragRef.current?.chain !== c.bones) {
        h.position.setFromMatrixPosition(c.effector.matrixWorld);
      }
    });
    if (dragRef.current) solveCCD(dragRef.current.chain, targetRef.current, jointsRef.current);
    // Hand pose — critically-damped ease toward the preset curl.
    const target = HAND_CURL[handPose];
    const cs = curlRef.current;
    cs.cur += (target - cs.cur) * Math.min(1, dt * 9);
    for (const f of fingersRef.current) {
      // fingers: local −X curl · thumbs: local +Z curl (probed on this rig)
      _fq.setFromAxisAngle(f.isThumb ? _fz : _fx, (f.isThumb ? 1 : -1) * cs.cur * f.flex);
      f.bone.quaternion.copy(f.rest).multiply(_fq);
    }
    mirrorRig(rig);
  });

  if (chains.length === 0) return null;

  return (
    <group>
      {chains.map((c, i) => (
        <mesh
          key={c.name}
          ref={(el) => {
            handleRefs.current[i] = el;
          }}
          onPointerDown={(e) => {
            e.stopPropagation();
            camera.getWorldDirection(camDir);
            const origin = new THREE.Vector3().setFromMatrixPosition(c.effector.matrixWorld);
            dragRef.current = {
              chain: c.bones,
              plane: new THREE.Plane().setFromNormalAndCoplanarPoint(camDir.clone().negate(), origin),
            };
            targetRef.current.copy(origin);
            setDragLock?.(true);
          }}
        >
          <sphereGeometry args={[0.08, 16, 16]} />
          <meshBasicMaterial color="#9fe6ff" transparent opacity={0.9} depthTest={false} />
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
      {/* The key light casts the one real shadow onto the ShadowCatcher plane
          below — every other light here stays shadow-less fill, the way a
          real product-photography setup uses one defining shadow, not an
          overlapping mess from six directions. Frustum is sized tight to the
          ~2-unit-normalized asset (see SpecimenModel's ns/groundY math). */}
      <directionalLight
        position={[-4, 8, 6]}
        intensity={1.3}
        color="#ffffff"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-3}
        shadow-camera-right={3}
        shadow-camera-top={3}
        shadow-camera-bottom={-3}
        shadow-camera-near={0.5}
        shadow-camera-far={20}
        shadow-bias={-0.0004}
      />
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

/** The slice of OrbitControls the keyboard/reset helpers need. */
type ControlsLike = {
  object: THREE.Camera;
  target: THREE.Vector3;
  minDistance: number;
  maxDistance: number;
  minPolarAngle: number;
  maxPolarAngle: number;
  update: () => void;
  reset: () => void;
};

/** Keyboard operability for the viewer — arrows orbit, +/- zoom, 0 resets.
 *  R3F's Canvas doesn't forward tabIndex/role/aria to its wrapper div, so this
 *  makes the wrapper focusable and listens natively (inside the Canvas tree,
 *  cleaned up on unmount). The global :focus-visible ring covers focus style. */
function KeyboardOrbit({ controls }: { controls: React.RefObject<ControlsLike | null> }) {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    const wrap = gl.domElement.parentElement;
    if (!wrap) return;
    wrap.setAttribute("tabindex", "0");
    wrap.setAttribute("role", "application");
    wrap.setAttribute(
      "aria-label",
      "3D viewer — drag or arrow keys to rotate, plus and minus to zoom, 0 or double-click to reset",
    );
    const orbitBy = (dTheta: number, dPhi: number) => {
      const c = controls.current;
      if (!c) return;
      const off = c.object.position.clone().sub(c.target);
      const sph = new THREE.Spherical().setFromVector3(off);
      sph.theta += dTheta;
      sph.phi = Math.min(c.maxPolarAngle, Math.max(c.minPolarAngle, sph.phi + dPhi));
      off.setFromSpherical(sph);
      c.object.position.copy(c.target).add(off);
      c.update();
    };
    const zoomBy = (factor: number) => {
      const c = controls.current;
      if (!c) return;
      const off = c.object.position.clone().sub(c.target);
      off.setLength(Math.min(c.maxDistance, Math.max(c.minDistance, off.length() * factor)));
      c.object.position.copy(c.target).add(off);
      c.update();
    };
    const step = 0.14;
    const onKey = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowLeft": e.preventDefault(); orbitBy(step, 0); break;
        case "ArrowRight": e.preventDefault(); orbitBy(-step, 0); break;
        case "ArrowUp": e.preventDefault(); orbitBy(0, -step); break;
        case "ArrowDown": e.preventDefault(); orbitBy(0, step); break;
        case "+": case "=": e.preventDefault(); zoomBy(0.88); break;
        case "-": case "_": e.preventDefault(); zoomBy(1.14); break;
        case "0": e.preventDefault(); controls.current?.reset(); break;
      }
    };
    wrap.addEventListener("keydown", onKey);
    return () => {
      wrap.removeEventListener("keydown", onKey);
      wrap.removeAttribute("role");
      wrap.removeAttribute("aria-label");
      wrap.removeAttribute("tabindex");
    };
  }, [gl, controls]);
  return null;
}

export default function SpecimenScene({
  specimen,
  channel = "material",
  clipIndex = 0,
  poseMode = false,
  allowZoom = false,
  handPose = "rest",
  onReady,
  onStats,
  onClips,
  onPoseable,
}: {
  specimen: Specimen;
  channel?: SpecimenChannel;
  clipIndex?: number;
  poseMode?: boolean;
  /** Always-on wheel zoom — detail pages. On mid-scroll surfaces (showcase)
   *  zoom instead engages after the user grabs the viewer (pointerdown) and
   *  releases when the pointer leaves it, so it never ambushes page scroll. */
  allowZoom?: boolean;
  /** Hand preset while posing (open / rest / fist). */
  handPose?: HandPose;
  onReady?: () => void;
  onStats?: (stats: SpecimenStats) => void;
  onClips?: (names: string[]) => void;
  onPoseable?: (v: boolean) => void;
}) {
  const [interacting, setInteracting] = useState(false);
  // When a pose handle is being dragged, freeze orbit so the camera doesn't spin.
  const [dragLock, setDragLock] = useState(false);
  // Engage-to-zoom (Sketchfab pattern): grabbing the viewer arms wheel zoom;
  // moving the pointer off it disarms, so scrolling past never gets hijacked.
  const [engaged, setEngaged] = useState(false);
  const controlsRef = useRef<ControlsLike | null>(null);

  return (
    <Canvas
      camera={{ position: [0, 0, 4.6], fov: 34 }}
      dpr={[1, 1.75]}
      gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}
      shadows="soft"
      onDoubleClick={() => {
        if (!dragLock) controlsRef.current?.reset();
      }}
      onPointerLeave={() => setEngaged(false)}
      style={{ width: "100%", height: "100%" }}
      onPointerDown={() => {
        setInteracting(true);
        setEngaged(true); // grabbing the viewer arms wheel zoom
      }}
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
          onPoseable={onPoseable}
          handPose={handPose}
          setDragLock={setDragLock}
        />
      </Suspense>
      <KeyboardOrbit controls={controlsRef} />
      <OrbitControls
        ref={controlsRef as never}
        enablePan={false}
        enableZoom={allowZoom || engaged}
        enabled={!dragLock}
        minDistance={1.4}
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
