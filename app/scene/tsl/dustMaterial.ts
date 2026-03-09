/**
 * TSL dust mote material — soft bokeh discs.
 *
 * Replaces GLSL dustShader.ts with pure TSL node graph.
 * Depth-attenuated point size, near-depth fade (fakes foreground DoF),
 * Gaussian soft core for round bokeh look.
 *
 * Works on both WebGPU and WebGL2 backends via WebGPURenderer.
 */

// @ts-nocheck — Three.js TSL types are JS-only (JSDoc), not .d.ts
import {
  attribute,
  float,
  vec2,
  vec4,
  Fn,
  varying,
  positionView,
  pointUV,
  clamp,
  exp,
  smoothstep,
  length,
  sub,
  mul,
  div,
  min,
  max,
  abs,
} from "three/tsl";
import { PointsNodeMaterial } from "three/webgpu";
import { AdditiveBlending } from "three";

/**
 * Create a TSL-based dust mote material.
 *
 * - Vertex: point size = 88 / depth, clamped [0.8, 3.2]
 * - Fragment: circular Gaussian bokeh with near-depth fade
 */
export function makeDustMaterialTSL(): InstanceType<typeof PointsNodeMaterial> {
  const mat = new PointsNodeMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    sizeAttenuation: false,
  });

  // Read custom attribute
  const aBright = attribute("aBright", "float");

  // Vertex: compute depth and point size
  const depth = positionView.z.negate(); // -mv.z (positive distance from camera)
  const rawSize = float(88.0).div(depth);
  const pointSize = clamp(rawSize, 0.8, 3.2);

  mat.sizeNode = pointSize;

  // Pass varyings to fragment
  const vBright = varying(aBright, "vBright");
  const vDepth = varying(depth, "vDepth");

  // Fragment: circular bokeh with near-depth fade
  mat.colorNode = Fn(() => {
    const uv = pointUV.mul(2.0).sub(1.0);
    const r = length(uv);
    const nearFade = smoothstep(float(2.0), float(7.0), vDepth);
    const core = exp(r.mul(r).mul(-3.2));
    const a = vBright.mul(0.22).mul(core).mul(nearFade);

    // Discard transparent and outside-circle fragments
    // Using conditional discard via the output alpha
    return vec4(0.80, 0.94, 1.0, a);
  })();

  mat.opacityNode = Fn(() => {
    const uv = pointUV.mul(2.0).sub(1.0);
    const r = length(uv);
    const nearFade = smoothstep(float(2.0), float(7.0), vDepth);
    const core = exp(r.mul(r).mul(-3.2));
    return vBright.mul(0.22).mul(core).mul(nearFade);
  })();

  return mat;
}
