// Anatomical posing, hands and the motion library for CC-named humanoid rigs
// (Rubia). Everything is measured from the rig at bind and expressed in the
// body's own frame — "shoulder raised 95°, 25° forward of the side", "knee
// bent 40°", "index curled 70° at the base knuckle" — so motions are keyed the
// way an animator thinks, not as guessed rotations about each bone's local axes.
//
// Root space: every measurement and rotation lives in the skeleton's parent
// object (the armature node), so the scene graph above (scale, centring, the
// set) never matters.
import * as THREE from "three";

export type Side = "L" | "R";
const SIDES: readonly Side[] = ["L", "R"];
const DEG = Math.PI / 180;
const sgnOf = (s: Side) => (s === "R" ? 1 : -1);

/** A pose: named anatomical channels (degrees; root offsets in hip heights). */
export type Channels = Record<string, number>;

type Joint = {
  bone: THREE.Bone;
  /** Bind local rotation, bind root-space rotation, and the parent's (root space). */
  L0: THREE.Quaternion;
  W0: THREE.Quaternion;
  P0: THREE.Quaternion;
  P0i: THREE.Quaternion;
};

type FingerSeg = { j: Joint; flex: THREE.Vector3; spread: THREE.Vector3 };
type ThumbSeg = { j: Joint; flex: THREE.Vector3; abd: THREE.Vector3; roll: THREE.Vector3 };
type HandRig = {
  fingers: Array<{ name: string; segs: FingerSeg[] }>;
  thumb: ThumbSeg[];
};
type ArmRig = {
  clav: Joint | null;
  upper: Joint;
  fore: Joint;
  hand: Joint;
  /** Elbow hinge (forearm local) and its flexion sign. */
  hinge: THREE.Vector3;
  flexSign: number;
  /** Bind → "hanging at the side, elbow bending forward" (root space). */
  neutral: THREE.Quaternion;
  /** Wrist axes at bind (root space): flexion (palm toward the forearm), radial deviation. */
  wristFlex: THREE.Vector3;
  wristDev: THREE.Vector3;
};
type LegRig = { thigh: Joint; calf: Joint; foot: Joint; toe: Joint | null; hinge: THREE.Vector3; flexSign: number };

export type MotionRig = {
  root: THREE.Object3D;
  right: THREE.Vector3;
  up: THREE.Vector3;
  fwd: THREE.Vector3;
  /** Hip height above the feet at bind (root-space units). */
  hipH: number;
  hip: Joint;
  hipPos0: THREE.Vector3;
  spine: Joint[];
  neck: Joint[];
  arms: Record<Side, ArmRig>;
  legs: Record<Side, LegRig>;
  hands: Partial<Record<Side, HandRig>>;
  /** The three toes per foot (big, middle, pinky): curl and spread axes (local). */
  toes: Partial<Record<Side, Array<{ j: Joint; curl: THREE.Vector3; spread: THREE.Vector3; sp: number }>>>;
  /** Every bone this layer writes, for the A-pose (bind) blend. */
  driven: Joint[];
};

// ── scratch ────────────────────────────────────────────────────────────────
const _qa = new THREE.Quaternion();
const _qb = new THREE.Quaternion();
const _qc = new THREE.Quaternion();
const _qd = new THREE.Quaternion();
const _qr = new THREE.Quaternion();
const _qChest = new THREE.Quaternion();
const _qw = new THREE.Quaternion();
const _va = new THREE.Vector3();
const _vb = new THREE.Vector3();
const _vd = new THREE.Vector3();
const _m4 = new THREE.Matrix4();
const _Y = new THREE.Vector3(0, 1, 0);

function rootOf(sk: THREE.Skeleton): THREE.Object3D | null {
  let top: THREE.Object3D = sk.bones[0];
  while (top.parent && (top.parent as THREE.Bone).isBone) top = top.parent;
  return top.parent;
}
/** Root-space rotation / position of an object (call after matrices are current). */
function rsQ(root: THREE.Object3D, o: THREE.Object3D, out: THREE.Quaternion) {
  root.getWorldQuaternion(_qw).invert();
  return o.getWorldQuaternion(out).premultiply(_qw);
}
function rsP(root: THREE.Object3D, o: THREE.Object3D, out: THREE.Vector3) {
  return root.worldToLocal(o.getWorldPosition(out));
}
function joint(root: THREE.Object3D, bone: THREE.Bone): Joint {
  const W0 = rsQ(root, bone, new THREE.Quaternion());
  const L0 = bone.quaternion.clone();
  const P0 = W0.clone().multiply(L0.clone().invert());
  return { bone, L0, W0, P0, P0i: P0.clone().invert() };
}
/** Bone +Y (along the bone) in root space at bind. */
const along = (j: Joint) => _Y.clone().applyQuaternion(j.W0).normalize();
const toLocal = (j: Joint, w: THREE.Vector3) => w.clone().applyQuaternion(j.W0.clone().invert()).normalize();

/** Rotate a joint by a root-space rotation `r` about its own pivot, relative to
 *  its parent's bind frame (so it rides along with whatever the parent does). */
function setRel(j: Joint, r: THREE.Quaternion) {
  j.bone.quaternion.copy(j.P0i).multiply(r).multiply(j.P0).multiply(j.L0);
}
function aa(axis: THREE.Vector3, deg: number, out: THREE.Quaternion) {
  return out.setFromAxisAngle(axis, deg * DEG);
}

