/**
 * Star point sprite shader with per-star velocity motion blur and twinkle.
 *
 * Each star streaks along its velocity vector: the point is enlarged to contain
 * the trail and the fragment shader applies a directional Gaussian with a
 * bright leading edge and fading tail. Stars at rest render as clean round dots.
 *
 * Twinkle: per-star aSeed attribute drives asynchronous brightness pulsing
 * via sin(uTime * rate + phase). Creates alive-feeling starfield.
 *
 * Rotation: applied via uRotY/uRotX uniforms in the vertex shader so that
 * geometry positions remain stable in world space (critical for recycling).
 */

import * as THREE from "three";

// GLSL helper: apply Y then X rotation to a vec3 using uniforms
const ROTATION_GLSL = /* glsl */`
  // Rotate position by uRotY (Y axis) then uRotX (X axis)
  float cy = cos(uRotY), sy = sin(uRotY);
  float cx = cos(uRotX), sx = sin(uRotX);
  vec3 rp = position;
  // Y rotation
  rp = vec3(cy * rp.x + sy * rp.z, rp.y, -sy * rp.x + cy * rp.z);
  // X rotation
  rp = vec3(rp.x, cx * rp.y - sx * rp.z, sx * rp.y + cx * rp.z);
`;

export function makeHoloStarMat(hasVelocity: boolean): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uSize:    { value: 0.22 },
      uOpacity: { value: 0.90 },
      uVH:      { value: 400.0 },
      uTime:    { value: 0.0 },
      uRotY:    { value: 0.0 },
      uRotX:    { value: 0.0 },
    },
    vertexShader: hasVelocity ? /* glsl */`
      attribute vec3 aVelocity;
      attribute float aSeed;
      varying vec3 vColor;
      varying vec2 vVelDir;
      varying float vTrailLen;
      varying float vBaseR;
      varying float vTwinkle;
      uniform float uSize;
      uniform float uVH;
      uniform float uTime;
      uniform float uRotY;
      uniform float uRotX;

      void main() {
        vColor = color;
        // Per-star twinkle: async brightness pulse
        float rate = 1.5 + aSeed * 2.5;
        float phase = aSeed * 6.2832;
        vTwinkle = 0.72 + 0.28 * sin(uTime * rate + phase);

        ${ROTATION_GLSL}
        vec4 mv = modelViewMatrix * vec4(rp, 1.0);
        float nat = uSize * projectionMatrix[1][1] * uVH / (-mv.z);
        nat = clamp(nat, 1.2, 5.5); // consistent sizing: no sub-pixel dots, no blobs
        if (-mv.z > uVH * 3.0) {
          gl_Position = vec4(10.0, 10.0, 10.0, 1.0);
          gl_PointSize = 1.0;
          vVelDir = vec2(0.0);
          vTrailLen = 0.0;
          vBaseR = 0.5;
          return;
        }

        gl_Position = projectionMatrix * mv;

        // Rotate velocity endpoint too
        vec3 vEnd = position + aVelocity * 0.045;
        vec3 rvEnd = vEnd;
        rvEnd = vec3(cy * rvEnd.x + sy * rvEnd.z, rvEnd.y, -sy * rvEnd.x + cy * rvEnd.z);
        rvEnd = vec3(rvEnd.x, cx * rvEnd.y - sx * rvEnd.z, sx * rvEnd.y + cx * rvEnd.z);
        vec4 mvEnd = modelViewMatrix * vec4(rvEnd, 1.0);
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
      attribute float aSeed;
      varying vec3 vColor;
      varying float vTwinkle;
      uniform float uSize;
      uniform float uVH;
      uniform float uTime;
      uniform float uRotY;
      uniform float uRotX;

      void main() {
        vColor = color;
        // Per-star twinkle: async brightness pulse
        float rate = 1.5 + aSeed * 2.5;
        float phase = aSeed * 6.2832;
        vTwinkle = 0.72 + 0.28 * sin(uTime * rate + phase);

        ${ROTATION_GLSL}
        vec4 mv = modelViewMatrix * vec4(rp, 1.0);
        float nat = uSize * projectionMatrix[1][1] * uVH / (-mv.z);
        nat = clamp(nat, 1.2, 5.5);
        if (-mv.z > uVH * 3.0) {
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
      varying float vTwinkle;

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
        float a = uOpacity * core * vTwinkle;
        if (a < 0.004) discard;
        gl_FragColor = vec4(vColor * core * vTwinkle, a);
      }
    ` : /* glsl */`
      uniform float uOpacity;
      varying vec3 vColor;
      varying float vTwinkle;

      void main() {
        vec2 uv = gl_PointCoord * 2.0 - 1.0;
        float r = length(uv);
        if (r > 1.0) discard;
        float core = exp(-r * r * 7.0);
        float a = uOpacity * core * vTwinkle;
        if (a < 0.004) discard;
        gl_FragColor = vec4(vColor * core * vTwinkle, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
  });
}
