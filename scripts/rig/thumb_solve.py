# Solve thumb presets against targets (Blender 4.2 background, numpy only).
#   blender -b --factory-startup --python thumb_solve.py -- <presets_in.json> <presets_out.json>
# presets_in: [{"name", "fingers": {...as hand_lab...}, "target": "fist"|"rest"|"open"|"none",
#              "thumbA0": {...start...}}]
# FK is done analytically from the bind matrices (exactly what the site will do), so the
# solve is fast; the result is rendered by hand_lab.py for judgement.
import bpy, math, sys, os, json
import numpy as np
from mathutils import Vector, Quaternion, Matrix

A = sys.argv[sys.argv.index("--") + 1:]
PRE = json.load(open(A[0]))
OUTF = os.path.abspath(A[1])
GLB = r"X:\software\cursor work\crystal-portfolio\public\Rigged Characters\rubia.glb"
SIDE = "R"
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB, bone_heuristic='BLENDER')
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
AW = arm.matrix_world
P = f"CC_Base_{SIDE}_"
side = 1
B = arm.data.bones


def bm(n):
    return AW @ B[P + n].matrix_local


def head(n):
    return bm(n).translation


f = (head("Mid1") - head("Hand")).normalized()
k = (head("Index1") - head("Pinky1")).normalized()
dorsal = (f.cross(k) * side).normalized()
k = (dorsal.cross(f) * side).normalized()


def local_axis(n, w):
    return (bm(n).to_quaternion().inverted() @ w).normalized()


AX = {}
for fn in ("Index", "Mid", "Pinky"):
    for s in (1, 2, 3):
        b = B[P + f"{fn}{s}"]
        d = ((AW @ b.tail_local) - (AW @ b.head_local)).normalized()
        AX[f"{fn}{s}"] = (local_axis(f"{fn}{s}", dorsal.cross(d).normalized()),
                          local_axis(f"{fn}{s}", (dorsal - d * dorsal.dot(d)).normalized() * side))
TAX = {}
for s in (1, 2, 3):
    b = B[P + f"Thumb{s}"]
    d = ((AW @ b.tail_local) - (AW @ b.head_local)).normalized()
    a = (dorsal - d * dorsal.dot(d)).normalized()
    if a.cross(d).dot(-k) < 0:
        a = -a
    a2 = d.cross(dorsal).normalized()
    if a2.cross(d).dot(-dorsal) < 0:
        a2 = -a2
    TAX[s] = (local_axis(f"Thumb{s}", a), local_axis(f"Thumb{s}", a2), local_axis(f"Thumb{s}", d * side))


def finger_q(fn, s, vals):
    mcp, pip, dip, spread = [math.radians(v) for v in (vals + [0, 0, 0, 0])[:4]]
    fl = (mcp, pip, dip)[s - 1]
    flex_l, spread_l = AX[f"{fn}{s}"]
    return Quaternion(spread_l, spread if s == 1 else 0) @ Quaternion(flex_l, fl)


def thumb_q(t):
    phi = math.radians(t.get("phi", 0))
    fl, ab, ro = [math.radians(v) for v in (t.get("cmc", [0, 0, 0]) + [0, 0, 0])[:3]]
    f1, a1, r1 = TAX[1]
    q = {1: Quaternion(f1, fl) @ Quaternion(a1, ab) @ Quaternion(r1, ro)}
    mf, ma = [math.radians(v) for v in (t.get("mcp", [0, 0]) + [0, 0])[:2]]
    for s, flex, abd in ((2, mf, ma), (3, math.radians(t.get("ip", 0)), 0.0)):
        fs, as_, rs = TAX[s]
        hinge = (fs * math.cos(phi) + as_ * math.sin(phi)).normalized()
        q[s] = Quaternion(as_, abd) @ Quaternion(hinge, flex)
    return q


def chain_world(names, qs):
    """Posed world matrices of a chain whose first bone's parent (Hand) is at bind."""
    out = []
    prev_rest = None
    prev_world = None
    for n, q in zip(names, qs):
        rest = bm(n)
        if prev_world is None:
            w = rest @ q.to_matrix().to_4x4()
        else:
            rel = prev_rest.inverted() @ rest
            w = prev_world @ rel @ q.to_matrix().to_4x4()
        out.append(w)
        prev_rest, prev_world = rest, w
    return out


def tip_of(fn, worlds):
    end = B.get(P + f"{fn}3_end")
    rel = bm(f"{fn}3").inverted() @ (AW @ end.matrix_local) if end else Matrix.Translation((0, B[P + f"{fn}3"].length, 0))
    return (worlds[-1] @ rel).translation


def seg_pts(fn, worlds):
    return [w.translation.copy() for w in worlds] + [tip_of(fn, worlds)]


def seg_dist(p, a, b):
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / max(ab.length_squared, 1e-12)))
    return (p - (a + ab * t)).length


