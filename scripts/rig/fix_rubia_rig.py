# Rubia rig fix (Blender 4.2, background). Reads the shipped GLB, fixes the skin
# weights, and exports a NEW GLB to the path given (never the project file).
#   blender -b --factory-startup --python scripts/rig/fix_rubia_rig.py -- <out.glb> [report.json] [in.glb]
# (Blender 4.2. Write <out.glb> OUTSIDE public/, compare it with glb-compare.mjs, then replace the shipped file.)
# Bones are untouched (same names, same rest frames), so the site's measured
# axes stay valid. What changes (each measured in the audit, see the review doc):
#   hands      — geometric finger / thumb / palm weights (smooth knuckle bands)
#   shoulder   — the shoulder gem rides the blend of the skin under it
#   knee/elbow — wider bending bands on the bare-skin side of each hinge; the
#                skin under the greave / bracer stays rigid like the armour
#   jaw        — skin hidden under the face mask follows the head, like the mask
import bpy, sys, os, json, math
import numpy as np
from mathutils import Vector
from mathutils.kdtree import KDTree

A = sys.argv[sys.argv.index("--") + 1:]
OUT = os.path.abspath(A[0])
REPORT = os.path.abspath(A[1]) if len(A) > 1 else OUT + ".json"
HERE = os.path.dirname(os.path.abspath(__file__))
GLB = os.path.abspath(A[2]) if len(A) > 2 else os.path.join(HERE, "..", "..", "public", "Rigged Characters", "rubia.glb")
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB, bone_heuristic='BLENDER')
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
AW = arm.matrix_world
body = bpy.data.objects["mesh_004"]
rep = {}


def head(name):
    return AW @ arm.data.bones[name].head_local


def weights_of(obj):
    names = {g.index: g.name for g in obj.vertex_groups}
    return [{names[g.group]: g.weight for g in v.groups if g.weight > 1e-5 and g.group in names} for v in obj.data.vertices]


def set_weights(obj, vi, new, keep_top=4):
    groups = {g.name: g for g in obj.vertex_groups}
    for g in obj.vertex_groups:
        g.remove([vi])
    top = sorted(new.items(), key=lambda kv: -kv[1])[:keep_top]
    s = sum(w for _, w in top)
    for n, w in top:
        if n not in groups:
            groups[n] = obj.vertex_groups.new(name=n)
        groups[n].add([vi], w / s, 'REPLACE')


def smoothstep(x):
    x = min(1.0, max(0.0, x))
    return x * x * (3 - 2 * x)


# body height (for distances)
feet = (head("CC_Base_L_Foot") + head("CC_Base_R_Foot")) / 2
H = (head("CC_Base_Head") - feet).length * 1.25  # head bone sits below the crown
rep["H"] = H

# ── 1. hands ──
exec(open(os.path.join(HERE, "reskin_hands.py")).read())
rep["hands"] = [reskin_hands(arm, s, "proc") for s in ("R", "L")]

# ── 2. shoulder gem: one rigid blend = the average of the skin under it ──
gem = bpy.data.objects.get("ShoulderRuby")
if gem:
    bw = weights_of(body)
    kd = KDTree(len(body.data.vertices))
    for v in body.data.vertices:
        kd.insert(body.matrix_world @ v.co, v.index)
    kd.balance()
    acc = {}
    for v in gem.data.vertices:
        for (co, idx, d) in kd.find_n(gem.matrix_world @ v.co, 8):
            for n, w in bw[idx].items():
                acc[n] = acc.get(n, 0.0) + w
    top = dict(sorted(acc.items(), key=lambda kv: -kv[1])[:4])
    s = sum(top.values())
    blend = {n: w / s for n, w in top.items()}
    for v in gem.data.vertices:
        set_weights(gem, v.index, blend)
    rep["shoulder_gem"] = {n: round(w, 3) for n, w in blend.items()}


