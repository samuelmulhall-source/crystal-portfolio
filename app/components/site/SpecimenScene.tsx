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

export type TexKey = "map" | "normalMap" | "roughnessMap" | "metalnessMap" | "transmissionMap";

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
  onChannelsDetected,
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
  onReady?: () => void;
  onStats?: (stats: SpecimenStats) => void;
  /** Report the rig's playable clip names for the selector. */
  onClips?: (names: string[]) => void;
  /** Report whether drag-to-pose is viable on this rig. */
  onPoseable?: (v: boolean) => void;
  /** Report which texture channels the model's OWN materials carry (rigged
   *  characters embed their maps in the GLB rather than the content config). */
  onChannelsDetected?: (keys: TexKey[]) => void;
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

    // ── Rigged-character channel materials ──────────────────────────────────
    // A rigged character embeds its maps in the GLB per-mesh (content.textures
    // is empty), so its channel views are built from each mesh's OWN material
    // rather than one shared texture set.
    const hasWireAsset = isRigged && !!specimen.wireModelPath;
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
          // Cache the character's authored materials once, then drive the
          // channel view per-mesh from them (skinning is preserved — a
          // SkinnedMesh accepts any material).
          const store = mesh.userData as { origMat?: THREE.Material | THREE.Material[] };
          store.origMat ??= mesh.material;
          const orig0 = Array.isArray(store.origMat) ? store.origMat[0] : store.origMat;
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
        proportions: [size.x / maxDim, size.y / maxDim, size.z / maxDim],
      } satisfies SpecimenStats,
    };
  }, [loaded, tex, texList, texEntries, specimen.yOffset, specimen.wireModelPath, channel, isRigged]);

  // This rig (a Reallusion/CC export) arrives as ~14 separate skinned meshes,
  // EACH with its own full clone of the skeleton (identical bone names). A single
  // mixer/IK solver can only drive one skeleton's bones — so the canonical
  // (densest) skeleton is the lead, and every frame its local bone transforms are
  // mirrored onto the same-named bones of the other skeletons so the whole
  // character moves as one. `groups` is empty for a normal single-skeleton rig.
  const rigSync = useMemo(() => buildRigSync(isRigged ? object : null), [object, isRigged]);

  // Which texture channels the rigged character's OWN materials carry (its maps
  // live in the GLB, not the content config). Read from the cached originals so
  // the answer is stable regardless of the currently-selected channel.
  const detectedChannels = useMemo(() => {
    if (!isRigged) return null;
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
  }, [object, isRigged]);
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
    onClips?.(playable.length ? playable.map((a) => a.name) : PROC_CLIPS.map((c) => c.name));
  }, [isRigged, playable, onClips]);

  // Procedural clips — used when the rig has no real motion clips. Captures each
  // driver bone's base pose once (clean bind), then layers sine offsets on top.
  const idle = useMemo(() => (rigSync ? buildIdle(rigSync.primary) : null), [rigSync]);
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
    else if (idle) {
      const s = procSwitch.current;
      const t = state.clock.elapsedTime;
      if (s.start < 0) s.start = t;
      if (s.toT0 < 0) s.toT0 = t; // the new clip's phase 0 = the moment it was selected
      const raw = s.from === s.to ? 1 : Math.min(1, (t - s.start) / 0.7);
      const blend = raw * raw * (3 - 2 * raw); // smoothstep the cross-fade
      applyIdle(idle, t, s.from, s.to, blend, s.fromT0, s.toT0);
    }
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
        <RigPoser rig={rigSync} handPose={handPose} setDragLock={setDragLock} />
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
function Cyclorama({ y, color }: { y: number; color: string }) {
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
  return (
    <mesh geometry={geo} position={[0, y, 0]} receiveShadow>
      {/* envMapIntensity kept low: the image-based light is for the asset's
          reflections; on the paint it would flatten the falloff to an even wash. */}
      <meshStandardMaterial color={color} roughness={0.96} metalness={0} envMapIntensity={0.1} side={THREE.DoubleSide} />
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
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    if (!shift || !cam.setViewOffset) return;
    cam.setViewOffset(size.width, size.height, -shift * size.width, 0, size.width, size.height);
    return () => cam.clearViewOffset();
  }, [camera, size.width, size.height, shift]);
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

