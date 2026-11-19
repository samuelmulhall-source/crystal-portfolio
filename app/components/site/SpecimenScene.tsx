"use client";

/**
 * SpecimenScene — the heavy R3F internals for the interactive 3D viewer.
 *
 * Self-contained: no journey/voidState/station coupling. Driven entirely by
 * the content `specimen` field (model path + PBR texture set). Dynamically
 * imported by SpecimenViewer so the Three.js bundle never loads in reduced
 * mode or during SSR.
 */

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import { Environment, Lightformer, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import type { Specimen } from "../../lib/content";
import {
  applyHand,
  applyPose,
  buildMotionRig,
  evalMotion,
  HAND_GRIP,
  mixChannels,
  MOTIONS,
  STAND,
  type Channels,
  type EyeMode,
  type MotionRig,
} from "./rig-motion";

export type TexKey = "map" | "normalMap" | "roughnessMap" | "metalnessMap" | "transmissionMap";
/** Maps the second model (extraModelPath) can carry. */
type ExtraKey = "map" | "normalMap" | "roughnessMap" | "metalnessMap" | "alphaMap";

/** What the inspector renders on the model. "material" = full PBR; "wireframe"
 *  = ice line-art; the rest show that raw texture map flat on the surface. */
export type SpecimenChannel = "material" | "wireframe" | TexKey;

/** Opt-in photographic set (lab draft): a seamless lit backdrop + one key light
 *  that turn with the camera, so the asset reads like a product photograph on
 *  a real cyclorama. `color` is the backdrop paint; `viewShift` slides the
 *  framing sideways (fraction of canvas width, + = subject moves right) so a
 *  full-bleed canvas can leave room for type. Absent → the original studio. */
export type SpecimenSet = {
  color: string;
  viewShift?: number;
  /** A photograph of this exact set covers the load, so keep the light at
   *  full instead of bringing it up when the model arrives. */
  lit?: boolean;
  /** Opening view, degrees around the subject (0 = the file's front). When
   *  absent, a three-quarter view onto the model's broad face is chosen from
   *  its proportions, so flat props never open edge-on. */
  azimuth?: number;
  /** Film grain on the backdrop, matching the page's grain: the same tile
   *  (`src`), the same on-screen size, the same blending. Only the set takes it
   *  — the model is drawn in front and stays clean. `scale` multiplies the
   *  tile size (1 = the page's 128 CSS px). */
  grain?: { src: string; scale?: number };
};

/** Technical readout computed from the loaded geometry + texture set. */
export type SpecimenStats = {
  triangles: number;
  vertices: number;
  meshes: number;
  maps: number;
  /** Largest texture dimension in px (e.g. 2048). */
  maxTextureSize: number;
  /** Bounding-box proportions (x, y, z), normalized so the largest is 1. */
  proportions?: [number, number, number];
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

/** The motion's evaluated channels this frame (and the previous motion's, mid cross-fade). */
const _chA: Channels = {};
const _chB: Channels = {};

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
  poseKey = 0,
  onReady,
  onStats,
  onClips,
  onPoseable,
  onChannelsDetected,
  onMotionEnd,
  setDragLock,
  set,
  onGround,
}: {
  set?: SpecimenSet;
  /** Report the asset's floor height (world Y) so a set outside Suspense can
   *  sit under it before and after the model streams in. */
  onGround?: (y: number) => void;
  specimen: Specimen;
  channel?: SpecimenChannel;
  /** Which animation clip to play (rigged characters). */
  clipIndex?: number;
  /** Pose mode: pause animation and enable drag-to-pose IK handles. */
  poseMode?: boolean;
  /** Hand preset while posing (open / rest / fist). */
  handPose?: HandPose;
  /** Changing it starts a fresh pose (the Reset control). */
  poseKey?: number;
  onReady?: () => void;
  onStats?: (stats: SpecimenStats) => void;
  /** Report the rig's playable clip names for the selector. */
  onClips?: (names: string[]) => void;
  /** Report whether drag-to-pose is viable on this rig. */
  onPoseable?: (v: boolean) => void;
  /** Report which texture channels the model's OWN materials carry (rigged
   *  characters embed their maps in the GLB rather than the content config). */
  onChannelsDetected?: (keys: TexKey[]) => void;
  /** A one-shot motion (Wave, Jump) finished and the rig is back in Idle:
   *  the index of the motion now playing. */
  onMotionEnd?: (index: number) => void;
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
  // The second model's own maps (extraModelPath), loaded in the same batch.
  const x = specimen.extraTextures;
  const xEntries = useMemo(() => {
    const e: Array<[ExtraKey, string]> = [];
    if (x?.map) e.push(["map", enc(x.map)]);
    if (x?.normalMap) e.push(["normalMap", enc(x.normalMap)]);
    if (x?.roughnessMap) e.push(["roughnessMap", enc(x.roughnessMap)]);
    if (x?.metalnessMap) e.push(["metalnessMap", enc(x.metalnessMap)]);
    if (x?.alphaMap) e.push(["alphaMap", enc(x.alphaMap)]);
    return e;
  }, [x?.map, x?.normalMap, x?.roughnessMap, x?.metalnessMap, x?.alphaMap]);
  // Stable URL array reference — a fresh array each render makes useLoader
  // re-suspend forever. NEVER pass an empty array: useLoader suspends forever on
  // [] (this is why texture-less rigged characters hung) — fall back to a 1px
  // transparent so it always resolves; the placeholder is ignored below.
  const texUrls = useMemo(() => {
    const all = [...texEntries, ...xEntries].map((e) => e[1]);
    return all.length ? all : [TRANSPARENT_PX];
  }, [texEntries, xEntries]);
  // A model that brings its own materials: a rigged character, or a GLB prop
  // with no separate maps listed (its PBR set is embedded in the file). These
  // keep their authored materials; channel views read each mesh's own maps.
  const ownMats = isRigged || (isGLB && texEntries.length === 0);
  const texList = useLoader(THREE.TextureLoader, texUrls);
  const tex = useMemo(() => {
    const out = {} as Record<TexKey, THREE.Texture | undefined>;
    texEntries.forEach((e, i) => { out[e[0]] = texList[i]; });
    return out;
  }, [texEntries, texList]);
  const xtex = useMemo(() => {
    const out = {} as Record<ExtraKey, THREE.Texture | undefined>;
    xEntries.forEach((e, i) => { out[e[0]] = texList[texEntries.length + i]; });
    return out;
  }, [xEntries, texEntries.length, texList]);

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

    // The second model wears its own maps when it has them (its UVs don't
    // match the main model's), cut out by its alpha map.
    function buildExtra(): THREE.Material | null {
      if (!xEntries.length || channel === "wireframe") return null;
      const cut = xtex.alphaMap ? { alphaMap: xtex.alphaMap, alphaTest: 0.5, side: THREE.DoubleSide } : { side: THREE.FrontSide };
      const color = xtex.map ? xtex.map.clone() : null;
      if (color) color.colorSpace = THREE.SRGBColorSpace;
      if (channel !== "material") {
        const src = channel === "map" ? color : (xtex as Record<string, THREE.Texture | undefined>)[channel];
        if (!src) return new THREE.MeshBasicMaterial({ color: 0x10151d, ...cut });
        const disp = src.clone();
        disp.colorSpace = THREE.SRGBColorSpace;
        disp.needsUpdate = true;
        return new THREE.MeshBasicMaterial({ map: disp, ...cut });
      }
      return new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        map: color,
        normalMap: xtex.normalMap ?? null,
        roughnessMap: xtex.roughnessMap ?? null,
        roughness: xtex.roughnessMap ? 0.95 : 0.7,
        metalnessMap: xtex.metalnessMap ?? null,
        metalness: xtex.metalnessMap ? 0.95 : 0.1,
        envMapIntensity: 0.9,
        ...cut,
      });
    }
    const extraMat = buildExtra();

    // ── Rigged-character channel materials ──────────────────────────────────
    // A rigged character embeds its maps in the GLB per-mesh (content.textures
    // is empty), so its channel views are built from each mesh's OWN material
    // rather than one shared texture set.
    const hasWireAsset = ownMats && !!specimen.wireModelPath;
    // Ice triangulated wire — the fallback for rigged props with no quad-wire
    // asset (and the prop path already uses buildMaterial()'s version).
    const rigWireMat = new THREE.MeshBasicMaterial({
      color: 0x9fdcff, wireframe: true, transparent: true, opacity: 0.5,
    });
    // Depth-only occluder: writes depth, no colour. Sits under the quad-wire
    // overlay so edges on BACK faces are hidden — a real hidden-line view.
    // Nudged back (polygonOffset) so coincident FRONT edges still read.
    const depthOnlyMat = new THREE.MeshBasicMaterial({ colorWrite: false });
    depthOnlyMat.polygonOffset = true;
    depthOnlyMat.polygonOffsetFactor = 1;
    depthOnlyMat.polygonOffsetUnits = 1;
    // Meshes that lack the selected map read as a dim neutral so the silhouette
    // stays legible (rather than a black hole) in a map-inspection view.
    const rigNoDataMat = new THREE.MeshBasicMaterial({ color: 0x10151d });

    /** Flat, unlit view of one of a rigged mesh's OWN maps. Display texture is
     *  tagged sRGB so its stored texels read like the source file (matches the
     *  prop rawMap() convention). */
    function rigMapMaterial(orig: THREE.Material | undefined, key: TexKey): THREE.Material | null {
      const src = orig ? (orig as unknown as Record<string, THREE.Texture | null>)[key] : null;
      if (!src) return null;
      const disp = src.clone();
      disp.colorSpace = THREE.SRGBColorSpace;
      disp.needsUpdate = true;
      return new THREE.MeshBasicMaterial({ map: disp, side: THREE.FrontSide });
    }

    // Rigged characters: drive the ORIGINAL loaded object (not a clone) so the
    // embedded animation clips bind correctly and the IK acts on the real
    // skinned bones. Props: merge clones + replace materials.
    let group: THREE.Object3D;
    if (isRigged) {
      group = loaded[0];
    } else {
      const g = new THREE.Group();
      loaded.forEach((m, i) => {
        const c = m.clone();
        // Meshes of the second model wear its own maps (see buildExtra).
        if (i > 0) c.traverse((o) => { o.userData.extra = true; });
        g.add(c);
      });
      group = g;
    }

    const labelLike = /(normal\s*map|tangent|tris|polygon|vertex|uv\s*map|debug|label)/i;

    let triangles = 0;
    let vertices = 0;
    let meshes = 0;
    const ownMaps = new Set<TexKey>();

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
        if (ownMats) {
          // Cache the model's authored materials once, then drive the
          // channel view per-mesh from them (skinning is preserved — a
          // SkinnedMesh accepts any material).
          const store = mesh.userData as { origMat?: THREE.Material | THREE.Material[] };
          store.origMat ??= mesh.material;
          const orig0 = Array.isArray(store.origMat) ? store.origMat[0] : store.origMat;
          const o0 = orig0 as unknown as Record<string, THREE.Texture | null>;
          for (const k of ["map", "normalMap", "roughnessMap", "metalnessMap", "transmissionMap"] as TexKey[]) if (o0?.[k]) ownMaps.add(k);
          if (channel === "wireframe") {
            // Hidden-line quad wire (see WireOverlay): the model renders
            // depth-only under the real quad edges. No wire asset → fall back
            // to ice triangulated wireframe on the mesh itself.
            mesh.material = hasWireAsset ? depthOnlyMat : rigWireMat;
          } else if (channel === "material") {
            mesh.material = store.origMat;
          } else {
            // A texture channel — show this mesh's own map flat, or a dim
            // neutral where the map is absent.
            mesh.material = rigMapMaterial(orig0, channel) ?? rigNoDataMat;
          }
        } else if (channel === "wireframe") {
          mesh.material = channelMat;
        } else {
          const prev = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          prev.forEach((m) => (m as THREE.Material)?.dispose());
          mesh.material = mesh.userData.extra && extraMat ? extraMat : channelMat;
        }
      }
    });

    const realTex = texList.slice(0, texEntries.length + xEntries.length);
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
        maps: ownMats ? ownMaps.size : texEntries.length + xEntries.length,
        maxTextureSize,
        proportions: [size.x / maxDim, size.y / maxDim, size.z / maxDim],
      } satisfies SpecimenStats,
    };
  }, [loaded, tex, xtex, texList, texEntries, xEntries, specimen.yOffset, specimen.wireModelPath, channel, isRigged, ownMats]);

  // This rig (a Reallusion/CC export) arrives as ~14 separate skinned meshes,
  // EACH with its own full clone of the skeleton (identical bone names). A single
  // mixer/IK solver can only drive one skeleton's bones — so the canonical
  // (densest) skeleton is the lead, and every frame its local bone transforms are
  // mirrored onto the same-named bones of the other skeletons so the whole
  // character moves as one. `groups` is empty for a normal single-skeleton rig.
  const rigSync = useMemo(() => buildRigSync(isRigged ? object : null), [object, isRigged]);

  // Which texture channels the model's OWN materials carry (its maps live in
  // the GLB, not the content config). Read from the cached originals so the
  // answer is stable regardless of the currently-selected channel.
  const detectedChannels = useMemo(() => {
    if (!ownMats) return null;
    const keys = new Set<TexKey>();
    const CHECK: TexKey[] = ["map", "normalMap", "roughnessMap", "metalnessMap", "transmissionMap"];
    object.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const store = mesh.userData as { origMat?: THREE.Material | THREE.Material[] };
      const src = store.origMat ?? mesh.material;
      const m = (Array.isArray(src) ? src[0] : src) as unknown as Record<string, THREE.Texture | null>;
      for (const k of CHECK) if (m?.[k]) keys.add(k);
    });
    return CHECK.filter((k) => keys.has(k));
  }, [object, ownMats]);
  useEffect(() => {
    if (detectedChannels) onChannelsDetected?.(detectedChannels);
  }, [detectedChannels, onChannelsDetected]);

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
    onClips?.(playable.length ? playable.map((a) => a.name) : MOTIONS.map((c) => c.name));
  }, [isRigged, playable, onClips]);

  // Motions — used when the rig has no real motion clips: the anatomical pose
  // layer measured from this rig at bind, keyed in the body's frame.
  const motion = useMemo(() => (rigSync ? buildMotionRig(rigSync.primary) : null), [rigSync]);
  // Roll bones: graded every frame after the clip / pose (see TWIST_SPECS).
  const twist = useMemo(() => (rigSync ? buildTwist(rigSync.primary) : null), [rigSync]);
  // After-motion drivers: planted feet, eyes (CC rigs).
  const anim = useMemo(() => (rigSync ? buildAnim(rigSync.primary) : null), [rigSync]);
  // Dual-quaternion skinning for rigs (see "Dual-quaternion skinning").
  useEffect(() => (rigSync ? enableDQS(object) : undefined), [rigSync, object]);
  // Clip-switch cross-blend: remember the previous clip and ramp to the new
  // one. Each clip keeps its own phase clock (fromT0/toT0) so a freshly
  // selected clip always starts at phase 0 (its anticipation), not mid-gesture.
  const procSwitch = useRef({ from: 0, to: 0, start: -1, fromT0: 0, toT0: -1 });
  useEffect(() => {
    if (playable.length) return; // real clips: the mixer handles switching
    const s = procSwitch.current;
    if (clipIndex !== s.to) {
      s.from = s.to;
      s.fromT0 = s.toT0;
      s.to = clipIndex;
      s.start = -1; // stamped with clock time on the next frame
      s.toT0 = -1;
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
  const wireHiddenLine = channel === "wireframe" && !!specimen.wireModelPath;
  useFrame((state, dt) => {
    if (!rigSync || poseMode) return;
    // Hidden-line wireframe overlays a STATIC (bind-pose) quad-edge asset, so
    // hold the model at bind while it's shown or the depth occluder desyncs
    // from the edges.
    if (wireHiddenLine) {
      rigSync.primary.skeleton.pose();
      mirrorRig(rigSync);
      return;
    }
    const m = mixerRef.current;
    if (m) m.update(dt);
    else if (motion) {
      const s = procSwitch.current;
      const t = state.clock.elapsedTime;
      if (s.start < 0) s.start = t;
      if (s.toT0 < 0) s.toT0 = t; // the new motion starts the moment it was selected
      const mB = MOTIONS[s.to] ?? MOTIONS[0];
      // Field-QA (?debug): `window.__clipAt = seconds` holds the current motion
      // at that moment (no cross-fade, no return to Idle), for frame-exact review.
      const at = RIG_QA ? (window as unknown as { __clipAt?: number }).__clipAt : undefined;
      const tB = typeof at === "number" ? at : t - s.toT0;
      evalMotion(mB, tB, _chB);
      const raw = typeof at === "number" || s.from === s.to ? 1 : Math.min(1, (t - s.start) / 0.5);
      // smoothstep cross-fade from the previous motion
      const ch = raw < 1 ? mixChannels(evalMotion(MOTIONS[s.from] ?? MOTIONS[0], t - s.fromT0, _chA), _chB, raw * raw * (3 - 2 * raw)) : _chB;
      // Field-QA (?debug): `window.__chOverride = { "pron.R": -40 }` overrides channels
      // on top of the motion, for measuring a pose while tuning keys.
      const ov = RIG_QA ? (window as unknown as { __chOverride?: Channels }).__chOverride : undefined;
      if (ov) Object.assign(ch, ov);
      applyPose(motion, ch, t);
      if (anim) {
        lockFeet(anim, ch["contact.L"] ?? 1, ch["contact.R"] ?? 1, ch["heel.L"] ?? 0, ch["heel.R"] ?? 0, ch["lift.L"] ?? 0, ch["lift.R"] ?? 0);
        driveEyes(anim, mB.eyes, typeof at === "number" ? s.toT0 + at : t, dt, state.camera.position);
      }
      // A gesture plays once: from its last half-second it hands over to Idle.
      if (typeof at !== "number" && !mB.loop && t - s.toT0 > mB.dur - 0.5) {
        const idleIdx = Math.max(0, MOTIONS.findIndex((x) => x.name === "Idle"));
        s.from = s.to;
        s.fromT0 = s.toT0;
        s.to = idleIdx;
        s.start = t;
        s.toT0 = t;
        onMotionEnd?.(idleIdx);
      }
    }
    if (twist) driveTwists(twist);
    mirrorRig(rigSync);
  });

  useEffect(() => {
    onPoseable?.(rigSync?.poseable ?? false);
  }, [rigSync, onPoseable]);

  // Field-QA rig probe (?debug): expose the lead skinned mesh so bone axes can
  // be measured from the console when authoring procedural clips — same
  // sanctioned read-only QA family as ?fps / ?off (see CLAUDE.md).
  useEffect(() => {
    if (!rigSync || typeof window === "undefined") return;
    if (!new URLSearchParams(window.location.search).has("debug")) return;
    (window as unknown as { __rig?: THREE.SkinnedMesh }).__rig = rigSync.primary;
  }, [rigSync]);

  // Release this model's GPU memory when it's replaced (asset switch) or the
  // viewer unmounts. The loader keeps the parsed model cached; three re-uploads
  // disposed geometry/textures automatically if the model is shown again.
  // Keyed on the loaded files (not the per-channel rebuild), so switching a
  // texture channel never forces a re-upload.
  useEffect(
    () => () => {
      loaded.forEach((root) =>
        root.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh) return;
          mesh.geometry?.dispose();
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          mats.forEach((mat) => mat?.dispose());
        }),
      );
      texList.forEach((t) => t.dispose());
    },
    [loaded, texList],
  );

  // Signal readiness once the model is mounted (assets resolved via Suspense).
  // Defer one frame so the canvas paints before the poster fades, but fall back
  // to a timer so readiness still fires if rAF is throttled (backgrounded tab).
  useEffect(() => {
    onStats?.(stats);
    onGround?.(groundY);
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
  }, [onReady, onStats, onGround, groundY, stats]);

  return (
    <>
      <group position={[centreOffset.x, centreOffset.y, centreOffset.z]}>
        <group scale={normScale}>
          <primitive object={object} />
          {/* Quad-topology hidden-line overlay — same scaled/centred frame as
              the model, so the edges land exactly on the depth-only surface. */}
          {wireHiddenLine && specimen.wireModelPath ? (
            <Suspense fallback={null}>
              <WireOverlay path={enc(specimen.wireModelPath)} />
            </Suspense>
          ) : null}
        </group>
      </group>
      {set ? null : <ShadowCatcher y={groundY} />}
      {rigSync && rigSync.poseable && poseMode ? (
        <RigPoser key={poseKey} rig={rigSync} twist={twist} anim={anim} motion={motion} handPose={handPose} setDragLock={setDragLock} />
      ) : null}
    </>
  );
}