// ── Build (at bind) ───────────────────────────────────────────────────────
export function buildMotionRig(primary: THREE.SkinnedMesh): MotionRig | null {
  const sk = primary.skeleton;
  const root = rootOf(sk);
  if (!root) return null;
  const get = (n: string) => sk.getBoneByName(`CC_Base_${n}`) ?? null;
  const need = ["Hip", "Waist", "Spine01", "Spine02", "Head", "L_Upperarm", "R_Upperarm", "L_Forearm", "R_Forearm", "L_Hand", "R_Hand", "L_Thigh", "R_Thigh", "L_Calf", "R_Calf", "L_Foot", "R_Foot"];
  if (need.some((n) => !get(n))) return null;
  const saved = sk.bones.map((b) => [b.position.clone(), b.quaternion.clone(), b.scale.clone()] as const);
  sk.pose();
  root.updateWorldMatrix(true, true);
  const J = (n: string) => {
    const b = get(n);
    return b ? joint(root, b) : null;
  };
  const P = (n: string) => rsP(root, get(n) as THREE.Bone, new THREE.Vector3());

  // The body's frame: right from the shoulders, up from feet to head.
  const feet = P("L_Foot").add(P("R_Foot")).multiplyScalar(0.5);
  const up = P("Head").sub(feet).normalize();
  const right = P("R_Upperarm").sub(P("L_Upperarm"));
  right.addScaledVector(up, -right.dot(up)).normalize();
  const fwd = new THREE.Vector3().crossVectors(up, right).normalize();
  const hipH = P("Hip").sub(feet).dot(up);

  const hip = J("Hip") as Joint;
  const spine = ["Waist", "Spine01", "Spine02"].map(J).filter((x): x is Joint => !!x);
  const neck = ["NeckTwist01", "NeckTwist02", "Head"].map(J).filter((x): x is Joint => !!x);

  const arms = {} as Record<Side, ArmRig>;
  const legs = {} as Record<Side, LegRig>;
  const hands: Partial<Record<Side, HandRig>> = {};
  const toes: MotionRig["toes"] = {};
  for (const side of SIDES) {
    const s = sgnOf(side);
    // ── arm
    const upper = J(`${side}_Upperarm`) as Joint;
    const fore = J(`${side}_Forearm`) as Joint;
    const hand = J(`${side}_Hand`) as Joint;
    const clavBone = upper.bone.parent as THREE.Bone | null;
    const clav = clavBone?.isBone ? joint(root, clavBone) : null;
    // Elbow hinge: the forearm's local Z; flexion is + on the right, − on the left (probed).
    const hinge = new THREE.Vector3(0, 0, 1);
    const flexSign = s;
    // Neutral: the bind arm swung to hang straight down, rolled so the elbow bends forward.
    const sh = P(`${side}_Upperarm`);
    const el = P(`${side}_Forearm`);
    const wr = P(`${side}_Hand`);
    const d0 = el.clone().sub(sh).normalize();
    const u0 = wr.clone().sub(el).normalize();
    const hW = hinge.clone().applyQuaternion(fore.W0).normalize();
    const m0 = new THREE.Vector3().crossVectors(hW, u0).multiplyScalar(flexSign).normalize();
    const down = up.clone().negate();
    const r1 = new THREE.Quaternion().setFromUnitVectors(d0, down);
    const m1 = m0.clone().applyQuaternion(r1);
    m1.addScaledVector(down, -m1.dot(down)).normalize();
    const ang = Math.atan2(new THREE.Vector3().crossVectors(m1, fwd).dot(down), m1.dot(fwd));
    const neutral = new THREE.Quaternion().setFromAxisAngle(down, ang).multiply(r1);
    // Hand frame (for the wrist and the fingers)
    const hf = get(`${side}_Mid1`) ? P(`${side}_Mid1`).sub(wr).normalize() : u0.clone();
    const hasK = !!get(`${side}_Index1`) && !!get(`${side}_Pinky1`);
    const hk = hasK ? P(`${side}_Index1`).sub(P(`${side}_Pinky1`)).normalize() : right.clone().multiplyScalar(-s);
    const dorsal = new THREE.Vector3().crossVectors(hf, hk).multiplyScalar(s).normalize();
    hk.crossVectors(dorsal, hf).multiplyScalar(s).normalize();
    arms[side] = {
      clav,
      upper,
      fore,
      hand,
      hinge,
      flexSign,
      neutral,
      wristFlex: new THREE.Vector3().crossVectors(dorsal, hf).normalize(),
      wristDev: new THREE.Vector3().crossVectors(hf, hk).normalize(),
    };
    // ── leg
    const toeB = get(`${side}_ToeBase`);
    legs[side] = {
      thigh: J(`${side}_Thigh`) as Joint,
      calf: J(`${side}_Calf`) as Joint,
      foot: J(`${side}_Foot`) as Joint,
      toe: toeB ? joint(root, toeB) : null,
      hinge: new THREE.Vector3(1, 0, 0), // knee: local X, flexion −
      flexSign: -1,
    };
    // ── hand: anatomical axes per segment (measured, mirror-correct)
    const fingers: HandRig["fingers"] = [];
    for (const name of ["Index", "Mid", "Ring", "Pinky"]) {
      const segs: FingerSeg[] = [];
      for (let k = 1; k <= 3; k++) {
        const j = J(`${side}_${name}${k}`);
        if (!j) break;
        const d = along(j);
        const flex = new THREE.Vector3().crossVectors(dorsal, d).normalize(); // + toward the palm
        const spread = dorsal.clone().addScaledVector(d, -dorsal.dot(d)).normalize().multiplyScalar(s); // + toward the thumb
        segs.push({ j, flex: toLocal(j, flex), spread: toLocal(j, spread) });
      }
      if (segs.length === 3) fingers.push({ name, segs });
    }
    const thumb: ThumbSeg[] = [];
    for (let k = 1; k <= 3; k++) {
      const j = J(`${side}_Thumb${k}`);
      if (!j) break;
      const d = along(j);
      const a = dorsal.clone().addScaledVector(d, -dorsal.dot(d)).normalize();
      if (_va.crossVectors(a, d).dot(hk) > 0) a.negate(); // + flexes toward the palm centre
      const b = new THREE.Vector3().crossVectors(d, dorsal).normalize();
      if (_va.crossVectors(b, d).dot(dorsal) > 0) b.negate(); // + abducts to the palm side
      thumb.push({ j, flex: toLocal(j, a), abd: toLocal(j, b), roll: toLocal(j, d.clone().multiplyScalar(s)) });
    }
    if (fingers.length && thumb.length === 3) hands[side] = { fingers, thumb };
    // ── toes: curl + bends a toe down (about up × its direction), spread fans
    // the big toe in and the pinky toe out (about the body's up)
    const tl: Array<{ j: Joint; curl: THREE.Vector3; spread: THREE.Vector3; sp: number }> = [];
    for (const [nm, sp] of [["BigToe1", s], ["MidToe1", 0], ["PinkyToe1", -s]] as Array<[string, number]>) {
      const j = J(`${side}_${nm}`);
      if (!j) continue;
      const d = along(j);
      tl.push({ j, curl: toLocal(j, new THREE.Vector3().crossVectors(up, d).normalize()), spread: toLocal(j, up), sp });
    }
    if (tl.length) toes[side] = tl;
  }

  const driven: Joint[] = [hip, ...spine, ...neck];
  for (const side of SIDES) {
    const a = arms[side];
    const l = legs[side];
    if (a.clav) driven.push(a.clav);
    driven.push(a.upper, a.fore, a.hand, l.thigh, l.calf, l.foot);
    if (l.toe) driven.push(l.toe);
    for (const t of toes[side] ?? []) driven.push(t.j);
    const h = hands[side];
    if (h) {
      for (const f of h.fingers) for (const g of f.segs) driven.push(g.j);
      for (const g of h.thumb) driven.push(g.j);
    }
  }
  const hipPos0 = hip.bone.position.clone();
  sk.bones.forEach((b, i) => {
    b.position.copy(saved[i][0]);
    b.quaternion.copy(saved[i][1]);
    b.scale.copy(saved[i][2]);
  });
  root.updateWorldMatrix(true, true);
  return { root, right, up, fwd, hipH, hip, hipPos0, spine, neck, arms, legs, hands, toes, driven };
}

// ── Hands ──────────────────────────────────────────────────────────────────
// Presets in anatomical degrees: per finger [base knuckle, middle knuckle, tip
// knuckle, spread (+ toward the thumb)]; the thumb's base (CMC) flexes across
// the palm, abducts to the palm side and rolls; its middle (MCP) and tip (IP)
// joints bend on a hinge turned `phi` from the palm plane. SOLVED against the
// mesh (Blender hand lab): the fist's fingertips just meet the palm (these
// thick fingers close less than a real hand) and its thumb lies across the
// curled index and middle; the relaxed thumb rests beside the index.
type FingerPose = [number, number, number, number];
type ThumbPose = { cmc: [number, number, number]; mcp: number; ip: number; phi: number };
type HandPose = { fingers: Record<string, FingerPose>; thumb: ThumbPose };
const HP_OPEN: HandPose = {
  fingers: { Index: [3, 3, 2, 6], Mid: [3, 3, 2, 0], Ring: [3, 3, 2, -4], Pinky: [3, 3, 2, -7] },
  thumb: { cmc: [-8, 0, 0], mcp: 0, ip: 4, phi: 0 },
};
const HP_REST: HandPose = {
  fingers: { Index: [20, 30, 13, -1], Mid: [25, 35, 15, 0], Ring: [28, 38, 16, 0], Pinky: [32, 42, 18, 0.5] },
  thumb: { cmc: [10, 9, -12], mcp: 2, ip: 10, phi: 40 },
};
const HP_FIST: HandPose = {
  fingers: { Index: [75.2, 72.0, 34.3, -4], Mid: [76.3, 70.7, 33.7, 0], Ring: [75, 68, 32.5, 2], Pinky: [73.4, 65.9, 31.4, 4] },
  thumb: { cmc: [16.9, 30.0, -25.3], mcp: -4.5, ip: 60.9, phi: 50.8 },
};
/** The greeting hand: open, fingers drawn together, a trace of curl. */
const HP_WAVE: HandPose = {
  fingers: { Index: [6, 10, 5, -3], Mid: [8, 12, 6, 0], Ring: [9, 13, 6, 1.5], Pinky: [10, 15, 7, 3] },
  thumb: { cmc: [6, 10, -12], mcp: 4, ip: 8, phi: 30 },
};
export type HandPresetName = "open" | "rest" | "fist";
/** Grip (0 open · 1 rest · 2 fist) of each Pose-mode preset. */
export const HAND_GRIP: Record<HandPresetName, number> = { open: 0, rest: 1, fist: 2 };

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** A hand value along the grip: a monotone cubic through open (0), rest (1) and
 *  fist (2) — smooth through the rest pose (a straight-line blend changed speed
 *  7× there, so closing fingers visibly snapped as they passed it). */
