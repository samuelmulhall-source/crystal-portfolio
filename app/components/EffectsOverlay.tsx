"use client";

/**
 * EffectsOverlay — 2D Canvas layer for all special visual effects.
 *
 * Effects rendered here:
 *   1. Holographic 3D star hover — bipyramid geometry (n=3..10 points) drawn
 *      with manual perspective projection and painter's-algorithm face sorting.
 *      Fresnel-based edge coloring gives a saturated holographic iridescence.
 *   2. Constellation paths — dashed ice-white lines between active hover stars.
 *   3. Meteor trail            — tapered gradient line with blue/ice glow.
 *   4. Meteor head spark       — bright radial burst at head position.
 */

import { useEffect, useRef } from "react";
import { voidState } from "../lib/voidState";
import { loadGate } from "../lib/loadingOrchestrator";

// Per-slot spring state (lives outside React render cycle)
const _springs: Array<{ pos: number; vel: number }> =
  Array.from({ length: 14 }, () => ({ pos: 0, vel: 0 }));

// Geometry cache keyed by n (4–7) — avoids rebuilding vertices every frame
const _geomCache = new Map<number, ReturnType<typeof getStarGeom>>();
function getCachedStarGeom(n: number) {
  if (!_geomCache.has(n)) _geomCache.set(n, getStarGeom(n));
  return _geomCache.get(n)!;
}

const _warpSeeds = Array.from({ length: 180 }, (_, i) => ({
  angle: (i / 180) * Math.PI * 2 + ((i % 7) - 3) * 0.012,
  radius: 0.02 + ((i * 37) % 100) / 100 * 1.18,
  speed: 0.8 + ((i * 19) % 100) / 100 * 1.7,
  width: 0.4 + ((i * 53) % 100) / 100 * 1.6,
  alpha: 0.45 + ((i * 29) % 100) / 100 * 0.55,
}));

// ─── 3D geometry helpers ───────────────────────────────────────────────────
type Vec3 = [number, number, number];
type Face = [number, number, number]; // indices into vertex array

/** Build an n-pointed bipyramid centred at origin, radius 1, height 1. */
function getStarGeom(n: number): { verts: Vec3[]; faces: Face[] } {
  const verts: Vec3[] = [];
  const faces: Face[] = [];
  verts.push([0,  1, 0]); // apex top    — index 0
  verts.push([0, -1, 0]); // apex bottom — index 1

  // 2*n ring vertices alternating outer (r=1) and inner (r=0.36)
  for (let i = 0; i < n; i++) {
    const aOuter = (i / n) * Math.PI * 2 - Math.PI / 2;
    const aInner = ((i + 0.5) / n) * Math.PI * 2 - Math.PI / 2;
    verts.push([Math.cos(aOuter), 0, Math.sin(aOuter)]);           // outer — index 2 + i*2
    verts.push([Math.cos(aInner) * 0.36, 0, Math.sin(aInner) * 0.36]); // inner — index 3 + i*2
  }

  // Build triangular faces: top cap and bottom cap
  for (let i = 0; i < n; i++) {
    const o  = 2 + i * 2;       // outer[i]
    const o2 = 2 + ((i + 1) % n) * 2; // outer[i+1]

    const inner  = o + 1;

    // Top faces (apex=0): outer[i] → inner[i] → apex, inner[i] → outer[i+1] → apex
    faces.push([0, o, inner]);
    faces.push([0, inner, o2]);
    // Bottom faces (apex=1)
    faces.push([1, inner, o]);
    faces.push([1, o2, inner]);
  }

  return { verts, faces };
}

/** Rotate a point by Ry then Rx. */
function rotV(v: Vec3, rx: number, ry: number): Vec3 {
  // Ry
  const x1 =  v[0] * Math.cos(ry) + v[2] * Math.sin(ry);
  const y1 =  v[1];
  const z1 = -v[0] * Math.sin(ry) + v[2] * Math.cos(ry);
  // Rx
  const x2 = x1;
  const y2 = y1 * Math.cos(rx) - z1 * Math.sin(rx);
  const z2 = y1 * Math.sin(rx) + z1 * Math.cos(rx);
  return [x2, y2, z2];
}