# ── 3. knee / elbow bands ──
def widen(side, upper_seg, lower_seg, upper_tw, lower_tw, armour_names, c=-0.06, h=0.14):
    """Re-split upper_tw ↔ lower_tw by a smoothstep along the upper segment's axis:
    centre `c`, half-width `h` (fractions of the upper segment's length) — on the
    bare skin. Skin under the armour (beyond the joint) goes fully to lower_tw, like
    the armour itself. Other bones' shares are kept."""
    P = f"CC_Base_{side}_"
    a = head(P + upper_seg)
    j = head(P + lower_seg)
    L = (j - a).length
    axis = (j - a).normalized()
    pts = []
    for nm in armour_names:
        o = bpy.data.objects.get(nm)
        if o:
            pts += [o.matrix_world @ v.co for v in o.data.vertices]
    kd = None
    if pts:
        kd = KDTree(len(pts))
        for i, p in enumerate(pts):
            kd.insert(p, i)
        kd.balance()
    bw = weights_of(body)
    up, lo = P + upper_tw, P + lower_tw
    n_band = n_cov = 0
    for v in body.data.vertices:
        w = bw[v.index]
        pair = w.get(up, 0) + w.get(lo, 0)
        if pair < 0.9:
            continue
        p = body.matrix_world @ v.co
        u = (p - j).dot(axis) / L
        if u < -0.32 or u > 0.3:
            continue
        covered = False
        if kd and u > -0.03:
            co, idx, d = kd.find(p)
            covered = d < 0.02 * H
        if covered:
            f = 1.0
            n_cov += 1
        else:
            f = smoothstep((u - (c - h)) / (2 * h))
            n_band += 1
        new = {k2: x for k2, x in w.items() if k2 not in (up, lo)}
        if pair * (1 - f) > 1e-4:
            new[up] = pair * (1 - f)
        if pair * f > 1e-4:
            new[lo] = pair * f
        set_weights(body, v.index, new)
    return {"band": n_band, "under_armour": n_cov}


rep["knee"] = {s: widen(s, "Thigh", "Calf", "ThighTwist02", "CalfTwist01", [f"Retopo_Leg_Brace_{s}"] + (["LegRuby"] if s == "R" else [])) for s in ("L", "R")}
rep["elbow"] = {s: widen(s, "Upperarm", "Forearm", "UpperarmTwist02", "ForearmTwist01", [f"Retopo_Arm_Brace_{s}"] + (["ArmRuby1", "ArmRuby2"] if s == "R" else []), c=-0.08, h=0.15) for s in ("L", "R")}

# ── 4. jaw skin under the face mask follows the head ──
mask = bpy.data.objects.get("Baked_retopo_helmet")
if mask:
    mesh = mask.data
    mesh.calc_loop_triangles()
    kd = KDTree(len(mesh.vertices))
    nrm = []
    for v in mesh.vertices:
        kd.insert(mask.matrix_world @ v.co, v.index)
        nrm.append((mask.matrix_world.to_3x3() @ v.normal).normalized())
    kd.balance()
    bw = weights_of(body)
    headN = "CC_Base_Head"
    neckish = ("CC_Base_NeckTwist01", "CC_Base_NeckTwist02")
    covered = []
    for v in body.data.vertices:
        w = bw[v.index]
        if not any(n in w for n in neckish):
            continue
        p = body.matrix_world @ v.co
        co, idx, d = kd.find(p)
        if d < 0.025 * H and (p - co).dot(nrm[idx]) < 0:
            covered.append(v.index)
    cov = set(covered)
    for vi in covered:
        set_weights(body, vi, {headN: 1.0})
    # soften the edge: uncovered neck skin close to the covered set leans to the head
    kd2 = KDTree(len(covered)) if covered else None
    if kd2:
        for i, vi in enumerate(covered):
            kd2.insert(body.matrix_world @ body.data.vertices[vi].co, i)
        kd2.balance()
        n_edge = 0
        for v in body.data.vertices:
            if v.index in cov:
                continue
            w = bw[v.index]
            if not any(n in w for n in neckish):
                continue
            co, idx, d = kd2.find(body.matrix_world @ v.co)
            R = 0.02 * H
            if d < R:
                t = 1 - smoothstep(d / R)
                new = {n: x * (1 - t) for n, x in w.items()}
                new[headN] = new.get(headN, 0) + t
                set_weights(body, v.index, new)
                n_edge += 1
        rep["jaw"] = {"covered": len(covered), "edge": n_edge}