function gripVal(v0: number, v1: number, v2: number, g: number): number {
  if (g <= 0) return v0;
  if (g >= 2) return v2;
  const d0 = v1 - v0;
  const d1 = v2 - v1;
  const m1 = d0 * d1 > 0 ? (2 * d0 * d1) / (d0 + d1) : 0; // harmonic mean: never overshoots
  const [p0, p1, m0, mE, u] = g <= 1 ? [v0, v1, d0, m1, g] : [v1, v2, m1, d1, g - 1];
  const u2 = u * u;
  const u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * p0 + (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) * p1 + (u3 - u2) * mE;
}

/** Pose one hand: grip per segment (knuckles may lead the tips), toward the
 *  greeting hand by `wave`, plus a little finger life. */
export function applyHand(rig: MotionRig, side: Side, grip: [number, number, number], wave: number, life = 0, t = 0) {
  const h = rig.hands[side];
  if (!h) return;
  h.fingers.forEach((f, fi) => {
    const fo = HP_OPEN.fingers[f.name] ?? HP_OPEN.fingers.Mid;
    const fr = HP_REST.fingers[f.name] ?? HP_REST.fingers.Mid;
    const fx = HP_FIST.fingers[f.name] ?? HP_FIST.fingers.Mid;
    const fw = HP_WAVE.fingers[f.name] ?? HP_WAVE.fingers.Mid;
    f.segs.forEach((g, k) => {
      let flex = lerp(gripVal(fo[k], fr[k], fx[k], grip[k]), fw[k], wave);
      // life: each finger breathes a few degrees, base knuckle first, out of phase
      if (life) flex += life * (3 - k) * 0.9 * Math.sin(t * 1.3 + fi * 1.7 - k * 0.45 + (side === "L" ? 0.8 : 0));
      const spread = k === 0 ? lerp(gripVal(fo[3], fr[3], fx[3], grip[0]), fw[3], wave) : 0;
      g.j.bone.quaternion.copy(g.j.L0).multiply(aa(g.spread, spread, _qa)).multiply(aa(g.flex, flex, _qb));
    });
  });
  const g1 = grip[1];
  const to = HP_OPEN.thumb;
  const tr = HP_REST.thumb;
  const tf = HP_FIST.thumb;
  const tw = HP_WAVE.thumb;
  const mix = (o: number, r: number, f: number, w: number) => lerp(gripVal(o, r, f, g1), w, wave);
  const cf = mix(to.cmc[0], tr.cmc[0], tf.cmc[0], tw.cmc[0]);
  const ca = mix(to.cmc[1], tr.cmc[1], tf.cmc[1], tw.cmc[1]);
  const cr = mix(to.cmc[2], tr.cmc[2], tf.cmc[2], tw.cmc[2]);
  const phi = mix(to.phi, tr.phi, tf.phi, tw.phi) * DEG;
  const [t1, t2, t3] = h.thumb;
  t1.j.bone.quaternion.copy(t1.j.L0).multiply(aa(t1.flex, cf, _qa)).multiply(aa(t1.abd, ca, _qb)).multiply(aa(t1.roll, cr, _qc));
  for (const [seg, deg] of [
    [t2, mix(to.mcp, tr.mcp, tf.mcp, tw.mcp)],
    [t3, mix(to.ip, tr.ip, tf.ip, tw.ip)],
  ] as Array<[ThumbSeg, number]>) {
    _va.copy(seg.flex).multiplyScalar(Math.cos(phi)).addScaledVector(seg.abd, Math.sin(phi)).normalize();
    seg.j.bone.quaternion.copy(seg.j.L0).multiply(aa(_va, deg, _qa));
  }
}

// ── Applying a pose ────────────────────────────────────────────────────────
const SPINE_SHARE = [0.3, 0.35, 0.35];
const NECK_SHARE = [0.3, 0.3, 0.4];
/** The shoulder rhythm: past ~30° of elevation the clavicle carries about a third. */
const rhythm = (elev: number) => Math.min(30, 0.33 * Math.max(0, elev - 30));

function bodyRot(rig: MotionRig, flex: number, side: number, twist: number, out: THREE.Quaternion) {
  // flex + leans the top forward (about −right); side + toward the right (about fwd);
  // twist + turns toward the right (about −up).
  _vd.copy(rig.up).negate();
  out.copy(aa(_vd, twist, _qa));
  out.multiply(aa(rig.fwd, side, _qa));
  _vd.copy(rig.right).negate();
  return out.multiply(aa(_vd, flex, _qa));
}