// ─── Procedural clips ────────────────────────────────────────────────────────
// Keyframed timelines + additive oscillations, applied as local-rotation
// offsets on top of each bone's authored base pose — a rig with no authored
// motion gets a set of REAL gestures (anticipation, holds, recovery), not
// endless sines. Each clip owns a duration; its tracks are keyframes
// [phase 0..1, radians] eased with smoothstep (equal-value neighbours = a
// hold), plus sine components (integer `cycles` loop seamlessly; fractional
// cycles must be windowed with `gate`, which feathers them to zero). `rootY`
// keys translate the hip in WORLD units as a fraction of the measured
// hip-to-foot height (jump arc) — converted into the hip parent's local space
// at apply time so bone orientation never matters.
//
// Axes were PROBED on this rig (see the ?debug rig hook; world deltas of each
// chain end, projected on the character's own frame):
//   thigh +x   → leg swings forward (hip flexion)   calf −x → knee bend
//   foot  +x   → toes rise (dorsiflex); −x → toes point (push-off)
//   spine +x   → lean forward;  spine +z → lean toward character right
//   R upperarm +x/−z → arm rises up-and-out in the frontal plane; the LEFT
//   arm mirrors on z (a raise to head height = x 1.3, z ∓1.15 — probed).
type SineComp = { axis: 0 | 1 | 2; amp: number; cycles: number; phase?: number; gate?: [number, number] };
type KeyTrack = { axis: 0 | 1 | 2; keys: Array<[number, number]> };
type BoneSpec = { name: string; tracks?: KeyTrack[]; sines?: SineComp[] };
type ProcClip = {
  name: string;
  dur: number;
  bones: BoneSpec[];
  rootY?: Array<[number, number]>;
  /** Weight of the shared relaxed STANCE layer (default 0 — pure bind). */
  stance?: number;
  /** Per-bone-prefix stance-weight overrides across the clip (first match
   *  wins) — e.g. the wave fades the right arm's stance to 0 while raised so
   *  the probed raise pose stays world-accurate, then restores it. */
  stanceMask?: Array<{ match: string; keys: Array<[number, number]> }>;
};

// ── Relaxed stance ── shared beneath every lifelike clip ("A Pose" omits it):
// the bind is an A-pose — arms outstretched, hands board-flat — so clips that
// only add gestures still read as a mannequin. The stance lowers the arms to
// the sides (slight elbow bend, neutral wrists, small counter-tilt so the
// hands hang just forward of the torso) and settles the fingers into a natural
// curl on the MEASURED hinge axes (fingers local Z mirrored per side, thumbs
// −X + mirrored-Y opposition — see the HAND_CURL note).
const STANCE: Record<string, [number, number, number]> = {
  CC_Base_R_Upperarm: [-0.12, 0, 0.42],
  CC_Base_L_Upperarm: [-0.12, 0, -0.42],
  // Pronation: palms turn IN toward the thighs (bind palms cup forward/out).
  // Measured against the GLB bind transforms with the stance applied: forearm
  // −1.2 rad about local Y (the along-bone twist axis) + wrist −0.35 lands the
  // right palm normal at r −0.98 (facing the leg, slight natural forward
  // bias); the left mirrors. The chained ForearmTwist01→02 bones inherit the
  // full twist, so they COUNTER-rotate (+0.55 / +0.15) to grade the skin from
  // ~zero twist at the elbow to full at the wrist — no candy-wrapping.
  CC_Base_R_Forearm: [0, -1.2, 0.22],
  CC_Base_L_Forearm: [0, 1.2, -0.22],
  CC_Base_R_ForearmTwist01: [0, 0.55, 0],
  CC_Base_L_ForearmTwist01: [0, -0.55, 0],
  CC_Base_R_ForearmTwist02: [0, 0.15, 0],
  CC_Base_L_ForearmTwist02: [0, -0.15, 0],
  CC_Base_R_Hand: [0, -0.35, 0.08],
  CC_Base_L_Hand: [0, 0.35, -0.08],
};
{
  // Relaxed finger curl ≈ 30% of the fist flex the hand-pose presets use.
  // MEASURED axes (tangent-tested against the GLB bind): fingers hinge on
  // local Z mirrored per side (R +, L −); the thumb rests at ~30% of its
  // measured across-the-fingers wrap (−X flex + mirrored-Y opposition).
  const F = [0.26, 0.35, 0.27];
  const TX = [0.045, 0.12, 0.15];
  const TY = [0.15, 0.024, 0];
  for (const side of ["L", "R"] as const) {
    const sgn = side === "R" ? 1 : -1;
    for (const f of ["Thumb", "Index", "Mid", "Ring", "Pinky"])
      for (let s = 1; s <= 3; s++)
        STANCE[`CC_Base_${side}_${f}${s}`] =
          f === "Thumb" ? [-TX[s - 1], sgn * TY[s - 1], 0] : [0, 0, sgn * F[s - 1]];
  }
}

