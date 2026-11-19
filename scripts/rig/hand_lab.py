# Hand lab (Blender 4.2, background). Poses a hand with ANATOMICAL axes measured from the
# bind skeleton and renders it from five views (grey + weight colours), so hand presets
# and skin fixes can be judged fast. Reads the GLB only; never saves.
#   blender -b --factory-startup --python hand_lab.py -- <poses.json> <outdir> [glb] [R|L]
# poses.json: [{"name": "fist",
#               "fingers": {"Index": [mcp, pip, dip, spread], "Mid": [...], "Pinky": [...]},   (degrees)
#               "thumb": {"t1": [ex, ey, ez], "t2": [ex, ey, ez], "t3": [ex, ey, ez]},       (local euler deg, three 'XYZ')
#               "wrist": [ex, ey, ez]}]                                                      (local euler deg)
import bpy, math, sys, os, json
import numpy as np
from mathutils import Vector, Quaternion, Matrix

A = sys.argv[sys.argv.index("--") + 1:]
POSES = json.load(open(A[0]))
OUT = os.path.abspath(A[1])
GLB = A[2] if len(A) > 2 and A[2] != "-" else r"X:\software\cursor work\crystal-portfolio\public\Rigged Characters\rubia.glb"
SIDE = A[3] if len(A) > 3 else "R"
VIEWS_WANTED = A[4].split(",") if len(A) > 4 else ["back34", "palm34", "pinky", "thumb", "front"]
os.makedirs(OUT, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB, bone_heuristic='BLENDER')
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
for o in meshes:
    for m in o.modifiers:
        if m.type == 'ARMATURE':
            m.use_deform_preserve_volume = True
AW = arm.matrix_world
P = f"CC_Base_{SIDE}_"
side = 1 if SIDE == "R" else -1
# optional 6th arg: re-skin the hands first ("heat" | "proc"), to judge a weight fix
RESKIN = A[5] if len(A) > 5 else ""
if RESKIN:
    exec(open(os.path.join(os.path.dirname(os.path.abspath(A[0])), "reskin_hands.py")).read())
    for sd in ("R", "L"):
        print("reskin", reskin_hands(arm, sd, RESKIN))


def bone(n):
    return arm.data.bones[P + n]


def head(n):
    return AW @ bone(n).head_local


def wrot(n):
    return (AW @ bone(n).matrix_local).to_quaternion()


f = (head("Mid1") - head("Hand")).normalized()
k = (head("Index1") - head("Pinky1")).normalized()
dorsal = (f.cross(k) * side).normalized()
k = (dorsal.cross(f) * side).normalized()


def local_axis(n, w):
    return (wrot(n).inverted() @ w).normalized()


AX = {}
for fn in ("Index", "Mid", "Pinky"):
    for s in (1, 2, 3):
        b = bone(f"{fn}{s}")
        d = ((AW @ b.tail_local) - (AW @ b.head_local)).normalized()
        flex_w = dorsal.cross(d).normalized()          # +angle moves the segment toward the palm
        spread_w = (dorsal - d * dorsal.dot(d)).normalized() * side  # + toward the thumb side (both hands)
        AX[f"{fn}{s}"] = (local_axis(f"{fn}{s}", flex_w), local_axis(f"{fn}{s}", spread_w))


# Thumb: anatomical axes per segment, from the bind geometry (mirror-correct per hand).
#   flexT: in the palm plane, toward the palm centre / fingers (about ~dorsal)
#   abdT : out of the palm plane, toward the palm side (palmar)
#   roll : about the segment itself
TAX = {}
for s in (1, 2, 3):
    b = bone(f"Thumb{s}")
    d = ((AW @ b.tail_local) - (AW @ b.head_local)).normalized()
    a = (dorsal - d * dorsal.dot(d)).normalized()
    if a.cross(d).dot(-k) < 0:
        a = -a
    a2 = d.cross(dorsal).normalized()
    if a2.cross(d).dot(-dorsal) < 0:
        a2 = -a2
    TAX[s] = (local_axis(f"Thumb{s}", a), local_axis(f"Thumb{s}", a2), local_axis(f"Thumb{s}", d * side))


def qe(x, y, z):  # three.js Euler XYZ, radians
    return Quaternion((1, 0, 0), x) @ Quaternion((0, 1, 0), y) @ Quaternion((0, 0, 1), z)


def thumb_anat(t):
    """t = {"cmc": [flex, abd, roll], "mcp": [flex, abd], "ip": flex, "phi": deg} (degrees)"""
    phi = math.radians(t.get("phi", 0))
    fl, ab, ro = [math.radians(v) for v in (t.get("cmc", [0, 0, 0]) + [0, 0, 0])[:3]]
    f1, a1, r1 = TAX[1]
    arm.pose.bones[P + "Thumb1"].rotation_quaternion = Quaternion(f1, fl) @ Quaternion(a1, ab) @ Quaternion(r1, ro)
    mf, ma = [math.radians(v) for v in (t.get("mcp", [0, 0]) + [0, 0])[:2]]
    for s, flex, abd in ((2, mf, ma), (3, math.radians(t.get("ip", 0)), 0.0)):
        fs, as_, rs = TAX[s]
        hinge = (fs * math.cos(phi) + as_ * math.sin(phi)).normalized()
        arm.pose.bones[P + f"Thumb{s}"].rotation_quaternion = Quaternion(as_, abd) @ Quaternion(hinge, flex)