/** Pose the rig from anatomical channels (absent channels = 0). */
export function applyPose(rig: MotionRig, ch: Channels, t = 0) {
  const c = (k: string) => ch[k] ?? 0;
  const { right, up, fwd } = rig;

  // Root: the hips move in the body frame (in hip heights) and tilt / turn.
  setRel(rig.hip, bodyRot(rig, c("hips.pitch"), c("hips.roll"), c("hips.yaw"), _qr));
  const hp = rig.hip.bone;
  if (hp.parent) {
    _va.set(0, 0, 0)
      .addScaledVector(right, c("hips.x") * rig.hipH)
      .addScaledVector(up, c("hips.y") * rig.hipH)
      .addScaledVector(fwd, c("hips.z") * rig.hipH);
    // root space → the hip's parent space (direction only)
    hp.parent.updateWorldMatrix(true, false);
    _m4.copy(rig.root.matrixWorld).invert().multiply(hp.parent.matrixWorld).invert();
    _vb.set(0, 0, 0).applyMatrix4(_m4);
    _va.applyMatrix4(_m4).sub(_vb);
    hp.position.copy(rig.hipPos0).add(_va);
  }
  // Spine and neck: shared down each chain.
  rig.spine.forEach((j, i) => setRel(j, bodyRot(rig, c("spine.flex") * SPINE_SHARE[i], c("spine.side") * SPINE_SHARE[i], c("spine.twist") * SPINE_SHARE[i], _qr)));
  rig.neck.forEach((j, i) => setRel(j, bodyRot(rig, c("neck.flex") * NECK_SHARE[i], c("neck.side") * NECK_SHARE[i], c("neck.turn") * NECK_SHARE[i], _qr)));

  for (const side of SIDES) {
    const s = sgnOf(side);
    const a = rig.arms[side];
    const elev = THREE.MathUtils.clamp(c(`arm.${side}.elev`), -40, 172);
    // Clavicle: keyed elevation / protraction + the rhythm's share of the raise.
    if (a.clav) {
      _vd.copy(fwd).multiplyScalar(-s);
      _qr.copy(aa(_vd, c(`clav.${side}.elev`) + rhythm(elev), _qa));
      _vd.copy(up).multiplyScalar(s);
      _qr.multiply(aa(_vd, c(`clav.${side}.prot`), _qa));
      setRel(a.clav, _qr);
    }
  }
  // the arms are posed relative to the chest as it is now
  const chest = rig.spine[rig.spine.length - 1];
  chest.bone.updateWorldMatrix(true, true);
  rsQ(rig.root, chest.bone, _qChest).multiply(_qd.copy(chest.W0).invert()); // chest delta since bind

  for (const side of SIDES) {
    const s = sgnOf(side);
    const a = rig.arms[side];
    // Arm direction in the chest's frame: elevation from hanging (0) to overhead,
    // plane 0 = out to the side, 90 = in front; axial rotation + = external.
    const e = THREE.MathUtils.clamp(c(`arm.${side}.elev`), -40, 172) * DEG;
    const p = c(`arm.${side}.plane`) * DEG;
    _va.copy(up).multiplyScalar(-Math.cos(e)).addScaledVector(right, s * Math.sin(e) * Math.cos(p)).addScaledVector(fwd, Math.sin(e) * Math.sin(p)).normalize();
    _vb.copy(up).negate();
    _qr.setFromUnitVectors(_vb, _va); // swing from hanging
    _qr.premultiply(aa(_va, s * c(`arm.${side}.rot`), _qa));
    _qr.multiply(a.neutral).multiply(a.upper.W0); // target root-space rotation (in the chest's bind frame)
    _qr.premultiply(_qChest); // ride with the chest
    const parent = a.upper.bone.parent as THREE.Object3D;
    parent.updateWorldMatrix(true, false);
    rsQ(rig.root, parent, _qb).invert();
    a.upper.bone.quaternion.copy(_qb).multiply(_qr);
    // Elbow on its hinge, then the forearm's roll (pronation + turns the palm toward the body).
    a.fore.bone.quaternion
      .copy(a.fore.L0)
      .multiply(_qa.setFromAxisAngle(a.hinge, a.flexSign * Math.max(0, c(`elbow.${side}`)) * DEG))
      .multiply(_qb.setFromAxisAngle(_Y, -s * c(`pron.${side}`) * DEG));
    // Wrist: flexion (palm toward the forearm) and radial deviation, in the forearm's frame.
    _qr.copy(aa(a.wristDev, c(`wrist.${side}.dev`), _qa)).multiply(aa(a.wristFlex, c(`wrist.${side}.flex`), _qb));
    setRel(a.hand, _qr);
    // ── leg: hip flexion (+ forward), abduction (+ out), rotation (+ toes out)
    const l = rig.legs[side];
    _qr.copy(aa(right, c(`leg.${side}.flex`), _qa));
    _vd.copy(fwd).multiplyScalar(-s);
    _qr.multiply(aa(_vd, c(`leg.${side}.abd`), _qa));
    _vd.copy(up).multiplyScalar(-s);
    _qr.multiply(aa(_vd, c(`leg.${side}.rot`), _qa));
    setRel(l.thigh, _qr);
    l.calf.bone.quaternion.copy(l.calf.L0).multiply(_qa.setFromAxisAngle(l.hinge, l.flexSign * Math.max(0, c(`knee.${side}`)) * DEG));
    // ankle: + toes up (dorsiflexion), inversion + turns the sole inward
    _qr.copy(aa(right, c(`ankle.${side}.flex`), _qa));
    _vd.copy(fwd).multiplyScalar(s);
    _qr.multiply(aa(_vd, c(`ankle.${side}.inv`), _qa));
    setRel(l.foot, _qr);
    if (l.toe) setRel(l.toe, aa(right, c(`toe.${side}`), _qr));
    // toes: curl (+ down) and spread (+ fans out)
    for (const t of rig.toes[side] ?? []) t.j.bone.quaternion.copy(t.j.L0).multiply(aa(t.spread, t.sp * c(`toeSpread.${side}`), _qa)).multiply(aa(t.curl, c(`toes.${side}`), _qb));
    // ── hand
    const g = c(`hand.${side}`);
    const lead = c(`handLead.${side}`); // grip the knuckles lead by (tips follow)
    applyHand(rig, side, [g + lead, g, g - lead], THREE.MathUtils.clamp(c(`wave.${side}`), 0, 1), c("handLife"), t);
  }

  // A-pose: blend every driven bone back to bind.
  const bind = THREE.MathUtils.clamp(c("bind"), 0, 1);
  if (bind > 0) {
    for (const j of rig.driven) j.bone.quaternion.slerp(j.L0, bind);
    hp.position.lerp(rig.hipPos0, bind);
  }
}

// ── Motions ────────────────────────────────────────────────────────────────
// Keys are [seconds, value]; values are anatomical degrees (root offsets in
// hip heights). Between keys: monotone cubic (velocity carries through a key,
// never overshoots — overshoot and settle are KEYED, as an animator would);
// equal neighbours hold still. Channels a motion doesn't key come from STAND.
type Keys = Array<[number, number]>;
export type EyeMode = "ahead" | "viewer" | "lead" | "none";
export type Motion = {
  name: string;
  dur: number;
  /** Loops (Idle, Look around) or plays once and returns to Idle (Wave, Jump). */
  loop: boolean;
  keys: Record<string, Keys>;
  /** Foot contact 0–1 per foot (planted feet are held by IK). Default 1. */
  contact?: Partial<Record<Side, Keys>>;
  eyes: EyeMode;
  /** Breaths per loop (seamless) and depth (degrees of chest lift). */
  breath?: { cycles: number; depth: number };
};

/** The relaxed standing pose every motion starts and ends in. */
export const STAND: Channels = {
  "hips.y": -0.012,
  "hips.pitch": 2,
  "spine.flex": -1.5,
  "neck.flex": 2,
  "clav.L.prot": 2,
  "clav.R.prot": 2,
  "arm.L.elev": 7,
  "arm.R.elev": 7,
  "arm.L.plane": 3,
  "arm.R.plane": 3,
  "arm.L.rot": -8,
  "arm.R.rot": -8,
  "elbow.L": 9,
  "elbow.R": 9,
  "pron.L": 80,
  "pron.R": 80,
  "wrist.L.flex": 5,
  "wrist.R.flex": 5,
  "wrist.L.dev": -6,
  "wrist.R.dev": -6,
  "leg.L.rot": 4,
  "leg.R.rot": 4,
  "knee.L": 4,
  "knee.R": 4,
  "hand.L": 1,
  "hand.R": 1,
  handLife: 1,
};
const S = (k: string) => STAND[k] ?? 0;

// Monotone cubic (Fritsch–Carlson), slopes cached per key list.
const _slopes = new WeakMap<Keys, number[]>();
function slopesOf(keys: Keys): number[] {
  const hit = _slopes.get(keys);
  if (hit) return hit;
  const n = keys.length;
  const d: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const h = keys[i + 1][0] - keys[i][0];
    d.push(h > 0 ? (keys[i + 1][1] - keys[i][1]) / h : 0);
  }
  const m = new Array<number>(n).fill(0);
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    const h = a * a + b * b;
    if (h > 9) {
      const t = 3 / Math.sqrt(h);
      m[i] = t * a * d[i];
      m[i + 1] = t * b * d[i];
    }
  }
  _slopes.set(keys, m);
  return m;
}
export function keyAt(keys: Keys, t: number): number {
  const n = keys.length;
  if (t <= keys[0][0]) return keys[0][1];
  if (t >= keys[n - 1][0]) return keys[n - 1][1];
  const m = slopesOf(keys);
  let i = 1;
  while (i < n && t > keys[i][0]) i++;
  const [t0, v0] = keys[i - 1];
  const [t1, v1] = keys[i];
  const h = t1 - t0;
  if (h <= 0) return v1;
  const u = (t - t0) / h;
  const u2 = u * u;
  const u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * v0 + (u3 - 2 * u2 + u) * h * m[i - 1] + (-2 * u3 + 3 * u2) * v1 + (u3 - u2) * h * m[i];
}

