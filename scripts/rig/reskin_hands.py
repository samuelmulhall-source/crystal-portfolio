# Re-skin Rubia's hands (Blender 4.2). Used by fix_rubia_rig.py and the hand lab:
# "proc" (geometric weights, the one in use) — position-only, so the duplicate
# vertices glTF splits along UV seams always agree. "heat" (Blender's automatic
# weights) is kept for comparison only: on this split mesh it cracks at the seams.
#   exec(open(".../reskin_hands.py").read()); report = reskin_hands(arm, side, method)
# Only vertices of the body mesh that carry hand / finger / thumb weight are touched. Their
# forearm (wrist) share is kept exactly; the rest is redistributed over the hand bones.
import bpy, bmesh, math
import numpy as np
from mathutils import Vector, Matrix
from mathutils.kdtree import KDTree

HAND_PARTS = ("Hand", "Thumb1", "Thumb2", "Thumb3", "Index1", "Index2", "Index3", "Mid1", "Mid2", "Mid3", "Pinky1", "Pinky2", "Pinky3")


def _hand_names(side):
    return [f"CC_Base_{side}_{p}" for p in HAND_PARTS]


def _body():
    return bpy.data.objects["mesh_004"]


def _smoothstep(x):
    x = np.clip(x, 0.0, 1.0)
    return x * x * (3 - 2 * x)


def _adjacency(me):
    n = len(me.vertices)
    nb = [[] for _ in range(n)]
    for e in me.edges:
        a, b = e.vertices
        nb[a].append(b)
        nb[b].append(a)
    return nb


def heat_weights(arm, side, idx):
    """Bone-heat weights for the hand bones only, on a temporary copy of the hand region.
    The copy is posed nowhere; the temporary armature's Hand bone is lengthened (along its
    own axis) to the knuckles so the palm draws its heat from the hand, not the fingers."""
    body = _body()
    names = _hand_names(side)
    scene = bpy.context.scene
    # temp armature copy (own data, so bones can be edited freely)
    tarm = arm.copy()
    tarm.data = arm.data.copy()
    scene.collection.objects.link(tarm)
    bpy.ops.object.select_all(action='DESELECT')
    tarm.select_set(True)
    bpy.context.view_layer.objects.active = tarm
    bpy.ops.object.mode_set(mode='EDIT')
    eb = tarm.data.edit_bones
    P = f"CC_Base_{side}_"
    knuckles = (eb[P + "Index1"].head + eb[P + "Mid1"].head + eb[P + "Pinky1"].head) / 3
    hb = eb[P + "Hand"]
    yax = (hb.tail - hb.head).normalized()
    reach = (knuckles - hb.head).dot(yax) * 0.85
    hb.tail = hb.head + yax * max(reach, hb.length)
    for b in eb:
        b.use_deform = b.name in names
    bpy.ops.object.mode_set(mode='OBJECT')
    # temp mesh: only the hand region of the body
    tmp = body.copy()
    tmp.data = body.data.copy()
    tmp.name = "hand_tmp"
    scene.collection.objects.link(tmp)
    tmp.modifiers.clear()
    tmp.vertex_groups.clear()
    tmp.parent = None
    tmp.matrix_world = body.matrix_world.copy()
    me = tmp.data
    keep = np.zeros(len(me.vertices), dtype=bool)
    keep[idx] = True
    oi = me.attributes.new("orig", 'INT', 'POINT')
    oi.data.foreach_set("value", list(range(len(me.vertices))))
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not keep[v.index]], context='VERTS')
    bm.to_mesh(me)
    bm.free()
    bpy.ops.object.select_all(action='DESELECT')
    tmp.select_set(True)
    tarm.select_set(True)
    bpy.context.view_layer.objects.active = tarm
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    orig = [0] * len(me.vertices)
    me.attributes["orig"].data.foreach_get("value", orig)
    gname = {g.index: g.name for g in tmp.vertex_groups}
    W = {}
    for v in me.vertices:
        ws = {gname[g.group]: g.weight for g in v.groups if g.weight > 0 and gname.get(g.group) in names}
        W[orig[v.index]] = ws
    # clean up the temporaries
    bpy.data.objects.remove(tmp, do_unlink=True)
    bpy.data.objects.remove(tarm, do_unlink=True)
    return W