function stanceWeight(clip: ProcClip, name: string, ph: number): number {
  if (clip.stanceMask)
    for (const m of clip.stanceMask) if (name.includes(m.match)) return trackEval(m.keys, ph);
  return clip.stance ?? 0;
}

/** Smoothstep-eased keyframe lookup. Keys are authored spanning phase 0→1. */
function trackEval(keys: Array<[number, number]>, ph: number): number {
  if (ph <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (ph <= keys[i][0]) {
      const [t0, v0] = keys[i - 1];
      const [t1, v1] = keys[i];
      const u = t1 > t0 ? (ph - t0) / (t1 - t0) : 1;
      const s = u * u * (3 - 2 * u);
      return v0 + (v1 - v0) * s;
    }
  }
  return keys[keys.length - 1][1];
}

/** Feathered on/off window for gated sines — 0 outside [a,b], eased edges. */
function gateEnv(ph: number, a: number, b: number): number {
  const w = 0.06;
  const up = Math.min(1, Math.max(0, (ph - a) / w));
  const dn = Math.min(1, Math.max(0, (b - ph) / w));
  const e = Math.min(up, dn);
  return e * e * (3 - 2 * e);
}

function evalBone(spec: BoneSpec | undefined, ph: number): [number, number, number] {
  const out: [number, number, number] = [0, 0, 0];
  if (!spec) return out;
  if (spec.tracks) for (const t of spec.tracks) out[t.axis] += trackEval(t.keys, ph);
  if (spec.sines)
    for (const s of spec.sines) {
      const g = s.gate ? gateEnv(ph, s.gate[0], s.gate[1]) : 1;
      if (g > 0) out[s.axis] += Math.sin(ph * Math.PI * 2 * s.cycles + (s.phase ?? 0)) * s.amp * g;
    }
  return out;
}

/** Full pose for one bone: the clip's own gesture + the weighted stance. */
function evalPose(clip: ProcClip, name: string, ph: number): [number, number, number] {
  const out = evalBone(clip.bones.find((s) => s.name === name), ph);
  const st = STANCE[name];
  if (st) {
    const w = stanceWeight(clip, name, ph);
    if (w !== 0) {
      out[0] += st[0] * w;
      out[1] += st[1] * w;
      out[2] += st[2] * w;
    }
  }
  return out;
}

// ── The clip set ── "A Pose" is the pure bind pose (all offsets zero).
const A_POSE: ProcClip = { name: "A Pose", dur: 2, bones: [] };

