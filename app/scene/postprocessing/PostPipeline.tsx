// @ts-nocheck — Three.js TSL/WebGPU types are JS-only (JSDoc), not .d.ts
"use client";

/**
 * PostPipeline — cinematic post-processing via Three.js native PostProcessing.
 *
 * Uses TSL-based effect nodes from three/examples/jsm/tsl/display/:
 *   - Selective Bloom (emissive-only via MRT)
 *   - Film grain (low-intensity analog noise)
 *   - RGB Shift (subtle chromatic aberration at edges)
 *   - Vignette (custom TSL — darken corners)
 *
 * Integrates with WebGPURenderer's PostProcessing class.
 * Replaces the SVG LensOverlay for grain.
 */
import { useEffect, useRef } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import {
  PostProcessing,
  QuadMesh,
  NodeMaterial,
  RenderTarget,
} from "three/webgpu";
import {
  pass,
  mrt,
  output,
  emissive,
  float,
  vec2,
  vec4,
  uv,
  Fn,
  uniform,
  length,
  smoothstep,
  mix,
  clamp,
  renderOutput,
} from "three/tsl";
import { bloom } from "three/examples/jsm/tsl/display/BloomNode.js";
import { film } from "three/examples/jsm/tsl/display/FilmNode.js";
import { rgbShift } from "three/examples/jsm/tsl/display/RGBShiftNode.js";

/**
 * R3F component that sets up the post-processing pipeline.
 *
 * Must be rendered inside a Canvas that uses WebGPURenderer.
 * Takes over the rendering pipeline — R3F's default render is disabled.
 */
export default function PostPipeline() {
  const { gl, scene, camera } = useThree();
  const postRef = useRef<InstanceType<typeof PostProcessing> | null>(null);
  const initRef = useRef(false);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    const renderer = gl as unknown as InstanceType<typeof PostProcessing>["renderer"];

    try {
      const postProcessing = new PostProcessing(renderer);

      // Scene pass with MRT for selective bloom
      const scenePass = pass(scene, camera);
      scenePass.setMRT(
        mrt({
          output,
          emissive,
        })
      );

      const sceneColor = scenePass.getTextureNode("output");
      const emissiveColor = scenePass.getTextureNode("emissive");

      // 1. Selective bloom — only on emissive (rim glow, stars)
      const bloomPass = bloom(emissiveColor, 0.8, 0.4, 0.2);

      // Combine scene + bloom
      let combined = sceneColor.add(bloomPass);

      // 2. Chromatic aberration — very subtle at edges
      combined = rgbShift(combined, 0.0012, 0);

      // 3. Film grain — analog noise texture
      combined = film(combined, float(0.06));

      // 4. Vignette — darken corners
      const vignetted = Fn(() => {
        const texColor = combined;
        const coord = uv().sub(0.5).mul(2.0); // -1 to 1
        const dist = length(coord);
        const vig = smoothstep(float(0.65), float(1.45), dist);
        const darkened = mix(texColor, vec4(0.0, 0.0, 0.02, 1.0), vig.mul(0.55));
        return darkened;
      })();

      // Output with tone mapping and color space conversion
      postProcessing.outputNode = renderOutput(vignetted);

      postRef.current = postProcessing;
    } catch (e) {
      console.warn("[PostPipeline] Failed to initialize:", e);
    }

    return () => {
      postRef.current = null;
    };
  }, [gl, scene, camera]);

  // Take over rendering
  useFrame(() => {
    if (postRef.current) {
      postRef.current.render();
    }
  }, 1); // Priority 1 = runs after scene updates

  return null;
}