/** Quad-edge wireframe overlay. Loads the edges-only GLB (exported from the DCC
 *  source where the original quads survive — the shipped model is triangulated)
 *  and renders it as ice line-art. It's drawn AFTER the depth-only model in the
 *  same frame, with depthTest on, so edges behind the surface are occluded — a
 *  real hidden-line view with the back-of-model quads culled. */
function WireOverlay({ path }: { path: string }) {
  const gltf = useLoader(GLTFLoader, path, (loader) => {
    loader.setDRACOLoader(getDracoLoader());
  });
  // Retint every line to the ice line-art material and draw after the model so
  // the depth-only surface occludes back-face edges. Same scene graph as the
  // model asset → identical transform, exact alignment on the bind pose.
  useMemo(() => {
    const mat = new THREE.LineBasicMaterial({
      color: 0x9fdcff,
      transparent: true,
      opacity: 0.62,
      depthTest: true,
      depthWrite: false,
    });
    gltf.scene.traverse((o) => {
      const line = o as THREE.Line;
      if ((line as unknown as { isLine?: boolean }).isLine) {
        line.material = mat;
        line.renderOrder = 2;
      }
    });
    return null;
  }, [gltf]);
  return <primitive object={gltf.scene} />;
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

/** A round seamless cyclorama — floor, cove and wall turned on a lathe — so
 *  the set looks the same from every orbit angle. Matte paint; it takes the key
 *  light's falloff and the asset's real shadow, which is what makes it read as
 *  a photographed set rather than a flat fill. */
function Cyclorama({ y, color, grain }: { y: number; color: string; grain?: SpecimenSet["grain"] }) {
  const geo = useMemo(() => {
    const R = 10, r = 3.4, H = 16;
    const pts: THREE.Vector2[] = [new THREE.Vector2(0.001, 0)];
    for (let i = 1; i <= 8; i++) pts.push(new THREE.Vector2(((R - r) * i) / 8, 0));
    for (let i = 1; i <= 16; i++) {
      const t = (i / 16) * (Math.PI / 2);
      pts.push(new THREE.Vector2(R - r + r * Math.sin(t), r - r * Math.cos(t)));
    }
    pts.push(new THREE.Vector2(R, H));
    return new THREE.LatheGeometry(pts, 128);
  }, []);
  useEffect(() => () => geo.dispose(), [geo]);

  // ── Grain on the backdrop ──
  // Screen-space, like the page's CSS grain: the tile is sampled by pixel
  // position (gl_FragCoord), sized to 128 CSS px × dpr, and mixed over the
  // final sRGB colour with the tile's own alpha — the same compositing the
  // browser does for the page. A second, offset layer is the "live" grain
  // that rises and jumps on page actions (the page's lit:boil events).
  const gl = useThree((st) => st.gl);
  // Shader uniforms live in a ref (mutated every frame, outside render).
  const uRef = useRef<{
    uGrain: { value: THREE.Texture | null };
    uGrainPx: { value: number };
    uLive: { value: number };
    uOff: { value: THREE.Vector2 };
    uOn: { value: number };
  } | null>(null);
  const getU = useCallback(() => {
    if (!uRef.current) {
      uRef.current = {
        uGrain: { value: null },
        uGrainPx: { value: 128 },
        uLive: { value: 0 },
        uOff: { value: new THREE.Vector2(0, 0) },
        uOn: { value: 0 },
      };
    }
    return uRef.current;
  }, []);
  useEffect(() => {
    if (!grain?.src) return;
    const uniforms = getU();
    const t = new THREE.TextureLoader().load(encodeURI(grain.src), () => (uniforms.uOn.value = 1));
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    t.colorSpace = THREE.NoColorSpace; // raw values: mixed in output (sRGB) space, as CSS does
    uniforms.uGrain.value = t;
    return () => {
      uniforms.uOn.value = 0;
      t.dispose();
    };
  }, [grain?.src, getU]);
  const live = useRef({ level: 0, target: 0, until: 0, settle: 0, step: 0 });
  useEffect(() => {
    const quiet = () =>
      window.matchMedia("(prefers-reduced-motion: reduce)").matches || window.matchMedia("(prefers-reduced-transparency: reduce)").matches;
    const on = (e: Event) => {
      if (quiet()) return;
      const { ms = 420, soft = false } = (e as CustomEvent<{ ms?: number; soft?: boolean }>).detail ?? {};
      const l = live.current;
      l.until = Math.max(l.until, performance.now() + ms);
      l.target = Math.max(soft ? 0.38 : 0.7, performance.now() < l.until && l.target > 0 ? l.target : 0);
    };
    window.addEventListener("lit:boil", on);
    return () => window.removeEventListener("lit:boil", on);
  }, []);
  // The page's grain jumps between six offsets ~12 times a second; so does this.
  const OFFS = useMemo(() => [[0, 0], [-41, 23], [29, -57], [-73, -11], [53, 67], [-17, 89]], []);
  useFrame((_, dt) => {
    const uniforms = getU();
    const scale = grain?.scale ?? 1;
    uniforms.uGrainPx.value = 128 * gl.getPixelRatio() * scale;
    const l = live.current;
    const now = performance.now();
    if (now > l.until) l.target = 0;
    // rise ~200 ms, settle ~760 ms (as the CSS layer's transitions)
    const k = l.target > l.level ? 12 : 3.2;
    l.level += (l.target - l.level) * (1 - Math.exp(-Math.min(dt, 0.05) * k));
    uniforms.uLive.value = l.level < 0.004 ? 0 : l.level;
    if (l.level > 0.004 && now - l.settle > 83) {
      l.settle = now;
      l.step = (l.step + 1) % OFFS.length;
      const [ox, oy] = OFFS[l.step];
      uniforms.uOff.value.set(ox / 128, oy / 128);
    }
  });
  const contrastMore = useMemo(() => typeof window !== "undefined" && window.matchMedia("(prefers-contrast: more)").matches, []);
  const onBeforeCompile = useCallback(
    (shader: THREE.WebGLProgramParametersWithUniforms) => {
      Object.assign(shader.uniforms, getU());
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "void main() {",
          `uniform sampler2D uGrain;
uniform float uGrainPx;
uniform float uLive;
uniform vec2 uOff;
uniform float uOn;
void main() {`,
        )
        .replace(
          "#include <colorspace_fragment>",
          `#include <colorspace_fragment>
if (uOn > 0.5) {
  vec2 gUv = gl_FragCoord.xy / uGrainPx;
  vec4 g0 = texture2D(uGrain, gUv);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, g0.rgb, g0.a);
  if (uLive > 0.0) {
    vec4 g1 = texture2D(uGrain, gUv + uOff + vec2(0.4765, 0.2890));
    gl_FragColor.rgb = mix(gl_FragColor.rgb, g1.rgb, g1.a * uLive);
  }
}`,
        );
    },
    [getU],
  );
  const useGrain = !!grain?.src && !contrastMore;

  return (
    <mesh geometry={geo} position={[0, y, 0]} receiveShadow>
      {/* envMapIntensity kept low: the image-based light is for the asset's
          reflections; on the paint it would flatten the falloff to an even wash. */}
      <meshStandardMaterial
        key={useGrain ? "grain" : "plain"}
        color={color}
        roughness={0.96}
        metalness={0}
        envMapIntensity={0.1}
        side={THREE.DoubleSide}
        onBeforeCompile={useGrain ? onBeforeCompile : undefined}
      />
    </mesh>
  );
}

/** Product-photography lighting for the set: one soft key that casts the only
 *  shadow, a background light that pools on the wall behind the subject, a
 *  cool fill and a rim. The rig turns with the camera (a turntable read: the
 *  light stays where the photographer put it while you inspect the object). */
function SetLights({ on, always }: { on: boolean; always?: boolean }) {
  const all = useRef<THREE.Group>(null);
  const rig = useRef<THREE.Group>(null);
  const keyTarget = useMemo(() => new THREE.Object3D(), []);
  const bgTarget = useMemo(() => new THREE.Object3D(), []);
  const camera = useThree((st) => st.camera);
  // Each light's authored intensity, captured once; every frame they are
  // scaled by `level`, which eases toward 1 when the model is ready and back
  // to a dim working light while the next one streams in.
  const base = useRef(new Map<THREE.Light, number>());
  const level = useRef(always ? 1 : 0.1);
  useFrame((_, dt) => {
    if (rig.current) rig.current.rotation.y = Math.atan2(camera.position.x, camera.position.z);
    const g = all.current;
    if (!g) return;
    if (!base.current.size) {
      g.traverse((o) => {
        const l = o as THREE.Light;
        if (l.isLight) base.current.set(l, l.intensity);
      });
    }
    const target = on || always ? 1 : 0.1;
    level.current += (target - level.current) * (1 - Math.exp(-Math.min(dt, 0.05) * 7));
    base.current.forEach((b, l) => {
      l.intensity = b * level.current;
    });
  });
  return (
    <>
      <group ref={all}>
      <ambientLight intensity={0.04} />
      <hemisphereLight args={["#fff4e6", "#0e0b09", 0.07]} />
      <group ref={rig}>
        {/* Key: a soft spot from high front-left. Its cone makes a pool of light
            around the subject that falls off to dark — the set is lit, not filled. */}
        <primitive object={keyTarget} position={[0, -0.6, 0]} />
        <spotLight
          position={[-2.2, 8, 2.6]}
          target={keyTarget}
          angle={0.3}
          penumbra={1}
          intensity={6}
          decay={0}
          color="#ffe8cc"
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-bias={-0.0004}
          shadow-camera-near={1}
          shadow-camera-far={20}
        />
        {/* Background light: a soft pool on the wall behind the subject. */}
        <primitive object={bgTarget} position={[0.4, 1.4, -10]} />
        <spotLight position={[0, 1.2, 2.5]} target={bgTarget} angle={0.3} penumbra={1} intensity={3.4} decay={0} color="#ffdcb8" />
        {/* Fill and rims are spots aimed at the subject, not directionals —
            a directional lights the whole floor evenly and kills the falloff. */}
        <spotLight position={[5, 2, 3]} target={keyTarget} angle={0.42} penumbra={1} intensity={0.9} decay={0} color="#cdd9ff" />
        <spotLight position={[2.5, 4, -6]} target={keyTarget} angle={0.3} penumbra={1} intensity={3} decay={0} color="#fff1e0" />
        <spotLight position={[-3.5, 2.5, -6]} target={keyTarget} angle={0.3} penumbra={1} intensity={1.8} decay={0} color="#d9e4ff" />
      </group>
      </group>
      <Environment resolution={256} environmentIntensity={0.8}>
        <Lightformer intensity={2.2} position={[0, 2.5, 3]} scale={[6, 5, 1]} color="#fff3e4" />
        <Lightformer intensity={0.8} position={[-4, 1, 2]} scale={[4, 4, 1]} color="#dfe7ff" />
        <Lightformer intensity={0.5} position={[0, -2, -3]} scale={[6, 4, 1]} color="#8a7b70" />
        <Lightformer intensity={2.4} position={[-5, 0.5, -1.5]} scale={[1.1, 7, 1]} color="#ffffff" />
        <Lightformer intensity={2.0} position={[5, 0.5, -1.5]} scale={[1.1, 7, 1]} color="#fff6ea" />
      </Environment>
    </>
  );
}