/** Simple perspective projection to 2D screen coords. */
function project(v: Vec3, cx: number, cy: number, scale: number, fov: number): [number, number] {
  const depth = fov / (fov + v[2]);
  return [cx + v[0] * scale * depth, cy - v[1] * scale * depth];
}

/** Cross product of two Vec3 edges → face normal (unnormalised). */
function faceNormal(a: Vec3, b: Vec3, c: Vec3): Vec3 {
  const ux = b[0]-a[0], uy = b[1]-a[1], uz = b[2]-a[2];
  const vx = c[0]-a[0], vy = c[1]-a[1], vz = c[2]-a[2];
  return [uy*vz - uz*vy, uz*vx - ux*vz, ux*vy - uy*vx];
}

export default function EffectsOverlay() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf: number;
    const t0 = performance.now();
    let lastT = performance.now();
    let loadFade = 0; // smoothed opacity for black hole loading vortex
    let warpLevel = 0;

    const resize = () => {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    function draw() {
      raf = requestAnimationFrame(draw);

      // Skip all rendering while loading screen is visible — nothing to draw
      // and we avoid competing for CPU time during critical loading phase.
      if (!loadGate.dismissed) return;

      const w   = canvas!.width;
      const h   = canvas!.height;
      ctx!.clearRect(0, 0, w, h);

      const now = performance.now();
      const dt  = Math.min((now - lastT) * 0.001, 0.05);
      lastT     = now;
      const t   = (now - t0) * 0.001;
      const warpTarget = voidState.journeyMode === "transit" ? 1 : 0;
      const warpRate = warpTarget > warpLevel ? 10 : 7;
      warpLevel += (warpTarget - warpLevel) * Math.min(dt * warpRate, 1);
      const warpStrength = warpLevel;

      // Smooth loading fade (drives black hole vortex in section 5)
      loadFade += ((voidState.modelLoading ? 1 : 0) - loadFade) * Math.min(dt * 2.5, 1);

      // ── 0. Hyperspace streak layer — explicit screen-space warp read ──────
      if (warpStrength > 0.02) {
        const cx = w * 0.5;
        const cy = h * 0.5;
        const maxR = Math.hypot(w, h) * 0.76;
        const baseVelocity = 0.85 + warpStrength * 4.2;
        ctx!.save();
        ctx!.globalCompositeOperation = "lighter";

        for (const seed of _warpSeeds) {
          const travel = (t * seed.speed * baseVelocity) % 1;
          const startR = 4 + travel * maxR * seed.radius;
          const lineLen = (90 + seed.width * 320) * warpStrength * (0.75 + travel * 0.9);
          const angle = seed.angle;
          const cosA = Math.cos(angle);
          const sinA = Math.sin(angle);
          const x1 = cx + cosA * startR;
          const y1 = cy + sinA * startR;
          const x2 = cx + cosA * (startR + lineLen);
          const y2 = cy + sinA * (startR + lineLen);

          const grad = ctx!.createLinearGradient(x1, y1, x2, y2);
          grad.addColorStop(0, `rgba(184,240,255,0)`);
          grad.addColorStop(0.2, `rgba(184,240,255,${0.12 * warpStrength * seed.alpha})`);
          grad.addColorStop(0.65, `rgba(196,244,255,${0.24 * warpStrength * seed.alpha})`);
          grad.addColorStop(1, `rgba(244,250,255,${0.48 * warpStrength * seed.alpha})`);

          ctx!.strokeStyle = grad;
          ctx!.lineWidth = 0.8 + seed.width * 2.1 * warpStrength;
          ctx!.shadowColor = `rgba(184,240,255,${0.24 * warpStrength})`;
          ctx!.shadowBlur = 12 + 26 * warpStrength;
          ctx!.beginPath();
          ctx!.moveTo(x1, y1);
          ctx!.lineTo(x2, y2);
          ctx!.stroke();
        }

        ctx!.restore();
      }

      const SPRING_K = 420;
      const SPRING_D = 26;

      // ── 1. 3D Holographic star hover ──────────────────────────────────────
      for (let i = 0; i < voidState.hoverSlots.length; i++) {
        const slot   = voidState.hoverSlots[i];
        const spring = _springs[i];

        const target = slot.ease;
        spring.vel  += (target - spring.pos) * SPRING_K * dt;
        spring.vel  -= spring.vel * SPRING_D * dt;
        spring.pos  += spring.vel * dt;
        spring.pos   = Math.max(0, Math.min(spring.pos, 1.0));
        if (spring.pos < 0.005 && target < 0.01) { spring.pos = 0; spring.vel = 0; }
        if (spring.pos < 0.005) continue;
        if (i >= 8) continue; // line-only slots: spring advances but no geometry

        const ease = Math.min(spring.pos, 1.0);
        const { sx, sy } = slot;

        // Scale: visible accent around each star
        const scale = ease * 14;
        const FOV   = 6;

        // n morphs slowly per slot (4–7), giving a unique feel per star
        const n = Math.max(4, Math.min(7, Math.round(4 + Math.sin(t * 0.14 + i * 1.7) * 1.5)));

        // Clean spin on Y; fixed per-slot X tilt for stable perspective view
        const ry = t * 1.1 + i * 0.85;
        const rx = 0.4 + i * 0.22;

        const { verts, faces } = getCachedStarGeom(n);
        const rotated: Vec3[] = verts.map(v => rotV(v, rx, ry));

        // Painter's sort back → front
        const faceOrder = faces
          .map((f, fi) => ({
            fi,
            avgZ: (rotated[f[0]][2] + rotated[f[1]][2] + rotated[f[2]][2]) / 3,
          }))
          .sort((a, b) => a.avgZ - b.avgZ);

        ctx!.save();
        ctx!.globalCompositeOperation = "lighter";

        for (const { fi } of faceOrder) {
          const f  = faces[fi];
          const a3 = rotated[f[0]], b3 = rotated[f[1]], c3 = rotated[f[2]];

          const norm    = faceNormal(a3, b3, c3);
          const nLen    = Math.sqrt(norm[0]*norm[0] + norm[1]*norm[1] + norm[2]*norm[2]);
          const facing  = nLen > 0 ? Math.abs(norm[2] / nLen) : 0;
          const fresnel = Math.pow(1 - facing, 2.2);

          // Holographic hue: violet → cyan → white, drifts with time
          const hue  = ((fresnel * 2.2 + t * 0.28 + fi * 0.13 + i * 0.38) % 1) * 360;
          const lgt  = 72 + fresnel * 18; // edge-on faces bloom brighter

          const ap  = project(a3, sx, sy, scale, FOV);
          const bp  = project(b3, sx, sy, scale, FOV);
          const cp2 = project(c3, sx, sy, scale, FOV);

          // Edges only — line-art look, no filled planes
          const edgeA = ease * (0.28 + fresnel * 0.72);
          ctx!.strokeStyle = `hsla(${hue},95%,${lgt}%,${edgeA})`;
          ctx!.lineWidth   = 0.7 + fresnel * 1.1;
          ctx!.lineJoin    = "round";
          ctx!.beginPath();
          ctx!.moveTo(ap[0], ap[1]);
          ctx!.lineTo(bp[0], bp[1]);
          ctx!.lineTo(cp2[0], cp2[1]);
          ctx!.closePath();
          ctx!.stroke();
        }

        // Outer glow halo — soft bloom around the whole star
        const glowR = 22 * ease;
        const glow = ctx!.createRadialGradient(sx, sy, 0, sx, sy, glowR);
        glow.addColorStop(0,   `rgba(184,240,255,${ease * 0.12})`);
        glow.addColorStop(0.4, `rgba(140,210,255,${ease * 0.06})`);
        glow.addColorStop(1,   "rgba(0,0,0,0)");
        ctx!.fillStyle = glow;
        ctx!.beginPath();
        ctx!.arc(sx, sy, glowR, 0, Math.PI * 2);
        ctx!.fill();

        // Chromatic aberration fringes — cyan left, magenta right
        const aberr = ease * 4.5;
        const fringeR = 6 * ease;
        const fL = ctx!.createRadialGradient(sx - aberr, sy, 0, sx - aberr, sy, fringeR);
        fL.addColorStop(0, `rgba(0,255,240,${ease * 0.28})`);
        fL.addColorStop(1, "rgba(0,0,0,0)");
        ctx!.fillStyle = fL;
        ctx!.beginPath();
        ctx!.arc(sx - aberr, sy, fringeR, 0, Math.PI * 2);
        ctx!.fill();

        const fR = ctx!.createRadialGradient(sx + aberr, sy, 0, sx + aberr, sy, fringeR);
        fR.addColorStop(0, `rgba(255,80,180,${ease * 0.20})`);
        fR.addColorStop(1, "rgba(0,0,0,0)");
        ctx!.fillStyle = fR;
        ctx!.beginPath();
        ctx!.arc(sx + aberr, sy, fringeR, 0, Math.PI * 2);
        ctx!.fill();

        // Ice-white core at star centre
        const coreR = 4 * ease;
        const anchor = ctx!.createRadialGradient(sx, sy, 0, sx, sy, coreR);
        anchor.addColorStop(0,   `rgba(240,250,255,${ease * 0.90})`);
        anchor.addColorStop(0.4, `rgba(180,230,255,${ease * 0.45})`);
        anchor.addColorStop(1,   "rgba(0,0,0,0)");
        ctx!.fillStyle = anchor;
        ctx!.beginPath();
        ctx!.arc(sx, sy, coreR, 0, Math.PI * 2);
        ctx!.fill();

        ctx!.restore();
      }

      // ── 2. Constellation paths between active hover stars ─────────────────
      const active: Array<{ sx: number; sy: number; ease: number }> = [];
      for (let i = 0; i < voidState.hoverSlots.length; i++) {
        if (_springs[i].pos > 0.12) {
          const s = voidState.hoverSlots[i];
          active.push({ sx: s.sx, sy: s.sy, ease: _springs[i].pos });
        }
      }
      if (active.length >= 2) {
        ctx!.save();
        ctx!.globalCompositeOperation = "lighter";
        ctx!.lineCap = "round";
        for (let a = 0; a < active.length - 1; a++) {
          for (let b = a + 1; b < active.length; b++) {
            const sa = active[a], sb = active[b];
            const dist = Math.hypot(sa.sx - sb.sx, sa.sy - sb.sy);
            if (dist > 700 || dist < 8) continue;

            const minE     = Math.min(sa.ease, sb.ease);
            const distFade = Math.max(0, 1 - dist / 700);
            const alpha    = minE * distFade * 0.55;

            const dashLen    = 8 + dist * 0.06;
            const dashOffset = (t * 45) % (dashLen * 2);
            ctx!.setLineDash([dashLen * 0.5, dashLen * 1.5]);
            ctx!.lineDashOffset = -dashOffset;

            ctx!.strokeStyle = `rgba(184, 240, 255, ${alpha})`;
            ctx!.lineWidth   = 1.0;
            ctx!.shadowColor = `rgba(184, 240, 255, 0.45)`;
            ctx!.shadowBlur  = 3;
            ctx!.beginPath();
            ctx!.moveTo(sa.sx, sa.sy);
            ctx!.lineTo(sb.sx, sb.sy);
            ctx!.stroke();
          }
        }
        ctx!.setLineDash([]);
        ctx!.lineDashOffset = 0;
        ctx!.restore();
      }

      // (Section 3 removed: model entrance scan-line sweep)

      // ── 4. Meteor trails — multi-segment tapered polylines ──────────────
      for (let m = 0; m < voidState.meteorSlots.length; m++) {
        const met = voidState.meteorSlots[m];
        if (!met.active || met.env < 0.01) continue;

        const { hsx, hsy, env, trail, trailLen } = met;
        const segCount = Math.max(trailLen, 2);

        ctx!.save();
        ctx!.globalCompositeOperation = "lighter";
        ctx!.lineCap  = "round";
        ctx!.lineJoin = "round";

        // Draw tapered trail segments (head → tail, decreasing width + opacity)
        for (let si = 0; si < segCount - 1; si++) {
          const frac = si / (segCount - 1); // 0 at head, 1 at tail
          const p0 = trail[si];
          const p1 = trail[si + 1];
          if (!p0 || !p1) break;

          const segAlpha = env * (1 - frac * 0.92);
          const segWidth = (1.2 - frac * 1.1) * env;
          if (segAlpha < 0.005 || segWidth < 0.05) break;

          // Glow pass — use shadowBlur only (no ctx.filter which is 10x slower)
          ctx!.strokeStyle = `rgba(${Math.round(80 + 175 * (1 - frac))}, ${Math.round(140 + 115 * (1 - frac))}, 255, ${(segAlpha * 0.55).toFixed(3)})`;
          ctx!.lineWidth = segWidth + 1.2 * env * (1 - frac);
          ctx!.shadowColor = `rgba(80, 150, 255, ${(segAlpha * 0.5).toFixed(3)})`;
          ctx!.shadowBlur = 3 * env * (1 - frac);
          ctx!.beginPath();
          ctx!.moveTo(p0.sx, p0.sy);
          ctx!.lineTo(p1.sx, p1.sy);
          ctx!.stroke();

          // Core pass
          ctx!.shadowBlur = 0;
          ctx!.strokeStyle = `rgba(${Math.round(210 + 45 * (1 - frac))}, ${Math.round(235 + 20 * (1 - frac))}, 255, ${(segAlpha * 0.85).toFixed(3)})`;
          ctx!.lineWidth = segWidth * 0.5;
          ctx!.beginPath();
          ctx!.moveTo(p0.sx, p0.sy);
          ctx!.lineTo(p1.sx, p1.sy);
          ctx!.stroke();
        }

        // Head spark — bright radial burst
        const sparkR = 1.65 * env;
        ctx!.shadowBlur = 0;
        const spark = ctx!.createRadialGradient(hsx, hsy, 0, hsx, hsy, sparkR * 2.5);
        spark.addColorStop(0.00, `rgba(255, 255, 255, ${env})`);
        spark.addColorStop(0.30, `rgba(200, 230, 255, ${env * 0.80})`);
        spark.addColorStop(0.65, `rgba(100, 160, 255, ${env * 0.45})`);
        spark.addColorStop(1.00, "rgba(0,0,0,0)");
        ctx!.fillStyle = spark;
        ctx!.shadowColor = "rgba(160, 210, 255, 0.72)";
        ctx!.shadowBlur = 2.5 * env;
        ctx!.beginPath();
        ctx!.arc(hsx, hsy, sparkR * 2.5, 0, Math.PI * 2);
        ctx!.fill();

        // Tiny scattered sparks near head
        for (let sp = 0; sp < 3; sp++) {
          const angle = (t * 3 + m * 2.1 + sp * 2.09) % (Math.PI * 2);
          const dist = 1.5 + Math.sin(t * 5 + sp * 1.3) * 1.2;
          const spx = hsx + Math.cos(angle) * dist * env;
          const spy = hsy + Math.sin(angle) * dist * env;
          const spAlpha = env * (0.4 + Math.sin(t * 8 + sp * 2.5) * 0.3);
          ctx!.fillStyle = `rgba(220, 240, 255, ${spAlpha.toFixed(3)})`;
          ctx!.shadowBlur = 0;
          ctx!.beginPath();
          ctx!.arc(spx, spy, 0.6 * env, 0, Math.PI * 2);
          ctx!.fill();
        }

        ctx!.restore();
      }

      // ── 5. Black hole loading animation ─────────────────────────────────
      // Dark gravitational center where the model will appear.  Stars orbit
      // around it via velocity forces in ShootingStars — their per-star
      // motion-blur streaks create the visual loading circle naturally.
      // modelRegion is now populated by ShootingStars immediately (before FBX
      // loads), so position is always correct relative to the work section.
      if (loadFade > 0.01 && voidState.modelRegion.rPx > 10) {
        const mr       = voidState.modelRegion;
        const cx       = mr.x;
        const cy       = mr.y;
        const coreR    = Math.max(mr.rPx * 0.5, 32) * loadFade;
        const eventR   = coreR * 1.6;
        const progress = Math.min(voidState.modelOpacity / 0.35, 1);

        ctx!.save();

        // ── Dark core: gravitational void ────────────────────────────────
        const core = ctx!.createRadialGradient(cx, cy, 0, cx, cy, coreR);
        core.addColorStop(0.0,  `rgba(0,0,5,${(0.88 * loadFade).toFixed(3)})`);
        core.addColorStop(0.5,  `rgba(2,3,12,${(0.65 * loadFade).toFixed(3)})`);
        core.addColorStop(0.85, `rgba(3,5,15,${(0.25 * loadFade).toFixed(3)})`);
        core.addColorStop(1.0,  "rgba(0,0,0,0)");
        ctx!.globalCompositeOperation = "source-over";
        ctx!.fillStyle = core;
        ctx!.beginPath();
        ctx!.arc(cx, cy, coreR, 0, Math.PI * 2);
        ctx!.fill();

        // ── Event horizon rim: subtle accretion disc glow ────────────────
        ctx!.globalCompositeOperation = "lighter";
        const rim = ctx!.createRadialGradient(cx, cy, coreR * 0.7, cx, cy, eventR);
        rim.addColorStop(0.0, "rgba(0,0,0,0)");
        rim.addColorStop(0.5, `rgba(40,80,140,${(0.12 * loadFade).toFixed(3)})`);
        rim.addColorStop(0.7, `rgba(80,160,220,${(0.18 * loadFade).toFixed(3)})`);
        rim.addColorStop(0.9, `rgba(140,210,255,${(0.08 * loadFade).toFixed(3)})`);
        rim.addColorStop(1.0, "rgba(0,0,0,0)");
        ctx!.fillStyle = rim;
        ctx!.beginPath();
        ctx!.arc(cx, cy, eventR, 0, Math.PI * 2);
        ctx!.fill();

        // ── Rotating lensing arcs ────────────────────────────────────────
        const arcCount = 3;
        for (let a = 0; a < arcCount; a++) {
          const aOff   = (a / arcCount) * Math.PI * 2 + t * 0.6;
          const aSpan  = 0.4 + Math.sin(t * 0.8 + a * 2.1) * 0.15;
          ctx!.beginPath();
          ctx!.arc(cx, cy, eventR * (0.85 + a * 0.08), aOff, aOff + aSpan);
          ctx!.strokeStyle = `rgba(140,210,255,${(0.14 * loadFade).toFixed(3)})`;
          ctx!.lineWidth   = 0.75;
          ctx!.stroke();
        }

        // ── Loading text below ───────────────────────────────────────────
        ctx!.globalCompositeOperation = "source-over";
        const textY    = cy + eventR + 22;
        const dotCount = Math.floor(t * 1.8) % 4;
        const dots     = ".".repeat(dotCount);
        const pulse    = 0.55 + Math.sin(t * 2.4) * 0.18;
        const alpha    = loadFade * pulse;

        ctx!.textAlign    = "center";
        ctx!.textBaseline = "middle";
        ctx!.font         = "500 8px 'Courier New', monospace";
        ctx!.fillStyle    = `rgba(184,240,255,${(alpha * 0.7).toFixed(3)})`;
        ctx!.fillText(`LOADING${dots}`, cx, textY);

        // Percentage
        if (progress > 0.01) {
          ctx!.font      = "400 7px 'Courier New', monospace";
          ctx!.fillStyle = `rgba(184,240,255,${(alpha * 0.4).toFixed(3)})`;
          ctx!.fillText(`${Math.round(progress * 100)}%`, cx, textY + 13);
        }

        ctx!.restore();
      }
    }

    draw();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      role="presentation"
      aria-hidden="true"
      style={{
        position:      "fixed",
        top:           0,
        left:          0,
        width:         "100%",
        height:        "100%",
        pointerEvents: "none",
        zIndex:        1,
      }}
    />
  );
}