// Idle — standing at rest: 4s breath, one slow weight-shift per loop, the head
// wandering on two mixed periods so it never reads as a metronome.
const IDLE: ProcClip = {
  name: "Idle",
  dur: 8,
  stance: 1,
  bones: [
    { name: "CC_Base_Spine02", sines: [{ axis: 0, amp: 0.028, cycles: 2 }] },
    { name: "CC_Base_Spine01", sines: [{ axis: 0, amp: 0.016, cycles: 2 }] },
    { name: "CC_Base_Waist", sines: [{ axis: 2, amp: 0.032, cycles: 1 }] },
    { name: "CC_Base_Hip", sines: [{ axis: 2, amp: -0.02, cycles: 1 }] },
    {
      name: "CC_Base_Head",
      sines: [
        { axis: 1, amp: 0.055, cycles: 1, phase: 1.0 },
        { axis: 1, amp: 0.03, cycles: 2, phase: 2.3 },
        { axis: 0, amp: 0.035, cycles: 1, phase: 0.5 },
      ],
    },
    { name: "CC_Base_NeckTwist02", sines: [{ axis: 1, amp: 0.028, cycles: 1, phase: 1.0 }] },
    {
      name: "CC_Base_L_Upperarm",
      sines: [
        { axis: 2, amp: 0.045, cycles: 1 },
        { axis: 0, amp: 0.025, cycles: 1, phase: 0.7 },
      ],
    },
    {
      name: "CC_Base_R_Upperarm",
      sines: [
        { axis: 2, amp: -0.045, cycles: 1, phase: 0.4 },
        { axis: 0, amp: 0.025, cycles: 1, phase: 1.1 },
      ],
    },
    { name: "CC_Base_L_Forearm", sines: [{ axis: 0, amp: 0.04, cycles: 1, phase: 0.2 }] },
    { name: "CC_Base_R_Forearm", sines: [{ axis: 0, amp: 0.04, cycles: 1, phase: 0.95 }] },
  ],
};
// Idle finger life — the base knuckles breathe slowly around the stance curl
// (measured hinge: local Z, mirrored R +/L −), phases staggered so the hands
// never pulse in unison.
{
  let ph = 0.3;
  for (const side of ["L", "R"] as const)
    for (const f of ["Index", "Mid", "Ring", "Pinky"]) {
      IDLE.bones.push({
        name: `CC_Base_${side}_${f}1`,
        sines: [{ axis: 2, amp: (side === "R" ? 1 : -1) * 0.05, cycles: 1, phase: ph }],
      });
      ph += 0.9;
    }
}