/** Puts the camera on the opening view for each asset and makes it the view
 *  that reset (double-click / 0) returns to. */
function OpeningView({ controls, azimuth, path }: { controls: React.RefObject<ControlsLike | null>; azimuth: number; path: string }) {
  useEffect(() => {
    const c = controls.current as (ControlsLike & { saveState?: () => void }) | null;
    if (!c) return;
    const r = c.object.position.distanceTo(c.target) || 4.6;
    const a = (azimuth * Math.PI) / 180;
    c.target.set(0, 0, 0);
    c.object.position.set(Math.sin(a) * r, 0, Math.cos(a) * r);
    c.update();
    c.saveState?.();
  }, [controls, azimuth, path]);
  return null;
}

/** Reports the orbit angle as a whole number of degrees, only on change — the
 *  caller writes it straight to the DOM, so there is no per-frame re-render. */
function AzimuthReporter({ onAzimuth }: { onAzimuth: (deg: number) => void }) {
  const camera = useThree((st) => st.camera);
  const last = useRef(-1);
  useFrame(() => {
    const deg = Math.round(((Math.atan2(camera.position.x, camera.position.z) * 180) / Math.PI + 360) % 360);
    if (deg !== last.current) {
      last.current = deg;
      onAzimuth(deg);
    }
  });
  return null;
}