/** Evaluate a motion at time t (seconds since it started) into `out`. */
export function evalMotion(m: Motion, t: number, out: Channels): Channels {
  const tt = m.loop ? ((t % m.dur) + m.dur) % m.dur : Math.min(Math.max(t, 0), m.dur);
  for (const k in out) delete out[k];
  for (const k in STAND) out[k] = STAND[k];
  for (const k in m.keys) out[k] = keyAt(m.keys[k], tt);
  for (const side of SIDES) out[`contact.${side}`] = m.contact?.[side] ? keyAt(m.contact[side] as Keys, tt) : 1;
  if (m.breath) {
    // inhale lifts the chest and the shoulders; the head stays level
    const b = Math.sin((tt / m.dur) * Math.PI * 2 * m.breath.cycles) * m.breath.depth;
    out["spine.flex"] = (out["spine.flex"] ?? 0) - b;
    out["neck.flex"] = (out["neck.flex"] ?? 0) + b * 0.8;
    out["clav.L.elev"] = (out["clav.L.elev"] ?? 0) + b * 0.9;
    out["clav.R.elev"] = (out["clav.R.elev"] ?? 0) + b * 0.9;
  }
  return out;
}
/** Per-channel blend of two evaluated poses (into a). */
export function mixChannels(a: Channels, b: Channels, w: number): Channels {
  for (const k in b) a[k] = lerp(a[k] ?? STAND[k] ?? 0, b[k], w);
  for (const k in a) if (!(k in b)) a[k] = lerp(a[k], STAND[k] ?? 0, w);
  return a;
}

// Key helpers: offsets from STAND (K), absolute values (KA), a prepared key list (KL).
const K = (ch: string, ...pts: Array<[number, number]>): [string, Keys] => [ch, pts.map(([t, v]) => [t, S(ch) + v] as [number, number])];
const KA = (ch: string, ...pts: Array<[number, number]>): [string, Keys] => [ch, pts];
const KL = (ch: string, keys: Keys): [string, Keys] => [ch, keys];
/** Dense samples of a physical curve (the jump's hips) as keys, 60 per second. */
function sampled(f: (t: number) => number, t0: number, t1: number): Keys {
  const n = Math.max(2, Math.round((t1 - t0) * 60));
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = t0 + ((t1 - t0) * i) / n;
    return [t, f(t)] as [number, number];
  });
}
const herm = (p0: number, p1: number, m0: number, m1: number, h: number, u: number) => {
  const u2 = u * u;
  const u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * p0 + (u3 - 2 * u2 + u) * h * m0 + (-2 * u3 + 3 * u2) * p1 + (u3 - u2) * h * m1;
};
/** Merge timed bumps (each a key list starting and ending at 0) into one offset track. */
function bumps(ch: string, list: Keys[], dur: number): [string, Keys] {
  const pts: Keys = [[0, 0]];
  for (const b of [...list].sort((x, y) => x[0][0] - y[0][0])) pts.push(...b);
  pts.push([dur, 0]);
  return K(ch, ...pts);
}

// ── A-pose: the bind pose (the rig's reference) ──
const A_POSE: Motion = {
  name: "A Pose",
  dur: 2,
  loop: true,
  keys: { bind: [[0, 1], [2, 1]], handLife: [[0, 0], [2, 0]] },
  contact: { L: [[0, 0], [2, 0]], R: [[0, 0], [2, 0]] },
  eyes: "none",
};

// ── Idle: standing at ease ──
// Starts and ends centred (so a gesture hands over cleanly), then puts the
// weight properly on one foot and later the other: the hips travel ~3%H over
// the standing foot and the free hip drops; the chest counter-tilts so the
// shoulder line runs against the pelvis; the head stays near level — a
// cascade, hips → pelvis +0.05 s → chest +0.15 s → head +0.25 s. Each arrival
// overshoots a touch and settles. The free heel rises on the ball of the foot.
// The arms drag behind every shift (upper arm, then elbow, then wrist) and
// swing a little past. Each hold has one beat of its own: a glance (eyes
// first), a shoulder adjust, a nod, a hand fidget. Two breaths per loop.
const SHIFTS: Array<[number, number, number]> = [
  [1.0, 2.0, -1], // centre → left foot
  [4.4, 5.6, 1], // left → right
  [8.0, 9.0, -1], // right → centre
];
function dragBumps(side: Side): Array<[string, Keys]> {
  const s = side === "L" ? 1 : -1;
  const elev: Keys[] = [];
  const elbow: Keys[] = [];
  const wrist: Keys[] = [];
  for (const [t0, t1, dir] of SHIFTS) {
    const tm = (t0 + t1) / 2;
    elev.push([[t0, 0], [tm + 0.25, 5 * dir * s], [t1 + 0.35, -1.5 * dir * s], [t1 + 0.75, 0]]);
    elbow.push([[t0 + 0.1, 0], [tm + 0.35, 5], [t1 + 0.6, 0]]);
    wrist.push([[t0 + 0.2, 0], [tm + 0.45, 7], [t1 + 0.8, 0]]);
  }
  return [bumps(`arm.${side}.elev`, elev, 10), bumps(`elbow.${side}`, elbow, 10), bumps(`wrist.${side}.flex`, wrist, 10)];
}
const IDLE: Motion = {
  name: "Idle",
  dur: 10,
  loop: true,
  eyes: "ahead",
  breath: { cycles: 2, depth: 1.6 },
  keys: Object.fromEntries([
    K("hips.x", [0, 0], [1.0, 0], [2.0, -0.075], [2.25, -0.07], [4.4, -0.072], [5.6, 0.075], [5.85, 0.07], [8.0, 0.072], [9.0, -0.004], [9.3, 0], [10, 0]),
    K("hips.y", [0, 0], [1.0, 0], [1.5, -0.008], [2.0, 0], [4.4, 0], [5.0, -0.012], [5.6, 0], [8.0, 0], [8.5, -0.008], [9.0, 0], [10, 0]),
    K("hips.roll", [0, 0], [1.05, 0], [2.1, 5], [4.45, 5], [5.65, -5], [8.05, -5], [9.05, 0], [10, 0]),
    K("hips.yaw", [0, 0], [1.1, 0], [2.2, -3], [4.5, -3], [5.75, 3], [8.1, 3], [9.15, 0], [10, 0]),
    K("spine.side", [0, 0], [1.15, 0], [2.25, -8.6], [2.55, -7.6], [4.55, -7.8], [5.75, 8.6], [6.05, 7.6], [8.15, 7.8], [9.15, 0], [10, 0]),
    K("spine.twist", [0, 0], [1.2, 0], [2.3, 2], [4.6, 2], [5.8, -2], [8.2, -2], [9.2, 0], [10, 0]),
    K("neck.side", [0, 0], [1.25, 0], [2.4, 2.6], [4.65, 2.6], [5.9, -2.6], [8.25, -2.6], [9.3, 0], [10, 0]),
    K("neck.turn", [0, 0], [2.7, 0], [3.0, -12], [3.7, -10], [4.05, 0], [10, 0]),
    K("neck.flex", [0, 0], [6.5, 0], [6.8, 5], [7.4, 4], [7.75, 0], [10, 0]),
    K("clav.L.elev", [0, 0], [3.1, 0], [3.3, 2.2], [3.75, 0], [10, 0]),
    KA("heel.R", [0, 0], [2.1, 0], [2.65, 7], [4.2, 7], [4.6, 0], [10, 0]),
    KA("heel.L", [0, 0], [5.7, 0], [6.25, 7], [7.8, 7], [8.2, 0], [10, 0]),
    ...dragBumps("L"),
    ...dragBumps("R"),
    KA("hand.R", [0, 1], [6.9, 1], [7.1, 1.28], [7.55, 1], [10, 1]),
    KA("handLead.R", [0, 0], [6.9, 0], [7.0, 0.12], [7.2, -0.05], [7.5, 0], [10, 0]),
    KA("hand.L", [0, 1], [3.0, 1.05], [6.0, 0.97], [10, 1]),
    // the standing foot's toes grip as the weight arrives; the free foot's toes
    // lift with its heel; one small toe wiggle in the right-foot hold
    KA("toes.L", [0, 0], [1.6, 0], [2.2, 6], [2.9, 2], [4.4, 2], [5.0, 0], [8.4, 0], [9.0, 3], [9.6, 0], [10, 0]),
    KA("toes.R", [0, 0], [2.2, 0], [2.7, -6], [4.2, -6], [4.6, 0], [5.2, 0], [5.8, 6], [6.5, 2], [7.0, 2], [7.2, -10], [7.45, 1], [7.7, -6], [8.0, 2], [8.6, 0], [10, 0]),
    KA("toeSpread.R", [0, 0], [6.9, 0], [7.2, 8], [7.7, 6], [8.1, 0], [10, 0]),
  ]),
};

