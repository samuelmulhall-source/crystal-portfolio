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
import { layerOff } from "../lib/debugFlags";

// Per-slot spring state (lives outside React render cycle)
const _springs: Array<{ pos: number; vel: number }> =
  Array.from({ length: 14 }, () => ({ pos: 0, vel: 0 }));

// Geometry cache keyed by n (4–7) — avoids rebuilding vertices every frame
const _geomCache = new Map<number, ReturnType<typeof getStarGeom>>();
function getCachedStarGeom(n: number) {
  if (!_geomCache.has(n)) _geomCache.set(n, getStarGeom(n));
  return _geomCache.get(n)!;
}

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

// Reused per-vertex scratch buffers for the hover-star draw — sized for the
// largest bipyramid (n=7 → 16 verts). Avoids per-frame array allocation, which
// otherwise builds GC pressure and causes periodic ~300ms collection hitches.
const _vx: number[] = [];
const _vy: number[] = [];
const _vz: number[] = [];
const _sx2: number[] = [];
const _sy2: number[] = [];

export default function EffectsOverlay() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (layerOff("effects")) return; // debug: ?off=effects
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf: number;
    const t0 = performance.now();
    let lastT = performance.now();
    let loadFade = 0; // smoothed loading opacity for HUD text
    let dirty = false; // whether the canvas currently holds drawn pixels

    const resize = () => {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    function draw() {
      raf = requestAnimationFrame(draw);

      const now = performance.now();
      const dt  = Math.min((now - lastT) * 0.001, 0.05);
      lastT     = now;
      const t   = (now - t0) * 0.001;

      // Smooth loading fade (used for HUD text below)
      loadFade += ((voidState.modelLoading ? 1 : 0) - loadFade) * Math.min(dt * 2.5, 1);

      // ── Activity gate ──────────────────────────────────────────────────
      // This overlay is fixed + full-screen and the browser composites it
      // every frame. Clearing and re-uploading a 1080p+ canvas with nothing
      // to show is the single biggest always-on cost of this layer. When
      // there is genuinely nothing to draw we skip ALL work (no clear, no
      // composite churn) — the layer becomes free until the next hover.
      let busy = false;
      for (let i = 0; i < voidState.hoverSlots.length; i++) {
        if (voidState.hoverSlots[i].ease > 0.003 || _springs[i].pos > 0.003) { busy = true; break; }
      }
      if (!busy) {
        for (let m = 0; m < voidState.meteorSlots.length; m++) {
          const met = voidState.meteorSlots[m];
          if (met.active && met.env > 0.01) { busy = true; break; }
        }
      }
      if (!busy && (loadFade > 0.01 ||
          (voidState.modelEntranceProgress < 0.98 && voidState.modelRegion.rPx > 30))) {
        busy = true;
      }
      // Nothing on screen and nothing left to erase → do nothing this frame.
      if (!busy && !dirty) return;

      const w   = canvas!.width;
      const h   = canvas!.height;
      ctx!.clearRect(0, 0, w, h);
      // Erased the last frame's content; canvas is now blank and stays blank.
      if (!busy) { dirty = false; return; }
      dirty = true;

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
        if (i >= 6) continue; // line-only slots: spring advances but no geometry

        const ease = Math.min(spring.pos, 1.0);
        const { sx, sy } = slot;

        // Scale kept small — accent, not a large graphic
        const scale = ease * 5;
        const FOV   = 6;

        // n morphs slowly per slot (4–7), giving a unique feel per star
        const n = Math.max(4, Math.min(7, Math.round(4 + Math.sin(t * 0.14 + i * 1.7) * 1.5)));

        // Clean spin on Y; fixed per-slot X tilt for stable perspective view
        const ry = t * 1.1 + i * 0.85;
        const rx = 0.4 + i * 0.22;

        const { verts, faces } = getCachedStarGeom(n);

        // Rotate + project every vertex ONCE into reused scratch buffers.
        const cosY = Math.cos(ry), sinY = Math.sin(ry);
        const cosX = Math.cos(rx), sinX = Math.sin(rx);
        for (let vi = 0; vi < verts.length; vi++) {
          const v = verts[vi];
          const x1 = v[0] * cosY + v[2] * sinY;
          const z1 = -v[0] * sinY + v[2] * cosY;
          const y2 = v[1] * cosX - z1 * sinX;
          const z2 = v[1] * sinX + z1 * cosX;
          _vx[vi] = x1; _vy[vi] = y2; _vz[vi] = z2;
          const depth = FOV / (FOV + z2);
          _sx2[vi] = sx + x1 * scale * depth;
          _sy2[vi] = sy - y2 * scale * depth;
        }

        ctx!.save();
        ctx!.globalCompositeOperation = "lighter";

        // Additive blending is order-independent — no painter's sort needed.
        for (let fi = 0; fi < faces.length; fi++) {
          const f = faces[fi];
          const i0 = f[0], i1 = f[1], i2 = f[2];

          // Face normal (scalars, no allocation); only z + magnitude are used.
          const ux = _vx[i1]-_vx[i0], uy = _vy[i1]-_vy[i0], uz = _vz[i1]-_vz[i0];
          const wx = _vx[i2]-_vx[i0], wy = _vy[i2]-_vy[i0], wz = _vz[i2]-_vz[i0];
          const nx = uy*wz - uz*wy, ny = uz*wx - ux*wz, nz = ux*wy - uy*wx;
          const nLen    = Math.sqrt(nx*nx + ny*ny + nz*nz);
          const facing  = nLen > 0 ? Math.abs(nz / nLen) : 0;
          const fresnel = Math.pow(1 - facing, 2.2);

          // Holographic hue: violet → cyan → white, drifts with time
          const hue = ((fresnel * 2.2 + t * 0.28 + fi * 0.13 + i * 0.38) % 1) * 360;
          const lgt = 72 + fresnel * 18; // edge-on faces bloom brighter

          // Edges only — line-art look, no filled planes
          const edgeA = ease * (0.28 + fresnel * 0.72);
          ctx!.strokeStyle = `hsla(${hue},95%,${lgt}%,${edgeA})`;
          ctx!.lineWidth   = 0.7 + fresnel * 1.1;
          ctx!.lineJoin    = "round";
          ctx!.beginPath();
          ctx!.moveTo(_sx2[i0], _sy2[i0]);
          ctx!.lineTo(_sx2[i1], _sy2[i1]);
          ctx!.lineTo(_sx2[i2], _sy2[i2]);
          ctx!.closePath();
          ctx!.stroke();
        }

        // Outer glow halo — soft bloom around the whole star
        const glow = ctx!.createRadialGradient(sx, sy, 0, sx, sy, 9 * ease);
        glow.addColorStop(0,   `rgba(184,240,255,${ease * 0.14})`);
        glow.addColorStop(0.5, `rgba(140,210,255,${ease * 0.06})`);
        glow.addColorStop(1,   "rgba(0,0,0,0)");
        ctx!.fillStyle = glow;
        ctx!.beginPath();
        ctx!.arc(sx, sy, 9 * ease, 0, Math.PI * 2);
        ctx!.fill();

        // Tiny ice-white core at star centre
        const anchor = ctx!.createRadialGradient(sx, sy, 0, sx, sy, 2.2 * ease);
        anchor.addColorStop(0,   `rgba(240,250,255,${ease * 0.95})`);
        anchor.addColorStop(0.5, `rgba(180,230,255,${ease * 0.45})`);
        anchor.addColorStop(1,   "rgba(0,0,0,0)");
        ctx!.fillStyle = anchor;
        ctx!.beginPath();
        ctx!.arc(sx, sy, 2.2 * ease, 0, Math.PI * 2);
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
            if (dist > 560 || dist < 6) continue;

            const minE     = Math.min(sa.ease, sb.ease);
            const distFade = Math.max(0, 1 - dist / 560);
            const alpha    = minE * distFade * 0.55;

            const dashLen    = 8 + dist * 0.06;
            const dashOffset = (t * 45) % (dashLen * 2);
            ctx!.setLineDash([dashLen * 0.5, dashLen * 1.5]);
            ctx!.lineDashOffset = -dashOffset;

            ctx!.beginPath();
            ctx!.moveTo(sa.sx, sa.sy);
            ctx!.lineTo(sb.sx, sb.sy);
            // Soft glow without the per-stroke cost of shadowBlur: a faint
            // wide additive pass under a crisp thin core (same path).
            ctx!.strokeStyle = `rgba(184, 240, 255, ${alpha * 0.34})`;
            ctx!.lineWidth   = 2.6;
            ctx!.stroke();
            ctx!.strokeStyle = `rgba(212, 248, 255, ${alpha})`;
            ctx!.lineWidth   = 1.0;
            ctx!.stroke();
          }
        }
        ctx!.setLineDash([]);
        ctx!.lineDashOffset = 0;
        ctx!.restore();
      }

      // ── 3. Model entrance scan-line sweep ────────────────────────────────
      {
        const ep = voidState.modelEntranceProgress;
        const mr = voidState.modelRegion;
        if (ep < 0.98 && mr.rPx > 30) {
          const scanY = mr.y + mr.rPx * (1 - ep * 2);
          const alpha = Math.sin(ep * Math.PI) * 0.55;

          const grad = ctx!.createLinearGradient(mr.x - mr.rPx, scanY, mr.x + mr.rPx, scanY);
          grad.addColorStop(0,    "rgba(0,0,0,0)");
          grad.addColorStop(0.25, `rgba(184,240,255,${(alpha * 0.6).toFixed(3)})`);
          grad.addColorStop(0.5,  `rgba(220,255,255,${alpha.toFixed(3)})`);
          grad.addColorStop(0.75, `rgba(184,240,255,${(alpha * 0.6).toFixed(3)})`);
          grad.addColorStop(1,    "rgba(0,0,0,0)");

          ctx!.beginPath();
          ctx!.moveTo(mr.x - mr.rPx, scanY);
          ctx!.lineTo(mr.x + mr.rPx, scanY);
          ctx!.strokeStyle = grad;
          ctx!.lineWidth = 1.5;
          ctx!.stroke();

          // Tiny vertical sparkle at midpoint
          ctx!.beginPath();
          ctx!.moveTo(mr.x, scanY - 3);
          ctx!.lineTo(mr.x, scanY + 3);
          ctx!.strokeStyle = `rgba(255,255,255,${(alpha * 0.8).toFixed(3)})`;
          ctx!.lineWidth = 0.75;
          ctx!.stroke();
        }
      }

      // ── 4. Meteor trails ──────────────────────────────────────────────────
      for (let m = 0; m < voidState.meteorSlots.length; m++) {
        const met = voidState.meteorSlots[m];
        if (!met.active || met.env < 0.01) continue;

        const { hsx, hsy, tsx, tsy, env } = met;

        ctx!.save();
        ctx!.globalCompositeOperation = "lighter";
        ctx!.lineCap  = "round";
        ctx!.lineJoin = "round";

        // Glow pass: blue/ice
        const gGlow = ctx!.createLinearGradient(tsx, tsy, hsx, hsy);
        gGlow.addColorStop(0.00, "rgba(0,0,0,0)");
        gGlow.addColorStop(0.25, `rgba(20,  50, 180, ${env * 0.42})`);
        gGlow.addColorStop(0.60, `rgba(70, 140, 255, ${env * 0.68})`);
        gGlow.addColorStop(0.85, `rgba(180,220, 255, ${env * 0.84})`);
        gGlow.addColorStop(1.00, `rgba(255,255, 255, ${env * 0.92})`);

        ctx!.strokeStyle = gGlow;
        ctx!.lineWidth   = 1.6 * env;
        ctx!.shadowColor = `rgba(80, 150, 255, ${env * 0.60})`;
        ctx!.shadowBlur  = 3 * env;
        ctx!.beginPath();
        ctx!.moveTo(tsx, tsy);
        ctx!.lineTo(hsx, hsy);
        ctx!.stroke();

        // Core pass: ice-white
        ctx!.shadowBlur = 0;

        const gCore = ctx!.createLinearGradient(tsx, tsy, hsx, hsy);
        gCore.addColorStop(0.00, "rgba(0,0,0,0)");
        gCore.addColorStop(0.35, `rgba( 80, 140, 255, ${env * 0.65})`);
        gCore.addColorStop(0.75, `rgba(210, 235, 255, ${env * 0.88})`);
        gCore.addColorStop(1.00, `rgba(255, 255, 255, ${env})`);

        ctx!.strokeStyle = gCore;
        ctx!.lineWidth   = 0.6 * env;
        ctx!.beginPath();
        ctx!.moveTo(tsx, tsy);
        ctx!.lineTo(hsx, hsy);
        ctx!.stroke();

        // Head spark
        const sparkR = 1.65 * env;
        const spark  = ctx!.createRadialGradient(hsx, hsy, 0, hsx, hsy, sparkR * 2.5);
        spark.addColorStop(0.00, `rgba(255, 255, 255, ${env})`);
        spark.addColorStop(0.30, `rgba(200, 230, 255, ${env * 0.80})`);
        spark.addColorStop(0.65, `rgba(100, 160, 255, ${env * 0.45})`);
        spark.addColorStop(1.00, "rgba(0,0,0,0)");

        ctx!.fillStyle   = spark;
        ctx!.shadowColor = "rgba(160, 210, 255, 0.72)";
        ctx!.shadowBlur  = 2.5 * env;
        ctx!.beginPath();
        ctx!.arc(hsx, hsy, sparkR * 2.5, 0, Math.PI * 2);
        ctx!.fill();

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