/** Slide the framing sideways without moving the camera (sub-view offset). */
function ViewShift({ shift }: { shift: number }) {
  const camera = useThree((st) => st.camera);
  const size = useThree((st) => st.size);
  const cur = useRef(shift);
  // Ease toward the target framing (e.g. centring the subject when the label
  // steps away) instead of jumping; writes the view offset only while moving.
  useFrame((_, dt) => {
    const cam = camera as THREE.PerspectiveCamera;
    if (!cam.setViewOffset) return;
    const d = shift - cur.current;
    if (Math.abs(d) < 0.0005 && cam.view?.enabled) return;
    cur.current += d * (1 - Math.exp(-Math.min(dt, 0.05) * 9));
    cam.setViewOffset(size.width, size.height, -cur.current * size.width, 0, size.width, size.height);
  });
  useEffect(() => () => (camera as THREE.PerspectiveCamera).clearViewOffset?.(), [camera]);
  return null;
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

// ─── Motions ─────────────────────────────────────────────────────────────────
// The anatomical pose layer, the hand model and the motion library live in
// ./rig-motion (keyed in the body's own frame, in degrees). After the motion
// each frame: planted feet (contact-weighted IK), eyes, the twist driver.

// ─── After the motion: planted feet, eyes ─────────────────────────────────
// Run every frame after the motion (and, in Pose, after the solve), on top of a
// pose the motion has just rebuilt from bind — so nothing accumulates.

// Shoulder rhythm (Pose): no real shoulder raises the arm from the shoulder
// joint alone — past ~35° of elevation the clavicle and scapula carry about a
// third of it. Without that, all of a raise bends the skin at one point (the
// stretched shoulder). The clavicle lifts toward "up", leaning a little toward
// where the arm points, and the arm is re-solved to its target. (Motions get
// the same rhythm from the pose layer in ./rig-motion.)
const _sha = new THREE.Vector3();
const _shb = new THREE.Vector3();
const _shd = new THREE.Vector3();
const _sht = new THREE.Vector3();
const _shu = new THREE.Vector3();
const _shdn = new THREE.Vector3();
const _shq = new THREE.Quaternion();
const _upY = new THREE.Vector3(0, 1, 0);
const shoulderLift = (elev: number) => Math.min(0.5, 0.33 * Math.max(0, elev - 0.6));
/** The body's "down", along the chest (so a lean doesn't count as a raise). */
function chestDown(chest: THREE.Bone, neckBase: THREE.Bone, out: THREE.Vector3) {
  chest.getWorldPosition(out);
  neckBase.getWorldPosition(_sha);
  return out.sub(_sha).normalize();
}
function liftShoulder(clav: THREE.Bone, arm: THREE.Bone, elbow: THREE.Bone, down: THREE.Vector3, extra: number, keepArm: boolean) {
  arm.getWorldPosition(_sha);
  elbow.getWorldPosition(_shb);
  _shd.subVectors(_shb, _sha).normalize();
  const lift = shoulderLift(Math.acos(clampN(_shd.dot(down), -1, 1))) + extra;
  if (Math.abs(lift) < 1e-4) return;
  clav.getWorldPosition(_shb);
  _sht.subVectors(_sha, _shb).normalize(); // the clavicle, toward the shoulder joint
  _shd.addScaledVector(down, -_shd.dot(down)); // where the arm points, across the body
  _shu.copy(down).negate().addScaledVector(_shd, 0.35).normalize();
  _sha.crossVectors(_sht, _shu);
  if (_sha.lengthSq() < 1e-8) return;
  _shq.setFromAxisAngle(_sha.normalize(), lift);
  rotateWorld(clav, _shq);
  if (keepArm) rotateWorld(arm, _shq.invert());
}

type AnimLeg = {
  l: Limb;
  s: LimbState;
  pinR: THREE.Vector3;
  pinQR: THREE.Quaternion;
  bendR: THREE.Vector3;
  /** The ball of the foot (ToeBase) at bind, and the toes' bind rotation (root
   *  space): a lifted heel pivots the foot about the ball, toes flat. */
  toe: THREE.Bone | null;
  ballR: THREE.Vector3 | null;
  toeQR: THREE.Quaternion | null;
};
type AnimRig = {
  /** The hips' parent: planted feet are stored in its space. */
  root: THREE.Object3D;
  legs: AnimLeg[];
  head: THREE.Bone | null;
  /** The head's forward and right, and each eye's forward, in their own frames. */
  headFwdL: THREE.Vector3;
  headRightL: THREE.Vector3;
  eyes: Array<{ bone: THREE.Bone; fwdL: THREE.Vector3; rest: THREE.Quaternion }>;
  prevHeadFwd: THREE.Vector3;
  /** The body's right at bind (root space): the heel pivots about it. */
  rightR: THREE.Vector3;
  /** Hip height above the feet at bind (root space): a foot's lift is keyed in hip heights. */
  hipHR: number;
  /** How far ahead a resting gaze falls: ≈3 body heights, in `root` units
   *  (measured before the model is scaled into the scene — scale at use). */
  farR: number;
};

/** Measure the rig at bind for the after-clip drivers (CC rigs only). */
function buildAnim(primary: THREE.SkinnedMesh): AnimRig | null {
  const def = definePose(primary);
  const root = def?.hip?.parent;
  if (!def || !root) return null;
  const sk = primary.skeleton;
  const saved = sk.bones.map((b) => [b.position.clone(), b.quaternion.clone(), b.scale.clone()] as const);
  sk.pose();
  root.updateWorldMatrix(true, true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const rootQi = root.getWorldQuaternion(new THREE.Quaternion()).invert();
  const wp = (b: THREE.Object3D) => b.getWorldPosition(new THREE.Vector3());
  const get = (n: string) => sk.getBoneByName(`CC_Base_${n}`) ?? null;
  const lU = get("L_Upperarm");
  const rU = get("R_Upperarm");
  const right = lU && rU ? wp(rU).sub(wp(lU)) : new THREE.Vector3(1, 0, 0);
  right.y = 0;
  right.normalize();
  const fwd = new THREE.Vector3().crossVectors(_upY, right).normalize();
  const legs: AnimLeg[] = def.limbs
    .filter((l) => l.kind === "leg")
    .map((l) => {
      const a = wp(l.upper);
      const b = wp(l.mid);
      const c = wp(l.end);
      const midBind = l.mid.quaternion.clone();
      // the knee's own bend direction (flexed a little the solver's way)
      const q0 = l.mid.quaternion.clone();
      splitMid(l, midBind, _sw, _st);
      l.mid.quaternion.copy(midBind).multiply(_hs.setFromAxisAngle(l.hinge, l.flex * 0.35)).multiply(_sw).multiply(_st);
      l.mid.updateWorldMatrix(false, true);
      const tip = wp(l.end);
      l.mid.quaternion.copy(q0);
      l.mid.updateWorldMatrix(false, true);
      const axis = tip.sub(a).normalize();
      const bend = b.clone().sub(a);
      bend.addScaledVector(axis, -bend.dot(axis));
      if (bend.lengthSq() < 1e-12) bend.copy(fwd);
      const s: LimbState = {
        midBind,
        len: a.distanceTo(b) + b.distanceTo(c),
        pin: new THREE.Vector3(),
        pinQ: new THREE.Quaternion(),
        bendDir: new THREE.Vector3(),
      };
      const toe = get(`${l.side === 1 ? "R" : "L"}_ToeBase`);
      return {
        l,
        s,
        pinR: c.clone().applyMatrix4(inv),
        pinQR: rootQi.clone().multiply(l.end.getWorldQuaternion(new THREE.Quaternion())),
        bendR: bend.normalize().transformDirection(inv),
        toe,
        ballR: toe ? wp(toe).applyMatrix4(inv) : null,
        toeQR: toe ? rootQi.clone().multiply(toe.getWorldQuaternion(new THREE.Quaternion())) : null,
      };
    });
  const head = def.head;
  const hq = head ? head.getWorldQuaternion(new THREE.Quaternion()).invert() : new THREE.Quaternion();
  const eyes = ["L_Eye", "R_Eye"]
    .map((n) => get(n))
    .filter((b): b is THREE.Bone => !!b)
    .map((bone) => ({ bone, fwdL: fwd.clone().applyQuaternion(bone.getWorldQuaternion(new THREE.Quaternion()).invert()), rest: bone.quaternion.clone() }));
  // Root space, like the foot pins: this runs before the model joins its scaled
  // group, so world distances here are not the scene's.
  const feetR = legs.length ? legs.reduce((v, g) => v.add(g.pinR), new THREE.Vector3()).multiplyScalar(1 / legs.length) : null;
  const farR = head && feetR ? 3 * wp(head).applyMatrix4(inv).distanceTo(feetR) : 0;
  sk.bones.forEach((b, i) => {
    b.position.copy(saved[i][0]);
    b.quaternion.copy(saved[i][1]);
    b.scale.copy(saved[i][2]);
  });
  root.updateWorldMatrix(true, true);
  return {
    farR,
    root,
    legs,
    head,
    headFwdL: fwd.clone().applyQuaternion(hq),
    headRightL: right.clone().applyQuaternion(hq),
    eyes,
    prevHeadFwd: new THREE.Vector3(),
    rightR: right.clone().transformDirection(inv),
    hipHR: def.hip && feetR ? wp(def.hip).applyMatrix4(inv).distanceTo(feetR) : 0,
  };
}

const _fkQ = [new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion()];
const _ikQ = new THREE.Quaternion();
const _rootWQ = new THREE.Quaternion();
const _lockPole = new THREE.Vector3();
const _ballW = new THREE.Vector3();
const _heelAxis = new THREE.Vector3();
const _heelQ = new THREE.Quaternion();
const _toeQ = new THREE.Quaternion();
/** Hold the feet where they stand (level), blended by each foot's contact:
 *  the hips can sway, shift and crouch without a foot sliding or sinking. A
 *  lifted heel (degrees) pivots the planted foot about the ball, toes flat on
 *  the floor — a push-off rolls through the foot instead of tipping it. A
 *  lift (hip heights) raises the whole foot off its mark: a jump keeps its
 *  feet on IK all the way through the air (no hand-over to keyed legs and
 *  back — that switch rolled the thigh ~25° in one frame at touchdown). */
function lockFeet(a: AnimRig, contactL: number, contactR: number, heelL = 0, heelR = 0, liftL = 0, liftR = 0) {
  if ((contactL < 0.001 && contactR < 0.001) || !a.legs.length) return;
  a.root.updateWorldMatrix(true, false);
  a.root.getWorldQuaternion(_rootWQ);
  for (const g of a.legs) {
    const contact = g.l.side === 1 ? contactR : contactL;
    if (contact < 0.001) continue;
    const heel = ((g.l.side === 1 ? heelR : heelL) * Math.PI) / 180;
    const lift = heel > 1e-3 && !!g.toe && !!g.ballR && !!g.toeQR;
    const bones = lift && g.toe ? [g.l.upper, g.l.mid, g.l.end, g.toe] : [g.l.upper, g.l.mid, g.l.end];
    if (contact < 0.999) bones.forEach((b, i) => _fkQ[i].copy(b.quaternion));
    g.s.pin.copy(g.pinR).applyMatrix4(a.root.matrixWorld);
    g.s.pinQ.copy(_rootWQ).multiply(g.pinQR);
    const up = (g.l.side === 1 ? liftR : liftL) * a.hipHR * a.root.matrixWorld.getMaxScaleOnAxis();
    if (up > 0) g.s.pin.addScaledVector(_upY, up);
    if (lift && g.ballR) {
      _ballW.copy(g.ballR).applyMatrix4(a.root.matrixWorld);
      if (up > 0) _ballW.addScaledVector(_upY, up);
      _heelAxis.copy(a.rightR).transformDirection(a.root.matrixWorld);
      _heelQ.setFromAxisAngle(_heelAxis, -heel); // toes-down pitch about the ball: the heel rises
      g.s.pin.sub(_ballW).applyQuaternion(_heelQ).add(_ballW);
      g.s.pinQ.premultiply(_heelQ);
    }
    g.s.bendDir.copy(g.bendR).transformDirection(a.root.matrixWorld);
    g.l.upper.getWorldPosition(_lockPole).addScaledVector(g.s.bendDir, 1.2 * g.s.len).addScaledVector(_upY, 0.25 * g.s.len);
    // a planted knee always faces its pole (a fading roll let the thigh spin
    // ~19° in one frame as the leg straightened for the push)
    solveLimb(g.l, g.s, g.s.pin, _lockPole, true);
    setWorldQuat(g.l.end, g.s.pinQ);
    if (lift && g.toe && g.toeQR) setWorldQuat(g.toe, _toeQ.copy(_rootWQ).multiply(g.toeQR));
    if (contact < 0.999)
      bones.forEach((b, i) => {
        _ikQ.copy(b.quaternion);
        b.quaternion.copy(_fkQ[i]).slerp(_ikQ, contact);
        b.updateWorldMatrix(false, true);
      });
  }
}

// Eyes. Their bones carry the eyes' skin (≈560 weight each, measured), so the
// eyes behind the visor can look: small saccades at rest, ahead of the head as
// it turns, at the viewer during a greeting, at the gaze ring in Pose.
const EYE_RANGE = 0.32; // ~18° in the head: these big cartoon eyes read calm within it
const _ea = new THREE.Vector3();
const _eb = new THREE.Vector3();
const _ec = new THREE.Vector3();
const _ef = new THREE.Vector3();
const _er = new THREE.Vector3();
const _eu = new THREE.Vector3();
const _eq = new THREE.Quaternion();
const _eq2 = new THREE.Quaternion();
const _eq3 = new THREE.Quaternion();
const _eyeT = new THREE.Vector3();
const _eyeAim = new THREE.Vector3();
/** Point both eyes at a world target, within the eyes' range. */
function aimEyes(a: AnimRig, target: THREE.Vector3) {
  // Copy first: callers may pass a scratch vector this loop reuses (the
  // second eye would otherwise aim at the first eye's direction, not the point).
  _eyeAim.copy(target);
  for (const e of a.eyes) {
    e.bone.getWorldPosition(_ea);
    _eb.subVectors(_eyeAim, _ea).normalize();
    e.bone.getWorldQuaternion(_eq);
    _ec.copy(e.fwdL).applyQuaternion(_eq);
    const ang = Math.acos(clampN(_ec.dot(_eb), -1, 1));
    if (ang < 1e-4) continue;
    _eq2.setFromUnitVectors(_ec, _eb);
    _eq3.identity().slerp(_eq2, Math.min(1, EYE_RANGE / ang));
    rotateWorld(e.bone, _eq3);
  }
}
/** Deterministic saccades: a new small fixation every ~2.3 s, reached in ~90 ms. */
function saccade(t: number): [number, number] {
  const period = 2.3;
  const k = Math.floor(t / period);
  const hash = (n: number) => {
    const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  };
  const e = Math.min(1, (t - k * period) / 0.09);
  const s2 = e * e * (3 - 2 * e);
  const yaw = (hash(k - 1) - 0.5) * 0.3 + ((hash(k) - 0.5) * 0.3 - (hash(k - 1) - 0.5) * 0.3) * s2;
  const pitch = (hash(k + 16.3) - 0.5) * 0.12 + ((hash(k + 17.3) - 0.5) * 0.12 - (hash(k + 16.3) - 0.5) * 0.12) * s2;
  return [yaw, pitch];
}
/** Where the eyes look this frame, for a clip's eye mode. */
function driveEyes(a: AnimRig, mode: EyeMode, t: number, dt: number, viewer: THREE.Vector3) {
  if (!a.head || !a.eyes.length) return;
  // From the socket every frame: the eye bones are not part of the motion's
  // pose, so without this each frame's aim stacked on the last (the eyes
  // turned 84–142° chasing a viewer behind the head and stayed there).
  for (const e of a.eyes) e.bone.quaternion.copy(e.rest);
  a.eyes[0].bone.parent?.updateWorldMatrix(true, true);
  if (mode === "none") return;
  if (mode === "viewer") {
    // follow the viewer only while they are within ~60° of where the head faces
    a.head.getWorldQuaternion(_eq);
    _ef.copy(a.headFwdL).applyQuaternion(_eq);
    a.head.getWorldPosition(_eb);
    _ec.subVectors(viewer, _eb).normalize();
    if (_ef.dot(_ec) > 0.5) return aimEyes(a, viewer);
    mode = "ahead";
  }
  a.head.getWorldQuaternion(_eq);
  _ef.copy(a.headFwdL).applyQuaternion(_eq);
  _er.copy(a.headRightL).applyQuaternion(_eq);
  _eu.crossVectors(_er, _ef);
  let yaw = 0;
  let pitch = 0;
  if (mode === "ahead" || mode === "lead") [yaw, pitch] = saccade(t);
  _eyeT.copy(_ef).addScaledVector(_er, Math.tan(yaw)).addScaledVector(_eu, Math.tan(pitch)).normalize();
  // lead: look where the head is turning (its turn over the next ~0.3 s)
  if (dt > 0 && a.prevHeadFwd.lengthSq() > 0) {
    _ec.subVectors(_ef, a.prevHeadFwd).multiplyScalar((mode === "lead" ? 0.35 : 0.15) / dt);
    if (_ec.length() > 0.5) _ec.setLength(0.5);
    _eyeT.add(_ec).normalize();
  }
  a.prevHeadFwd.copy(_ef);
  a.head.getWorldPosition(_eb);
  const far = a.farR > 0 ? a.farR * a.root.matrixWorld.getMaxScaleOnAxis() : 3;
  aimEyes(a, _eb.addScaledVector(_eyeT, far));
}

// ─── Dual-quaternion skinning ───────────────────────────────────────────────
// Linear blend skinning averages bone MATRICES, so a vertex shared by a still
// torso and an arm raised 120° is pulled toward the joint — the thin,
// collapsed web at a raised shoulder, the pinched elbow and knee. Blending
// dual quaternions blends the ROTATIONS and keeps the skin's distance from the
// joint. This rig has no weighted corrective bones (its ShareBones are empty),
// so this is the fix the runtime can make.
// How: the skeleton's own bone texture (which three re-binds for every skinned
// draw) carries, per bone, a (real, dual) quaternion pair and the bone's
// uniform scale instead of a matrix; texel 3's w is 0 for that layout and 1
// for a matrix, so every patched shader tells the two apart and falls back to
// linear blending if the matrices come back (cleanup, or QA `window.__lbs`).
// Shadows use patched depth materials, so they deform the same way.
const DQ_PARS = /* glsl */ `
#include <skinning_pars_vertex>
#ifdef USE_SKINNING
vec4 dqTexel( const in float i, const in int k ) {
  int size = textureSize( boneTexture, 0 ).x;
  int j = int( i ) * 4 + k;
  return texelFetch( boneTexture, ivec2( j % size, j / size ), 0 );
}
#endif
`;
const DQ_BASE = /* glsl */ `
#include <skinbase_vertex>
#ifdef USE_SKINNING
bool dqMode = dqTexel( skinIndex.x, 3 ).w < 0.5;
vec4 dqR = vec4( 0.0, 0.0, 0.0, 1.0 );
vec4 dqD = vec4( 0.0 );
float dqS = 1.0;
if ( dqMode ) {
  vec4 r0 = dqTexel( skinIndex.x, 0 ); vec4 d0 = dqTexel( skinIndex.x, 1 );
  vec4 r1 = dqTexel( skinIndex.y, 0 ); vec4 d1 = dqTexel( skinIndex.y, 1 );
  vec4 r2 = dqTexel( skinIndex.z, 0 ); vec4 d2 = dqTexel( skinIndex.z, 1 );
  vec4 r3 = dqTexel( skinIndex.w, 0 ); vec4 d3 = dqTexel( skinIndex.w, 1 );
  float s1 = dot( r0, r1 ) < 0.0 ? -1.0 : 1.0;
  float s2 = dot( r0, r2 ) < 0.0 ? -1.0 : 1.0;
  float s3 = dot( r0, r3 ) < 0.0 ? -1.0 : 1.0;
  dqR = skinWeight.x * r0 + skinWeight.y * s1 * r1 + skinWeight.z * s2 * r2 + skinWeight.w * s3 * r3;
  dqD = skinWeight.x * d0 + skinWeight.y * s1 * d1 + skinWeight.z * s2 * d2 + skinWeight.w * s3 * d3;
  float dqLen = max( length( dqR ), 1e-6 );
  dqR /= dqLen;
  dqD /= dqLen;
  float wsum = max( skinWeight.x + skinWeight.y + skinWeight.z + skinWeight.w, 1e-6 );
  dqS = ( skinWeight.x * dqTexel( skinIndex.x, 2 ).x + skinWeight.y * dqTexel( skinIndex.y, 2 ).x
        + skinWeight.z * dqTexel( skinIndex.z, 2 ).x + skinWeight.w * dqTexel( skinIndex.w, 2 ).x ) / wsum;
}
#endif
`;
const DQ_NORMAL = /* glsl */ `
#ifdef USE_SKINNING
vec3 dqN0 = objectNormal;
#ifdef USE_TANGENT
vec3 dqT0 = objectTangent;
#endif
#endif
#include <skinnormal_vertex>
#ifdef USE_SKINNING
if ( dqMode ) {
  vec3 dqn = ( bindMatrix * vec4( dqN0, 0.0 ) ).xyz;
  dqn += 2.0 * cross( dqR.xyz, cross( dqR.xyz, dqn ) + dqR.w * dqn );
  objectNormal = ( bindMatrixInverse * vec4( dqn, 0.0 ) ).xyz;
  #ifdef USE_TANGENT
  vec3 dqt = ( bindMatrix * vec4( dqT0, 0.0 ) ).xyz;
  dqt += 2.0 * cross( dqR.xyz, cross( dqR.xyz, dqt ) + dqR.w * dqt );
  objectTangent = ( bindMatrixInverse * vec4( dqt, 0.0 ) ).xyz;
  #endif
}
#endif
`;
const DQ_SKIN = /* glsl */ `
#ifdef USE_SKINNING
vec3 dqP0 = transformed;
#endif
#include <skinning_vertex>
#ifdef USE_SKINNING
if ( dqMode ) {
  vec3 dqp = ( bindMatrix * vec4( dqP0, 1.0 ) ).xyz;
  dqp += 2.0 * cross( dqR.xyz, cross( dqR.xyz, dqp ) + dqR.w * dqp );
  dqp += 2.0 * ( dqR.w * dqD.xyz - dqD.w * dqR.xyz + cross( dqR.xyz, dqD.xyz ) );
  transformed = ( bindMatrixInverse * vec4( dqp * dqS, 1.0 ) ).xyz;
}
#endif
`;

/** Teach a material to read dual-quaternion bone data (idempotent). */
function patchDQ<T extends THREE.Material>(mat: T): T {
  if (mat.userData.dqs) return mat;
  mat.userData.dqs = true;
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    prev.call(mat, shader, renderer);
    shader.vertexShader = shader.vertexShader
      .replace("#include <skinning_pars_vertex>", DQ_PARS)
      .replace("#include <skinbase_vertex>", DQ_BASE)
      .replace("#include <skinnormal_vertex>", DQ_NORMAL)
      .replace("#include <skinning_vertex>", DQ_SKIN);
  };
  const prevKey = mat.customProgramCacheKey.bind(mat);
  mat.customProgramCacheKey = () => `${prevKey()}|dqs`;
  mat.needsUpdate = true;
  return mat;
}

const _dm = new THREE.Matrix4();
const _dt = new THREE.Vector3();
const _dr = new THREE.Quaternion();
const _dsc = new THREE.Vector3();
/** Write each bone's transform as [real quat][dual quat][scale,0,0,0][0,0,0,0]. */
function packDQ(sk: THREE.Skeleton) {
  const arr = sk.boneMatrices as Float32Array;
  for (let i = 0; i < sk.bones.length; i++) {
    const bone = sk.bones[i];
    if (bone) _dm.multiplyMatrices(bone.matrixWorld, sk.boneInverses[i]);
    else _dm.identity();
    _dm.decompose(_dt, _dr, _dsc);
    const sc = (_dsc.x + _dsc.y + _dsc.z) / 3 || 1;
    const tx = _dt.x / sc, ty = _dt.y / sc, tz = _dt.z / sc;
    const { x, y, z, w } = _dr;
    const o = i * 16;
    arr[o] = x;
    arr[o + 1] = y;
    arr[o + 2] = z;
    arr[o + 3] = w;
    arr[o + 4] = 0.5 * (w * tx + ty * z - tz * y);
    arr[o + 5] = 0.5 * (w * ty + tz * x - tx * z);
    arr[o + 6] = 0.5 * (w * tz + tx * y - ty * x);
    arr[o + 7] = -0.5 * (tx * x + ty * y + tz * z);
    arr[o + 8] = sc;
    for (let k = 9; k < 16; k++) arr[o + k] = 0; // texel 3 .w = 0 → dual-quaternion layout
  }
}

/** Do this skeleton's bones carry one uniform scale (so DQS can factor it out)? */
function uniformlyScaled(sk: THREE.Skeleton) {
  let lo = Infinity;
  let hi = 0;
  for (let i = 0; i < sk.bones.length; i++) {
    const bone = sk.bones[i];
    if (!bone) continue;
    bone.updateWorldMatrix(true, false);
    _dm.multiplyMatrices(bone.matrixWorld, sk.boneInverses[i]).decompose(_dt, _dr, _dsc);
    for (const c of [_dsc.x, _dsc.y, _dsc.z]) {
      lo = Math.min(lo, c);
      hi = Math.max(hi, c);
    }
  }
  return lo > 0 && hi / lo < 1.001;
}

/** Switch a rig to dual-quaternion skinning; returns the undo. */
function enableDQS(root: THREE.Object3D): () => void {
  const meshes: THREE.SkinnedMesh[] = [];
  root.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) meshes.push(o as THREE.SkinnedMesh);
  });
  const skeletons = [...new Set(meshes.map((m) => m.skeleton))].filter(uniformlyScaled);
  if (!skeletons.length) return () => {};
  const undo: Array<() => void> = [];
  for (const sk of skeletons) {
    const orig = sk.update;
    sk.update = function (this: THREE.Skeleton) {
      if (RIG_QA && (window as unknown as { __lbs?: boolean }).__lbs) return orig.call(this);
      packDQ(this);
      if (this.boneTexture) this.boneTexture.needsUpdate = true;
    };
    undo.push(() => {
      sk.update = orig;
      sk.update();
    });
  }
  const depth = patchDQ(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }));
  const distance = patchDQ(new THREE.MeshDistanceMaterial());
  for (const m of meshes) {
    if (!skeletons.includes(m.skeleton)) continue;
    const prevBR = m.onBeforeRender;
    const prevDepth = m.customDepthMaterial;
    const prevDistance = m.customDistanceMaterial;
    // Whatever material a channel puts on the mesh is patched before it draws.
    m.onBeforeRender = function (renderer, scene, camera, geometry, material, group) {
      prevBR.call(this, renderer, scene, camera, geometry, material, group);
      patchDQ(material);
    };
    for (const mat of Array.isArray(m.material) ? m.material : [m.material]) patchDQ(mat);
    m.customDepthMaterial = depth;
    m.customDistanceMaterial = distance;
    undo.push(() => {
      m.onBeforeRender = prevBR;
      m.customDepthMaterial = prevDepth;
      m.customDistanceMaterial = prevDistance;
    });
  }
  return () => {
    undo.forEach((u) => u());
    depth.dispose();
    distance.dispose();
  };
}

// ─── Twist distribution ("roll bones") ───────────────────────────────────────
// PROBED on this rig (?debug, skin weights summed per bone): the limb bones
// themselves carry NO skin — Upperarm, Forearm, Thigh and Calf have zero
// weight. Each limb's skin lives on its two twist bones: Twist01 at the
// segment's root joint, Twist02 (Twist01's child) at the midpoint. Undriven,
// both inherit the limb's FULL roll, so shoulder, elbow, hip and knee skin
// wrings like a candy wrapper whenever a limb rolls (every IK move, the
// forearm's pronation). The driver grades the roll the way anatomy does —
// little at the root end, most toward the far end. `a` = the net share of the
// segment's twist that Twist01's / Twist02's skin takes. The forearm also
// carries the wrist's own roll (the hand's twist), so a turning hand twists
// the forearm instead of shearing at the wrist.
type TwistBone = { bone: THREE.Bone; bind: THREE.Quaternion; s: number };
type TwistSeg = {
  seg: THREE.Bone;
  segBind: THREE.Quaternion;
  end: { bone: THREE.Bone; bind: THREE.Quaternion } | null;
  t1: TwistBone;
  t2: TwistBone | null;
  a1: number;
  a2: number;
};
export type TwistRig = TwistSeg[];
const TWIST_SPECS: Array<{ seg: string; end?: string; a: [number, number] }> = [
  { seg: "Upperarm", a: [0.1, 0.55] },
  { seg: "Forearm", end: "Hand", a: [0.2, 0.65] },
  { seg: "Thigh", a: [0.1, 0.55] },
  { seg: "Calf", a: [0.2, 0.6] },
];
const _tq = new THREE.Quaternion();
const _ty = new THREE.Vector3(0, 1, 0);