// ── Wave: a greeting ──
// Anticipation 0–0.3 s: the head tilts to the viewer, the right shoulder dips,
// the elbow tucks, the weight goes to the left foot (its toes grip). Rise
// 0.2–0.85: the shoulder leads, the elbow trails, the hand drags behind and
// then opens, the arm overshoots a touch and settles — upper arm out near the
// side, forearm upright, palm square to the viewer. The wave is ONE motion: a
// windshield-wiper sweep of the forearm about the elbow, in the picture plane
// (with the upper arm near the side the elbow's hinge faces the viewer), the
// wrist flicking the hand a little further each way just after the forearm
// turns. The forearm's roll and the shoulder hold still, so the palm keeps
// facing the viewer (three things oscillating at once made the hand wobble in
// depth). Varied timing (0.44 / 0.42 / 0.46 s, a hesitation, a slower last
// one), shrinking swings, a small head bob. Then the elbow drops first and the
// forearm swings down inside it, in front of the thigh, the hand relaxing; a
// small swing past and a settle. Eyes on the viewer.
const WAVES: Array<[number, number, number]> = [
  // [period, forearm sweep about the elbow (deg), wrist flick (deg)]
  [0.44, 13, 11],
  [0.42, 12, 10],
  [0.46, 10, 8],
  [0.56, 7, 5],
];
const W0 = 0.9;
const WC = 76; // elbow at the centre of the sweep: forearm upright, leaning a little out from the helmet
const R0 = 84; // shoulder roll that stands the forearm up with the upper arm near the side
const PR = 125; // forearm roll: palm square to the viewer in this arm position (measured)
function waveKeys(): { elbow: Keys; dev: Keys; end: number } {
  const elbow: Keys = [[0, S("elbow.R")], [0.2, S("elbow.R") + 8], [0.5, 48], [0.72, WC + 10], [W0, WC]];
  const dev: Keys = [[0, S("wrist.R.dev")], [W0, 0]];
  let t = W0;
  WAVES.forEach(([P, f, w], i) => {
    if (i === 3) t += 0.1; // a hesitation before the last, slower wave
    // out (elbow opens) then in (elbow closes); the hand flicks the same way 0.06 s later —
    // outward = ulnar (−), inward = radial (+, toward the head: kept smaller)
    elbow.push([t + P * 0.25, WC - f], [t + P * 0.75, WC + f]);
    dev.push([t + P * 0.25 + 0.06, -w], [t + P * 0.75 + 0.06, w * 0.6]);
    t += P;
  });
  elbow.push([t, WC]);
  dev.push([t + 0.06, 0]);
  return { elbow, dev, end: t };
}
const WK = waveKeys();
const WE = WK.end; // ≈ 2.78 s
const WAVE: Motion = {
  name: "Wave",
  dur: WE + 1.0,
  loop: false,
  eyes: "viewer",
  breath: { cycles: 1, depth: 0.8 },
  keys: Object.fromEntries([
    K("hips.x", [0, 0], [0.3, -0.04], [WE + 0.05, -0.04], [WE + 0.6, 0.003], [WE + 1.0, 0]),
    K("hips.roll", [0, 0], [0.35, 2.5], [WE + 0.05, 2.5], [WE + 0.65, 0], [WE + 1.0, 0]),
    K("spine.side", [0, 0], [0.4, -3], [WE + 0.05, -3], [WE + 0.65, 0.4], [WE + 1.0, 0]),
    K("spine.twist", [0, 0], [0.5, 5], [WE + 0.05, 5], [WE + 0.6, 0], [WE + 1.0, 0]),
    K("neck.side", [0, 0], [0.15, 5], [WE + 0.05, 5], [WE + 0.55, -1], [WE + 1.0, 0]),
    K("neck.turn", [0, 0], [0.3, 3], [WE + 0.05, 3], [WE + 0.55, 0], [WE + 1.0, 0]),
    K("neck.flex", [0, 0], [0.3, -3], [0.95, -3], [1.12, -1.5], [1.34, -3], [1.8, -3], [1.97, -1.5], [2.2, -3], [WE + 0.05, -3], [WE + 0.55, 1], [WE + 1.0, 0]),
    K("clav.R.elev", [0, 0], [0.2, -4], [0.45, 0], [WE + 1.0, 0]),
    KA("arm.R.elev", [0, S("arm.R.elev")], [0.2, S("arm.R.elev") - 1], [0.42, 45], [0.62, 84], [0.7, 87], [0.85, 84], [WE, 84], [WE + 0.22, 50], [WE + 0.42, 10], [WE + 0.55, 4], [WE + 0.75, S("arm.R.elev") + 1], [WE + 1.0, S("arm.R.elev")]),
    KA("arm.R.plane", [0, S("arm.R.plane")], [0.3, S("arm.R.plane")], [0.55, 14], [0.8, 16], [WE, 16], [WE + 0.22, 20], [WE + 0.42, 12], [WE + 0.7, S("arm.R.plane")], [WE + 1.0, S("arm.R.plane")]),
    KA("arm.R.rot", [0, S("arm.R.rot")], [0.3, S("arm.R.rot")], [0.5, 40], [0.75, R0 + 4], [0.85, R0], [WE, R0], [WE + 0.22, 45], [WE + 0.42, 5], [WE + 0.7, S("arm.R.rot")], [WE + 1.0, S("arm.R.rot")]),
    KL("elbow.R", [...WK.elbow, [WE + 0.22, 88], [WE + 0.42, 15], [WE + 0.7, S("elbow.R") + 2], [WE + 1.0, S("elbow.R")]]),
    KA("pron.R", [0, S("pron.R")], [0.55, PR - 20], [0.8, PR], [WE, PR], [WE + 0.3, PR - 25], [WE + 0.45, S("pron.R")], [WE + 1.0, S("pron.R")]),
    KL("wrist.R.dev", [...WK.dev, [WE + 0.45, S("wrist.R.dev")], [WE + 1.0, S("wrist.R.dev")]]),
    KA("wrist.R.flex", [0, S("wrist.R.flex")], [0.35, S("wrist.R.flex") + 6], [0.5, 25], [0.72, -12], [0.9, -3], [WE, -3], [WE + 0.27, 12], [WE + 0.5, 2], [WE + 0.75, S("wrist.R.flex")], [WE + 1.0, S("wrist.R.flex")]),
    KA("wave.R", [0, 0], [0.5, 0], [0.8, 1], [WE + 0.02, 1], [WE + 0.32, 0], [WE + 1.0, 0]),
    KA("hand.R", [0, 1], [0.45, 1], [0.8, 0.25], [WE + 0.02, 0.25], [WE + 0.35, 1], [WE + 1.0, 1]),
    KA("handLead.R", [0, 0], [0.5, 0], [0.62, -0.25], [0.8, 0], [WE + 0.05, 0], [WE + 0.2, 0.2], [WE + 0.4, 0], [WE + 1.0, 0]),
    KA("heel.R", [0, 0], [0.4, 0], [0.8, 5], [WE, 5], [WE + 0.4, 0], [WE + 1.0, 0]),
    KA("toes.L", [0, 0], [0.4, 0], [0.7, 5], [WE, 5], [WE + 0.5, 0], [WE + 1.0, 0]),
    K("arm.L.elev", [0, 0], [0.5, 3], [WE + 0.05, 3], [WE + 0.6, -1], [WE + 1.0, 0]),
    K("arm.L.plane", [0, 0], [0.5, -3], [WE + 0.05, -3], [WE + 0.6, 1], [WE + 1.0, 0]),
  ]),
};