def seg_seg(a0, a1, b0, b1, n=7):
    return min(seg_dist(a0 + (a1 - a0) * (i / (n - 1)), b0, b1) for i in range(n))


# radii from the mesh (median distance of dominant verts to their bone line)
body = bpy.data.objects["mesh_004"]
gidx = {g.index: g.name for g in body.vertex_groups}
mw = body.matrix_world
RAD = {}
for fn in ("Index", "Mid", "Pinky", "Thumb"):
    rs = []
    pts = [head(f"{fn}{s}") for s in (1, 2, 3)]
    pts.append(tip_of(fn, chain_world([P[:0] + f"{fn}{s}" for s in (1, 2, 3)], [Quaternion()] * 3)))
    for v in body.data.vertices:
        if not v.groups:
            continue
        g = max(v.groups, key=lambda gg: gg.weight)
        if gidx.get(g.group, "").startswith(P + fn):
            p = mw @ v.co
            rs.append(min(seg_dist(p, pts[i], pts[i + 1]) for i in range(3)))
    RAD[fn] = float(np.median(rs))
# palm: thickness from the Hand-dominant verts (distance to the palm mid-plane)
pc = (head("Hand") + head("Mid1")) / 2
hs = []
for v in body.data.vertices:
    if not v.groups:
        continue
    g = max(v.groups, key=lambda gg: gg.weight)
    if gidx.get(g.group) == P + "Hand":
        hs.append(abs((mw @ v.co - pc).dot(dorsal)))
RAD["palm"] = float(np.percentile(hs, 80)) if hs else 0.008
print("radii", {kk: round(vv, 5) for kk, vv in RAD.items()})

PARAMS = ["cmc_flex", "cmc_abd", "cmc_roll", "mcp", "ip", "phi"]
LIM = {"cmc_flex": (-25, 75), "cmc_abd": (-15, 75), "cmc_roll": (-60, 60), "mcp": (-10, 65), "ip": (-10, 80), "phi": (-40, 90)}


def to_t(x):
    d = dict(zip(PARAMS, x))
    return {"cmc": [d["cmc_flex"], d["cmc_abd"], d["cmc_roll"]], "mcp": [d["mcp"], 0], "ip": d["ip"], "phi": d["phi"]}


def finger_pts(fn, vals):
    return seg_pts(fn, chain_world([f"{fn}{s}" for s in (1, 2, 3)], [finger_q(fn, s, vals) for s in (1, 2, 3)]))


def tip_depth(fn, vals):
    """Fingertip vs the palm's palmar surface, in finger radii: <0 clear, >0 inside."""
    T = finger_pts(fn, vals)
    return ((T[3] - pc).dot(dorsal) + RAD["palm"] + RAD[fn]) / RAD[fn]


def fit_curl(fn, vals, clear=-0.08):
    """Scale a curl (mcp, pip, dip; spread kept) down until the tip just clears the palm."""
    if tip_depth(fn, vals) <= clear:
        return vals
    lo, hi = 0.2, 1.0
    for _ in range(30):
        mid = (lo + hi) / 2
        v = [vals[0] * mid, vals[1] * mid, vals[2] * mid] + vals[3:]
        if tip_depth(fn, v) <= clear:
            lo = mid
        else:
            hi = mid
    return [round(vals[0] * lo, 1), round(vals[1] * lo, 1), round(vals[2] * lo, 1)] + vals[3:]


