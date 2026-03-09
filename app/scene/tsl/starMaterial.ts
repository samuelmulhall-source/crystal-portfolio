/**
 * TSL star material — Gaussian point sprites with optional velocity motion blur.
 *
 * Replaces GLSL starShader.ts with pure TSL node graph.
 * Two variants:
 *   hasVelocity=true  — per-star velocity streaking (layers 0,1)
 *   hasVelocity=false — simple round dots (layer 2)
 *
 * Point size: FOV-correct pixel sizing via projectionMatrix[1][1] * uVH / depth.
 * Fragment: Gaussian exp(-r^2 * 7) core with directional trail fade for velocity.
 *
 * Works on both WebGPU and WebGL2 backends via WebGPURenderer.
 */

// @ts-nocheck — Three.js TSL types are JS-only (JSDoc), not .d.ts
import {
  attribute,
  uniform,
  float,
  vec2,
  vec3,
  vec4,
  Fn,
  varying,
  vertexColor,
  positionLocal,
  positionView,
  modelViewMatrix,
  cameraProjectionMatrix,
  pointUV,
  select,
  sub,
  mul,
  div,
  add,
  min,
  max,
  clamp,
  abs,
  exp,
  length,
  dot,
  normalize,
} from "three/tsl";
import { PointsNodeMaterial } from "three/webgpu";
import { AdditiveBlending } from "three";

export interface StarUniforms {
  size: { value: number };
  opacity: { value: number };
  vh: { value: number };
  velocityScale: { value: number };
}

/**
 * Create a TSL-based star point sprite material.
 *
 * @param hasVelocity  If true, reads aVelocity attribute and renders motion blur trails.
 */
export function makeStarMaterialTSL(hasVelocity: boolean): {
  material: InstanceType<typeof PointsNodeMaterial>;
  uniforms: StarUniforms;
} {
  const uSize = uniform(0.22);
  const uOpacity = uniform(0.90);
  const uVH = uniform(400.0);
  const uVelocityScale = uniform(1.0); // Multiplied by scroll speed for streak boost

  const mat = new PointsNodeMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    vertexColors: true,
    sizeAttenuation: false,
  });

  if (hasVelocity) {
    // ── Velocity variant ──
    const aVelocity = attribute("aVelocity", "vec3");
    const depth = positionView.z.negate(); // -mv.z

    // Point size: FOV-correct pixel sizing
    const projY = cameraProjectionMatrix.element(1).element(1); // projectionMatrix[1][1]
    const nat = uSize.mul(projY).mul(uVH).div(depth);

    // Velocity in screen space (scaled by scroll speed for streak boost)
    const posEnd = positionLocal.add(aVelocity.mul(float(0.045).mul(uVelocityScale)));
    const mvEnd = modelViewMatrix.mul(vec4(posEnd, 1.0));
    const clipEnd = cameraProjectionMatrix.mul(mvEnd);
    const clipStart = cameraProjectionMatrix.mul(positionView);
    const screenStart = clipStart.xy.div(clipStart.w);
    const screenEnd = clipEnd.xy.div(clipEnd.w);
    const screenVel = screenEnd.sub(screenStart).mul(uVH);

    const velMag = length(screenVel);
    const trailPx = min(velMag.mul(0.6), float(18.0));
    const totalSize = max(float(2.0), nat.add(trailPx));

    mat.sizeNode = totalSize;

    // Pass varyings
    const vVelDir = varying(
      select(velMag.greaterThan(0.1), screenVel.div(velMag), vec2(0.0, 1.0)),
      "vVelDir"
    );
    const vTrailLen = varying(trailPx.div(totalSize), "vTrailLen");
    const vBaseR = varying(nat.div(totalSize), "vBaseR");
    const vColor = varying(vertexColor, "vColor");

    // Fragment: directional Gaussian with trail fade
    mat.colorNode = Fn(() => {
      const uv = pointUV.mul(2.0).sub(1.0);
      const dir = vec2(vVelDir.x, vVelDir.y.negate());
      const perp = vec2(dir.y.negate(), dir.x);
      const along = dot(uv, dir);
      const across = dot(uv, perp);

      const stretch = float(1.0).add(vTrailLen.mul(3.0));
      const rx = along.div(stretch);
      const ry = across;
      const r = length(vec2(rx, ry));

      // Trail fade — brighter at leading edge
      const trailFade = max(
        float(1.0).sub(max(float(0.0), along.negate()).mul(vTrailLen).mul(1.8)),
        float(0.15)
      );

      const core = exp(r.mul(r).mul(-7.0)).mul(trailFade);
      return vColor.mul(core);
    })();

    mat.opacityNode = Fn(() => {
      const uv = pointUV.mul(2.0).sub(1.0);
      const dir = vec2(vVelDir.x, vVelDir.y.negate());
      const perp = vec2(dir.y.negate(), dir.x);
      const along = dot(uv, dir);
      const across = dot(uv, perp);

      const stretch = float(1.0).add(vTrailLen.mul(3.0));
      const rx = along.div(stretch);
      const ry = across;
      const r = length(vec2(rx, ry));

      const trailFade = max(
        float(1.0).sub(max(float(0.0), along.negate()).mul(vTrailLen).mul(1.8)),
        float(0.15)
      );

      const core = exp(r.mul(r).mul(-7.0)).mul(trailFade);
      return uOpacity.mul(core);
    })();
  } else {
    // ── Simple round dot variant ──
    const depth = positionView.z.negate();
    const projY = cameraProjectionMatrix.element(1).element(1);
    const nat = uSize.mul(projY).mul(uVH).div(depth);
    mat.sizeNode = max(float(2.0), nat);

    const vColor = varying(vertexColor, "vColor");

    // Fragment: Gaussian round dot
    mat.colorNode = Fn(() => {
      const uv = pointUV.mul(2.0).sub(1.0);
      const r = length(uv);
      const core = exp(r.mul(r).mul(-7.0));
      return vColor.mul(core);
    })();

    mat.opacityNode = Fn(() => {
      const uv = pointUV.mul(2.0).sub(1.0);
      const r = length(uv);
      const core = exp(r.mul(r).mul(-7.0));
      return uOpacity.mul(core);
    })();
  }

  const uniforms: StarUniforms = {
    size: uSize as unknown as { value: number },
    opacity: uOpacity as unknown as { value: number },
    vh: uVH as unknown as { value: number },
    velocityScale: uVelocityScale as unknown as { value: number },
  };

  return { material: mat, uniforms };
}
