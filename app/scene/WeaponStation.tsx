"use client";

/**
 * WeaponStation — single weapon model placed at a fixed world position.
 *
 * Performance optimizations:
 *   - Shader pre-compilation via renderer.compileAsync before first visible frame
 *   - Parallel texture loading (all textures fetched concurrently, applied in one batch)
 *   - EdgesGeometry deferred 3s after mount, processed 1 mesh per 150ms idle slot
 *   - Model starts invisible (opacity=0) until shader compilation finishes
 */

import { useRef, useMemo, useEffect, useContext, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useFBX } from "@react-three/drei";
import * as THREE from "three";
import { voidState } from "../lib/voidState";
import { workModels, type WorkModelEntry } from "../lib/workModels";
import { type WeaponStation as WeaponStationConfig } from "../lib/journeyConfig";
import { makeWireframeMat } from "./wireframeShader";
import { VoidContext } from "./VoidScene";

interface Props {
  station: WeaponStationConfig;
  entry: WorkModelEntry;
}

export default function WeaponStation({ station, entry }: Props) {
  const { isMobile }  = useContext(VoidContext);
  const scene         = useFBX(entry.modelPath);
  const { gl, camera } = useThree();
  const posGroupRef   = useRef<THREE.Group>(null);
  const rotGroupRef   = useRef<THREE.Group>(null);
  const scaleGroupRef = useRef<THREE.Group>(null);
  const allMats       = useRef<THREE.MeshPhysicalMaterial[]>([]);
  const wireMatRefs   = useRef<THREE.ShaderMaterial[]>([]);
  const opacityRef    = useRef(0);
  const entranceRef   = useRef(0);
  const tiltX         = useRef(0);
  const tiltY         = useRef(0);
  const tmpMp         = useMemo(() => new THREE.Vector3(), []);

  // Shader compilation gate — model stays invisible until shaders are compiled
  const [shaderReady, setShaderReady] = useState(false);

  // Replace FBX materials + compute normScale (sync — must complete before render)
  const { normScale, centreOffset } = useMemo(() => {
    const labelLike = /(normal\s*map|tangent|tris|polygon|vertex|uv\s*map|specular|roughness\s*map|metalness|debug|label)/i;
    allMats.current = [];
    scene.traverse((o) => {
      if (labelLike.test(o.name)) {
        o.visible = false;
        return;
      }
      if ((o as THREE.Mesh).isMesh) {
        const mesh = o as THREE.Mesh;
        const prev = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        prev.forEach(m => (m as THREE.Material)?.dispose());
        const mat = new THREE.MeshPhysicalMaterial({
          color:              0xffffff,
          emissive:           new THREE.Color(0x000000),
          emissiveIntensity:  0,
          roughness:          0.65,
          metalness:          0.08,
          transparent:        true,
          opacity:            0,
          depthWrite:         true,
          envMapIntensity:    2.4,
          clearcoat:          0.18,
          clearcoatRoughness: 0.08,
          side:               THREE.FrontSide,
        });
        mesh.material = mat;
        allMats.current.push(mat);
      }
    });
    const box    = new THREE.Box3().setFromObject(scene);
    const size   = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const maxDim = Math.max(size.x, size.y, size.z);
    const ns     = maxDim > 0 ? 2.2 / maxDim : 1;
    return { normScale: ns, centreOffset: center.clone().negate().multiplyScalar(ns) };
  }, [scene]);

  // Pre-compile shaders asynchronously to avoid GPU stall on first frame
  useEffect(() => {
    let cancelled = false;
    // compileAsync is available in Three.js r164+
    if (gl.compileAsync) {
      gl.compileAsync(scene, camera).then(() => {
        if (!cancelled) setShaderReady(true);
      }).catch(() => {
        // Fallback: allow rendering even if compile fails
        if (!cancelled) setShaderReady(true);
      });
    } else {
      // Fallback for older Three.js: just compile synchronously on next idle
      setTimeout(() => {
        gl.compile(scene, camera);
        if (!cancelled) setShaderReady(true);
      }, 0);
    }
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene]);

  // Async PBR texture loading — parallel fetch, single batch apply
  const texSig = [
    entry.textures.map, entry.textures.normalMap,
    entry.textures.roughnessMap, entry.textures.metalnessMap,
  ].filter(Boolean).join("|");

  const loadedTextures = useRef<THREE.Texture[]>([]);

  useEffect(() => {
    if (!texSig) return;
    const loader = new THREE.TextureLoader();
    const t      = entry.textures;
    let cancelled = false;
    const textures: THREE.Texture[] = [];

    // Build load tasks
    const tasks: Array<{ url: string; apply: (tex: THREE.Texture) => void }> = [];

    if (t.map) tasks.push({
      url: t.map,
      apply: tex => { tex.colorSpace = THREE.SRGBColorSpace; allMats.current.forEach(m => { if (m) { m.map = tex; } }); },
    });
    if (t.normalMap) tasks.push({
      url: t.normalMap,
      apply: tex => { tex.colorSpace = THREE.NoColorSpace; allMats.current.forEach(m => { if (m) { m.normalMap = tex; m.normalMapType = THREE.TangentSpaceNormalMap; } }); },
    });
    if (t.roughnessMap) tasks.push({
      url: t.roughnessMap,
      apply: tex => { allMats.current.forEach(m => { if (m) { m.roughnessMap = tex; m.roughness = 0.88; } }); },
    });
    if (t.metalnessMap) tasks.push({
      url: t.metalnessMap,
      apply: tex => { allMats.current.forEach(m => { if (m) { m.metalnessMap = tex; m.metalness = 0.85; } }); },
    });

    // Parallel fetch all textures, then apply in a single idle callback batch
    Promise.all(
      tasks.map(async (task) => {
        try {
          const tex = await loader.loadAsync(task.url);
          if (cancelled) { tex.dispose(); return null; }
          textures.push(tex);
          return { task, tex };
        } catch { return null; }
      })
    ).then((results) => {
      if (cancelled) return;
      // Apply all textures in a single batch via requestIdleCallback
      const applyBatch = () => {
        results.forEach(r => { if (r) r.task.apply(r.tex); });
        // Single needsUpdate call per material (triggers one shader recompile)
        allMats.current.forEach(m => { if (m) m.needsUpdate = true; });
      };
      if (typeof window !== "undefined" && "requestIdleCallback" in window) {
        (window as unknown as { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => void })
          .requestIdleCallback(applyBatch, { timeout: 1000 });
      } else {
        setTimeout(applyBatch, 16);
      }
      loadedTextures.current = textures;
    });

    return () => {
      cancelled = true;
      loadedTextures.current.forEach(tex => tex.dispose());
      loadedTextures.current = [];
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texSig]);

  // Initial scale
  useEffect(() => {
    if (scaleGroupRef.current) scaleGroupRef.current.scale.setScalar(0.001);
  }, []);

  // Wireframe edges (GLSL ShaderMaterial) — skip on mobile for performance
  useEffect(() => {
    if (isMobile) return; // isMobile is stable (never changes after mount)
    wireMatRefs.current = [];
    let cancelled = false;

    // Defer EdgesGeometry computation well after model is visible
    const timer = setTimeout(() => {
      if (cancelled) return;
      const meshes: THREE.Mesh[] = [];
      scene.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
      });

      // Process one mesh per 150ms idle slot to avoid blocking frames
      let idx = 0;
      const processNext = () => {
        if (cancelled || idx >= meshes.length) return;
        const mesh = meshes[idx++];
        try {
          const edgeGeo = new THREE.EdgesGeometry(mesh.geometry, 15);
          const mat = makeWireframeMat();
          const lines = new THREE.LineSegments(edgeGeo, mat);
          mesh.add(lines);
          wireMatRefs.current.push(mat);
        } catch { /* skip */ }
        if (idx < meshes.length) setTimeout(processNext, 150);
      };
      setTimeout(processNext, 0);
    }, 3000);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      scene.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) {
          const mesh = o as THREE.Mesh;
          mesh.children
            .filter(c => c instanceof THREE.LineSegments)
            .forEach(c => {
              mesh.remove(c);
              (c as THREE.LineSegments).geometry.dispose();
              ((c as THREE.LineSegments).material as THREE.Material).dispose();
            });
        }
      });
      wireMatRefs.current = [];
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene]);

  useFrame((s, dt) => {
    // Opacity: driven by station proximity to camera
    const stationIdx = voidState.stationProximity
      ? STATIONS_IDS.indexOf(station.id)
      : -1;
    const proximity = stationIdx >= 0 && voidState.stationProximity[stationIdx] !== undefined
      ? voidState.stationProximity[stationIdx]
      : 0;

    // Also check if this weapon is the active or expanded one
    const isExpanded = workModels.expandedModelId === entry.id ||
                       workModels.expandedModelId === station.id;
    const isNearCamera = proximity > 0.1 || isExpanded;

    // Gate on shaderReady — don't show model until GPU shaders are compiled
    const opTarget = (isNearCamera && shaderReady) ? 1 : 0;
    opacityRef.current += (opTarget - opacityRef.current) * Math.min(dt * 2.5, 1);

    // Reset entrance when fully faded
    if (opacityRef.current < 0.01) entranceRef.current = 0;

    // Entrance scale
    if (opacityRef.current > 0.04 && entranceRef.current < 1) {
      entranceRef.current = Math.min(entranceRef.current + dt / 0.8, 1);
    }
    if (scaleGroupRef.current) {
      const ep   = entranceRef.current;
      const ease = ep < 0.5 ? 2 * ep * ep : -1 + (4 - 2 * ep) * ep;
      scaleGroupRef.current.scale.setScalar(0.94 + ease * 0.06);
    }

    // Apply opacity
    const op = opacityRef.current;
    allMats.current.forEach((m) => {
      if (m) {
        m.opacity = op;
      }
    });

    // Signal first model ready
    if (op > 0.3 && station.modelIndex === 0) {
      voidState.firstModelReady = true;
    }

    // Write model opacity for loading animation
    if (voidState.activeStationIndex >= 0 && STATIONS_IDS[voidState.activeStationIndex] === station.id) {
      voidState.modelOpacity = op;
      workModels.activeModelId = entry.id;
    }

    // Position is fixed at station world position
    if (posGroupRef.current) {
      const [wx, wy, wz] = station.worldPosition;
      const isExp = isExpanded;
      const expandedX = isExp && !isMobile ? 1.8 : 0;
      posGroupRef.current.position.set(wx + expandedX, wy, wz);
    }

    // Rotation: auto-spin + camera-reactive tilt
    if (rotGroupRef.current) {
      const e = workModels.entries.find((en) => en.id === entry.id);
      if (e && !e.isDragging) {
        const decay = Math.pow(0.93, Math.min(dt * 60, 6));
        e.velX *= decay;
        e.velY *= decay;
        e.rotX += e.velX;
        e.rotY += e.velY;
        if (voidState.autoRotate) e.rotY += dt * 0.45;
      }

      const entranceSpin = (1 - op) * Math.PI * 0.15;

      // Camera-reactive tilt
      const lerpF = Math.min(dt * 2.5, 1);
      tiltX.current += (-voidState.mouseNY * 0.10 - tiltX.current) * lerpF;
      tiltY.current += ( voidState.mouseNX * 0.08 - tiltY.current) * lerpF;

      const e2 = workModels.entries.find((en) => en.id === entry.id);
      if (e2) {
        rotGroupRef.current.rotation.x = e2.rotX + tiltX.current;
        rotGroupRef.current.rotation.y = e2.rotY + entranceSpin + tiltY.current;
      }
    }

    // Wireframe: show when toggled on, fade when off
    const wireTarget = voidState.showWireframe && op > 0.1 ? 0.35 : 0;
    wireMatRefs.current.forEach((m) => {
      if (!m) return;
      m.uniforms.uOpacity.value += (wireTarget - m.uniforms.uOpacity.value) * 0.12;
    });

    // Write model screen region for hover suppression
    if (op > 0.08 && posGroupRef.current && voidState.activeStationIndex >= 0 &&
        STATIONS_IDS[voidState.activeStationIndex] === station.id) {
      posGroupRef.current.getWorldPosition(tmpMp);
      tmpMp.project(s.camera);
      const W = s.size.width, H = s.size.height;
      voidState.modelRegion.x   = (tmpMp.x + 1) / 2 * W;
      voidState.modelRegion.y   = (1 - tmpMp.y) / 2 * H;
      voidState.modelRegion.rPx = Math.min(W, H) * 0.22 * Math.min(op, 1);
    }
  });

  return (
    <group ref={posGroupRef} renderOrder={1}>
      <group ref={rotGroupRef}>
        <group ref={scaleGroupRef}>
          <group position={[centreOffset.x, centreOffset.y, centreOffset.z]}>
            <group scale={normScale}>
              {/* Hide from scene graph until shaders are compiled to prevent
                  synchronous GPU shader compilation stall on first render */}
              <primitive object={scene} visible={shaderReady} />
            </group>
          </group>
        </group>
      </group>
    </group>
  );
}

// Import here to avoid circular dependency — used for index lookups
import { STATIONS } from "../lib/journeyConfig";
const STATIONS_IDS = STATIONS.map(s => s.id);
