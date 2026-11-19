# Multiscatter Portfolio — Working Contract

Portfolio for **Multiscatter**, a 3D generalist / technical artist. Since 2026-11 the
site is **"lit, not styled"**: a catalogue of lit objects. Every piece is shown in its
own light with a precise label beside it; the interface is a quiet type layer and the
work is the frame. It must stay a clear, fast, clients-first way to evaluate the work.

## Decision filter
Every change must improve at least one of: **trust**, **clarity**, **presentation
quality** — for clients, art directors, and collaborators sizing up fit. If something is
impressive but makes the work slower or harder to evaluate, cut it.

## Where the direction came from (read before any visual change)
The owner rejected several redesigns in Nov 2026 before approving this one. The rules
that came out of that, in the owner's terms:
- **Only the owner's own art makes atmosphere.** Light and colour come from their renders
  and from properly lit real-time 3D — never from code-painted environments, procedural
  fake 3D, CSS glows, starfields or effects standing in for craft.
- **The moodboard is read as a whole collection**, never by lifting one image's surfaces,
  colours or objects. Its sensibility: real things caught in real light (light through
  and off materials — literally "multiple scattering"); craft that reads at a glance and
  rewards a close look; one committed idea per frame with calm around it; colour that
  belongs to the subject; timeless and physical, not techy-HUD.
- **No long-scroll storytelling page.** Organisation is bounded: an index, categories,
  every piece one click away.
- Interface motion stays within ~100–500 ms. No distorting lens/magnifier effects.

## Information architecture
- `/` — the **index**: the titles in large serif; the piece you point at (or move to with
  ↑/↓) is lit large on the right in its own colours and the whole room takes its light.
  Enter or click opens it **in place** (the picture morphs into the piece view; ←/→ step,
  Esc returns, F shows a still/video alone). Phones get a one-screen catalogue (a
  small proof beside each title) — never a long feed of large images.
- Categories **filter the index in place** (other titles step back, ↑↓ stay inside the
  filter, `?v=sheet&c=video` is shareable); from a piece, a category returns to the index
  filtered. The lit picture itself also opens its piece. Keys: ↑↓, Home/End, A–Z
  type-ahead, Enter, 1–5, ←→, F (alone — stills, video and 3D), Space, Esc, `?` (overlay).
- `/work` — the same index (older links keep working); its canonical address is `/`.
- `/work/[slug]` — the same showcase **opened on that piece**. It exists for sharing and
  search (per-piece metadata, OG image, JSON-LD). **Nothing in the showcase links to it**
  — pieces open in place and the address bar mirrors the view on `/` with query params.
  Firm standing rule from the owner (said more than once): no "View details" / "Closer
  look" / expand-to-detail CTA and no case-study narrative block. Don't add one even under
  a blanket "apply all"; it must be requested explicitly and on its own.
- Categories stay as the organising structure: **All · Models · Rigged Characters ·
  Video · Images**, in the top bar with plain counts (thin categories are temporary).
  Categories derive from each entry's media (`specimen` → models, video hero → video,
  else images); an explicit `category` field overrides.
- Contact: the top bar says "Email"; on hover/focus it widens into the full address and
  Copy slides out (owner's request). Touch screens and the phone footer always show the
  full address. X sits beside it. Copy comes from `content/site/settings.json`.
- Asset packs (`assets[]`) show one asset at a time on a shared lit set, with a numbered
  asset list in the label; the index shows the pack's cover asset (the entry's `cover`
  field, an asset id; default the first).
- The index list scales its titles with the number of pieces (`--n`) so it stays one
  screen; past what fits at 22 px it scrolls, with soft edges, keeping the lit title in
  view. Phones show up to 8 pieces on one screen, then scroll as compact rows.

## Content
- **New work goes through the asset tool**, never hand-built JSON: `npm run asset -- add
  <file>` (still, MP4, FBX + maps, or GLB) copies it in, measures it, makes thumbnails,
  sizes, share image, poster, room / set paint and set photograph, and writes a **draft**
  entry. `status` shows what's stale or missing (with the fixing command), `derive`
  re-measures, `room` shows and writes the colour rules' room, `shoot` photographs 3D
  sets, `publish` takes a draft live. Guide: `docs/adding-work.md`; code:
  `scripts/asset.mjs` + `scripts/lib/` (media probe, colour, room engine, derive, CDP
  browser, static server — `check-site.mjs` shares the last two).
