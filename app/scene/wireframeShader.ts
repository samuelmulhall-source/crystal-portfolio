/**
 * Mouse-localised wireframe shader — edges fade based on cursor proximity.
 *
 * Extracted from VoidBackground.tsx lines 1100-1133.
 * Wireframe edges fade to transparent outside a screen-space radius of the
 * mouse cursor in NDC coords. Creates a "scan-line brush" reveal effect.
 */

import * as THREE from "three";

export function makeWireframeMat(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uMouseNDC: { value: new THREE.Vector2(9, 9) },
      uOpacity:  { value: 0 },
      uRadius:   { value: 0.28 },
    },
    vertexShader: /* glsl */`
      uniform vec2  uMouseNDC;
      uniform float uRadius;
      varying float vFade;
      void main() {
        vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = clip;
        vec2  ndc  = clip.xy / clip.w;
        float dist = length(ndc - uMouseNDC);
        vFade = 1.0 - smoothstep(uRadius * 0.35, uRadius, dist);
      }
    `,
    fragmentShader: /* glsl */`
      uniform float uOpacity;
      varying float vFade;
      void main() {
        float a = uOpacity * vFade;
        if (a < 0.005) discard;
        gl_FragColor = vec4(0.53, 0.87, 1.0, a);
      }
    `,
    transparent: true,
    depthWrite:  false,
    blending:    THREE.AdditiveBlending,
    toneMapped:  false,
  });
}