def apply(p):
    for pb in arm.pose.bones:
        pb.rotation_mode = 'QUATERNION'
        pb.rotation_quaternion = Quaternion()
    for fn, vals in p.get("fingers", {}).items():
        mcp, pip, dip, spread = [math.radians(v) for v in (vals + [0, 0, 0, 0])[:4]]
        for s, fl in ((1, mcp), (2, pip), (3, dip)):
            pb = arm.pose.bones.get(P + f"{fn}{s}")
            if not pb:
                continue
            flex_l, spread_l = AX[f"{fn}{s}"]
            q = Quaternion(spread_l, spread if s == 1 else 0) @ Quaternion(flex_l, fl)
            pb.rotation_quaternion = q
    for s in (1, 2, 3):
        e = p.get("thumb", {}).get(f"t{s}")
        if e:
            x, y, z = [math.radians(v) for v in e]
            # mirror: the left hand's frame mirrors on Y and Z rotations (as the site's presets do)
            arm.pose.bones[P + f"Thumb{s}"].rotation_quaternion = qe(x, y * side, z * side)
    if p.get("thumbA"):
        thumb_anat(p["thumbA"])
    if p.get("wrist"):
        x, y, z = [math.radians(v) for v in p["wrist"]]
        arm.pose.bones[P + "Hand"].rotation_quaternion = qe(x, y * side, z * side)
    bpy.context.view_layer.update()


# colours: grey, or weight colours (sum of weight x bone colour)
HUE = {"Thumb": (0.95, 0.25, 0.2), "Index": (0.2, 0.85, 0.3), "Mid": (0.25, 0.45, 1.0), "Pinky": (1.0, 0.85, 0.1)}


def bone_col(n):
    if not n.startswith(P):
        return (0.3, 0.3, 0.32)
    s = n[len(P):]
    for fn, c in HUE.items():
        if s.startswith(fn) and len(s) == len(fn) + 1 and s[-1] in "123":
            kk = {1: 0.45, 2: 0.75, 3: 1.0}[int(s[-1])]
            return tuple(min(1.0, x * kk + (0.25 if kk == 1.0 else 0)) for x in c)
    if s == "Hand":
        return (0.85, 0.85, 0.9)
    if "ForearmTwist" in s:
        return (0.5, 0.42, 0.55)
    return (0.3, 0.3, 0.32)


for o in meshes:
    me = o.data
    names = [g.name for g in o.vertex_groups]
    cols = np.zeros((len(me.vertices), 4), dtype=np.float32)
    cols[:, 3] = 1
    for v in me.vertices:
        acc = np.zeros(3)
        tot = 0.0
        for g in v.groups:
            if g.group < len(names) and g.weight > 0:
                acc += np.array(bone_col(names[g.group])) * g.weight
                tot += g.weight
        cols[v.index, :3] = acc / tot if tot > 0 else (0.2, 0.2, 0.2)
    a = me.color_attributes.new(name="W", type='FLOAT_COLOR', domain='POINT')
    a.data.foreach_set("color", cols.ravel())
    me.color_attributes.active_color = a
    me.color_attributes.render_color_index = me.color_attributes.active_color_index

hand_len = (head("Mid1") - head("Hand")).length
centre = head("Hand") + f * hand_len * 0.95
R = hand_len * 2.0
scene = bpy.context.scene
scene.render.engine = 'BLENDER_WORKBENCH'
scene.render.resolution_x = scene.render.resolution_y = 640
sh = scene.display.shading
sh.light = 'STUDIO'
sh.show_cavity = True
sh.cavity_type = 'WORLD'
sh.show_specular_highlight = True
world = bpy.data.worlds.new("W")
scene.world = world
world.color = (0.06, 0.07, 0.08)
cd = bpy.data.cameras.new("C")
cd.type = 'ORTHO'
cd.ortho_scale = R * 1.15
cam = bpy.data.objects.new("C", cd)
scene.collection.objects.link(cam)
scene.camera = cam
palm = -dorsal
VIEWS = {
    "back34": ((dorsal * 0.8 + k * -0.35 + f * 0.25).normalized(), f),
    "palm34": ((palm * 0.8 + k * 0.35 + f * 0.25).normalized(), f),
    "pinky": ((-k + dorsal * 0.15).normalized(), f),
    "thumb": ((k + palm * 0.2).normalized(), f),
    "front": ((f + palm * 0.35).normalized(), dorsal),
}


def aim(direction, up):
    z = direction.normalized()
    x = up.cross(z).normalized()
    y = z.cross(x)
    loc = centre + z * R * 3
    cam.matrix_world = Matrix.Translation(loc) @ Matrix((x, y, z)).transposed().to_4x4()
    cd.clip_start = R * 3 - R * 1.0
    cd.clip_end = R * 3 + R * 1.0


for p in POSES:
    apply(p)
    for vname in VIEWS_WANTED:
        d, up = VIEWS[vname]
        aim(d, up)
        for mode in p.get("modes", ["grey", "weights"]):
            sh.color_type = 'VERTEX' if mode == "weights" else 'SINGLE'
            sh.single_color = (0.78, 0.76, 0.74)
            scene.render.filepath = os.path.join(OUT, f"{p['name']}-{vname}-{mode}.png")
            bpy.ops.render.render(write_still=True)
# report the axes so the site can be checked against them
rep = {k2: {"flex_local": list(map(lambda x: round(x, 4), v[0])), "spread_local": list(map(lambda x: round(x, 4), v[1]))} for k2, v in AX.items()}
json.dump({"side": SIDE, "dorsal": list(dorsal), "axes": rep}, open(os.path.join(OUT, "axes.json"), "w"), indent=1)
print("lab done", OUT)
