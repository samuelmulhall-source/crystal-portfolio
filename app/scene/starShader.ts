/**
 * Star point sprite shader with per-star velocity motion blur.
 *
 * Extracted from VoidBackground.tsx lines 118-236.
 * Each star streaks along its velocity vector: the point is enlarged to contain
 * the trail and the fragment shader applies a directional Gaussian with a
 * bright leading edge and fading tail. Stars at rest render as clean round dots.
 */

import * as THREE from "three";

export function makeHoloStarMat(hasVelocity: boolean): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uSize:    { value: 0.22 },
      uOpacity: { value: 0.90 },
      uVH:      { value: 400.0 },
    },
    vertexShader: hasVelocity ? /* glsl */`
      attribute vec3 aVelocity;
      varying vec3 vColor;
      varying vec2 vVelDir;
      varying float vTrailLen;
      varying float vBaseR;
      uniform float uSize;
      uniform float uVH;

      void main() {
        vColor = color;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float nat = uSize * projectionMatrix[1][1] * uVH / (-mv.z);
        if (nat < 0.5) {
          gl_Position = vec4(10.0, 10.0, 10.0, 1.0);
          gl_PointSize = 1.0;
          vVelDir = vec2(0.0);
          vTrailLen = 0.0;
          vBaseR = 0.5;
          return;
        }

        gl_Position = projectionMatrix * mv;

        vec4 mvEnd = modelViewMatrix * vec4(position + aVelocity * 0.045, 1.0);
        vec4 clipEnd = projectionMatrix * mvEnd;
        vec2 screenStart = gl_Position.xy / gl_Position.w;
        vec2 screenEnd = clipEnd.xy / clipEnd.w;
        vec2 screenVel = (screenEnd - screenStart) * uVH;

        float velMag = length(screenVel);
        float trailPx = min(velMag * 0.6, 18.0);

        float totalSize = max(2.0, nat + trailPx);
        gl_PointSize = totalSize;

        vVelDir = velMag > 0.1 ? screenVel / velMag : vec2(0.0, 1.0);
        vTrailLen = trailPx / totalSize;
        vBaseR = nat / totalSize;
      }
    ` : /* glsl */`
      varying vec3 vColor;
      uniform float uSize;
      uniform float uVH;
      void main() {
        vColor = color;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float nat = uSize * projectionMatrix[1][1] * uVH / (-mv.z);
        if (nat < 0.5) {
          gl_Position = vec4(10.0, 10.0, 10.0, 1.0);
          gl_PointSize = 1.0;
          return;
        }
        gl_Position = projectionMatrix * mv;
        gl_PointSize = max(2.0, nat);
      }
    `,
    fragmentShader: hasVelocity ? /* glsl */`
      uniform float uOpacity;
      varying vec3 vColor;
      varying vec2 vVelDir;
      varying float vTrailLen;
      varying float vBaseR;

      void main() {
        vec2 uv = gl_PointCoord * 2.0 - 1.0;

        vec2 dir = vec2(vVelDir.x, -vVelDir.y);
        vec2 perp = vec2(-dir.y, dir.x);
        float along = dot(uv, dir);
        float across = dot(uv, perp);

        float stretch = 1.0 + vTrailLen * 3.0;
        float rx = along / stretch;
        float ry = across;
        float r = length(vec2(rx, ry));
        if (r > 1.0) discard;

        float trailFade = 1.0 - max(0.0, -along) * vTrailLen * 1.8;
        trailFade = max(trailFade, 0.15);

        float core = exp(-r * r * 7.0) * trailFade;
        float a = uOpacity * core;
        if (a < 0.004) discard;
        gl_FragColor = vec4(vColor * core, a);
      }
    ` : /* glsl */`
      uniform float uOpacity;
      varying vec3 vColor;
      void main() {
        vec2 uv = gl_PointCoord * 2.0 - 1.0;
        float r = length(uv);
        if (r > 1.0) discard;
        float core = exp(-r * r * 7.0);
        float a = uOpacity * core;
        if (a < 0.004) discard;
        gl_FragColor = vec4(vColor * core, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
  });
}
