/**
 * Volumetric dust mote shader — soft bokeh discs.
 *
 * Extracted from VoidBackground.tsx lines 1459-1495.
 * Depth-attenuated point size, near-depth fade (fakes foreground DoF),
 * Gaussian soft core for round bokeh look.
 */

import * as THREE from "three";

export function makeDustMat(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {},
    vertexShader: /* glsl */`
      attribute float aBright;
      varying  float vBright;
      varying  float vDepth;
      void main() {
        vBright = aBright;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vDepth  = -mv.z;
        gl_Position = projectionMatrix * mv;
        float pxSz = 88.0 / (-mv.z);
        gl_PointSize = clamp(pxSz, 0.8, 3.2);
      }
    `,
    fragmentShader: /* glsl */`
      varying float vBright;
      varying float vDepth;
      void main() {
        vec2  uv = gl_PointCoord * 2.0 - 1.0;
        float r  = length(uv);
        if (r > 1.0) discard;
        float nearFade = smoothstep(2.0, 7.0, vDepth);
        float a = vBright * 0.22 * exp(-r * r * 3.2) * nearFade;
        if (a < 0.004) discard;
        gl_FragColor = vec4(0.80, 0.94, 1.0, a);
      }
    `,
    transparent: true,
    depthWrite:  false,
    blending:    THREE.AdditiveBlending,
  });
}