// ── Look around: the eyes lead, the head follows, the chest and the pelvis follow the head ──
// Each look is spread down the body (eyes ~20°, neck ~35°, chest ~20°,
// pelvis ~7°) with the lags of a real turn (head +0.07 s, chest +0.15 s,
// pelvis +0.25 s), the head arriving with a small overshoot, the weight going
// to the foot on the looking side, the head dipping as it passes the middle.
// Left, a beat back toward the middle (the eyes jump first), right and up,
// then a smaller look down-left, and home. The arms trail each chest turn.
const LOOK: Motion = {
  name: "Look Around",
  dur: 9,
  loop: true,
  eyes: "lead",
  breath: { cycles: 2, depth: 1.3 },
  keys: Object.fromEntries([
    K("neck.turn", [0, 0], [0.67, 0], [1.12, -37], [1.37, -34], [2.0, -34], [2.3, -30], [2.7, -33], [2.9, -33], [3.4, -8], [3.6, -8], [4.1, 39], [4.35, 35], [5.8, 35], [6.5, -15], [7.6, -15], [8.3, 0], [9, 0]),
    K("neck.flex", [0, 0], [0.67, 0], [0.95, 4], [1.3, -2], [2.0, -2], [2.2, 3], [2.5, 0], [2.9, 0], [3.15, 3], [3.4, 1], [3.6, 1], [3.85, 4], [4.3, -6], [4.8, -10], [5.4, -8], [5.8, -7], [6.15, 2], [6.6, 12], [7.0, 10], [7.3, 13], [7.6, 11], [8.3, 0], [9, 0]),
    K("neck.side", [0, 0], [1.5, 0], [2.0, 5], [2.6, 5], [2.9, 0], [4.4, 0], [4.9, -4], [5.6, -4], [5.9, 0], [6.6, 3], [7.6, 3], [8.2, 0], [9, 0]),
    K("spine.twist", [0, 0], [0.82, 0], [1.3, -21], [1.5, -20], [3.05, -20], [3.55, -5], [3.75, -5], [4.3, 22], [4.5, 21], [5.95, 21], [6.7, -8], [7.75, -8], [8.45, 0], [9, 0]),
    K("hips.yaw", [0, 0], [0.92, 0], [1.45, -7], [3.15, -7], [3.65, -2], [3.85, -2], [4.4, 7], [6.05, 7], [6.8, -2], [7.85, -2], [8.55, 0], [9, 0]),
    K("hips.x", [0, 0], [0.85, 0], [1.5, -0.045], [3.1, -0.045], [3.6, -0.01], [3.85, -0.01], [4.5, 0.045], [6.0, 0.045], [6.8, -0.015], [7.8, -0.015], [8.5, 0], [9, 0]),
    K("hips.roll", [0, 0], [0.9, 0], [1.55, 3], [3.1, 3], [3.65, 0.5], [3.9, 0.5], [4.55, -3], [6.0, -3], [6.85, 1], [7.8, 1], [8.55, 0], [9, 0]),
    K("spine.side", [0, 0], [1.0, 0], [1.65, -4], [3.2, -4], [3.75, -1], [4.0, -1], [4.65, 4], [6.1, 4], [6.95, -1.5], [7.9, -1.5], [8.65, 0], [9, 0]),
    K("arm.R.plane", [0, 0], [0.8, 0], [1.0, 4], [1.5, -2], [1.8, 0], [3.75, 0], [3.95, -4], [4.45, 2], [4.75, 0], [5.95, 0], [6.2, 4], [6.8, -2], [7.1, 0], [7.75, 0], [8.0, -2], [8.6, 0], [9, 0]),
    K("arm.L.plane", [0, 0], [0.8, 0], [1.0, -4], [1.5, 2], [1.8, 0], [3.75, 0], [3.95, 4], [4.45, -2], [4.75, 0], [5.95, 0], [6.2, -4], [6.8, 2], [7.1, 0], [7.75, 0], [8.0, 2], [8.6, 0], [9, 0]),
    K("elbow.R", [0, 0], [0.8, 0], [1.15, 4], [1.7, 0], [3.7, 0], [4.05, 4], [4.6, 0], [5.9, 0], [6.3, 4], [6.9, 0], [9, 0]),
    K("elbow.L", [0, 0], [0.8, 0], [1.15, 4], [1.7, 0], [3.7, 0], [4.05, 4], [4.6, 0], [5.9, 0], [6.3, 4], [6.9, 0], [9, 0]),
    KA("heel.R", [0, 0], [1.4, 0], [1.9, 5], [3.0, 5], [3.4, 0], [9, 0]),
    KA("heel.L", [0, 0], [4.3, 0], [4.8, 5], [5.9, 5], [6.3, 0], [9, 0]),
    // the toes grip on the side the weight goes to
    KA("toes.L", [0, 0], [1.0, 0], [1.6, 5], [3.1, 4], [3.6, 0], [6.8, 0], [7.2, 3], [7.9, 3], [8.4, 0], [9, 0]),
    KA("toes.R", [0, 0], [4.0, 0], [4.6, 5], [6.0, 4], [6.5, 0], [9, 0]),
  ]),
};

