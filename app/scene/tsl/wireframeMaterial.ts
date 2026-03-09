/**
 * TSL wireframe material — mouse-localised edge reveal.
 *
 * Replaces GLSL wireframeShader.ts with pure TSL node graph.
 * Wireframe edges fade to transparent outside a screen-space radius
 * of the mouse cursor in NDC coords. Creates a "scan-line brush" reveal.
 *
 * Works on both WebGPU and WebGL2 backends via WebGPURenderer.
 */

// @ts-nocheck — Three.js TSL types are JS-only (JSDoc), not .d.ts
import {
  uniform,
  float,
  vec2,
  vec3,
  vec4,
  Fn,
  varying,
  positionLocal,
  modelViewMatrix,
  cameraProjectionMatrix,
  sub,
  mul,
  div,
  length,
  smoothstep,
  min,
  max,
} from "three/tsl";
import { NodeMaterial } from "three/webgpu";
import { AdditiveBlending, Vector2 } from "three";

export interface WireframeUniforms {
  mouseNDC: { value: Vector2 };
  opacity: { value: number };
  radius: { value: number };
}

/**
 * Create a TSL-based wireframe material with mouse-proximity reveal.
 *
 * Returns the material and uniform handles for per-frame updates.
 */
export function makeWireframeMaterialTSL(): {
  material: InstanceType<typeof NodeMaterial>;
  uniforms: WireframeUniforms;
} {
  // Uniform nodes
  const uMouseNDC = uniform(new Vector2(9, 9));
  const uOpacity = uniform(0);
  const uRadius = uniform(0.28);

  const mat = new NodeMaterial();
  mat.transparent = true;
  mat.depthWrite = false;
  mat.blending = AdditiveBlending;
  mat.toneMapped = false;

  // Vertex: compute NDC distance from mouse and pass as varying
  const clipPos = cameraProjectionMatrix.mul(modelViewMatrix.mul(vec4(positionLocal, 1.0)));
  const ndc = clipPos.xy.div(clipPos.w);
  const dist = length(ndc.sub(uMouseNDC));
  const fade = float(1.0).sub(smoothstep(uRadius.mul(0.35), uRadius, dist));

  const vFade = varying(fade, "vFade");

  // Fragment: apply opacity and fade
  mat.colorNode = vec3(0.53, 0.87, 1.0);
  mat.opacityNode = Fn(() => {
    return uOpacity.mul(vFade);
  })();

  // Expose uniform handles for per-frame updates
  const uniforms: WireframeUniforms = {
    mouseNDC: uMouseNDC as unknown as { value: Vector2 },
    opacity: uOpacity as unknown as { value: number },
    radius: uRadius as unknown as { value: number },
  };

  return { material: mat, uniforms };
}