// Wave — a real greeting: raise (anticipation), ~2Hz wave with wrist
// follow-through while held, lower, settle. Arm pose per the probed frontal
// plane (x +0.95 / z −0.85 on the right side).
const WAVE: ProcClip = {
  name: "Wave",
  dur: 4.8,
  stance: 1,
  // The waving arm's raise keys were probed FROM BIND — fade that whole limb's
  // stance (arm-down + finger curl) out for the gesture so the hand rises to
  // the probed head-height pose with an open, flat greeting hand, then settle
  // it back into the relaxed stance as the arm lowers.
  stanceMask: [{ match: "CC_Base_R_", keys: [[0, 1], [0.08, 1], [0.18, 0], [0.62, 0], [0.75, 1], [1, 1]] }],
  bones: [
    {
      name: "CC_Base_R_Clavicle",
      tracks: [{ axis: 0, keys: [[0, 0], [0.08, 0], [0.17, 0.3], [0.6, 0.3], [0.72, 0], [1, 0]] }],
      sines: [{ axis: 0, amp: 0.045, cycles: 10, gate: [0.18, 0.62] }],
    },
    {
      // Raised pose PROBED in world space: with x 1.3 / z −1.15 (+ forearm 1.3)
      // the hand sits exactly at head height, out to the side and slightly
      // forward — the classic greeting silhouette (0.95/−0.85 only reached
      // shoulder height).
      name: "CC_Base_R_Upperarm",
      tracks: [
        { axis: 0, keys: [[0, 0], [0.08, 0], [0.18, 1.3], [0.62, 1.3], [0.74, 0], [1, 0]] },
        { axis: 2, keys: [[0, 0], [0.08, 0], [0.18, -1.15], [0.62, -1.15], [0.74, 0], [1, 0]] },
      ],
      sines: [{ axis: 2, amp: 0.07, cycles: 10, gate: [0.2, 0.62] }],
    },
    {
      name: "CC_Base_R_Forearm",
      tracks: [{ axis: 2, keys: [[0, 0], [0.09, 0], [0.19, 1.3], [0.63, 1.3], [0.75, 0], [1, 0]] }],
      sines: [
        { axis: 2, amp: 0.48, cycles: 10, phase: -1.2, gate: [0.2, 0.62] },
        { axis: 2, amp: 0.1, cycles: 5, phase: 0.4, gate: [0.2, 0.62] },
      ],
    },
    {
      name: "CC_Base_R_Hand",
      tracks: [{ axis: 2, keys: [[0, 0], [0.1, 0], [0.2, 0.12], [0.62, 0.12], [0.74, 0], [1, 0]] }],
      sines: [{ axis: 2, amp: 0.22, cycles: 10, phase: -1.9, gate: [0.21, 0.63] }],
    },
    {
      name: "CC_Base_Head",
      tracks: [
        { axis: 1, keys: [[0, 0], [0.1, 0], [0.2, -0.13], [0.62, -0.13], [0.75, 0], [1, 0]] },
        { axis: 2, keys: [[0, 0], [0.1, 0], [0.2, -0.06], [0.62, -0.06], [0.75, 0], [1, 0]] },
      ],
      sines: [{ axis: 0, amp: 0.03, cycles: 2 }],
    },
    {
      name: "CC_Base_Spine02",
      tracks: [
        { axis: 1, keys: [[0, 0], [0.1, 0], [0.2, -0.05], [0.62, -0.05], [0.75, 0], [1, 0]] },
        { axis: 2, keys: [[0, 0], [0.1, 0], [0.2, 0.04], [0.62, 0.04], [0.75, 0], [1, 0]] },
      ],
      sines: [{ axis: 0, amp: 0.028, cycles: 2 }],
    },
    { name: "CC_Base_Waist", tracks: [{ axis: 1, keys: [[0, 0], [0.1, 0], [0.2, -0.05], [0.62, -0.05], [0.75, 0], [1, 0]] }] },
    { name: "CC_Base_L_Upperarm", sines: [{ axis: 2, amp: 0.04, cycles: 2, phase: 1.6 }] },
  ],
};

// Look Around — eased sweeps with true HOLDS (near-equal key pairs), a small
// downward scan inside each hold, the torso following at a fraction with lag.
const LOOK: ProcClip = {
  name: "Look Around",
  dur: 8,
  stance: 1,
  bones: [
    {
      name: "CC_Base_Head",
      tracks: [
        { axis: 1, keys: [[0, 0], [0.06, 0], [0.15, 0.48], [0.32, 0.42], [0.44, -0.5], [0.6, -0.44], [0.7, 0.08], [0.8, 0], [1, 0]] },
        { axis: 0, keys: [[0, 0], [0.15, 0.03], [0.24, -0.05], [0.32, 0.02], [0.5, 0.06], [0.6, -0.03], [0.72, 0], [1, 0]] },
        { axis: 2, keys: [[0, 0], [0.15, 0.04], [0.44, -0.04], [0.7, 0], [1, 0]] },
      ],
    },
    {
      name: "CC_Base_NeckTwist02",
      tracks: [{ axis: 1, keys: [[0, 0], [0.08, 0], [0.17, 0.2], [0.33, 0.18], [0.46, -0.21], [0.61, -0.19], [0.72, 0.03], [0.82, 0], [1, 0]] }],
    },
    {
      name: "CC_Base_Spine02",
      tracks: [{ axis: 1, keys: [[0, 0], [0.1, 0], [0.19, 0.1], [0.34, 0.09], [0.48, -0.11], [0.62, -0.1], [0.75, 0], [1, 0]] }],
      sines: [{ axis: 0, amp: 0.028, cycles: 2 }],
    },
    { name: "CC_Base_Spine01", sines: [{ axis: 0, amp: 0.016, cycles: 2 }] },
    {
      name: "CC_Base_Waist",
      tracks: [{ axis: 1, keys: [[0, 0], [0.12, 0], [0.21, 0.05], [0.35, 0.05], [0.5, -0.06], [0.64, -0.06], [0.77, 0], [1, 0]] }],
    },
    { name: "CC_Base_L_Upperarm", sines: [{ axis: 2, amp: 0.035, cycles: 1 }] },
    { name: "CC_Base_R_Upperarm", sines: [{ axis: 2, amp: -0.035, cycles: 1, phase: 0.4 }] },
  ],
};

