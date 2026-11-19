# Rubia — rig, posing and animation review

Measured on the live viewer (headless Edge, software WebGL, `?debug` hooks: `window.__rig`,
`__pose.drive`, `__clipAt`, `__orbit`, `__twistOff`, `__lbs`). Each item: what was wrong,
the evidence, the fix, and what the re-check measured after the fix (2026-11-17).

## A. Skin deformation (the "shoulder stretches" problem)

| # | Problem | Evidence | Fix | After |
|---|---|---|---|---|
| A1 | Raised arms collapse into a thin web at the shoulder | Owner's screenshot; Wave hold. Shoulder skin is split Spine02 ≈ 90 / UpperarmTwist01 ≈ 188 / Clavicle ≈ 45 (body mesh, symmetric). Linear blend skinning averages a still torso and a raised arm, which pulls the shared skin toward the joint. | Dual-quaternion skinning (blends rotations, keeps volume), plus A3. | **Fixed.** DQS engaged on 16/16 skinned meshes and their shadow materials (bone scale uniform to 0.1 %, so it is exact). The owner's raised-arm pose keeps a full, rounded deltoid; A/B against linear blending (`__lbs`) differs exactly at the shoulder. |
| A2 | Elbows and knees pinch when bent | Elbow ForearmTwist01 157 / UpperarmTwist02 79, knee CalfTwist01 200 / ThighTwist02 154. The corrective ShareBones carry zero weight. | Dual-quaternion skinning; flex limits from measured limb thickness (C5). | **Fixed.** Bent elbow and knee keep their volume; full flex stops before the bracer meets the upper arm. |
| A3 | Clavicles never move: no motion or pose lifts the shoulder | Clavicles absent from every clip and from the poser. | Shoulder rhythm: past ~35° of arm elevation the clavicle takes ~⅓ of the raise; the arm keeps its direction. | **Fixed.** Clavicle lift `min(0.5, 0.33·(elevation − 0.6))` rad, in clips (arm counter-rotated, so the hand lands where keyed) and in Pose (arm re-solved after the lift). |

## B. Hands

The hands have three fingers and a thumb (Index, Mid, Pinky — no Ring bones). Curl is local Z
(mirrored: right +, left −), spread is local X (+ toward the thumb on both sides); the hand
bone's Z and the fingers' Z agree (a +Z turn moves the fingertip the same way, 0.97).

| # | Problem | Evidence | Fix | After |
|---|---|---|---|---|
| B1 | Fist folds the fingers into each other | Fist: 0.85+1.15+0.9 = 2.9 rad (166°) per finger on thick cartoon segments; frames show merged segments. | Anatomical per-segment flex, fingers drawn together; thumb rests on them. | **Fixed.** 0.85 / 0.9 / 0.55 rad (2.3 rad) with a cascade; compact fist, no merged segments. |
| B2 | Rest hand reads as a claw / mitten | Same curl on every finger. | Cascade: index least, pinky most; slight fan. | **Fixed.** Rest curl 0.2 / 0.3 / 0.22 × (index 0.8 … pinky 1.25). |
| B3 | Open hand bends fingers backwards | Open = −0.22 × flex (hyperextension). | Straight with a natural slight curl and a fan. | **Fixed.** 0.06 / 0.06 / 0.04 rad, no hyperextension. |
| B4 | Waving hand is the flat, splayed bind hand | Wave masks out the whole right-arm stance, finger curl included. | Relaxed curl during the wave; fingers drawn together; follow-through. | **Fixed.** 45 % of the relaxed curl; index −0.06 / pinky +0.09 rad toward the middle finger; the fingers trail the wrist's flick (wrist −0.25…+0.18 rad per 0.48 s cycle, middle knuckle ±0.065 rad ≈ 0.05 s later, the next segment later still). The hand clears the helmet by 5.0 % of body height at its nearest. |
| B5 | Idle fingers: only the base knuckle moves | ±0.05 rad on segment 1 only. | Segments 2–3 follow with a lag. | **Fixed.** 0.05 / 0.035 / 0.022 rad, each segment 0.45 rad later; fingers and hands out of phase. |

## C. Clipping