/** Roll of `q` relative to `bind` about the bone's own +Y (along the bone). */
function twistOf(bind: THREE.Quaternion, q: THREE.Quaternion): number {
  _tq.copy(bind).invert().multiply(q);
  let a = 2 * Math.atan2(_tq.y, _tq.w);
  if (a > Math.PI) a -= 2 * Math.PI;
  if (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

function buildTwist(primary: THREE.SkinnedMesh): TwistRig | null {
  const sk = primary.skeleton;
  // Read the true bind from the inverse-bind matrices, then put the pose back.
  const saved = sk.bones.map((b) => [b.position.clone(), b.quaternion.clone()] as const);
  sk.pose();
  // ±1: does the twist bone's +Y run the same way as its parent's?
  const sgn = (b: THREE.Bone) => (_ty.clone().applyQuaternion(b.quaternion).y < 0 ? -1 : 1);
  const out: TwistRig = [];
  for (const side of ["L", "R"])
    for (const spec of TWIST_SPECS) {
      const seg = sk.getBoneByName(`CC_Base_${side}_${spec.seg}`);
      const t1 = sk.getBoneByName(`CC_Base_${side}_${spec.seg}Twist01`);
      const t2 = sk.getBoneByName(`CC_Base_${side}_${spec.seg}Twist02`);
      if (!seg || !t1 || t1.parent !== seg) continue;
      const end = spec.end ? sk.getBoneByName(`CC_Base_${side}_${spec.end}`) : undefined;
      out.push({
        seg,
        segBind: seg.quaternion.clone(),
        end: end && end.parent === seg ? { bone: end, bind: end.quaternion.clone() } : null,
        t1: { bone: t1, bind: t1.quaternion.clone(), s: sgn(t1) },
        t2: t2 && t2.parent === t1 ? { bone: t2, bind: t2.quaternion.clone(), s: sgn(t2) } : null,
        a1: spec.a[0],
        a2: spec.a[1],
      });
    }
  sk.bones.forEach((b, i) => {
    b.position.copy(saved[i][0]);
    b.quaternion.copy(saved[i][1]);
  });
  return out.length ? out : null;
}

// Field-QA (?debug): `window.__twistOff = true` holds the twist bones at bind
// (the rig's raw, undriven behaviour) for a before/after comparison.
const RIG_QA = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("debug");

/** Re-grade every limb's roll across its twist bones (after any posing). */
function driveTwists(rig: TwistRig) {
  const off = RIG_QA && !!(window as unknown as { __twistOff?: boolean }).__twistOff;
  for (const t of rig) {
    if (off) {
      t.t1.bone.quaternion.copy(t.t1.bind);
      t.t2?.bone.quaternion.copy(t.t2.bind);
      continue;
    }
    const segTw = twistOf(t.segBind, t.seg.quaternion);
    const tau = segTw + (t.end ? twistOf(t.end.bind, t.end.bone.quaternion) : 0);
    _tq.setFromAxisAngle(_ty, t.t1.s * (t.a1 * tau - segTw));
    t.t1.bone.quaternion.copy(t.t1.bind).multiply(_tq);
    if (t.t2) {
      _tq.setFromAxisAngle(_ty, t.t2.s * (t.a2 - t.a1) * tau);
      t.t2.bone.quaternion.copy(t.t2.bind).multiply(_tq);
    }
  }
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
// Per-segment flex (radians at curl=1). Axes MEASURED against the GLB bind
// transforms (tangent test: rotate segment 1, watch segment 2 move toward the
// palm normal): fingers hinge about local Z, MIRRORED (R +Z, L −Z; toward-palm
// scores 0.8–0.99 — the previously-shipped −X barely moved the index and did
// nothing for mid/pinky, which is why a "fist" splayed instead of closing).
// The thumb WRAPS ACROSS the closed fingers rather than folding under:
// grid-searched offline against the curled index/mid knuckles, its tip lands
// half a knuckle-width from them, slightly palm-side — segment 1 is mostly
// mirrored-Y opposition (R +Y / L −Y) with light −X flexion, 2–3 mostly −X.
const FINGER_SEG_FLEX = [0.85, 1.15, 0.9];
const THUMB_SEG_FLEX: Array<[number, number]> = [[0.15, 0.5], [0.4, 0.08], [0.5, 0]]; // [−x flex, ±y opposition]
const FINGER_RE = /_(Thumb|Index|Mid|Ring|Pinky)([123])$/;

type FingerJoint = {
  bone: THREE.Bone;
  rest: THREE.Quaternion;
  /** Radians at curl=1: fingers use fx about mirrored Z; thumbs −fx about X
   *  plus side·fy about Y (the opposition sweep). */
  fx: number;
  fy: number;
  isThumb: boolean;
  /** +1 right hand, −1 left — the mirrored component's sign. */
  side: number;
};

// ─── Posing: analytic two-bone IK ─────────────────────────────────────────
// For humanoid (CC-named) rigs. Each limb is solved exactly instead of by CCD:
// the elbow / knee bends on its MEASURED hinge (JOINT_LIMITS) to the length the
// target needs, the chain aims at the target, then rolls about its own axis so
// the elbow / knee faces a pole (elbows back-down-out, knees forward) — no
// flipped elbows, no straight-limb lock-up. Posing starts from the relaxed
// stance (not the A-pose bind); feet stay planted AND level while the hips
// move; a gaze target turns neck and head; the twist driver grades the roll.
type Limb = {
  key: string;
  kind: "arm" | "leg";
  side: 1 | -1;
  upper: THREE.Bone;
  mid: THREE.Bone;
  end: THREE.Bone;
  hinge: THREE.Vector3;
  flex: number;
  maxFlex: number;
};
type PoseDef = {
  limbs: Limb[];
  hip: THREE.Bone | null;
  /** Waist → Spine01 → Spine02: the chest ring leans them, shared down the chain. */
  spine: THREE.Bone[];
  /** The base of the neck — where the chest ring sits. */
  chestTop: THREE.Bone | null;
  neck: THREE.Bone[];
  head: THREE.Bone | null;
};
type LimbState = {
  midBind: THREE.Quaternion;
  len: number;
  pin: THREE.Vector3;
  pinQ: THREE.Quaternion;
  /** The way this elbow / knee stands out when it bends, measured when posing
   *  starts (world) — the base of its pole. */
  bendDir: THREE.Vector3;
  /** Flex limit from the limb's measured thickness (else the joint's own). */
  maxFlex?: number;
};
type PoseState = {
  /** Arms: where each hand should be, in the chest's frame (it rides along). */
  armPins: Map<Limb, THREE.Vector3>;
  clavRest: Map<Limb, THREE.Quaternion>;
  /** Measured body proxies, and the contact each arm already has at rest. */
  body: BodyProxy | null;
  armSlack: Map<Limb, number>;
  handSlack: Map<Limb, number>;
  floorY: number;
  footSep: number;
  eyeRest: THREE.Quaternion[];
  spineRest: THREE.Quaternion[];
  /** Where the chest should be, as an offset from the hips (world axes). */
  leanOff: THREE.Vector3;
  limbs: Map<Limb, LimbState>;
  hipOk: THREE.Vector3;
  look: THREE.Vector3;
  lookRest: THREE.Quaternion[];
  headFwd: THREE.Vector3;
  fwd: THREE.Vector3;
  up: THREE.Vector3;
  right: THREE.Vector3;
  /** Each hand's grip (0 open · 1 rest · 2 fist) per finger segment, eased
   *  toward the preset — base knuckles first, tips last. */
  grip: { L: [number, number, number]; R: [number, number, number] };
};

/** The rig's posable parts, by CC name (pure lookups — no mutation). */
function definePose(primary: THREE.SkinnedMesh): PoseDef | null {
  const sk = primary.skeleton;
  const get = (n: string) => sk.getBoneByName(`CC_Base_${n}`) ?? null;
  const limbs: Limb[] = [];
  const kinds = [
    ["arm", ["Upperarm", "Forearm", "Hand"]],
    ["leg", ["Thigh", "Calf", "Foot"]],
  ] as const;
  for (const side of ["L", "R"] as const)
    for (const [kind, names] of kinds) {
      const [upper, mid, end] = names.map((n) => get(`${side}_${n}`));
      const lim = mid ? limitFor(mid.name) : null;
      if (!upper || !mid || !end || end.parent !== mid || mid.parent !== upper || !lim || lim.kind !== "hinge") continue;
      limbs.push({
        key: end.name,
        kind,
        side: side === "R" ? 1 : -1,
        upper,
        mid,
        end,
        hinge: lim.axis,
        flex: Math.abs(lim.min) > Math.abs(lim.max) ? -1 : 1,
        maxFlex: Math.max(Math.abs(lim.min), Math.abs(lim.max)),
      });
    }
  if (limbs.length < 4) return null;
  const neck = [get("NeckTwist01"), get("NeckTwist02")].filter((b): b is THREE.Bone => !!b);
  const spine = [get("Waist"), get("Spine01"), get("Spine02")].filter((b): b is THREE.Bone => !!b);
  return { limbs, hip: get("Hip"), spine, chestTop: get("NeckTwist01"), neck, head: get("Head") };
}

const _ia = new THREE.Vector3();
const _ib = new THREE.Vector3();
const _ic = new THREE.Vector3();
const _iu = new THREE.Vector3();
const _iv = new THREE.Vector3();
const _iq = new THREE.Quaternion();
const _iw = new THREE.Quaternion();
const _ip = new THREE.Quaternion();
const _hq = new THREE.Quaternion();
const _hs = new THREE.Quaternion();
const _ht = new THREE.Quaternion();
const _sw = new THREE.Quaternion();
const _st = new THREE.Quaternion();
const _im = new THREE.Matrix4();
const _pole = new THREE.Vector3();
const _hipTry = new THREE.Vector3();
const _lp = new THREE.Vector3();
const _lf = new THREE.Vector3();
const _lq = new THREE.Quaternion();
const _lr = new THREE.Quaternion();
const _lw = new THREE.Quaternion();
const _camDir = new THREE.Vector3();
const clampN = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const wrapA = (a: number) => (a > Math.PI ? a - 2 * Math.PI : a < -Math.PI ? a + 2 * Math.PI : a);

/** Rotate a bone by a WORLD-space rotation (`r` must not be _iw / _ip). */
function rotateWorld(bone: THREE.Bone, r: THREE.Quaternion) {
  bone.getWorldQuaternion(_iw).premultiply(r);
  (bone.parent as THREE.Object3D).getWorldQuaternion(_ip).invert();
  bone.quaternion.copy(_ip).multiply(_iw);
  bone.updateWorldMatrix(false, true);
}
/** Give a bone this WORLD orientation (a foot stays level as its leg moves). */
function setWorldQuat(bone: THREE.Bone, q: THREE.Quaternion) {
  (bone.parent as THREE.Object3D).getWorldQuaternion(_ip).invert();
  bone.quaternion.copy(_ip).multiply(q);
  bone.updateWorldMatrix(false, true);
}
/** Split the mid joint's rotation (relative to bind) into swing · twist (twist
 *  = roll about the bone's own +Y) into `swing` / `twist`; returns the part of
 *  the swing that lies on the hinge (the current bend). */
function splitMid(l: Limb, bind: THREE.Quaternion, swing: THREE.Quaternion, twist: THREE.Quaternion): number {
  _hq.copy(bind).invert().multiply(l.mid.quaternion);
  const n = Math.hypot(_hq.y, _hq.w);
  if (n < 1e-8) twist.identity();
  else twist.set(0, _hq.y / n, 0, _hq.w / n);
  swing.copy(_hq).multiply(_ht.copy(twist).invert()); // swing = delta · twist⁻¹
  if (swing.w < 0) swing.set(-swing.x, -swing.y, -swing.z, -swing.w);
  const proj = swing.x * l.hinge.x + swing.y * l.hinge.y + swing.z * l.hinge.z;
  return wrapA(2 * Math.atan2(proj, swing.w));
}

/** Solve one limb exactly: bend to length, aim, roll toward the pole. */
function solveLimb(l: Limb, s: LimbState, target: THREE.Vector3, pole: THREE.Vector3, fullRoll = false) {
  l.upper.getWorldPosition(_ia);
  l.mid.getWorldPosition(_ib);
  l.end.getWorldPosition(_ic);
  const l1 = _ia.distanceTo(_ib);
  const l2 = _ib.distanceTo(_ic);
  // Reach stops just short of straight (a straight limb has no bend direction)
  // — unless the limb already is straighter, which it may stay.
  const d = clampN(_ia.distanceTo(target), Math.abs(l1 - l2) + 1e-3, Math.max((l1 + l2) * 0.999, _ia.distanceTo(_ic)));
  const want = Math.acos(clampN((l1 * l1 + l2 * l2 - d * d) / (2 * l1 * l2), -1, 1));
  // Bend: keep the joint's existing swing (e.g. the stance's carrying angle)
  // and roll exactly as they are, and add bend on the BIND hinge in front of
  // them — so the first grab never snaps the forearm, and the elbow / knee
  // only folds the way it anatomically can.
  const bend0 = splitMid(l, s.midBind, _sw, _st);
  let extra = 0;
  for (let k = 0; k < 3; k++) {
    l.mid.getWorldPosition(_ib);
    l.end.getWorldPosition(_ic);
    _iu.subVectors(_ia, _ib).normalize();
    _iv.subVectors(_ic, _ib).normalize();
    const cur = Math.acos(clampN(_iu.dot(_iv), -1, 1));
    const next = l.flex * clampN(l.flex * (bend0 + extra) + (cur - want), -0.02, s.maxFlex ?? l.maxFlex) - bend0;
    if (Math.abs(next - extra) < 1e-5) break;
    extra = next;
    _hs.setFromAxisAngle(l.hinge, extra);
    l.mid.quaternion.copy(s.midBind).multiply(_hs).multiply(_sw).multiply(_st);
    l.mid.updateWorldMatrix(false, true);
  }
  // Aim: turn the whole chain so its tip points at the target.
  l.end.getWorldPosition(_ic);
  _iu.subVectors(_ic, _ia).normalize();
  _iv.subVectors(target, _ia).normalize();
  _iq.setFromUnitVectors(_iu, _iv);
  rotateWorld(l.upper, _iq);
  // Roll about the root→target line so the elbow / knee faces the pole — in
  // proportion to how bent the limb is: a near-straight limb's joint offset
  // points nowhere in particular, and steering that noise would twist the
  // whole limb (it rolled a standing leg ~23° on entering Pose).
  l.mid.getWorldPosition(_ib).sub(_ia);
  _ib.addScaledVector(_iv, -_ib.dot(_iv));
  _iu.subVectors(pole, _ia);
  _iu.addScaledVector(_iv, -_iu.dot(_iv));
  const bent = fullRoll ? (_ib.length() > 0.004 * s.len ? 1 : 0) : clampN((_ib.length() / s.len - 0.01) / 0.04, 0, 1);
  if (bent > 0 && _iu.lengthSq() > 1e-10) {
    const ang = Math.atan2(_iv.dot(_ic.crossVectors(_ib, _iu)), _ib.dot(_iu));
    _iq.setFromAxisAngle(_iv, ang * bent * bent * (3 - 2 * bent));
    rotateWorld(l.upper, _iq);
  }
}

/** Poles start from each joint's own bend direction (measured when posing
 *  starts), so a limb is never rolled away from how it naturally bends. Knees
 *  tilt UP — a leg raised forward bends knee-up like a step (a downward pole
 *  would aim the knee at the floor); elbows tilt DOWN — a raised arm keeps its
 *  elbow low. On a limb hanging straight down the vertical tilt projects away,
 *  so the start pose is untouched. */
function poleOf(l: Limb, s: LimbState, st: PoseState, out: THREE.Vector3) {
  l.upper.getWorldPosition(out);
  const L = s.len;
  out.addScaledVector(s.bendDir, (l.kind === "leg" ? 1.2 : 0.7) * L);
  return out.addScaledVector(st.up, (l.kind === "leg" ? 0.25 : -0.5) * L);
}

function placeHip(hip: THREE.Bone, p: THREE.Vector3) {
  const parent = hip.parent as THREE.Object3D;
  parent.updateWorldMatrix(true, false);
  hip.position.copy(p).applyMatrix4(_im.copy(parent.matrixWorld).invert());
  hip.updateWorldMatrix(false, true);
}
/** Planted feet must stay reachable: between a half-squat and a straight
 *  leg. With the feet held flat, a deeper crouch would need more ankle flex
 *  than a foot has (the knees end up near the floor — it reads as kneeling). */
function legsReach(def: PoseDef, st: PoseState) {
  for (const l of def.limbs) {
    if (l.kind !== "leg") continue;
    const s = st.limbs.get(l);
    if (!s) continue;
    const dd = l.upper.getWorldPosition(_ia).distanceTo(s.pin);
    if (dd > s.len * 0.995 || dd < s.len * 0.62) return false;
  }
  return true;
}
/** Move the hips toward `want`, stopping where the planted feet stop reaching. */
function moveHips(def: PoseDef, st: PoseState, want: THREE.Vector3) {
  const hip = def.hip;
  if (!hip) return;
  placeHip(hip, want);
  if (legsReach(def, st)) {
    st.hipOk.copy(want);
    return;
  }
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 7; i++) {
    const m = (lo + hi) / 2;
    placeHip(hip, _hipTry.lerpVectors(st.hipOk, want, m));
    if (legsReach(def, st)) lo = m;
    else hi = m;
  }
  placeHip(hip, _hipTry.lerpVectors(st.hipOk, want, lo));
  st.hipOk.copy(_hipTry);
}

const LEAN_SHARE = [0.3, 0.4]; // of the remaining lean: Waist, Spine01; Spine02 takes the rest
// Lean limits by direction (radians from upright): forward stops before the
// torso folds onto the thighs, back and sideways before the spine buckles.
const LEAN_FWD = 0.45;
const LEAN_BACK = 0.25;
const LEAN_SIDE = 0.4;
const _ca = new THREE.Vector3();
const _cb = new THREE.Vector3();
const _cc = new THREE.Vector3();
const _cd = new THREE.Vector3();
/** The spine bends so the chest moves toward its target (a lean forward, back
 *  or to the side), shared down the chain; the neck, head and arms ride along. */
function solveChest(def: PoseDef, st: PoseState) {
  const top = def.chestTop;
  if (!top || !def.hip || !def.spine.length) return;
  def.spine.forEach((b, i) => b.quaternion.copy(st.spineRest[i]));
  def.spine[0].updateWorldMatrix(true, true);
  def.spine[0].getWorldPosition(_ca);
  def.hip.getWorldPosition(_cb).add(st.leanOff);
  _cd.subVectors(_cb, _ca);
  if (_cd.lengthSq() < 1e-8) return;
  _cd.normalize();
  const vert = Math.max(1e-3, _cd.dot(st.up));
  const lf = clampN(Math.atan2(_cd.dot(st.fwd), vert), -LEAN_BACK, LEAN_FWD);
  const ls = clampN(Math.atan2(_cd.dot(st.right), vert), -LEAN_SIDE, LEAN_SIDE);
  _cd.copy(st.up).addScaledVector(st.fwd, Math.tan(lf)).addScaledVector(st.right, Math.tan(ls)).normalize();
  def.spine.forEach((b, i) => {
    top.getWorldPosition(_cc).sub(_ca).normalize(); // where the chest leans now
    _lq.setFromUnitVectors(_cc, _cd);
    _lr.identity().slerp(_lq, i < def.spine.length - 1 ? (LEAN_SHARE[i] ?? 0.35) : 1);
    rotateWorld(b, _lr);
  });
}

const LOOK_SHARE = [0.25, 0.25]; // of the remaining turn: NeckTwist01, NeckTwist02; the head takes the rest
// Gaze limits: the head turns ±1 rad, looks up 0.5 rad and down only 0.3 —
// further down, the helmet buries itself in the chest.
const LOOK_YAW = 1.0;
const LOOK_UP = 0.5;
const LOOK_DOWN = 0.3;
/** Neck and head turn toward the gaze target, shared down the chain. */
function solveLook(def: PoseDef, st: PoseState) {
  const head = def.head;
  if (!head) return;
  const chain = [...def.neck, head];
  chain.forEach((b, i) => b.quaternion.copy(st.lookRest[i]));
  chain[0].updateWorldMatrix(true, true);
  head.getWorldPosition(_lp);
  _lf.subVectors(st.look, _lp);
  if (_lf.lengthSq() < 1e-8) return;
  _lf.normalize();
  const yaw = clampN(Math.atan2(_lf.dot(st.right), _lf.dot(st.fwd)), -LOOK_YAW, LOOK_YAW);
  const pitch = clampN(Math.asin(clampN(_lf.dot(st.up), -1, 1)), -LOOK_DOWN, LOOK_UP);
  _lf.copy(st.fwd)
    .multiplyScalar(Math.cos(pitch) * Math.cos(yaw))
    .addScaledVector(st.right, Math.cos(pitch) * Math.sin(yaw))
    .addScaledVector(st.up, Math.sin(pitch));
  chain.forEach((b, i) => {
    head.getWorldQuaternion(_lw);
    _lp.copy(st.headFwd).applyQuaternion(_lw); // where the head looks now
    _lq.setFromUnitVectors(_lp, _lf);
    _lr.identity().slerp(_lq, i < def.neck.length ? (LOOK_SHARE[i] ?? 0.3) : 1);
    rotateWorld(b, _lr);
  });
}

// ─── Body proxies: what a hand, an arm or a foot may not pass through ───────
// Measured once per rig from the skinned vertices at bind, classed by each
// vertex's dominant bone (armour included — a bracer belongs to its forearm):
// a torso capsule, pelvis and head spheres (the head's is the helmet), thigh
// capsules, and the limbs' own radii.
type BodyProxy = {
  torsoR: number;
  pelvisC: THREE.Vector3; // in the hip's frame
  pelvisR: number;
  headC: THREE.Vector3; // in the head's frame
  headR: number;
  thighR: number;
  calfR: number;
  upperR: number;
  foreR: number;
};
const _bodyCache = new WeakMap<THREE.Skeleton, BodyProxy | null>();
function segDist(p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3, out?: THREE.Vector3) {
  _sgAB.subVectors(b, a);
  const len2 = _sgAB.lengthSq();
  const u = len2 > 0 ? clampN(_sgAP.subVectors(p, a).dot(_sgAB) / len2, 0, 1) : 0;
  _sgQ.copy(a).addScaledVector(_sgAB, u);
  if (out) out.copy(_sgQ);
  return p.distanceTo(_sgQ);
}
const _sgAB = new THREE.Vector3();
const _sgAP = new THREE.Vector3();
const _sgQ = new THREE.Vector3();
function measureBody(primary: THREE.SkinnedMesh): BodyProxy | null {
  const sk = primary.skeleton;
  if (_bodyCache.has(sk)) return _bodyCache.get(sk) ?? null;
  const get = (n: string) => sk.getBoneByName(`CC_Base_${n}`) ?? null;
  const need = ["Waist", "NeckTwist01", "Hip", "Head", "L_Thigh", "L_Calf", "L_Foot", "L_Upperarm", "L_Forearm", "L_Hand"];
  if (need.some((n) => !get(n))) {
    _bodyCache.set(sk, null);
    return null;
  }
  let top: THREE.Object3D = primary;
  while (top.parent) top = top.parent;
  const meshes: THREE.SkinnedMesh[] = [];
  top.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh && (o as THREE.SkinnedMesh).skeleton === sk) meshes.push(o as THREE.SkinnedMesh);
  });
  const saved = sk.bones.map((b) => [b.position.clone(), b.quaternion.clone(), b.scale.clone()] as const);
  sk.pose();
  top.updateWorldMatrix(true, true);
  const W = (n: string) => (get(n) as THREE.Bone).getWorldPosition(new THREE.Vector3());
  const seg = {
    torso: [W("Waist"), W("NeckTwist01")],
    thighL: [W("L_Thigh"), W("L_Calf")],
    thighR: get("R_Thigh") && get("R_Calf") ? [W("R_Thigh"), W("R_Calf")] : null,
    calfL: [W("L_Calf"), W("L_Foot")],
    calfR: get("R_Calf") && get("R_Foot") ? [W("R_Calf"), W("R_Foot")] : null,
    upperL: [W("L_Upperarm"), W("L_Forearm")],
    upperR: get("R_Upperarm") && get("R_Forearm") ? [W("R_Upperarm"), W("R_Forearm")] : null,
    foreL: [W("L_Forearm"), W("L_Hand")],
    foreR: get("R_Forearm") && get("R_Hand") ? [W("R_Forearm"), W("R_Hand")] : null,
  };
  const d: Record<string, number[]> = { torso: [], pelvis: [], head: [], thigh: [], calf: [], upper: [], fore: [] };
  const pelvisPts: THREE.Vector3[] = [];
  const headPts: THREE.Vector3[] = [];
  const names = sk.bones.map((b) => b.name.replace("CC_Base_", ""));
  const v = new THREE.Vector3();
  for (const m of meshes) {
    const SI = m.geometry.attributes.skinIndex;
    const SW = m.geometry.attributes.skinWeight;
    const n = m.geometry.attributes.position.count;
    for (let i = 0; i < n; i++) {
      let best = 0;
      let bw = -1;
      for (let k = 0; k < 4; k++) {
        const w = SW.getComponent(i, k);
        if (w > bw) [bw, best] = [w, SI.getComponent(i, k)];
      }
      const bn = names[best] ?? "";
      const cls = /^(Waist|Spine01|Spine02)$/.test(bn)
        ? "torso"
        : /^(Hip|Pelvis)$/.test(bn)
          ? "pelvis"
          : bn === "Head"
            ? "head"
            : /ThighTwist0[12]$/.test(bn)
              ? "thigh"
              : /CalfTwist0[12]$/.test(bn)
                ? "calf"
                : /UpperarmTwist0[12]$/.test(bn)
                  ? "upper"
                  : /ForearmTwist0[12]$/.test(bn)
                    ? "fore"
                    : "";
      if (!cls) continue;
      m.getVertexPosition(i, v);
      m.localToWorld(v);
      const L = bn.startsWith("L_");
      if (cls === "torso") d.torso.push(segDist(v, seg.torso[0], seg.torso[1]));
      else if (cls === "pelvis") pelvisPts.push(v.clone());
      else if (cls === "head") headPts.push(v.clone());
      else {
        const pair = (L ? seg[`${cls}L` as keyof typeof seg] : seg[`${cls}R` as keyof typeof seg]) as THREE.Vector3[] | null;
        if (pair) d[cls].push(segDist(v, pair[0], pair[1]));
      }
    }
  }
  const pct = (a: number[], q: number) => {
    if (!a.length) return 0;
    const s2 = a.slice().sort((x, y) => x - y);
    return s2[Math.min(s2.length - 1, Math.floor(q * (s2.length - 1)))];
  };
  const centroid = (pts: THREE.Vector3[]) => pts.reduce((acc, q) => acc.add(q), new THREE.Vector3()).multiplyScalar(1 / Math.max(1, pts.length));
  const pc = centroid(pelvisPts);
  const hc = centroid(headPts);
  const hip = get("Hip") as THREE.Bone;
  const head = get("Head") as THREE.Bone;
  const out: BodyProxy = {
    torsoR: pct(d.torso, 0.8),
    pelvisC: hip.worldToLocal(pc.clone()),
    pelvisR: pct(pelvisPts.map((q) => q.distanceTo(pc)), 0.85),
    headC: head.worldToLocal(hc.clone()),
    headR: pct(headPts.map((q) => q.distanceTo(hc)), 0.92),
    thighR: pct(d.thigh, 0.88),
    calfR: pct(d.calf, 0.88),
    upperR: pct(d.upper, 0.88),
    foreR: pct(d.fore, 0.9),
  };
  sk.bones.forEach((b, i) => {
    b.position.copy(saved[i][0]);
    b.quaternion.copy(saved[i][1]);
    b.scale.copy(saved[i][2]);
  });
  top.updateWorldMatrix(true, true);
  _bodyCache.set(sk, out);
  return out;
}

