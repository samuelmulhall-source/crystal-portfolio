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
 * Stars are positioned in world space — no shader-side rotation.
 * Camera movement through the star volume creates natural parallax streaming.
 */

import * as THREE from "three";

export function makeHoloStarMat(hasVelocity: boolean): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uSize:    { value: 0.22 },
      uOpacity: { value: 0.90 },
      uVH:      { value: 400.0 },
      uTime:    { value: 0.0 },
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

      void main() {
        vColor = color;
        // Per-star twinkle: async brightness pulse
        float rate = 1.5 + aSeed * 2.5;
        float phase = aSeed * 6.2832;
        vTwinkle = 0.72 + 0.28 * sin(uTime * rate + phase);

        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float nat = uSize * projectionMatrix[1][1] * uVH / (-mv.z);
        // Clamp: min 1.5px (no invisible sub-pixel), max 4.5px (no giant blobs)
        nat = clamp(nat, 1.5, 4.5);
        if (nat < 0.5) {
          gl_Position = vec4(10.0, 10.0, 10.0, 1.0);
          gl_PointSize = 1.0;
          vVelDir = vec2(0.0);
          vTrailLen = 0.0;
          vBaseR = 0.5;
          return;
        }

        gl_Position = projectionMatrix * mv;

        // Velocity endpoint for motion blur trail
        vec3 vEnd = position + aVelocity * 0.045;
        vec4 mvEnd = modelViewMatrix * vec4(vEnd, 1.0);
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

      void main() {
        vColor = color;
        // Per-star twinkle: async brightness pulse
        float rate = 1.5 + aSeed * 2.5;
        float phase = aSeed * 6.2832;
        vTwinkle = 0.72 + 0.28 * sin(uTime * rate + phase);

        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float nat = uSize * projectionMatrix[1][1] * uVH / (-mv.z);
        nat = clamp(nat, 1.5, 4.5);
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