// Jump — anticipation crouch → extension/launch → airborne arc (root rises on
// the measured hip height) with a leg tuck → landing absorb → recover. Leg
// axes per the probe: thigh +x flexes forward, calf −x bends the knee, foot −x
// points the toes for push-off.
const THIGH_X: Array<[number, number]> = [[0, 0], [0.2, 0], [0.3, 0.8], [0.38, -0.05], [0.47, 0.55], [0.56, 0.55], [0.63, 0.15], [0.68, 0.7], [0.82, 0.1], [0.9, 0], [1, 0]];
const CALF_X: Array<[number, number]> = [[0, 0], [0.2, 0], [0.3, -1.2], [0.38, 0], [0.47, -0.9], [0.56, -0.9], [0.63, -0.2], [0.68, -1.05], [0.82, -0.15], [0.9, 0], [1, 0]];
const FOOT_X: Array<[number, number]> = [[0, 0], [0.2, 0], [0.3, 0.35], [0.36, 0.1], [0.4, -0.5], [0.47, -0.2], [0.56, -0.12], [0.63, 0.15], [0.68, 0.3], [0.82, 0], [1, 0]];
const JUMP: ProcClip = {
  name: "Jump",
  dur: 3.2,
  stance: 1,
  // rootY depths PROBED against the folded-leg shortening so the feet stay
  // planted while grounded: crouch pose shortens the legs by 0.227 of hip
  // height, the landing pose by 0.179 — the dips match, so nothing floats.
  rootY: [[0, 0], [0.2, 0], [0.3, -0.22], [0.36, -0.17], [0.4, 0.1], [0.5, 0.32], [0.6, 0.1], [0.64, -0.14], [0.7, -0.18], [0.85, 0], [1, 0]],
  bones: [
    { name: "CC_Base_L_Thigh", tracks: [{ axis: 0, keys: THIGH_X }] },
    { name: "CC_Base_R_Thigh", tracks: [{ axis: 0, keys: THIGH_X }] },
    { name: "CC_Base_L_Calf", tracks: [{ axis: 0, keys: CALF_X }] },
    { name: "CC_Base_R_Calf", tracks: [{ axis: 0, keys: CALF_X }] },
    { name: "CC_Base_L_Foot", tracks: [{ axis: 0, keys: FOOT_X }] },
    { name: "CC_Base_R_Foot", tracks: [{ axis: 0, keys: FOOT_X }] },
    {
      name: "CC_Base_Spine02",
      tracks: [{ axis: 0, keys: [[0, 0], [0.2, 0], [0.3, 0.22], [0.4, -0.02], [0.5, -0.07], [0.63, 0.05], [0.68, 0.18], [0.85, 0], [1, 0]] }],
      sines: [{ axis: 0, amp: 0.028, cycles: 2, gate: [0.78, 1] }],
    },
    { name: "CC_Base_Spine01", tracks: [{ axis: 0, keys: [[0, 0], [0.2, 0], [0.3, 0.12], [0.4, -0.01], [0.5, -0.04], [0.68, 0.09], [0.85, 0], [1, 0]] }] },
    {
      name: "CC_Base_Head",
      tracks: [{ axis: 0, keys: [[0, 0], [0.2, 0], [0.3, 0.15], [0.4, -0.1], [0.5, -0.12], [0.63, 0.02], [0.68, 0.1], [0.85, 0], [1, 0]] }],
    },
    {
      // Throw keys are boosted ~the stance offset (arms start lowered now), so
      // the airborne arms still reach the probed up-and-out raise.
      name: "CC_Base_L_Upperarm",
      tracks: [
        { axis: 0, keys: [[0, 0], [0.2, 0], [0.3, -0.45], [0.38, 0.7], [0.5, 0.95], [0.63, 0.35], [0.7, 0.1], [0.85, 0], [1, 0]] },
        { axis: 2, keys: [[0, 0], [0.2, 0], [0.3, 0.1], [0.38, 0.85], [0.5, 1.12], [0.63, 0.5], [0.78, 0], [1, 0]] },
      ],
    },
    {
      name: "CC_Base_R_Upperarm",
      tracks: [
        { axis: 0, keys: [[0, 0], [0.2, 0], [0.3, -0.45], [0.38, 0.7], [0.5, 0.95], [0.63, 0.35], [0.7, 0.1], [0.85, 0], [1, 0]] },
        { axis: 2, keys: [[0, 0], [0.2, 0], [0.3, -0.1], [0.38, -0.85], [0.5, -1.12], [0.63, -0.5], [0.78, 0], [1, 0]] },
      ],
    },
    { name: "CC_Base_L_Forearm", tracks: [{ axis: 0, keys: [[0, 0], [0.2, 0], [0.3, 0.3], [0.42, 0.1], [0.63, 0.15], [0.8, 0], [1, 0]] }] },
    { name: "CC_Base_R_Forearm", tracks: [{ axis: 0, keys: [[0, 0], [0.2, 0], [0.3, 0.3], [0.42, 0.1], [0.63, 0.15], [0.8, 0], [1, 0]] }] },
  ],
};