const _pxA = new THREE.Vector3();
const _pxB = new THREE.Vector3();
const _pxC = new THREE.Vector3();
const _pxQ = new THREE.Vector3();
type Proxy = { a: THREE.Vector3; b: THREE.Vector3; r: number };
const _proxies: Proxy[] = Array.from({ length: 6 }, () => ({ a: new THREE.Vector3(), b: new THREE.Vector3(), r: 0 }));
/** This frame's proxies in world space (torso, pelvis, head, thighs). */
function bodyNow(def: PoseDef, body: BodyProxy): Proxy[] {
  const out = _proxies;
  let n = 0;
  const set = (a: THREE.Vector3, b: THREE.Vector3, r: number) => {
    out[n].a.copy(a);
    out[n].b.copy(b);
    out[n].r = r;
    n++;
  };
  const waist = def.spine[0];
  if (waist && def.chestTop) set(waist.getWorldPosition(_pxA), def.chestTop.getWorldPosition(_pxB), body.torsoR);
  if (def.hip) {
    def.hip.localToWorld(_pxA.copy(body.pelvisC));
    set(_pxA, _pxA, body.pelvisR);
  }
  if (def.head) {
    def.head.localToWorld(_pxA.copy(body.headC));
    set(_pxA, _pxA, body.headR);
  }
  for (const l of def.limbs) if (l.kind === "leg") set(l.upper.getWorldPosition(_pxA), l.mid.getWorldPosition(_pxB), body.thighR);
  return out.slice(0, n);
}
/** How far an arm's segments sink into the body: summed beyond `slack`, or
 *  (deepest = true) the single deepest contact. */
function armSink(l: Limb, prox: Proxy[], body: BodyProxy, slack: number, deepest = false) {
  l.upper.getWorldPosition(_pxA);
  l.mid.getWorldPosition(_pxB);
  l.end.getWorldPosition(_pxC);
  let sink = 0;
  const probe = (p: THREE.Vector3, r: number) => {
    for (const c of prox) {
      const depth = c.r + r - segDist(p, c.a, c.b);
      sink = deepest ? Math.max(sink, depth) : sink + Math.max(0, depth - slack);
    }
  };
  probe(_pxQ.lerpVectors(_pxA, _pxB, 0.6), body.upperR);
  probe(_pxB, body.upperR);
  probe(_pxQ.lerpVectors(_pxB, _pxC, 0.5), body.foreR);
  probe(_pxQ.lerpVectors(_pxB, _pxC, 0.85), body.foreR);
  return sink;
}
/** Push a hand target out of the body (beyond its resting contact). */
function clearOfBody(p: THREE.Vector3, prox: Proxy[], r: number, slack: number) {
  for (let pass = 0; pass < 2; pass++)
    for (const c of prox) {
      const dist = segDist(p, c.a, c.b, _pxQ);
      const need = c.r + r - slack;
      if (dist >= need) continue;
      if (dist < 1e-6) continue;
      p.sub(_pxQ).multiplyScalar(need / dist).add(_pxQ);
    }
}
const _rollQ = new THREE.Quaternion();
const _rollSave = new THREE.Quaternion();
const _rollAxis = new THREE.Vector3();
const ROLL_TRIES = [0.2, -0.2, 0.4, -0.4, 0.6, -0.6, 0.85, -0.85, 1.1, -1.1, 1.4, -1.4];
/** If the elbow or forearm sinks into the body, roll the arm about the
 *  shoulder→hand line (the hand stays put) to the nearest clear angle. */