# ── 5. eyes: pivot at each eyeball's centre ──
# The eye bones sat on the FRONT of the eyeballs (14.7 mm, 0.64 of the eyeball's
# radius, from the centre), so every glance swung the eyeball sideways — the
# eyes slid inside the goggles. The eyeballs are 100% on their bones; moving
# each bone (head, tail and its _end, direction and roll kept) puts the pivot
# where the eye turns.
def edit_bones():
    bpy.ops.object.select_all(action='DESELECT')
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='EDIT')
    return arm.data.edit_bones


bw = weights_of(body)
inv = arm.matrix_world.inverted()
eye_c = {}
for side in ("L", "R"):
    n = f"CC_Base_{side}_Eye"
    pts = [body.matrix_world @ v.co for v in body.data.vertices if bw[v.index].get(n, 0) > 0.99]
    if pts:
        eye_c[side] = inv @ (sum(pts, Vector()) / len(pts))
eb = edit_bones()
rep["eyes"] = {}
for side, c in eye_c.items():
    n = f"CC_Base_{side}_Eye"
    b = eb[n]
    d = c - b.head
    b.head += d
    b.tail += d
    e = eb.get(n + "_end")
    if e:
        e.head += d
        e.tail += d
    rep["eyes"][side] = round(d.length, 5)
bpy.ops.object.mode_set(mode='OBJECT')