| # | Problem | Evidence | Fix | After |
|---|---|---|---|---|
| C1 | A hand can be dragged inside the body | Hand into chest. | Body proxies (torso capsule, pelvis and helmet spheres, thighs, arms) measured from the skinned vertices at bind; hand targets are pushed out. | **Fixed.** Dragged into the chest, the hand stops on the surface. |
| C2 | Arms pass through the torso / thighs | Crouch + lean: hanging forearm and bracer inside the thigh. | Arms re-solved each frame; an elbow or forearm that would enter a proxy rolls away. | **Fixed.** Arm across the body stays in front; in the crouch-lean the forearm hangs in front of the thigh. |
| C3 | Helmet buries itself in the chest | Look down: head pitched ~90°. | Separate yaw / pitch limits sized to the helmet. | **Fixed.** Yaw ±1.0, up 0.5, down 0.3 rad; the helmet stays clear of the chest. |
| C4 | Feet go under the floor and through each other | Foot below floor; foot crossed into the other boot. | Floor clamp; minimum foot separation. | **Fixed.** Feet stay on the floor and ≥ 0.7 × their rest separation apart. |
| C5 | Bracer folds into the upper arm, boot into the thigh | Elbow fully bent. | Elbow / knee flex limits from measured limb + armour thickness. | **Fixed.** Max flex `asin(min(0.95, thickness / (0.55 × far segment)))` per limb. |
| C6 | Deep lean folds the torso toward the thighs | Crouch + forward lean. | Lean limits per direction. | **Fixed.** Forward 0.45, back 0.25, side 0.4 rad. |

## D. Animation

| # | Problem | Evidence | Fix | After |
|---|---|---|---|---|
| D1 | Feet slide during the idle | 1.09–1.19 % of body height (hip sway rotates the legs). | Foot IK lock in every clip; weight shift by moving the hips, not rotating the legs. | **Fixed.** 0.032 % of body height. |
| D2 | Jump: feet slide and sink through the floor while grounded | Toes slide 16 cm forward and sink 8 cm below the floor during the crouch and landing. | Contact-weighted foot IK (planted on the ground, free in the air). | **Fixed.** Feet held on their marks through the crouch and the landing; the leg tuck takes over in the air. |
| D3 | Keyframed motion stops at every key | Per-segment smoothstep (zero velocity at each key). | Monotone cubic interpolation (continuous velocity, holds preserved). | **Fixed.** |
| D4 | Arm raises in Wave / Jump have no shoulder motion | — | Shoulder rhythm (A3) applies to clips too. | **Fixed.** The Wave's shoulder lifts with the raise. |
| D5 | The eyes never move | Eye bones carry the eyes' skin (≈ 560 weight each) but nothing drives them. | Saccades in the idle; eyes lead the head in Look around; on the viewer in Wave; on the gaze ring in Pose. | **Fixed.** Idle fixations shift 0.22 rad every 2.3 s; in the Wave the eyes find the camera (0.03 rad off it when in range, a full 0.42 rad turn toward it otherwise). |
| D6 | The head sways with the body in the idle | — | Head counter-sway (gaze stays level). | **Fixed.** Across the idle the chest rolls 0.064 rad, the head 0.012. |
| D7 | Breathing moves only the chest | — | Shoulders rise slightly on the inhale. | **Fixed.** The clavicles rise and fall with the breath (two breaths per 8 s loop). |

## E. Found during the re-check

| # | Problem | Evidence | Fix | After |
|---|---|---|---|---|
| E1 | The right eye looked at the wrong point (idle, Look around) | The gaze target was a scratch vector the eye loop reuses, so the second eye aimed at the first eye's direction. | Copy the target before the loop. | **Fixed.** |
| E2 | The resting gaze converged on a point ~1 body height away (slightly cross-eyed) | Eyes 0.12 rad apart. The distance was measured in world units before the model joins its scaled group. | Measure in the hips' parent space (like the foot pins); scale at use. | **Fixed.** Eyes 0.038 rad apart — a point ~3 body heights ahead. |
| E3 | Set photographs are under-lit, so the scene brightens when the live 3D takes over | The set light eases up per rendered frame; the shoot captures after 3.5 s, and software WebGL draws only a few frames by then. Floor luminance in the current photos is 71 % (Rubia) to 81–88 % (asset pack) of the settled live light, and two shots of the same set differed by 8.5 / 255. | `?still=1` keeps the set at full light from the first frame. | **Tool fixed**: two shots now read identically (floor 38.3 / 38.3, mean difference 1.06 / 255 from the idle motion). The photographs themselves are re-shot to the scratchpad; replacing the ones in `public/images/set/` waits for the owner's OK. |