function rollClear(l: Limb, prox: Proxy[], body: BodyProxy, slack: number, target: THREE.Vector3) {
  const sink0 = armSink(l, prox, body, slack);
  if (sink0 < 1e-4) return;
  l.upper.getWorldPosition(_rollAxis);
  _rollAxis.subVectors(target, _rollAxis);
  if (_rollAxis.lengthSq() < 1e-10) return;
  _rollAxis.normalize();
  _rollSave.copy(l.upper.quaternion);
  let best = 0;
  let bestSink = sink0;
  for (const a of ROLL_TRIES) {
    l.upper.quaternion.copy(_rollSave);
    l.upper.updateWorldMatrix(false, true);
    rotateWorld(l.upper, _rollQ.setFromAxisAngle(_rollAxis, a));
    const sk2 = armSink(l, prox, body, slack);
    if (sk2 < bestSink - 1e-5) [best, bestSink] = [a, sk2];
    if (sk2 < 1e-4) break;
  }
  l.upper.quaternion.copy(_rollSave);
  l.upper.updateWorldMatrix(false, true);
  if (best !== 0) rotateWorld(l.upper, _rollQ.setFromAxisAngle(_rollAxis, best));
}

const _armT = new THREE.Vector3();
const _armL = new THREE.Vector3();
/** An arm, every frame: its target (the dragged ring, or its pin riding with
 *  the chest) kept clear of the body; solved with the clavicle at rest; the
 *  shoulder lifted by the rhythm; solved again from the lifted shoulder; any
 *  elbow / forearm sinking into the body rolled clear. */
function solveArm(def: PoseDef, l: Limb, s: LimbState, st: PoseState, prox: Proxy[], drag: THREE.Vector3 | null) {
  const chest = def.spine[def.spine.length - 1];
  const pin = st.armPins.get(l);
  if (!chest || !pin) return;
  const body = st.body;
  const handSlack = st.handSlack.get(l) ?? 0;
  if (drag) {
    _armT.copy(drag);
    if (body) clearOfBody(_armT, prox, body.foreR * 0.6, handSlack);
    pin.copy(chest.worldToLocal(_armL.copy(_armT)));
  } else {
    chest.localToWorld(_armT.copy(pin));
    if (body) clearOfBody(_armT, prox, body.foreR * 0.6, handSlack);
  }
  const clav = l.upper.parent as THREE.Bone;
  const rest = st.clavRest.get(l);
  if (rest) {
    clav.quaternion.copy(rest);
    clav.updateWorldMatrix(false, true);
  }
  solveLimb(l, s, _armT, poleOf(l, s, st, _pole));
  if (rest && def.chestTop) {
    chestDown(chest, def.chestTop, _shdn);
    liftShoulder(clav, l.upper, l.mid, _shdn, 0, false);
    solveLimb(l, s, _armT, poleOf(l, s, st, _pole));
  }
  if (body) rollClear(l, prox, body, st.armSlack.get(l) ?? 0, _armT);
}
/** A dragged foot: never under the floor, never into the other foot. */
function keepFootClear(l: Limb, s: LimbState, st: PoseState) {
  s.pin.y = Math.max(s.pin.y, st.floorY);
  for (const [o, os] of st.limbs) {
    if (o === l || o.kind !== "leg") continue;
    _pxA.subVectors(s.pin, os.pin);
    _pxA.y = 0;
    const dist = _pxA.length();
    const min = st.footSep * 0.7;
    if (dist >= min) continue;
    if (dist < 1e-6) _pxA.copy(st.right).multiplyScalar(l.side);
    s.pin.addScaledVector(_pxA.normalize(), min - dist);
  }
}

function RigPoser({
  rig,
  twist,
  anim,
  motion,
  handPose = "rest",
  setDragLock,
}: {
  rig: RigSync;
  twist: TwistRig | null;
  anim: AnimRig | null;
  motion: MotionRig | null;
  handPose?: HandPose;
  setDragLock?: (v: boolean) => void;
}) {
  const def = useMemo(() => definePose(rig.primary), [rig]);
  if (!def) return <LegacyPoser rig={rig} handPose={handPose} setDragLock={setDragLock} />;
  return <HumanPoser rig={rig} def={def} twist={twist} anim={anim} motion={motion} handPose={handPose} setDragLock={setDragLock} />;
}