def smooth_weights(me, idx_set, W, names, iters=2, lam=0.5):
    """Laplacian smoothing of the new weights inside the region (edges only inside it)."""
    nb = _adjacency(me)
    col = {n: i for i, n in enumerate(names)}
    ids = sorted(idx_set)
    M = np.zeros((len(ids), len(names)))
    pos = {vi: r for r, vi in enumerate(ids)}
    for r, vi in enumerate(ids):
        for n, w in W[vi].items():
            M[r, col[n]] = w
    for _ in range(iters):
        M2 = M.copy()
        for r, vi in enumerate(ids):
            ns = [pos[j] for j in nb[vi] if j in pos]
            if ns:
                M2[r] = (1 - lam) * M[r] + lam * M[ns].mean(axis=0)
        M = M2
    out = {}
    for r, vi in enumerate(ids):
        out[vi] = {names[c]: float(M[r, c]) for c in range(len(names)) if M[r, c] > 1e-4}
    return out


# ---- procedural (geometric) weights: a smooth partition of unity over the hand ----
# Every weight is a function of the vertex POSITION only, so the duplicate vertices glTF
# makes along UV seams always get identical weights (no cracks), and each joint's blend
# band is exactly where and how wide we say.
PROC = dict(
    mcp_c=-0.10, mcp_w=0.50,     # finger vs palm: centre / half-width, in units of seg-1 length
    pip_w=0.30, dip_w=0.28,      # half-widths, in units of the shorter neighbouring segment
    t12_w=0.38, t23_w=0.30,      # thumb joints
    thumb_c=0.30, thumb_w=0.32,  # thumb chain vs palm along Thumb1 (units of Thumb1 length)
    lat_tau=0.85,                # lateral softness between digits (x digit radius)
)


def _chain(arm, side, D):
    AW = arm.matrix_world
    P = f"CC_Base_{side}_"
    bones = arm.data.bones
    pts = [AW @ bones[P + f"{D}{s}"].head_local for s in (1, 2, 3)]
    end = bones.get(P + f"{D}3_end")
    pts.append(AW @ (end.head_local if end else bones[P + f"{D}3"].tail_local))
    return [np.array(p) for p in pts]


def _project(p, pts):
    """Arc-length parameter u along the polyline (extrapolated before the first point and
    past the last) and the radial distance to it."""
    L = [np.linalg.norm(pts[i + 1] - pts[i]) for i in range(3)]
    cum = [0.0, L[0], L[0] + L[1], L[0] + L[1] + L[2]]
    best = None
    for i in range(3):
        a, b = pts[i], pts[i + 1]
        ab = b - a
        t = float(np.dot(p - a, ab) / np.dot(ab, ab))
        lo = -10.0 if i == 0 else 0.0
        hi = 10.0 if i == 2 else 1.0
        tc = min(hi, max(lo, t))
        q = a + ab * tc
        d = float(np.linalg.norm(p - q))
        if best is None or d < best[0]:
            best = (d, cum[i] + tc * L[i])
    return best[1], best[0], L, cum


def _sig(u, c, w):
    return float(_smoothstep((u - (c - w)) / (2 * w)))