/** Procedural clip registry — offered in the clip selector when the rig ships
 *  no real motion clips. Order is the menu order; the viewer defaults to Idle. */
const PROC_CLIPS: ProcClip[] = [A_POSE, IDLE, WAVE, LOOK, JUMP];

type IdleRig = {
  /** Union of every bone any clip drives, with its clean base pose captured at
   *  load (before any procedural motion ran) — switching clips can then blend
   *  through the base instead of compounding on a contaminated pose. */
  drivers: Array<{ bone: THREE.Bone; base: THREE.Quaternion }>;
  byName: Map<string, number>;
  /** Root-translation channel (jump arc): the hip bone, its base local
   *  position, and the lazily measured world hip→foot height that scales the
   *  clip's rootY fractions. */
  hip: THREE.Bone | null;
  hipBase: THREE.Vector3;
  foot: THREE.Bone | null;
  hipHeight: number;
};

function buildIdle(primary: THREE.SkinnedMesh): IdleRig | null {
  const drivers: IdleRig["drivers"] = [];
  const byName = new Map<string, number>();
  const wanted = new Set<string>();
  for (const clip of PROC_CLIPS) for (const s of clip.bones) wanted.add(s.name);
  for (const name of Object.keys(STANCE)) wanted.add(name); // stance layer bones (arms + fingers)
  for (const name of wanted) {
    const bone = primary.skeleton.getBoneByName(name);
    if (!bone) continue;
    byName.set(name, drivers.length);
    drivers.push({ bone, base: bone.quaternion.clone() });
  }
  const hip = primary.skeleton.getBoneByName("CC_Base_Hip") ?? null;
  const foot = primary.skeleton.getBoneByName("CC_Base_L_Foot") ?? null;
  return drivers.length
    ? { drivers, byName, hip, hipBase: hip ? hip.position.clone() : new THREE.Vector3(), foot, hipHeight: 0 }
    : null;
}

const _idleEuler = new THREE.Euler();
const _idleQ = new THREE.Quaternion();
const _rootM = new THREE.Matrix4();
const _rootA = new THREE.Vector3();
const _rootB = new THREE.Vector3();