function HumanPoser({
  rig,
  def,
  twist,
  anim,
  motion,
  handPose = "rest",
  setDragLock,
}: {
  rig: RigSync;
  def: PoseDef;
  twist: TwistRig | null;
  anim: AnimRig | null;
  motion: MotionRig | null;
  handPose?: HandPose;
  setDragLock?: (v: boolean) => void;
}) {
  const { camera, gl } = useThree();
  const state = useRef<PoseState | null>(null);
  const drag = useRef<{ key: string; plane: THREE.Plane } | null>(null);
  const target = useRef(new THREE.Vector3());
  const handles = useRef<Record<string, THREE.Group | null>>({});
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const ndc = useMemo(() => new THREE.Vector2(), []);
  // Handles: hands and feet, the hips (largest ring), the chest and the gaze
  // (smallest ring).
  const keys = useMemo(
    () => [
      ...def.limbs.map((l) => ({ key: l.key, r: 0.05 })),
      ...(def.hip ? [{ key: "hips", r: 0.085 }] : []),
      ...(def.chestTop && def.spine.length ? [{ key: "chest", r: 0.065 }] : []),
      ...(def.head ? [{ key: "look", r: 0.034 }] : []),
    ],
    [def],
  );

  // Start from the standing pose every motion starts from (without breathing
  // or finger life), not the A-pose bind: bind → stand → feet on their marks →
  // graded twists. Pins hold each foot where it stands, level; the gaze starts
  // straight ahead.
  useEffect(() => {
    const sk = rig.primary.skeleton;
    const body = measureBody(rig.primary); // once per rig (cached)
    sk.pose();
    const bind = new Map<THREE.Bone, THREE.Quaternion>();
    for (const b of sk.bones) bind.set(b, b.quaternion.clone());
    if (motion) applyPose(motion, { ...STAND, handLife: 0 });
    if (anim) lockFeet(anim, 1, 1);
    if (twist) driveTwists(twist);
    let top: THREE.Object3D = sk.bones[0];
    while (top.parent) top = top.parent;
    top.updateWorldMatrix(true, true);

    const up = new THREE.Vector3(0, 1, 0);
    const arm = (side: number) => def.limbs.find((l) => l.kind === "arm" && l.side === side);
    const right = new THREE.Vector3(1, 0, 0);
    const rA = arm(1);
    const lA = arm(-1);
    if (rA && lA) right.subVectors(rA.upper.getWorldPosition(new THREE.Vector3()), lA.upper.getWorldPosition(new THREE.Vector3()));
    right.y = 0;
    right.normalize();
    const fwd = new THREE.Vector3().crossVectors(up, right).normalize();
    const limbs = new Map<Limb, LimbState>();
    for (const l of def.limbs) {
      const a = l.upper.getWorldPosition(new THREE.Vector3());
      const b = l.mid.getWorldPosition(new THREE.Vector3());
      const c = l.end.getWorldPosition(new THREE.Vector3());
      const midBind = (bind.get(l.mid) ?? l.mid.quaternion).clone();
      const len = a.distanceTo(b) + b.distanceTo(c);
      // This joint's own bend direction, so a pole built on it makes entering
      // Pose — and the first grab — change nothing. A limb that is already
      // bent (the stance's arms) stands out the way it bends; a near-straight
      // one (the legs) is flexed a little on its hinge (the solver's way —
      // bind · hinge · swing · twist) to see which side the joint goes, then
      // put back.
      const line = c.clone().sub(a).normalize();
      const own = b.clone().sub(a);
      own.addScaledVector(line, -own.dot(line));
      const q0 = l.mid.quaternion.clone();
      splitMid(l, midBind, _sw, _st);
      l.mid.quaternion.copy(midBind).multiply(_hs.setFromAxisAngle(l.hinge, l.flex * 0.35)).multiply(_sw).multiply(_st);
      l.mid.updateWorldMatrix(false, true);
      const tip = l.end.getWorldPosition(new THREE.Vector3());
      l.mid.quaternion.copy(q0);
      l.mid.updateWorldMatrix(false, true);
      const axis = tip.sub(a).normalize();
      const bendDir = own.length() > 0.03 * len ? own : b.clone().sub(a);
      if (bendDir !== own) bendDir.addScaledVector(axis, -bendDir.dot(axis));
      if (bendDir.lengthSq() < 1e-12) bendDir.copy(l.kind === "leg" ? fwd : fwd.clone().negate());
      // Flex limit from thickness: the far segment (with its bracer / boot)
      // must not fold into the near one.
      const far = b.distanceTo(c);
      const thick = body ? (l.kind === "arm" ? body.upperR + body.foreR : body.thighR + body.calfR) : 0;
      const minInterior = thick > 0 ? Math.asin(Math.min(0.95, thick / (0.55 * far))) : 0;
      limbs.set(l, {
        midBind,
        len,
        pin: c,
        pinQ: l.end.getWorldQuaternion(new THREE.Quaternion()),
        bendDir: bendDir.normalize(),
        maxFlex: Math.min(l.maxFlex, Math.PI - minInterior),
      });
    }
    const chestBone = def.spine[def.spine.length - 1];
    const armPins = new Map<Limb, THREE.Vector3>();
    const clavRest = new Map<Limb, THREE.Quaternion>();
    for (const l of def.limbs) {
      if (l.kind !== "arm" || !chestBone) continue;
      armPins.set(l, chestBone.worldToLocal(l.end.getWorldPosition(new THREE.Vector3())));
      if ((l.upper.parent as THREE.Bone | null)?.isBone) clavRest.set(l, (l.upper.parent as THREE.Bone).quaternion.clone());
    }
    const head = def.head;
    const headPos = head ? head.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3();
    const feet = def.limbs.filter((l) => l.kind === "leg").map((l) => limbs.get(l)?.pin.y ?? 0);
    const height = Math.max(0.1, headPos.y - Math.min(...feet));
    const chain = [...def.neck, ...(head ? [head] : [])];
    // The contact each arm already has at rest is allowed (slack), so the
    // clearance never moves a resting arm.
    const armSlack = new Map<Limb, number>();
    const handSlack = new Map<Limb, number>();
    if (body) {
      const prox = bodyNow(def, body);
      for (const l of def.limbs) {
        if (l.kind !== "arm") continue;
        armSlack.set(l, Math.max(0, armSink(l, prox, body, 0, true)) + 0.002);
        const hand = l.end.getWorldPosition(new THREE.Vector3());
        let hs = 0;
        for (const c of prox) hs = Math.max(hs, c.r + body.foreR * 0.6 - segDist(hand, c.a, c.b));
        handSlack.set(l, Math.max(0, hs) + 0.002);
      }
    }
    const feetPins = def.limbs.filter((l) => l.kind === "leg").map((l) => limbs.get(l)?.pin);
    const footA = feetPins[0];
    const footB = feetPins[1];
    const footSep = footA && footB ? Math.hypot(footA.x - footB.x, footA.z - footB.z) : 0;
    state.current = {
      armPins,
      clavRest,
      body,
      armSlack,
      handSlack,
      floorY: Math.min(...feetPins.map((q) => q?.y ?? 0)),
      footSep,
      eyeRest: anim ? anim.eyes.map((e) => e.bone.quaternion.clone()) : [],
      limbs,
      hipOk: def.hip ? def.hip.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(),
      look: headPos.clone().addScaledVector(fwd, 0.6 * height),
      lookRest: chain.map((b) => b.quaternion.clone()),
      spineRest: def.spine.map((b) => b.quaternion.clone()),
      leanOff:
        def.chestTop && def.hip
          ? def.chestTop.getWorldPosition(new THREE.Vector3()).sub(def.hip.getWorldPosition(new THREE.Vector3()))
          : new THREE.Vector3(),
      headFwd: head ? fwd.clone().applyQuaternion(head.getWorldQuaternion(new THREE.Quaternion()).invert()) : fwd.clone(),
      fwd,
      up,
      right,
      grip: { L: [1, 1, 1], R: [1, 1, 1] },
    };
    mirrorRig(rig);
    return () => {
      state.current = null;
      sk.pose();
      mirrorRig(rig);
    };
  }, [rig, def, twist, anim, motion]);

  // Field-QA (?debug): the pose camera and the handles, so a review script can
  // drive them with real pointer events. Read-only, like ?fps.
  useEffect(() => {
    if (typeof window === "undefined" || !new URLSearchParams(window.location.search).has("debug")) return;
    (window as unknown as { __pose?: unknown }).__pose = {
      camera,
      canvas: gl.domElement,
      chains: keys.map((k) => ({ name: k.key, effector: handles.current[k.key] })),
      // Set a ring's target directly (world space) for frame-exact review;
      // release() ends it, as letting go of the ring would.
      drive: (key: string, x: number, y: number, z: number) => {
        drag.current = { key, plane: new THREE.Plane() };
        target.current.set(x, y, z);
      },
      release: () => {
        drag.current = null;
      },
    };
    return () => {
      delete (window as unknown as { __pose?: unknown }).__pose;
    };
  }, [camera, gl, keys]);

  // Drag from window-level listeners so motion keeps tracking once the cursor
  // leaves the small handle: the pointer is raycast onto a camera-facing plane
  // through where the handle was grabbed.
  useEffect(() => {
    const dom = gl.domElement;
    const onMove = (ev: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const rect = dom.getBoundingClientRect();
      ndc.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      if (raycaster.ray.intersectPlane(d.plane, _hit)) target.current.copy(_hit);
    };
    const onUp = () => {
      if (!drag.current) return;
      drag.current = null;
      setDragLock?.(false);
    };
    // A drag ends however the pointer goes away: released (even outside the
    // window), cancelled by the browser, or the tab losing focus.
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    window.addEventListener("blur", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("blur", onUp);
    };
  }, [gl, camera, raycaster, ndc, setDragLock]);

  useFrame((_, dt) => {
    const st = state.current;
    if (!st) return;
    const d = drag.current;
    const t = target.current;
    if (d?.key === "hips") moveHips(def, st, t);
    if (d?.key === "chest" && def.hip) st.leanOff.copy(t).sub(def.hip.getWorldPosition(_cb));
    solveChest(def, st);
    // Every limb re-solves every frame: legs onto their planted pins (so the
    // hips can move over them), arms onto pins that ride with the chest — kept
    // clear of the body, with the shoulder taking its share of a raise.
    const prox = st.body ? bodyNow(def, st.body) : [];
    for (const l of def.limbs) {
      const s = st.limbs.get(l);
      if (!s) continue;
      const mine = d?.key === l.key;
      if (l.kind === "leg") {
        if (mine) {
          s.pin.copy(t);
          keepFootClear(l, s, st);
        }
        solveLimb(l, s, s.pin, poleOf(l, s, st, _pole));
        setWorldQuat(l.end, s.pinQ);
      } else solveArm(def, l, s, st, prox, mine ? t : null);
    }
    if (d?.key === "look") st.look.copy(t);
    solveLook(def, st);
    // The eyes find the gaze ring too (from rest each frame, within their range).
    if (anim && anim.eyes.length) {
      anim.eyes.forEach((e, i) => {
        const q = st.eyeRest[i];
        if (q) e.bone.quaternion.copy(q);
      });
      anim.eyes[0].bone.parent?.updateWorldMatrix(true, true);
      aimEyes(anim, st.look);
    }
    // Hands ease toward the preset (~0.25 s): Rest is the standing pose's
    // relaxed hand. The base knuckles lead and the tips follow, so a hand
    // closes or opens as a wave down the fingers, not all at once.
    if (motion) {
      const want = HAND_GRIP[handPose];
      for (const side of ["L", "R"] as const) {
        const g = st.grip[side];
        for (let k = 0; k < 3; k++) g[k] += (want - g[k]) * Math.min(1, dt * (11 - 2.5 * k));
        applyHand(motion, side, g, 0);
      }
    }
    if (twist) driveTwists(twist);
    mirrorRig(rig);
    // Park the handles: a dragged hand / foot stays under the cursor; the hips
    // ring shows where the hips actually are (it stops where the legs do).
    for (const l of def.limbs) {
      const h = handles.current[l.key];
      if (!h) continue;
      if (d?.key === l.key) h.position.copy(t);
      else l.end.getWorldPosition(h.position);
    }
    const hh = handles.current.hips;
    if (hh && def.hip) def.hip.getWorldPosition(hh.position);
    const ch = handles.current.chest;
    if (ch && def.chestTop) def.chestTop.getWorldPosition(ch.position);
    const lh = handles.current.look;
    if (lh) lh.position.copy(st.look);
    for (const k2 of keys) handles.current[k2.key]?.quaternion.copy(camera.quaternion);
  });

  return (
    <group>
      {/* Manipulator reticles (DCC gizmo language): a thin billboarded ring and
          a centre dot, drawn over the model, each with a fat invisible grab
          volume. The hips ring is larger; the gaze ring is small. */}
      {keys.map(({ key, r }) => (
        <group
          key={key}
          ref={(el) => {
            handles.current[key] = el;
          }}
          onPointerOver={(e) => e.eventObject.scale.setScalar(1.25)}
          onPointerOut={(e) => e.eventObject.scale.setScalar(1)}
          onPointerDown={(e) => {
            e.stopPropagation();
            const h = handles.current[key];
            if (!h) return;
            camera.getWorldDirection(_camDir);
            const origin = h.getWorldPosition(new THREE.Vector3());
            drag.current = { key, plane: new THREE.Plane().setFromNormalAndCoplanarPoint(_camDir.clone().negate(), origin) };
            target.current.copy(origin);
            setDragLock?.(true);
          }}
        >
          <mesh renderOrder={10}>
            <ringGeometry args={[r, r * 1.16, 40]} />
            <meshBasicMaterial color="#c8faff" transparent opacity={0.85} depthTest={false} side={THREE.DoubleSide} />
          </mesh>
          <mesh renderOrder={10}>
            <circleGeometry args={[Math.max(0.008, r * 0.22), 12]} />
            <meshBasicMaterial color="#c8faff" transparent opacity={0.95} depthTest={false} side={THREE.DoubleSide} />
          </mesh>
          {/* Grab volume: generous, but the hips' must not swallow the hands. */}
          <mesh>
            <sphereGeometry args={[Math.max(0.07, r * 1.25), 8, 8]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** The CCD poser — kept for rigs without CC naming (no measured hinges). */
function LegacyPoser({
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
  const handleRefs = useRef<Array<THREE.Group | null>>([]);
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
      const [fx, fy] = isThumb
        ? (THUMB_SEG_FLEX[seg] ?? [0.4, 0])
        : [FINGER_SEG_FLEX[seg] ?? 0.8, 0];
      fingers.push({
        bone,
        rest: bone.quaternion.clone(),
        fx,
        fy,
        isThumb,
        side: /_L_/.test(bone.name) ? -1 : 1,
      });
    }
    fingersRef.current = fingers;
  }, [rig, chains]);

  // Field-QA (?debug): the pose camera and handle bones, so a review script can
  // drive the real handles with pointer events. Read-only, like ?fps.
  useEffect(() => {
    if (typeof window === "undefined" || !new URLSearchParams(window.location.search).has("debug")) return;
    (window as unknown as { __pose?: unknown }).__pose = { camera, canvas: gl.domElement, chains: chains.map((c) => ({ name: c.name, effector: c.effector })) };
    return () => {
      delete (window as unknown as { __pose?: unknown }).__pose;
    };
  }, [camera, gl, chains]);

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
    // A drag ends however the pointer goes away: released (even outside the
    // window), cancelled by the browser, or the tab losing focus.
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    window.addEventListener("blur", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("blur", onUp);
    };
  }, [gl, camera, raycaster, ndc, setDragLock]);

  // Park handles on their effectors, solve while dragging (joint-limited),
  // ease the hands toward the selected pose, then propagate the lead pose onto
  // the duplicate skeletons so the whole character poses as one.
  const _fq = useMemo(() => new THREE.Quaternion(), []);
  const _fe = useMemo(() => new THREE.Euler(), []);
  const _fz = useMemo(() => new THREE.Vector3(0, 0, 1), []);
  useFrame((_, dt) => {
    chains.forEach((c, i) => {
      const h = handleRefs.current[i];
      if (h && dragRef.current?.chain !== c.bones) {
        h.position.setFromMatrixPosition(c.effector.matrixWorld);
      }
      // Reticle gizmos billboard toward the camera (manipulator convention).
      if (h) h.quaternion.copy(camera.quaternion);
    });
    if (dragRef.current) solveCCD(dragRef.current.chain, targetRef.current, jointsRef.current);
    // Hand pose — critically-damped ease toward the preset curl.
    const target = HAND_CURL[handPose];
    const cs = curlRef.current;
    cs.cur += (target - cs.cur) * Math.min(1, dt * 9);
    for (const f of fingersRef.current) {
      // Measured axes (see HAND_CURL note): fingers hinge on local Z mirrored
      // per side; the thumb wraps across via −X flex + mirrored-Y opposition.
      if (f.isThumb) {
        _fe.set(-cs.cur * f.fx, f.side * cs.cur * f.fy, 0);
        _fq.setFromEuler(_fe);
      } else {
        _fq.setFromAxisAngle(_fz, f.side * cs.cur * f.fx);
      }
      f.bone.quaternion.copy(f.rest).multiply(_fq);
    }
    mirrorRig(rig);
  });

  if (chains.length === 0) return null;

  return (
    <group>
      {/* Drag handles as manipulator reticles (DCC gizmo language): a thin
          billboarded ring + a center dot, drawn over the model, with a FAT
          invisible hit sphere so they stay easy to grab. Hover swells the
          reticle slightly — the old solid sphere read as a blob glued to the
          hand rather than a control. */}
      {chains.map((c, i) => (
        <group
          key={c.name}
          ref={(el) => {
            handleRefs.current[i] = el;
          }}
          onPointerOver={(e) => e.eventObject.scale.setScalar(1.25)}
          onPointerOut={(e) => e.eventObject.scale.setScalar(1)}
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
          <mesh renderOrder={10}>
            <ringGeometry args={[0.05, 0.058, 32]} />
            <meshBasicMaterial color="#c8faff" transparent opacity={0.85} depthTest={false} side={THREE.DoubleSide} />
          </mesh>
          <mesh renderOrder={10}>
            <circleGeometry args={[0.011, 12]} />
            <meshBasicMaterial color="#c8faff" transparent opacity={0.95} depthTest={false} side={THREE.DoubleSide} />
          </mesh>
          {/* invisible grab volume — keeps the small reticle easy to hit */}
          <mesh>
            <sphereGeometry args={[0.085, 8, 8]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
        </group>
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
      {/* Rim pair — one from behind each shoulder. Dark metal has almost no
          diffuse response, so against the dark stage it read as a silhouette;
          a rim on BOTH back edges draws the outline in light and separates the
          asset from the wall without lifting the wall itself. */}
      <directionalLight position={[3, 4, -6]} intensity={1.5} color="#cfe0f6" />
      <directionalLight position={[-4, 3, -6]} intensity={1.2} color="#dbe8f8" />
      <directionalLight position={[0, 10, 2]} intensity={0.35} color="#f0f0f0" />
      <pointLight position={[2, 1, 5]} intensity={0.6} color="#ffffff" distance={30} />
      {/* Local procedural environment (no external HDR fetch → keeps the canvas
          untainted for toDataURL, and removes a CDN dependency on deploy).
          Metals are lit by what they REFLECT, so the environment — not the
          direct lights — decides whether a dark blade reads: intensity is up
          from 0.55, and two tall side strips (the product-photography staple)
          give long edge highlights down blades, hafts and rims. */}
      <Environment resolution={256} environmentIntensity={0.9}>
        <Lightformer intensity={2.4} position={[0, 2.5, 3]} scale={[6, 5, 1]} color="#ffffff" />
        <Lightformer intensity={1.1} position={[-4, 1, 2]} scale={[4, 4, 1]} color="#cfe6ff" />
        <Lightformer intensity={0.9} position={[4, -1, 1]} scale={[4, 4, 1]} color="#ffffff" />
        <Lightformer intensity={0.7} position={[0, -2, -3]} scale={[6, 4, 1]} color="#9fb8d8" />
        <Lightformer intensity={2.6} position={[-5, 0.5, -1.5]} scale={[1.1, 7, 1]} color="#ffffff" />
        <Lightformer intensity={2.2} position={[5, 0.5, -1.5]} scale={[1.1, 7, 1]} color="#eaf3ff" />
      </Environment>
    </>
  );
}

/** Field-QA (?debug): exposes the orbit controls as `window.__orbit` so a
 *  review script can frame close-ups (camera position + target). Read-only in
 *  spirit, like ?fps — it changes nothing unless driven. */
function OrbitQA({ controls }: { controls: React.RefObject<ControlsLike | null> }) {
  useEffect(() => {
    if (!RIG_QA) return;
    (window as unknown as { __orbit?: unknown }).__orbit = controls.current;
    return () => {
      delete (window as unknown as { __orbit?: unknown }).__orbit;
    };
  }, [controls]);
  return null;
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
  poseKey = 0,
  onReady,
  onStats,
  onClips,
  onPoseable,
  onChannelsDetected,
  onMotionEnd,
  set,
  turntable = true,
  onAzimuth,
}: {
  /** Opt-in photographic set (see SpecimenSet). Absent → original studio. */
  set?: SpecimenSet;
  /** Idle auto-rotate. Off holds the authored front view (set photography). */
  turntable?: boolean;
  /** Camera azimuth in whole degrees (0–359), reported only when it changes. */
  onAzimuth?: (deg: number) => void;
  specimen: Specimen;
  channel?: SpecimenChannel;
  clipIndex?: number;
  poseMode?: boolean;
  /** Resolved wheel-zoom permission. Detail pages pass true; the showcase
   *  passes its engage-to-zoom state (armed on grab, disarmed on pointer
   *  leave — see SpecimenViewer, which also gates Lenis via
   *  data-lenis-prevent so wheel zoom and page scroll never fight). */
  allowZoom?: boolean;
  /** Hand preset while posing (open / rest / fist). */
  handPose?: HandPose;
  /** Changing it starts a fresh pose (the Reset control). */
  poseKey?: number;
  onReady?: () => void;
  onStats?: (stats: SpecimenStats) => void;
  onClips?: (names: string[]) => void;
  onPoseable?: (v: boolean) => void;
  onChannelsDetected?: (keys: TexKey[]) => void;
  /** A one-shot motion finished; the rig is back in this motion (Idle). */
  onMotionEnd?: (index: number) => void;
}) {
  const [interacting, setInteracting] = useState(false);
  // When a pose handle is being dragged, freeze orbit so the camera doesn't spin.
  const [dragLock, setDragLock] = useState(false);
  // Pause the auto-rotate whenever the pointer is over the viewer — the model
  // holds still the moment you move in to inspect it.
  const [hovered, setHovered] = useState(false);
  const controlsRef = useRef<ControlsLike | null>(null);
  // Lit set only: the floor and lights exist before the model does, so a load
  // shows an empty, dimly lit set — never a placeholder picture — and the
  // light comes up when the asset is ready.
  const [groundY, setGroundY] = useState(-1);
  const [readyPath, setReadyPath] = useState<string | null>(null);
  const path = specimen.modelPath;
  // On the lit set, hold the opening (front) view for a beat after the model
  // appears — it matches the set photograph — before the turntable starts.
  const [spinPath, setSpinPath] = useState<string | null>(null);
  useEffect(() => {
    if (!set || readyPath !== path) return;
    const t = setTimeout(() => setSpinPath(path), 1200);
    return () => clearTimeout(t);
  }, [set, readyPath, path]);
  const handleReady = useCallback(() => {
    setReadyPath(path);
    onReady?.();
  }, [path, onReady]);
  // Opening view: explicit, or a three-quarter view onto the broad face.
  const [autoAz, setAutoAz] = useState<number | null>(null);
  const handleStats = useCallback(
    (s: SpecimenStats) => {
      const p = s.proportions;
      if (p) setAutoAz(p[0] < p[2] * 0.6 ? 60 : 330);
      onStats?.(s);
    },
    [onStats],
  );
  const openAz = set ? set.azimuth ?? autoAz ?? 0 : null;

  return (
    <Canvas
      camera={{ position: [0, 0, 4.6], fov: 34 }}
      dpr={[1, 1.75]}
      gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}
      shadows="soft"
      onDoubleClick={() => {
        if (!dragLock) controlsRef.current?.reset();
      }}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      style={{ width: "100%", height: "100%" }}
      onPointerDown={() => setInteracting(true)}
      onPointerUp={() => setInteracting(false)}
      onCreated={() => {
        // R3F can measure the container before layout settles (canvas stuck at
        // 300×150). A deferred resize forces a correct re-measure.
        requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
      }}
    >
      {set ? <SetLights on={readyPath === path} always={set.lit} /> : <StudioLights />}
      {set ? <Cyclorama y={groundY} color={set.color} grain={set.grain} /> : null}
      {set && set.viewShift !== undefined ? <ViewShift shift={set.viewShift} /> : null}
      <Suspense fallback={null}>
        <SpecimenModel
          set={set}
          specimen={specimen}
          channel={channel}
          clipIndex={clipIndex}
          poseMode={poseMode}
          onReady={set ? handleReady : onReady}
          onGround={set ? setGroundY : undefined}
          onStats={set ? handleStats : onStats}
          onClips={onClips}
          onPoseable={onPoseable}
          onChannelsDetected={onChannelsDetected}
          onMotionEnd={onMotionEnd}
          handPose={handPose}
          poseKey={poseKey}
          setDragLock={setDragLock}
        />
      </Suspense>
      <KeyboardOrbit controls={controlsRef} />
      <OrbitQA controls={controlsRef} />
      {onAzimuth ? <AzimuthReporter onAzimuth={onAzimuth} /> : null}
      {openAz !== null ? <OpeningView controls={controlsRef} azimuth={openAz} path={path} /> : null}
      <OrbitControls
        ref={controlsRef as never}
        // Right-drag pans (screen-space), left-drag rotates, wheel zooms — the
        // pan lets you inspect any region, not just the centred pivot. Panning
        // stops the auto-rotate too (it fires interacting via pointerdown).
        enablePan
        screenSpacePanning
        panSpeed={0.8}
        mouseButtons={{
          LEFT: THREE.MOUSE.ROTATE,
          MIDDLE: THREE.MOUSE.DOLLY,
          RIGHT: THREE.MOUSE.PAN,
        }}
        touches={{ ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }}
        enableZoom={allowZoom}
        enabled={!dragLock}
        minDistance={1.4}
        maxDistance={7}
        autoRotate={turntable && (!set || spinPath === path) && !hovered && !interacting && !poseMode}
        autoRotateSpeed={0.9}
        enableDamping
        dampingFactor={0.08}
        minPolarAngle={Math.PI * (set ? 0.24 : 0.18)}
        maxPolarAngle={Math.PI * (set ? 0.52 : 0.82)}
      />
    </Canvas>
  );
}