## Round 3 — hands, skin weights, motions rebuilt (2026-11-19)

The owner: "hand bones still fucked, the skeleton rigging needs work, and all the animations need
a complete quality overhaul". Measured in Blender 4.2 on the GLB (dual-quaternion skinning, the
GLB's own bone frames — `bone_heuristic='BLENDER'` keeps them exactly) and on the live site
(headless Edge on the GPU, `__clipAt`), plus an independent audit and an adversarial re-check.
%H = percent of body height.

### F. Hands

| # | Problem | Evidence | Fix | After |
|---|---|---|---|---|
| F1 | Bending a finger tears the skin: spikes on the back of every middle knuckle | Weight profiles along each finger: the tip knuckle switches 100% → 100% between neighbouring vertices (no blend at all); the middle knuckle's blend sits ~3 mm before the joint, and vertices at the same station are 0% and 100% on the same bone; the right pinky's tip is half on its middle segment (59 vs 118 vertices on the left). Up to 44% of some vertices' weight sits on the neighbouring finger. | Hands re-skinned geometrically (`scripts/rig/reskin_hands.py`): each vertex's weights from its position along its finger — smooth bands at every knuckle (base ±50%, middle ±30%, tip ±28% of the shorter segment), a lateral blend only in the webbing, the thumb and palm the same way. Position-only, so the duplicate vertices glTF splits along UV seams always agree (Blender's automatic weights cracked open at those seams). | Middle knuckle at 100° and tip at 70°: smooth, no spikes or tears; a fist closes without folding. |
| F2 | The index curls sideways into the middle finger | Its local Z (the old curl axis) is 15–20° off the true bending axis (middle and pinky 1–8°). | A hand model with anatomical axes measured from the bind: curl perpendicular to the palm normal and the segment, spread about the palm normal, the thumb's own frame (across the palm, out of its plane, roll; a hinge for its two outer joints). | Fingers curl in their own planes. |
| F3 | The fist's thumb sticks straight out (the preset folded it behind the palm) | Rendered as the site posed it. | Presets solved against the mesh (`scripts/rig/thumb_solve.py`): the fist's curl fitted so each fingertip just meets the palm (these thick fingers close less than a real hand — at 85/95/55° the tips sat 1.9–2.5 finger widths inside the palm), the thumb laid across the curled index and middle. | A fist with the thumb across the fingers, both hands (mirror checked). |
| F4 | The relaxed thumb presses into the index (re-check: 82 intersecting triangle pairs) | Verifier, then renders. | A gentler rest (base 8° across, 12° out, −15° roll; tip 6°). | Thumb beside the index with a gap. |
| F5 | Closing fingers snap as they pass the rest pose | The open → rest → fist blend changed speed 7× at rest. | A monotone cubic through the three presets. | Smooth through rest. |

### G. Skin weights (rig)

| # | Problem | Evidence | Fix | After |
|---|---|---|---|---|
| G1 | The shoulder gem lifts off or sinks with every arm move | Bound 100% to the left clavicle over skin that is 45% upper arm / 29% clavicle / 26% chest: off by up to 1% H. | Bound rigidly to the blend of the skin under it (UpperarmTwist01 0.48 / Clavicle 0.30 / Spine02 0.22). | Rides with the skin. |
| G2 | Knee and elbow creases fold from ~60° (81 folded triangles at a 90° knee) | Blend bands only 12–15% of the segment wide. | Wider bands on the bare-skin side (knee −20% … +8% of thigh length, elbow −23% … +7%); the skin under the greave / bracer stays rigid like the armour. | Smoother creases (the audit's in-memory test of the same change: 81 → 19 folds). |
| G3 | Jaw and chin skin under the face mask pokes through when the head nods (114 vertices looking up 35°) | Weighted to the neck while the mask follows the head. | Skin covered by the mask bound to the head (173 vertices), a 2% H blend around it (328). | — |
| — | Bracers vs the forearm roll (up to 0.6% H) | Mostly hidden (16 of 116 crossings visible from any of 26 views). | Not re-weighted; the standing pose turns the palm in with less forearm roll (55° plus 6° of shoulder rotation, was 72°). | — |
| — | Greave / bracer rims enter the thigh / biceps past ~60° | Geometry (the rims sit on the hinge): no weight change can fix a rigid rim. | Motions keep knees near 60° (the jump takes its depth from the hips and ankles). A real fix is a model change (trim the rims, or a separate knee cop). | — |

The fixed GLB is exported with the original settings and checked against the shipped one
(`scripts/rig/glb-compare.mjs`): the same 134 joints in the same order, bind matrices within
9e-5, 218,402 triangles, identical materials, all 14 textures byte-identical, 4,873,180 bytes (was
4,873,160). The tools: `scripts/rig/README.md`.

### H. Motions (rebuilt — `app/components/site/rig-motion.ts`)

The old clips were per-bone Euler offsets and sines on guessed local axes. Motions are now keyed
in the body's own frame, in degrees (`arm.R.elev 95, plane 14, rot 85`, `knee`, `spine.flex`,
`hips.x` in hip heights …), turned into bone rotations through axes measured at bind; the arms
ride with the chest; the shoulder rhythm, the hands, the eyes and the feet are layers on top.

| # | Problem (audit) | Fix | After (measured on the live site) |
|---|---|---|---|
| H1 | Idle: the weight never goes onto a leg; the shoulders tilt WITH the pelvis; the arms are dead; 78% holds | Starts and ends centred; the hips travel 0.075 hip heights over each foot in turn, the free hip drops 5°, the chest counter-tilts 8.6° (shoulders against the pelvis), the head stays near level, cascaded hips → +0.05 → +0.15 → +0.25 s; the free heel rises on the ball; the arms drag every shift (upper arm 0.25 s, elbow 0.35 s, wrist 0.45 s late, a 1.5° swing past); one beat per hold (a glance, a shoulder adjust, a nod, a hand fidget); two breaths. | Hands ≥ 13% H from the helmet; feet never below the floor; no thigh roll step over 1.1°. |
| H2 | Wave swings toward the camera and into the helmet; the arm moves as one block | Anticipation (head tilt, shoulder dip, elbow tuck, weight to the left foot); a rise with the shoulder leading, the elbow 0.08 s and the hand 0.06 s behind (dragged, then whipping open); four waves on the elbow in the picture plane with the forearm leaning out, varied timing (0.42 / 0.40 / 0.46 s, a hesitation, 0.55 s) and shrinking swings, the wrist trailing by 0.07 s; the drop on an inner arc in front of the thigh. | The hand clears the helmet's box by ≥ 2.9% H; nothing in the thigh. |
| H3 | Look around: a turret head (neck 56–60°, chest 17°, hips 4°), one 267°/s whip | Each look spread down the body (eyes ~20°, neck 34–39°, chest 20–22°, pelvis 7°) with real lags and a small overshoot, the weight to the looking side, the head dipping through the middle; left, a beat back, right and up, then a smaller look down-left. | Head turns peak ≈ 150°/s; eyes ≤ 24° in the head. |
| H4 | Jump: the hips stall at take-off; the foot flips onto its heel and stabs the floor; the soles sink before touchdown; the thigh spins 19–25° in one frame; the arms whip through a T-pose; twin sides | One physical hip curve (an eased crouch, a 40 ms hold, a push accelerating to 2.45 hip heights/s at take-off, ballistic flight, touchdown at the same speed into the absorb); the feet roll off the balls (heels first, toes flat) and stay on IK through the air, lifted on a keyed path (no switch to keyed legs and back), released at 93% leg stretch, landing balls first; the arms swing front-to-back with the push, up and a little out at the apex; the head holds the horizon; the left side 0.012–0.04 s behind. | Hip speed rises steadily to take-off and falls in a straight line through the flight; feet and toes never below the floor; legs ≤ 98.7% straight; the largest thigh roll step 2.1°; hands ≥ 2.9% H from the helmet. |
| H5 | The eyes turn up to 142° and stay turned (the A-pose shows white eyeballs) | Eyes reset to their sockets every frame (≤ 24° of aim), and let go of a viewer more than 60° off the head's facing. | ≤ 24° in every motion. |
| H6 | Gestures loop forever and end with a slide into Idle | Wave and Jump play once, then hand over to Idle (which now starts centred); the label shows Idle again. | — |

### I. Owner's second note (2026-11-19): eyes, resting hands, wave, jump, toes

| # | Problem | Evidence | Fix | After |
|---|---|---|---|---|
| I1 | The eyes slip out of the goggles while animating | Each eye bone pivoted at the FRONT of its eyeball, 14.7 mm (0.64 of the eyeball's radius) from the centre, so every glance swung the eyeball sideways (≈6 mm at 24°). The eyeballs are 100% on their bones. | Each eye bone moved to its eyeball's centre (direction and roll kept); the eyes aim within ~18° of the socket. | The eyes turn in place, seated in the lenses, through Look around and the Wave. |
| I2 | Resting hands held too far forward and too open | The stand had the arms 12° forward with the elbows bent 14° and the palms half forward (forearm roll 55°); the relaxed curl was light. | Arms straight down beside the thighs (3° forward, elbow 9°), palms to the thighs (roll 80° with 8° of shoulder rotation), a deeper relaxed curl (base 20–32°, middle 30–42°, tip 13–18°), the thumb closer to the index. | Relaxed hanging hands by the thighs. |
| I3 | The wave is "off" | The arm was raised to the side like a stop sign, with the forearm swinging. | A friendly hand wave: the arm comes up in front of the shoulder (so the hand is in front of the wide helmet), palm to the viewer, the HAND waving from the wrist with the forearm swaying a beat ahead; varied, shrinking waves; the drop in front of the body. | The hand stays outside the helmet's box throughout (≥ 0.4% H; the box includes the hair buns and gems). Owner's third note — "the hand wave is backwards": the palm faced the helmet with the back of the hand to the viewer (palm·forward −0.53). A sweep of the forearm roll on the live rig put the palm square to the viewer (palm·forward 0.97, thumb toward the head). Fourth note — "the arm wave wiggles oddly": the elbow, the forearm roll and the wrist all oscillated, and with the arm held well forward the elbow swing moved the hand in depth. Now ONE motion: the upper arm near the side (plane 16°), the forearm upright and swept about the elbow like a windshield wiper in the picture plane, the wrist flicking 0.06 s behind, the forearm roll held (125, palm·forward 0.95). Side view: the hand holds its depth; helmet clearance ≥ 2.2% H. |
| I4 | The jump is awkward | A deep crouch-and-stare: the torso folded 40–48°, the head cranked up, the arms swung far back and overhead. | A light hop: crouch 11% of hip height with the torso tipping 26°, the head level, the arms back a little then forward to shoulder height, a 0.4 s flight (apex 0.25 hip heights), a softer landing. | Hip speed rises steadily to take-off and falls in a straight line in the air; feet never below the floor; largest thigh roll step 2.1°. |
| I5 | No toe rigging | The mesh has three long toes per foot; the rig's five toe bones sat at the ball like a human foot's, 1 cm long, with no weight — the toes could not move. | The big / middle / pinky toe bones placed root → tip along the three mesh toes (4.7 / 3.8 / 3.0 cm), each toe bound to its bone over a band at its root (~1,415 vertices per foot); curl and spread on measured axes; animated: the standing foot's toes grip as the weight arrives, the free foot's toes lift with its heel, a toe wiggle in the idle, a grip before the jump's push, pointed in the air, up and spread to catch the floor, a press on landing. | The toes bend smoothly at their roots. |


- Clips have no runtime collision; their keys were checked instead (the Wave hand above).
- Body proxies are capsules and spheres measured at bind, so contact in Pose is close but not
  exact to the surface.
- The source rig has no weighted corrective bones or shapes; dual-quaternion skinning and the wider
  bands are the fix for volume. Correctives would have to come from the character's source file.
- Armour rims on the knee and elbow hinges, the overhead armpit (past ~120°) and arm reach into the
  helmet (past ~140° of flexion) are geometry: the motions stay inside those ranges.