// ── Jump: a hop in place ──
// A light hop, not an athletic leap. The hips follow ONE physical curve: an
// eased crouch (0.10–0.38 s), a brief compression hold, a push accelerating to
// take-off (0.60 s, 2.2 hip heights/s), ballistic flight (apex 0.80 s), and a
// touchdown at the same speed into the absorb (1.18 s), then a rise with a small
// overshoot. The torso folds a little (not a crouch-and-stare), the head stays
// level. The feet roll off the balls, heels first; the toes grip before the
// push, point in the air, reach up and spread to catch the floor, and press as
// the weight lands. The arms swing back a little, then forward and up to about
// shoulder height, out front for balance on landing, then down. The two sides
// are not twins: the left arm lags 0.03 s, the left foot 0.01 s.
const JY = { y0: -0.012, yc: -0.11, tc0: 0.1, tc1: 0.38, th: 0.42, toff: 0.6, yoff: 0.03, voff: 2.2, tland: 1.0, ya: -0.12, tab: 1.18, tab1: 1.22, trec: 1.6, tset: 1.85 };
function jumpY(t: number): number {
  const j = JY;
  if (t <= j.tc0) return j.y0;
  if (t <= j.tc1) {
    const u = (t - j.tc0) / (j.tc1 - j.tc0);
    return j.y0 + (j.yc - j.y0) * u * u * (3 - 2 * u);
  }
  if (t <= j.th) return j.yc;
  if (t <= j.toff) return herm(j.yc, j.yoff, 0, j.voff, j.toff - j.th, (t - j.th) / (j.toff - j.th));
  const T = j.tland - j.toff;
  const g = (2 * j.voff) / T;
  if (t <= j.tland) {
    const tau = t - j.toff;
    return j.yoff + j.voff * tau - 0.5 * g * tau * tau;
  }
  if (t <= j.tab) return herm(j.yoff, j.ya, -j.voff, 0, j.tab - j.tland, (t - j.tland) / (j.tab - j.tland));
  if (t <= j.tab1) return j.ya;
  // rise with a small overshoot — never to a straight leg (a planted knee needs a bend to face its way)
  if (t <= j.trec) return herm(j.ya, j.y0 + 0.004, 0, 0, j.trec - j.tab1, (t - j.tab1) / (j.trec - j.tab1));
  if (t <= j.tset) return herm(j.y0 + 0.004, j.y0, 0, 0, j.tset - j.trec, (t - j.trec) / (j.tset - j.trec));
  return j.y0;
}
/** The feet leave the floor when the legs are ~93% straight (a planted leg
 *  pushed further locks out, and its knee direction becomes undefined — the
 *  thigh spun 27° in one frame), and touch down when the falling hips pass the
 *  same height. In between, a foot is lifted by the body's rise above that
 *  point plus a tuck that peaks at the apex and is gone at touchdown (the legs
 *  reach for the floor). */
const Y_REL = -0.025;
const T_REL = (() => {
  for (let t = JY.th; t < JY.toff; t += 0.001) if (jumpY(t) >= Y_REL) return t;
  return JY.toff;
})();
const T_TOUCH = (() => {
  for (let t = JY.tland; t < JY.tab; t += 0.001) if (jumpY(t) <= Y_REL) return t;
  return JY.tland;
})();
function jumpLift(t: number): number {
  if (t <= T_REL || t >= T_TOUCH) return 0;
  const u = Math.min(1, Math.max(0, (t - JY.toff) / (T_TOUCH - JY.toff)));
  return Math.max(0, jumpY(t) - Y_REL) + 0.07 * Math.sin(Math.PI * u);
}
function jumpArm(side: Side): Array<[string, Keys]> {
  const d = side === "L" ? 0.03 : 0;
  const top = side === "L" ? 90 : 98;
  const e = (t: number) => (t > 0.4 && t < 1.7 ? t + d : t);
  return [
    KA(`arm.${side}.elev`, [0, S(`arm.${side}.elev`)], [0.1, S(`arm.${side}.elev`)], [0.38, 30], [e(0.44), 26], [e(0.47), 9], [e(0.53), 40], [e(0.6), 75], [e(0.78), top], [e(0.92), top - 18], [e(1.0), 55], [e(1.15), 38], [e(1.45), 12], [1.8, S(`arm.${side}.elev`)], [2.2, S(`arm.${side}.elev`)]),
    KA(`arm.${side}.plane`, [0, S(`arm.${side}.plane`)], [0.1, S(`arm.${side}.plane`)], [0.38, -50], [e(0.44), -50], [e(0.47), 0], [e(0.53), 70], [e(0.78), 75], [e(1.0), 70], [e(1.15), 65], [e(1.45), 30], [1.8, S(`arm.${side}.plane`)], [2.2, S(`arm.${side}.plane`)]),
    KA(`elbow.${side}`, [0, S(`elbow.${side}`)], [0.38, 20], [e(0.5), 12], [e(0.78), 20], [e(1.0), 25], [e(1.15), 22], [1.8, S(`elbow.${side}`)], [2.2, S(`elbow.${side}`)]),
    KA(`pron.${side}`, [0, S(`pron.${side}`)], [0.38, 80], [e(0.6), 55], [e(1.0), 55], [1.5, S(`pron.${side}`)], [2.2, S(`pron.${side}`)]),
    K(`wrist.${side}.flex`, [0, 0], [0.38, -10], [e(0.5), 14], [e(0.62), -5], [e(0.85), 3], [e(1.0), 0], [e(1.15), 10], [1.45, -3], [1.8, 0], [2.2, 0]),
    KA(`hand.${side}`, [0, 1], [0.3, 1], [e(0.55), 0.55], [e(0.8), 0.35], [e(1.0), 0.6], [1.35, 1.03], [2.2, 1]),
  ];
}
function jumpLeg(side: Side): Array<[string, Keys]> {
  const o = side === "L" ? 0.01 : 0;
  return [
    KL(`lift.${side}`, sampled((t) => jumpLift(t - o), 0, 2.2)),
    // heel-off on the ball (heel first, toes last), toes pointed in the air,
    // ball first at touchdown, the heel down into the absorb
    KA(`heel.${side}`, [0, 0], [0.44 + o, 0], [0.56 + o, 24], [0.6 + o, 28], [0.8 + o, 20], [T_TOUCH - 0.03 + o, 12], [T_TOUCH + 0.01 + o, 12], [T_TOUCH + 0.07 + o, 0], [2.2, 0]),
    KA(`toes.${side}`, [0, 0], [0.3, 0], [0.42 + o, 6], [0.55 + o, 0], [0.72 + o, 15], [0.92 + o, -8], [T_TOUCH + o, -6], [T_TOUCH + 0.08 + o, 4], [1.45, 0], [2.2, 0]),
    KA(`toeSpread.${side}`, [0, 0], [0.8 + o, 0], [0.95 + o, 8], [T_TOUCH + 0.1 + o, 5], [1.5, 0], [2.2, 0]),
  ];
}
const JUMP: Motion = {
  name: "Jump",
  dur: 2.2,
  loop: false,
  eyes: "ahead",
  breath: { cycles: 1, depth: 1.1 },
  keys: Object.fromEntries([
    KL("hips.y", sampled(jumpY, 0, 2.2)),
    K("hips.z", [0, 0], [0.1, 0], [0.38, -0.03], [0.42, -0.03], [0.6, 0.01], [0.9, 0], [1.0, 0], [1.18, -0.035], [1.6, 0], [2.2, 0]),
    K("hips.pitch", [0, 0], [0.1, 0], [0.38, 14], [0.42, 14], [0.6, -3], [0.85, 3], [0.98, 6], [1.18, 16], [1.22, 16], [1.6, -1], [1.85, 0], [2.2, 0]),
    K("spine.flex", [0, 0], [0.1, 0], [0.38, 12], [0.42, 12], [0.6, -6], [0.85, 2], [0.98, 5], [1.18, 14], [1.22, 14], [1.55, -2], [1.85, 0.4], [2.2, 0]),
    K("neck.flex", [0, 0], [0.1, 0], [0.38, -18], [0.42, -18], [0.6, 6], [0.85, 0], [0.98, -4], [1.18, -22], [1.24, -16], [1.3, -20], [1.6, 1], [1.85, 0], [2.2, 0]),
    K("spine.side", [0, 0], [0.65, 0], [0.8, 2], [0.98, 0], [2.2, 0]),
    K("neck.side", [0, 0], [0.7, 0], [0.82, 2.5], [1.0, 0], [2.2, 0]),
    ...jumpArm("R"),
    ...jumpArm("L"),
    ...jumpLeg("R"),
    ...jumpLeg("L"),
  ]),
};

/** The motion set, in menu order (the label sorts Idle first, A-pose last). */
export const MOTIONS: Motion[] = [A_POSE, IDLE, WAVE, LOOK, JUMP];