- Drafts (`draft: true`) show in `next dev` and in `SHOW_DRAFTS=1` builds (what `shoot`
  uses), never in a production build. `CONTENT_DIR=<folder>` points a build at another
  content folder (review and stress tests) — use it instead of adding test entries here.
- Work entries live in `content/work/*.json`; global config in `content/site/`. The Zod
  schema is `app/lib/content.ts`; `app/lib/lit-pieces.ts` shapes entries for the
  showcase. Adding/editing an entry must require **no component edits**.
- Presentation fields (all optional): `facts` (true pixel size; video fps/frames/duration/
  audio), `edgeColors` (the render's own top/bottom edge colours — the field it sits in),
  and per 3D asset `specimen.stage` (set paint + field, measured from the asset's own
  albedo; optional opening `azimuth`), `specimen.facts` (tris/maps from the live viewer),
  `specimen.setStill` (a photograph of the asset on its lit set, `/images/set/`),
  `specimen.extraTextures` (the second model's own maps incl. `alphaMap` — e.g. the
  sword's grip wrap; without them it wears the main model's material).
- A GLB with no maps listed keeps its own embedded materials (like a rigged character);
  FBX props always get the listed PBR set.
- Set photographs: `npm run asset -- shoot [slug] [--asset id]` — the live viewer with
  `?still=1` (front view held, no framing shift) at 2700×900 @1.5×, software WebGL, saved
  as `<id>.webp` (q74 — keeps the backdrop grain; WebP smooths it away below ~q66) + a
  480×360 `<id>-tile.webp` (cards and peeks). Re-shoot when a model, its maps or its set
  paint change (`status` flags it). `--out <dir>` shoots elsewhere and changes nothing in
  the project (review before replacing). The set is at full light from the first frame in
  `?still=1`: the light's ease advances per rendered frame, and software WebGL draws only
  a few before the capture, so eased sets photographed under-lit, by a machine-dependent
  amount.
- The one-line introduction on the index is `content/site/home.json` → `intro`.
- Write for external evaluation, not internal lore. **Never invent** clients, metrics, or
  collaboration details. When information is missing, leave it out (e.g. Rubia has no
  role/tools yet) — don't fabricate.

## Visual system (`app/components/lit/lit.module.css`)
- **Rooms (colour theory, owner-requested 2026-11-15).** Each piece's room is chosen from
  its measured colour (OKLab), stored in content (`room` on stills/video, `stage.color/
  field/accent` on 3D assets) and generated by `scripts/make-rooms.mjs`, which documents
  every choice and prints a contrast/value report per room. The rules (second pass):
  - **hue at depth**: blue, violet, teal and crimson keep their identity at very low
    lightness; orange, yellow and gold turn brown/olive. The wall in shadow is always a
    darkness-stable hue; a warm complement is carried as **light**, bright enough to
    read as colour (the moodboard never paints a dark warm wall — warmth arrives as glow);
  - **temperature contrast**: light and shadow sit on opposite sides of the wheel (warm
    light / cool shadow). The light is the **complement** of the work's dominant hue
    (simultaneous contrast); the shadow is near the work's own hue family, so the work's
    edges settle into it. Many-hued works get near-neutral light (warm) and shadow
    (cool); achromatic works are the one place for a bold, saturated light;
  - **value hierarchy**: large wall areas stay below the work's median value; a small
    shaped light may approach it; the work's highlights top the wall's peak by ≥0.2 L.
    The darkest values frame the edges and the type sits in that shadow;
  - **shape** = the light's character: `pool`, `low` (firelight), `rake` (diagonal
    sweep), `horizon` (a flat band at the work's lower third). Where it falls follows the
    layout (`--px/--py`); gradients interpolate in OKLab. Each hung work casts a soft
    shadow on the wall **away** from that light (drawn outside the picture, never on it);
  - **colour key**: the cream type takes ~8% of the room's light (`--room-l`) — counters
    simultaneous contrast and gives each room one shared colour;
  - **accent**: the work's own hue at the lightness where that hue reads truest, ≥4.5:1 on
    the shadow (the accent numbers are text), on small marks only;
  - colours are gamut-mapped by lowering chroma (never clipped — clipping shifts hue);
  - cool set paints sit lower in L than warm ones (they read paler under the key light).
  Re-run the script after changing a room; re-shoot set photographs after a set change.
- Text is warm cream (`--cream`, `--c2`, `--c3`). Besides the accent, the only colour
  in the chrome is the prism glint on the wordmark's triangle (hover).
- Type — Geist, self-hosted in `app/fonts/geist/` (SIL OFL), four sizes:
  - **Geist Serif Triangle** — titles, the wordmark, piece names (`--t-display`, `--t-title`).
  - **Geist Sans** — text and labels, calm sentence/title case (`--t-text`).
  - **Geist Mono** — **figures only**: dimensions, counts, timecode, indices (`--t-fig`).
    No uppercase-mono "HUD voice".
- Label order (museum object label): title → year · discipline → note → Role, Made with,
  Dimensions. Dimensions use one format for every kind of work.
- One control style: text buttons, ≥32 px tall, a 1 px underline on the active one.
- One spacing scale (`--s1`–`--s8`); one margin token (`--m`).
- Film grain is one tile (`public/images/grain.png`) in the field **under** the work —
  never over the owner's pixels. On 3D pieces the set's backdrop carries the same grain
  inside the scene (`SpecimenSet.grain`: the tile sampled in screen space at 128 CSS px ×
  dpr and mixed over the final sRGB colour with the tile's alpha — the same compositing as
  the CSS layer), so the model, drawn in front, stays clean. It stirs on `lit:boil` like
  the page grain. Set photographs are shot with it, so the photo→live hand-over matches. Still at rest; on actions (moving between pieces,
  opening/closing, the index's light changing, asset switch, scrubbing) it "boils" — call
  `boil(ms)`, which sets `data-boil` on the grain layer (not a class: React re-renders
  would wipe it). Off under reduced motion.
- Wordmark hover: a thin pastel sheen crosses the letters (~560 ms) and the triangle
  tittle lifts, glows and holds the spectrum.
- Motion: exposure change between pieces (~120 ms lift, ~300 ms develop), View-Transition
  morph sheet↔piece (~420 ms), field cross-fade ~320 ms. Everything is a cut under
  `prefers-reduced-motion`.

## Architecture & performance
- Next.js (app router), **static export** (`output: "export"`); deploys on **push to
  `main`** via Cloudflare Pages. Keep everything export-safe.
- The whole site is one component (`LitShowcase`) fed by server-read content, and it is
  **rendered on the server**: the static HTML holds the full index (and, on
  `/work/[slug]`, the full piece) — it must never fall back to a client-only blank. Keep
  render paths free of `window`/`document`; read the address bar through `useSearch()`
  (server snapshot `""`), and apply a query only after hydration. The live 3D canvas mounts
  only after hydration (the server can't know the device); its HTML shows the set photo.
- The three.js stack (`SpecimenScene`) is lazy-imported and only mounts for 3D pieces.
- Media weight: the landing page loads only posters/thumbnails. Index videos start only
  after the visitor has moved through the index and rests on a piece; full-resolution
  stills on the index load after a ~500 ms rest.
- `DisplayModeProvider` (`app/lib/display-mode.ts`) decides live 3D vs. set photograph:
  reduced motion, Save-Data, or low memory/cores → the photograph, and index videos stay
  on their poster. The site must be complete in that mode.
- `SpecimenScene` serves both the lit set (`set` prop: cyclorama, spot-lit, lights turn
  with the camera, lights come up when the model is ready) and its original studio mode.
- Comprehensible without WebGL and navigable without JS: an `sr-only` link list to every
  `/work/[slug]`.
- TypeScript strict: `npx tsc --noEmit`, `npx eslint app/`, and `npx next build` must all
  pass before shipping — then **`npm run check:site`** (scripts/check-site.mjs): serves
  out/, drives headless Edge/Chrome through 1280×720, 1440×900, 1920×1080, 2560×1080 and
  two phones, plus no-JS, and fails on labels under the top bar, overlapping title/note,
  wrapped index titles, the intro running into the titles, sideways overflow, a phone
  index that doesn't fit one screen (≤ 8 pieces; more must be compact rows), empty
  server HTML, or script errors. It loads the first published still, 3D piece and video
  from content. Screenshots land in .check/ (git-ignored). Its checks must find the
  elements they measure — a selector that matches nothing fails.
- Stills have smaller renditions for phones (public/images/sized/, picked up
  automatically by srcset) — `npm run asset -- derive <slug>` makes them.

## Hard-won gotchas (don't relearn these)
- Global `img { max-width: 100% }`-style rules break oversized layers — set
  `max-width: none` on anything meant to bleed.
- Lit-set lights must be **spots aimed at the subject**; directional fills light the
  whole floor evenly and kill the falloff. Keep `envMapIntensity` low on the set paint.
- While a 3D asset loads, never show a placeholder picture over the set; the set photo
  (same camera) covers the load and cross-fades to the live view.
- Keyboard handlers: `e.target` may be `window`/`document` (no `.closest`) — guard with
  `instanceof Element`. Widgets that own arrow keys (`[role=slider]`, the 3D canvas) are
  skipped by the page's key handler.
- The address-bar query is read exactly once, on the first render after hydration —
  later queries are the showcase's own mirror (reading them again reset the lit piece).
- Anything placed inside the label column inherits its opacity — the 3D set lives there,
  so hide the label's children, never the column, when the set must stay visible.
- Both index layouts are in the HTML; pictures in the hidden one use a
  `<picture><source media=… srcset={BLANK}>` so they never download.
- Check layouts at 1280×720 and 1920×1080+, not just 1440×900: wide pieces switch to the
  side layout when the picture-over-label layout can't give them ≥880 px; labels tighten
  under 820 px tall; index titles never wrap.
- Icons: `app/icon.png`, `app/apple-icon.png`, `app/favicon.ico` (a cream Geist Serif "M").
  Share images for 3D pieces are cut from their set photographs (1200×630).
- **Rubia's skin lives on the twist bones.** Upperarm / Forearm / Thigh / Calf carry zero
  weight; each limb's skin is on `<Seg>Twist01` (at the joint) and `<Seg>Twist02` (its child,
  mid-segment); the elbow/knee "ShareBone"s are unweighted. `driveTwists` (`TWIST_SPECS` in
  SpecimenScene) grades every limb's roll across them each frame after the motion or pose —
  never hand-set twist bones in a motion. Measured: idle forearm roll 0.31 / 1.0 /
  1.55 rad elbow→mid→wrist (undriven, the elbow end took the full 1.2 and sheared).
- **Posing (CC rigs) is analytic two-bone IK** (`HumanPoser`): bend only on the measured
  hinge (`JOINT_LIMITS`), keeping the joint's existing swing; aim; roll to a pole (built
  from each joint's own bend direction, measured when posing starts, tilted knees-up /
  elbows-down — so entering Pose or the first grab changes nothing). It starts from
  `STAND` (the motions' standing pose, feet on their marks), keeps feet pinned and level, and has hips (reach 0.62–0.995 of leg length),
  chest (spine lean, held relative to the hips, 0.7 rad cone) and gaze handles; `poseKey`
  = Reset. Nothing passes through the body: `measureBody` builds proxies from the skinned
  vertices at bind (torso capsule, pelvis and helmet spheres, thigh/calf/arm capsules);
  hand targets are pushed out of them, an elbow that would enter one rolls away
  (`rollClear`), elbow/knee flex is capped from measured limb thickness, feet stay on the
  floor and ≥0.7× their rest separation apart, and look/lean have per-direction limits.
  `LegacyPoser` (CCD) remains for rigs without CC names.
- **Rigged characters use dual-quaternion skinning** (`enableDQS`): `skeleton.update` packs
  each bone's (real, dual) quaternion and uniform scale into the skeleton's own bone
  texture (texel 3 `.w` = 0 marks that layout; matrices → every patched shader falls back to
  linear blending); materials and the shadow depth/distance materials are patched in
  `onBeforeCompile`. Needs uniform bone scale (checked). Rubia's thin shoulder web when the
  arm is raised and the pinched elbows/knees were linear-blend artefacts — the rig has no
  weighted correctives. CPU-side skinning (raycasts, bounds) stays linear.
- **Motions are anatomical** (`app/components/site/rig-motion.ts`): channels in the body's own
  frame, in degrees — `arm.R.elev/plane/rot` (0 = hanging; plane 0 = out to the side, 90 = in
  front; rot + = external), `elbow.R`, `pron.R`, `wrist.R.flex/dev`, `clav.R.elev/prot`,
  `spine.flex/side/twist` and `neck.*` (shared down each chain), `leg.R.flex/abd/rot`,
  `knee.R`, `ankle.R.flex/inv`, `hips.x/y/z` (hip heights) / `pitch/roll/yaw`, `hand.R`
  (grip 0 open · 1 rest · 2 fist), `wave.R`, `toes.R` (curl, + down) / `toeSpread.R`, and per foot
  `contact`, `heel` (lift about the ball, degrees) and `lift` (hip heights). `buildMotionRig` measures every axis from the bind
  (root space); arms are posed relative to the chest as it is now; the shoulder rhythm is part of
  the pose. Keys `[seconds, value]`, monotone cubic, absent channels = `STAND`. Wave and Jump
  play once and hand back to Idle (`onMotionEnd` resets the label). After the motion each
  frame: `lockFeet` (contact / heel / lift per foot), eyes, the twist driver. Measure for the
  drivers in the hips' parent space, never in world units (the model joins its scaled group
  later — the resting gaze once converged ~1 body height away).
- Motion rules learnt the hard way: a planted leg must keep a bend (release a foot by ~93% leg
  stretch) — a straight leg has no knee direction and the thigh spins ~25° in a frame; a jump
  keeps its feet on IK through the air (lifted), never switching to keyed legs and back; eyes
  reset to their sockets every frame (≤ 24° of aim, a viewer > 60° off is let go); arms stay
  ≤ ~115° raised and the waving forearm leans out (the helmet is wide); knees ≈ 60° max (the
  greave rims sit on the hinge).
- Rubia's feet have three long toes; the rig's BigToe1 / MidToe1 / PinkyToe1 run root → tip along
  them (Index/Ring toe bones are unused). The eye bones pivot at the eyeball centres (they sat on
  the front surface and the eyes slid in the goggles).
- **Rubia's hands**: three fingers and a thumb (Index, Mid, Pinky — no Ring bones). The hand model
  (`applyHand`) uses anatomical axes measured at load (the index's local Z is 15–20° off its real
  curl axis). Presets open / rest / fist / wave were solved against the mesh in the Blender hand
  lab (`scripts/rig/`): the fist's fingertips just meet the palm (thick fingers — they close less
  than a real hand) and its thumb lies across the curled index and middle. The grip blends them
  on a monotone cubic.