# ── 6. toes: bones on the three mesh toes, each toe bound to its bone ──
# The mesh has three long cartoon toes per foot; the rig's five 1 cm toe bones
# sat at the ball like a human foot's and carried no weight, so the toes could
# not move. BigToe1 / MidToe1 / PinkyToe1 go root → tip along the inner,
# middle and outer toe; each toe's skin blends onto its bone over a band at
# its root (the rest keeps its foot / ball weights). Index / Ring stay unused.
def rig_toes(side):
    P = f"CC_Base_{side}_"
    s = 1 if side == "R" else -1
    foot = AW @ arm.data.bones[P + "Foot"].head_local
    ball = AW @ arm.data.bones[P + "ToeBase"].head_local
    up = Vector((0, 0, 1))
    fwd = ball - foot
    fwd.z = 0
    fwd.normalize()
    lat = fwd.cross(up).normalized()  # + = the character's right
    medial = -lat * s
    bw = weights_of(body)
    pts = []
    for v in body.data.vertices:
        w = bw[v.index]
        if w.get(P + "ToeBase", 0) + w.get(P + "Foot", 0) > 0.5:
            p = body.matrix_world @ v.co
            pts.append((v.index, p, (p - ball).dot(fwd), (p - ball).dot(lat)))
    # where the toes separate: the first forward slice whose lateral runs split in three
    fmax = max(q[2] for q in pts)

    def gaps(f0):
        xs = np.sort([q[3] for q in pts if f0 <= q[2] < f0 + 0.004])
        return int((np.diff(xs) > 0.0035).sum()) if len(xs) >= 6 else 0

    # the split must hold for three slices running (a sparse slice near the ball can look split)
    split = None
    for f0 in np.linspace(0.005, fmax * 0.7, 60):
        if gaps(f0) >= 2 and gaps(f0 + 0.003) >= 2 and gaps(f0 + 0.006) >= 2:
            split = float(f0)
            break
    if split is None:
        return {"error": "no toes found"}
    # lateral runs a little past the split = the toe columns
    xs = np.sort([q[3] for q in pts if split + 0.004 <= q[2] < split + 0.012])
    cuts = np.where(np.diff(xs) > 0.0035)[0]
    bounds = np.split(xs, cuts + 1)
    # medial first (the medial direction is -lat*s, so a column's medial-ness is -c*s)
    cols = sorted([float(np.mean(b)) for b in bounds if len(b) > 3], key=lambda c: c * s)
    if len(cols) < 3:
        return {"error": f"{len(cols)} toe columns"}
    toes = []
    for ci, c in enumerate(cols[:3]):
        members = [q for q in pts if q[2] > split and abs(q[3] - c) < 0.012 and min(range(len(cols)), key=lambda k: abs(q[3] - cols[k])) == ci]
        Pm = np.array([list(q[1]) for q in members])
        cen = Pm.mean(0)
        u, sv, vt = np.linalg.svd(Pm - cen, full_matrices=False)
        ax = Vector(vt[0])
        if ax.dot(fwd) < 0:
            ax = -ax
        tvals = (Pm - cen) @ np.array(ax)
        root_f = split - 0.004
        # point on the toe's axis at the root slice
        k = (root_f - (Vector(cen) - ball).dot(fwd)) / max(ax.dot(fwd), 1e-6)
        root = Vector(cen) + ax * k
        tip = Vector(cen) + ax * float(tvals.max())
        toes.append({"col": c, "root": root, "tip": tip, "axis": ax, "members": set(q[0] for q in members)})
    names = [P + "BigToe1", P + "MidToe1", P + "PinkyToe1"]
    eb = edit_bones()
    for nm, t in zip(names, toes):
        b = eb[nm]
        b.head = inv @ t["root"]
        b.tail = inv @ t["tip"]
        b.align_roll((inv.to_3x3() @ up).normalized())
        e = eb.get(nm + "_end")
        if e:
            e.head = b.tail
            e.tail = b.tail + (b.tail - b.head) * 0.3
    bpy.ops.object.mode_set(mode='OBJECT')
    # weights: each toe vertex blends onto its toe bone across a band at the root
    h = 0.005
    n_set = 0
    bw = weights_of(body)
    for vi, p, f, l in pts:
        if f < split - 0.012:
            continue
        # which toe: nearest column (soft between the two nearest in the web)
        d = sorted(((abs(l - t["col"]), i) for i, t in enumerate(toes)))
        (d0, i0), (d1, i1) = d[0], d[1]
        share = {i0: 1.0}
        if f < split + 0.006 and d1 - d0 < 0.008:
            a = smoothstep((d1 - d0) / 0.008) * 0.5 + 0.5
            share = {i0: a, i1: 1 - a}
        new = dict(bw[vi])
        tot_toe = 0.0
        add = {}
        for i, m in share.items():
            t = toes[i]
            along = (p - t["root"]).dot(t["axis"])
            w = smoothstep((along + h) / (2 * h)) * m
            if w > 1e-4:
                add[names[i]] = w
                tot_toe += w
        if tot_toe <= 1e-4:
            continue
        tot_toe = min(1.0, tot_toe)
        new = {k: x * (1 - tot_toe) for k, x in new.items()}
        for k, w in add.items():
            new[k] = new.get(k, 0) + w
        set_weights(body, vi, new)
        n_set += 1
    return {"split": round(split, 4), "toes": [{"bone": nm.replace("CC_Base_", ""), "len": round((t["tip"] - t["root"]).length, 4)} for nm, t in zip(names, toes)], "verts": n_set}


rep["toes"] = {s: rig_toes(s) for s in ("L", "R")}

# ── export ──
for o in bpy.data.objects:
    o.select_set(True)
bpy.ops.export_scene.gltf(
    filepath=OUT,
    export_format='GLB',
    export_draco_mesh_compression_enable=True,
    export_image_format='AUTO',
    export_animations=False,
    export_skins=True,
    export_all_influences=False,
    export_def_bones=False,
    export_apply=False,
    export_yup=True,
    export_tangents=False,
    export_materials='EXPORT',
)
json.dump(rep, open(REPORT, "w"), indent=1)
print("fixed ->", OUT, json.dumps(rep))
