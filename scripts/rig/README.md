# Rig tools (Rubia)

Blender 4.2 scripts, run headless: `"C:Program FilesBlender FoundationBlender 4.2lender.exe" -b --factory-startup --python <script> -- <args>`.
They import the GLB with `bone_heuristic='BLENDER'`, which keeps every bone's frame exactly as the
GLB stores it (checked: axes equal to 1e-5), so the site's measured axes stay valid. None of them
saves a .blend.

- `fix_rubia_rig.py <out.glb> [report.json] [in.glb]` — the skin-weight fixes (hands re-skinned
  geometrically, the shoulder gem bound to the skin under it, wider knee/elbow bands on bare skin,
  jaw skin under the face mask bound to the head, each eye bone moved to its eyeball's centre, the
  big / middle / pinky toe bones placed along the three mesh toes and each toe bound to its bone) and a GLB export with the original settings
  (Draco, WebP passed through, 4 influences). Write the output outside `public/`, then compare.
- `glb-compare.mjs <old.glb> <new.glb>` (node) — joints, bind matrices, inverse binds, meshes,
  materials and images, old vs new. A faithful export matches all of them (bind ≤ 1e-4).
- `reskin_hands.py` — the hand weights (used by the fix script).
- `hand_lab.py <poses.json> <outdir> [glb|-] [R|L] [views] [proc]` — renders a hand in anatomical
  poses (Workbench, grey + weight colours) to judge presets and skin.
- `thumb_solve.py <in.json> <out.json>` — solves thumb presets against targets (fist: across the
  curled index and middle; rest: beside the index) without passing through fingers or palm.