- **Skin-weight fixes are made in Blender, on the GLB** (`scripts/rig/fix_rubia_rig.py`, README
  there): import with `bone_heuristic='BLENDER'` (keeps every bone frame exactly), export with the
  original settings, then `glb-compare.mjs` against the shipped file. Hand weights are geometric
  (`reskin_hands.py`) — never Blender's automatic weights on this GLB: the mesh is split along UV
  seams and heat weights crack the fingers open there. The measured review: `docs/rubia-rig-review.md`.
- Rig QA (`?debug`): `window.__rig`, `__pose` (camera, handles, `drive(key, x, y, z)` /
  `release()` — no mouse needed; real CDP drags take ~90 s each under software WebGL),
  `__clipAt = seconds` (freeze the current motion at that moment, no return to Idle), `__orbit` (the orbit
  controls, for framing close-ups), `__twistOff` and `__lbs` (A/B the twist driver and
  linear skinning). Click the label's buttons with `el.click()` or a tall viewport — at
  700×500 the motion row sits below the fold and a CDP click lands on nothing. For REVIEW,
  launch headless Edge with `webgl: false` — that is the hardware GPU, ~100× faster than the
  software renderer (which only set photography needs, for repeatable pixels).
- `?a=N` selects a pack's asset — 0 (the first) included; only a missing `a` means "the
  cover". (`a=0` once fell through to the cover, so shared sword links opened the dagger.)
- Never chain a destructive or writing tool command after a `cd` with `;` — if the `cd`
  fails it runs in the wrong project. Pin the tool with `ASSET_ROOT=<path>` instead.
- Field-QA URL flags are sanctioned, read-only, and never affect content: `?fps`/`?debug`,
  `?displayMode=reduced`, `?slow=N` (all transitions N× slower, for review), `?still=1`
  (set-photography mode for the 3D viewer).

## Not in use (kept in the repo, unmounted)
The pre-2026-11 starfield-era components in `app/components/` and
`app/components/site/` (VoidBackground, EffectsOverlay, CursorFollower, GlassRefraction,
SmoothScroll/Lenis, HeroIntro, WorkShowcase, SpecimenViewer, …) are no longer mounted.
They were not ported because they paint atmosphere with code. Remove them only with the
owner's OK.
