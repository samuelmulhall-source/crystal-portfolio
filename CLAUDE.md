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
  asset list in the label; the index shows the pack's cover asset (`PACK_COVER` in
  `app/lib/lit-pieces.ts`).

## Content
- Work entries live in `content/work/*.json`; global config in `content/site/`. The Zod
  schema is `app/lib/content.ts`; `app/lib/lit-pieces.ts` shapes entries for the
  showcase. Adding/editing an entry must require **no component edits**.
- Presentation fields (all optional): `facts` (true pixel size; video fps/frames/duration/
  audio), `edgeColors` (the render's own top/bottom edge colours — the field it sits in),
  and per 3D asset `specimen.stage` (set paint + field, measured from the asset's own
  albedo; optional opening `azimuth`), `specimen.facts` (tris/maps from the live viewer),
  `specimen.setStill` (a photograph of the asset on its lit set, `/images/set/`).
- Set photographs are shot from the live viewer with `?still=1` (front view held, no
  framing shift) at 2700×900 @1.5×, saved as `<id>.webp` + a 4:3 `<id>-tile.webp`. Re-shoot
  when a model, its materials or its set change.
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
  wrapped index titles, sideways overflow, a phone index that doesn't fit one screen,
  empty server HTML, or script errors. Screenshots land in .check/ (git-ignored). Its
  checks must find the elements they measure — a selector that matches nothing fails.
- Stills have smaller renditions for phones (`node scripts/make-sizes.mjs` →
  public/images/sized/, picked up automatically by srcset). Re-run when a still changes.

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
- Field-QA URL flags are sanctioned, read-only, and never affect content: `?fps`/`?debug`,
  `?displayMode=reduced`, `?slow=N` (all transitions N× slower, for review), `?still=1`
  (set-photography mode for the 3D viewer).

## Not in use (kept in the repo, unmounted)
The pre-2026-11 starfield-era components in `app/components/` and
`app/components/site/` (VoidBackground, EffectsOverlay, CursorFollower, GlassRefraction,
SmoothScroll/Lenis, HeroIntro, WorkShowcase, SpecimenViewer, …) are no longer mounted.
They were not ported because they paint atmosphere with code. Remove them only with the
owner's OK.