def proc_weights(arm, side, idx):
    body = _body()
    me = body.data
    mw = body.matrix_world
    P = f"CC_Base_{side}_"
    digits = ("Index", "Mid", "Pinky", "Thumb")
    chains = {D: _chain(arm, side, D) for D in digits}
    # digit radius from the current dominant weights (robust median)
    gidx = {g.index: g.name for g in body.vertex_groups}
    rad = {}
    for D in digits:
        rs = []
        for v in me.vertices:
            if not v.groups:
                continue
            g = max(v.groups, key=lambda gg: gg.weight)
            n = gidx.get(g.group, "")
            if n.startswith(P + D) and not n.endswith("_end"):
                u, r, L, cum = _project(np.array(mw @ v.co), chains[D])
                if 0 < u < cum[3]:
                    rs.append(r)
        rad[D] = float(np.median(rs)) if rs else 0.006
    C = PROC
    W = {}
    for vi in idx:
        p = np.array(mw @ me.vertices[vi].co)
        proj = {D: _project(p, chains[D]) for D in digits}
        # how strongly each digit's chain owns this point (vs the palm), along its length
        own = {}
        for D in ("Index", "Mid", "Pinky"):
            u, r, L, cum = proj[D]
            own[D] = _sig(u, C["mcp_c"] * L[0], C["mcp_w"] * L[0])
        u, r, L, cum = proj["Thumb"]
        own["Thumb"] = _sig(u, C["thumb_c"] * L[0], C["thumb_w"] * L[0])
        # which digit (lateral): softmax on radial distance in units of each digit's radius
        lg = {D: -((proj[D][1] / (rad[D] * C["lat_tau"])) ** 2) for D in digits}
        m = max(lg.values())
        ex = {D: math.exp(lg[D] - m) for D in digits}
        s = sum(ex.values())
        share = {D: ex[D] / s for D in digits}
        g = {D: own[D] * share[D] for D in digits}
        tot = sum(g.values())
        if tot > 1.0:
            g = {D: g[D] / tot for D in digits}
            tot = 1.0
        w = {P + "Hand": 1.0 - tot}
        for D in digits:
            if g[D] <= 1e-5:
                continue
            u, r, L, cum = proj[D]
            if D == "Thumb":
                s1 = _sig(u, cum[1], C["t12_w"] * min(L[0], L[1]))
                s2 = _sig(u, cum[2], C["t23_w"] * min(L[1], L[2]))
            else:
                s1 = _sig(u, cum[1], C["pip_w"] * min(L[0], L[1]))
                s2 = _sig(u, cum[2], C["dip_w"] * min(L[1], L[2]))
            for name, val in ((f"{D}1", 1 - s1), (f"{D}2", s1 - s2), (f"{D}3", s2)):
                if val > 1e-5:
                    w[P + name] = w.get(P + name, 0.0) + g[D] * val
        W[vi] = {n: x for n, x in w.items() if x > 1e-5}
    return W


def reskin_hands(arm, side="R", method="heat", smooth=2, keep_top=4):
    body = _body()
    me = body.data
    names = _hand_names(side)
    groups = {g.name: g for g in body.vertex_groups}
    gidx = {g.index: g.name for g in body.vertex_groups}
    idx = []
    forearm = {}
    for v in me.vertices:
        ws = {gidx[g.group]: g.weight for g in v.groups if g.weight > 0}
        hand_w = sum(ws.get(n, 0) for n in names)
        if hand_w > 1e-4:
            idx.append(v.index)
            forearm[v.index] = {n: w for n, w in ws.items() if n not in names}
    if method == "heat":
        W = heat_weights(arm, side, idx)
        if smooth:
            W = smooth_weights(me, set(idx), W, names, iters=smooth)
    elif method == "proc":
        W = proc_weights(arm, side, idx)
    else:
        raise ValueError(method)
    changed = 0
    for vi in idx:
        other = forearm[vi]
        o_sum = sum(other.values())
        hw = W.get(vi, {})
        h_sum = sum(hw.values())
        if h_sum <= 1e-6:
            continue  # heat found nothing: keep the original weights
        share = max(0.0, 1.0 - o_sum)
        new = {n: w / h_sum * share for n, w in hw.items()}
        new.update(other)
        # keep the strongest `keep_top` influences (glTF / three.js use 4), renormalise
        top = sorted(new.items(), key=lambda kv: -kv[1])[:keep_top]
        s = sum(w for _, w in top)
        for n in set(names) | set(other.keys()):
            if n in groups:
                groups[n].remove([vi])
        for n, w in top:
            if n in groups:
                groups[n].add([vi], w / s, 'REPLACE')
        changed += 1
    return {"side": side, "vertices": len(idx), "changed": changed}
