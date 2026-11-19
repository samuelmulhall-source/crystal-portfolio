# Adding work to the site

Everything goes through one command, run from the project folder:

```bash
npm run asset -- help
```

New pieces come in as **drafts**. A draft shows in `npm run dev`, marked "Draft"
beside its category. It never appears in a production build, so it can't go live
by accident. Nothing in the tool deletes files.

## The short version

```bash
npm run asset -- add "D:/renders/Glass Orchard.png" --title "Glass Orchard"
npm run dev                       # look at it: it's on the index, marked Draft
#   write summary / discipline (and role / tools if you can state them) in
#   content/work/glass-orchard.json
npm run asset -- publish glass-orchard
npm run build && npm run check:site
git add -A && git commit -m "Add Glass Orchard" && git push   # deploys
```

## What `add` does with each kind of file

| You give it | It copies to | It makes |
|---|---|---|
| a still: `.png .jpg .tif .webp` | `public/Image renders/<slug>.webp`: WebP at q92, at most 3840 px (`--keep` copies it as it is) | 960 px thumbnail, 1280/1920 phone sizes, 1200×630 share image, edge colours, room |
| a video: `.mp4` (H.264) | `public/Video renders/<slug>.mp4`, as it is | poster (the most detailed of five frames; `derive --at 12.5` picks one), share image, room from four frames |
| a model: `.fbx` | `public/models/<slug>/`, with its maps converted to WebP | set paint from the colour map, then the set photograph (`shoot`) |
| a model: `.glb` | `public/models/<slug>/`; rigged ones go to `public/Rigged Characters/<slug>/` | the same; it keeps its own embedded materials |

Measured from the files and written into the entry: pixel size, frame rate, frame
count, duration, whether a video has sound, and triangle and map counts. These
are facts the label states, so they are never typed by hand. `status` reports when
an entry and its file disagree.

**Maps for an FBX** sit beside it (or in a `textures/` folder), named after the
model: `torch_color`, `torch_normal`, `torch_roughness`, `torch_metallic`,
`torch_transmission`. Other names it accepts: `basecolor`, `albedo`, `diffuse`,
`nrm`, `rough`, `metal`. Use OpenGL normals; if both are present it picks the
OpenGL one. Ambient occlusion, height and emission maps are listed but not used.
If the maps don't start with the model's name, give the prefix: `--maps Torch`.

**A second model in the same view** (e.g. a grip wrap with its own UVs):
`--extra "…/sword_wrap.fbx" --extra-maps Sword_grip`. Its own colour, normal,
roughness, metal and alpha maps are used, and the alpha map cuts it out.

**Asset packs:** `add model.fbx --pack medieval-asset-pack --title "Mace"` adds a
model to an existing pack. `cover <pack> <asset-id>` picks which asset stands for
the pack on the index.

**Limits:** Cloudflare Pages serves files up to 25 MB. `add` refuses anything
larger and prints an `ffmpeg` command to re-encode a video, or suggests Draco for
a GLB.

## Rooms and set paint

Each still or video hangs in a **room** that the colour rules design from its own
colours (see CLAUDE.md, "Rooms"): a shadow in a hue that holds in the dark, light
in the complement of the work's colour, an accent in its own hue, and the value
hierarchy checked. `add` designs one automatically. To see the reasoning and the
contrast report, or to try another light shape:

```bash
npm run asset -- room glass-orchard
npm run asset -- room glass-orchard --shape low --write    # pool | low | rake | horizon
```

A 3D model's **set paint** is the complement of its colour map, held at amber
where the complement would turn brown or olive. On a pack, `room <pack> --asset
<id> --write` repaints one asset; the others are left as they are. The rooms tuned
by hand live in `scripts/make-rooms.mjs`, and `add` never touches them.

## Set photographs (`shoot`)

3D pieces are photographed from the live viewer on their lit sets: same camera,
front view, 4050 × 1350, plus a small 4:3 tile. The photograph stands in before
WebGL loads and in reduced-motion or low-power mode, so take a new one whenever
a model, its maps or its set paint change:

```bash
npm run asset -- shoot medieval-asset-pack --asset sword
npm run asset -- shoot                      # every 3D piece
npm run asset -- shoot rubia-rigged-character --out C:/tmp/review   # review only; changes nothing
```

`shoot` builds the site with drafts included (`SHOW_DRAFTS=1`), serves `out/`,
and drives headless Edge with software WebGL, so the photos come out the same on
any machine. In photography mode the set is at full light from the first frame —
the live viewer's light eases up frame by frame, and software rendering draws
only a few frames before the capture, which used to leave photos under-lit by a
machine-dependent amount. It also records the triangle and map counts.

## Keeping the catalogue honest

```bash
npm run asset -- status        # every entry: ok, stale (with the fixing command), errors, text still to write
npm run asset -- derive --all  # re-measure facts and dimensions; make anything missing
npm run asset -- order         # the running order; `order glass-orchard 2` moves it
npm run asset -- check         # status + the build's content and size checks
```

`status` also lists files in `public/` that no entry uses, and says whether each
one is in git (and so deploys). It only lists them; it never deletes anything.

## Taking a piece down

```bash
npm run asset -- archive glass-orchard          # shows what would happen
npm run asset -- archive glass-orchard --yes    # moves the entry to content/archive/
```

Its files stay where they are. Delete them yourself if you want them gone; the
dry run lists the ones only that piece used. To bring the piece back, move the
JSON back into `content/work/`.

## Rules the tool keeps (and you should too)

- Never invent clients, metrics, roles or credits. Leave a field empty when you
  can't state it; the label leaves the line out.
- `publish` refuses while the summary or discipline is empty, or while anything
  is stale. `--force` publishes with stale items, but never with missing files.
- Nothing is overwritten silently. If a file with that name already exists in
  `public/` and is different, `add` stops and asks for another `--slug`. Derived
  images (thumbnails, sizes, share images, posters) are rebuilt only with
  `--force`.