def solve(pre):
    fingers = pre.get("fingers", {})
    if pre.get("fit_fingers"):
        fingers = {fn: fit_curl(fn, list(v)) for fn, v in fingers.items()}
        pre["fingers"] = fingers
        print("  fitted curls", fingers)
    F = {}
    for fn in ("Index", "Mid", "Pinky"):
        vals = fingers.get(fn, [0, 0, 0, 0])
        F[fn] = finger_pts(fn, vals)
    kind = pre["target"]
    rT, rI = RAD["Thumb"], RAD["Index"]
    if kind == "fist":
        # thumb pad across the middle phalanges of index + middle, on their outside
        a = (F["Index"][1] + F["Index"][2]) / 2
        b = (F["Mid"][1] + F["Mid"][2]) / 2
        c = a * 0.62 + b * 0.38
        out = (c - pc)
        out = (out - dorsal * out.dot(dorsal) * 0.3).normalized()
        target = c + out * (rI + rT) * 0.92
        pad_at = 0.55  # point along Thumb3 that should sit on the target
        want_dir = (-k * 0.9 - f * 0.3).normalized()  # across the fist, toward the pinky side
    elif kind == "rest":
        # beside the index's first knuckle, a little palmar, not touching
        target = F["Index"][1] * 0.6 + F["Index"][0] * 0.4 + k * (rI + rT) * 1.15 - dorsal * rI * 0.9
        pad_at = 0.9
        want_dir = None
    elif kind == "near":
        target = Vector(pre["point"])
        pad_at = 0.9
        want_dir = None
    else:
        return pre.get("thumbA0", {})

    def cost(x):
        t = to_t(x)
        q = thumb_q(t)
        W = chain_world([f"Thumb{s}" for s in (1, 2, 3)], [q[1], q[2], q[3]])
        T = seg_pts("Thumb", W)
        pad = T[2] + (T[3] - T[2]) * pad_at
        c = (pad - target).length_squared / (rT * rT)
        if want_dir is not None:
            c += 3.0 * (1 - (T[3] - T[2]).normalized().dot(want_dir)) ** 2
        # no thumb segment (2,3) inside a finger or the palm
        pen = 0.0
        for i in (1, 2):
            for fn in ("Index", "Mid", "Pinky"):
                for j in range(3):
                    d = seg_seg(T[i], T[i + 1], F[fn][j], F[fn][j + 1])
                    m = (rT + RAD[fn]) * 0.95
                    if d < m:
                        pen += ((m - d) / rT) ** 2
            # palm slab: points of the free thumb must not go dorsal of the palm surface
            for s_ in (0.0, 0.5, 1.0):
                pnt = T[i] + (T[i + 1] - T[i]) * s_
                dd = (pnt - pc).dot(dorsal)
                if dd > -RAD["palm"] - rT * 0.6 and (pnt - pc).length < (head("Mid1") - head("Hand")).length * 0.9:
                    pen += ((dd + RAD["palm"] + rT * 0.6) / rT) ** 2
        reg = sum((v / 60.0) ** 2 for v in x) * 0.02
        lim = 0.0
        for nm, v in zip(PARAMS, x):
            lo, hi = LIM[nm]
            if v < lo:
                lim += ((lo - v) / 5) ** 2
            if v > hi:
                lim += ((v - hi) / 5) ** 2
        return c + 4 * pen + reg + lim

    # Nelder-Mead from several starts
    starts = [[20, 20, 10, 20, 20, 20], [35, 35, 25, 30, 30, 40], [10, 40, 0, 40, 40, 60], [45, 15, 30, 20, 30, 0], [25, 50, 40, 15, 20, 70]]
    if pre.get("thumbA0"):
        t0 = pre["thumbA0"]
        starts.insert(0, [t0["cmc"][0], t0["cmc"][1], t0["cmc"][2], t0["mcp"][0], t0["ip"], t0.get("phi", 0)])
    best = None
    for s0 in starts:
        x, fx = nelder_mead(cost, np.array(s0, dtype=float), step=12.0, iters=500)
        if best is None or fx < best[1]:
            best = (x, fx)
    x, fx = best
    for fn in ("Index", "Mid", "Pinky"):
        tipd = (F[fn][3] - pc).dot(dorsal)
        print("  ", fn, "tip depth vs palm surface (finger radii; <0 clear, >0 inside):", round((tipd + RAD["palm"] + RAD[fn]) / RAD[fn], 2))
    t = to_t([round(float(v), 1) for v in x])
    q = thumb_q(t)
    W = chain_world([f"Thumb{s}" for s in (1, 2, 3)], [q[1], q[2], q[3]])
    T = seg_pts("Thumb", W)
    pad = T[2] + (T[3] - T[2]) * pad_at
    print(pre["name"], "cost", round(fx, 4), "pad-target / thumb radius", round((pad - target).length / rT, 3), t)
    return t


def nelder_mead(fn, x0, step=10.0, iters=400, tol=1e-6):
    n = len(x0)
    pts = [x0] + [x0 + np.eye(n)[i] * step for i in range(n)]
    vals = [fn(p) for p in pts]
    for _ in range(iters):
        order = np.argsort(vals)
        pts = [pts[i] for i in order]
        vals = [vals[i] for i in order]
        if abs(vals[-1] - vals[0]) < tol:
            break
        c = np.mean(pts[:-1], axis=0)
        xr = c + (c - pts[-1])
        fr = fn(xr)
        if fr < vals[0]:
            xe = c + 2 * (c - pts[-1])
            fe = fn(xe)
            pts[-1], vals[-1] = (xe, fe) if fe < fr else (xr, fr)
        elif fr < vals[-2]:
            pts[-1], vals[-1] = xr, fr
        else:
            xc = c + 0.5 * (pts[-1] - c)
            fc = fn(xc)
            if fc < vals[-1]:
                pts[-1], vals[-1] = xc, fc
            else:
                pts = [pts[0]] + [pts[0] + 0.5 * (p - pts[0]) for p in pts[1:]]
                vals = [vals[0]] + [fn(p) for p in pts[1:]]
    i = int(np.argmin(vals))
    return pts[i], vals[i]


out = []
for pre in PRE:
    r = dict(pre)
    r["thumbA"] = solve(pre)
    out.append(r)
json.dump(out, open(OUTF, "w"), indent=1)
print("solved ->", OUTF)
