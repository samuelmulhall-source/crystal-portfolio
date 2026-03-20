/**
 * Star point sprite shader with radial hyperspace streaking and twinkle.
 *
 * During transit (uStreak > 0), stars streak radially outward from screen
 * center — classic hyperspace jump effect. Stars near screen center get
 * short streaks (coming at you), stars at edges get long streaks (flying past).
 * All computed in screen-space in the vertex shader, zero CPU overhead.
 *
 * At stations (uStreak = 0), stars render as clean round dots.
 *
 * Twinkle: per-star aSeed attribute drives asynchronous brightness pulsing
 * via sin(uTime * rate + phase). Creates alive-feeling starfield.
 */

import * as THREE from "three";

export function makeHoloStarMat(hasVelocity: boolean): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uSize:    { value: 0.22 },
      uOpacity: { value: 0.90 },
      uVH:      { value: 400.0 },
      uTime:    { value: 0.0 },
      uStreak:  { value: 0.0 },   // 0 = clean dots, 1 = full hyperspace streaks
    },
    vertexShader: hasVelocity ? /* glsl */`
      attribute float aSeed;
      varying vec3 vColor;
      varying vec2 vVelDir;
      varying float vTrailLen;
      varying float vBaseR;
      varying float vTwinkle;
      varying float vStreak;
      uniform float uSize;
      uniform float uVH;
      uniform float uTime;
      uniform float uStreak;

      void main() {
        vColor = color;
        vStreak = uStreak;

        // Per-star twinkle
        float rate = 1.5 + aSeed * 2.5;
        float phase = aSeed * 6.2832;
        vTwinkle = 0.72 + 0.28 * sin(uTime * rate + phase);

        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float nat = uSize * projectionMatrix[1][1] * uVH / (-mv.z);
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

        // ── Radial hyperspace streaking ──────────────────────────────
        // Stars streak radially outward from screen center.
        // Length proportional to distance from center * uStreak.
        vec2 ndc = gl_Position.xy / gl_Position.w;
        float distFromCenter = length(ndc);
        vec2 radialDir = distFromCenter > 0.01
          ? normalize(ndc)
          : vec2(0.0, 1.0);

        // Trail length: dramatic at edges (dist~1), subtle at center (dist~0)
        // Scaled by uStreak: 0 = no trail, 1 = full hyperspace
        float trailPx = distFromCenter * uStreak * 220.0;
        // Per-star variation so not every streak is identical
        trailPx *= (0.7 + aSeed * 0.6);
        trailPx = min(trailPx, 240.0);

        float totalSize = max(2.0, nat + trailPx);
        gl_PointSize = totalSize;

        vVelDir = radialDir;
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
      varying float vStreak;

      void main() {
        vec2 uv = gl_PointCoord * 2.0 - 1.0;

        vec2 dir = vec2(vVelDir.x, -vVelDir.y);
        vec2 perp = vec2(-dir.y, dir.x);
        float along = dot(uv, dir);
        float across = dot(uv, perp);

        // Stretch ellipse along radial direction
        float stretch = 1.0 + vTrailLen * 5.0;
        float rx = along / stretch;
        float ry = across;
        float r = length(vec2(rx, ry));
        if (r > 1.0) discard;

        // Bright leading edge, fading tail
        float trailFade = 1.0 - max(0.0, -along) * vTrailLen * 2.5;
        trailFade = max(trailFade, 0.08);

        float core = exp(-r * r * 9.0) * trailFade;

        // Hyperspace color shift: boost brightness, shift toward ice-blue/white
        float warpBoost = 1.0 + vStreak * 1.2;
        vec3 warpColor = mix(vColor, vec3(0.75, 0.92, 1.0), min(vStreak * 0.65, 1.0));

        float a = uOpacity * core * vTwinkle * warpBoost;
        if (a < 0.003) discard;
        gl_FragColor = vec4(warpColor * core * vTwinkle * warpBoost, a);
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