/** Clip phase for a given wall-clock time and per-clip start stamp. */
function clipPhase(clip: ProcClip, t: number, t0: number): number {
  const ph = ((t - t0) / clip.dur) % 1;
  return ph < 0 ? ph + 1 : ph;
}

/** Pose the driver bones from base pose + the active clip's offsets, blending
 *  from the previous clip across a switch (per-axis lerp — offsets are small
 *  or monotonic, so euler-space blending stays clean). Also drives the hip's
 *  world-Y translation channel (rootY), converted into the hip parent's local
 *  space so bone orientation never matters. */
function applyIdle(
  idle: IdleRig,
  t: number,
  from: number,
  to: number,
  blend: number,
  fromT0: number,
  toT0: number,
) {
  const clipA = PROC_CLIPS[from] ?? PROC_CLIPS[0];
  const clipB = PROC_CLIPS[to] ?? PROC_CLIPS[0];
  const phA = clipPhase(clipA, t, fromT0);
  const phB = clipPhase(clipB, t, toT0);
  idle.byName.forEach((idx, name) => {
    const d = idle.drivers[idx];
    const a = blend < 1 ? evalPose(clipA, name, phA) : null;
    const b = evalPose(clipB, name, phB);
    const rx = a ? a[0] + (b[0] - a[0]) * blend : b[0];
    const ry = a ? a[1] + (b[1] - a[1]) * blend : b[1];
    const rz = a ? a[2] + (b[2] - a[2]) * blend : b[2];
    _idleEuler.set(rx, ry, rz);
    _idleQ.setFromEuler(_idleEuler);
    d.bone.quaternion.copy(d.base).multiply(_idleQ);
  });

  // Root translation (jump arc) — world-space Y, scaled by measured hip height.
  const hip = idle.hip;
  if (!hip) return;
  const yA = blend < 1 && clipA.rootY ? trackEval(clipA.rootY, phA) : 0;
  const yB = clipB.rootY ? trackEval(clipB.rootY, phB) : 0;
  const yFrac = blend < 1 ? yA + (yB - yA) * blend : yB;
  if (Math.abs(yFrac) < 1e-4) {
    hip.position.copy(idle.hipBase);
    return;
  }
  if (idle.hipHeight === 0 && idle.foot) {
    // Lazy: world matrices are valid once the scene has rendered a frame.
    hip.updateWorldMatrix(true, false);
    idle.foot.updateWorldMatrix(true, false);
    hip.getWorldPosition(_rootA);
    idle.foot.getWorldPosition(_rootB);
    idle.hipHeight = Math.max(Math.abs(_rootA.y - _rootB.y), 1e-3);
  }
  const worldDy = yFrac * idle.hipHeight;
  const parent = hip.parent;
  if (!parent) return;
  parent.updateWorldMatrix(true, false);
  _rootM.copy(parent.matrixWorld).invert();
  _rootA.set(0, worldDy, 0).applyMatrix4(_rootM);
  _rootB.set(0, 0, 0).applyMatrix4(_rootM);
  hip.position.copy(idle.hipBase).add(_rootA.sub(_rootB));
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
  onChannelsDetected,
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
  onReady?: () => void;
  onStats?: (stats: SpecimenStats) => void;
  onClips?: (names: string[]) => void;
  onPoseable?: (v: boolean) => void;
  onChannelsDetected?: (keys: TexKey[]) => void;
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
      {set ? <Cyclorama y={groundY} color={set.color} /> : null}
      {set?.viewShift ? <ViewShift shift={set.viewShift} /> : null}
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
          handPose={handPose}
          setDragLock={setDragLock}
        />
      </Suspense>
      <KeyboardOrbit controls={controlsRef} />
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
        autoRotate={turntable && !hovered && !interacting && !poseMode}
        autoRotateSpeed={0.9}
        enableDamping
        dampingFactor={0.08}
        minPolarAngle={Math.PI * (set ? 0.24 : 0.18)}
        maxPolarAngle={Math.PI * (set ? 0.52 : 0.82)}
      />
    </Canvas>
  );
}
