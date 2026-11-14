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
  Esc returns, F shows a still/video alone). Phones get a single-column list.
- `/work` — the same index (older links keep working).
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
- Contact is the email in full in the top bar (primary, with a Copy action) plus X; on
  phones it sits at the foot. Copy comes from `content/site/settings.json`.
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
- Write for external evaluation, not internal lore. **Never invent** clients, metrics, or
  collaboration details. When information is missing, leave it out (e.g. Rubia has no
  role/tools yet) — don't fabricate.

## Visual system (`app/components/lit/lit.module.css`)
- Colour comes from the work. The room is the piece's own colour held ~40% darker
  (a lit work in a dim room); the only colour in the site's own chrome is the prism glint
  on the wordmark's triangle (hover). Text is warm cream (`--cream`, `--c2`, `--c3`).
- Type — Geist, self-hosted in `app/fonts/geist/` (SIL OFL), four sizes:
  - **Geist Serif Triangle** — titles, the wordmark, piece names (`--t-display`, `--t-title`).
  - **Geist Sans** — text and labels, calm sentence/title case (`--t-text`).
  - **Geist Mono** — **figures only**: dimensions, counts, timecode, indices (`--t-fig`).
    No uppercase-mono "HUD voice".
- Label order (museum object label): title → year · discipline → note → Role, Made with,
  Dimensions. Dimensions use one format for every kind of work.
- One control style: text buttons, ≥32 px tall, a 1 px underline on the active one.
- One spacing scale (`--s1`–`--s8`); one margin token (`--m`).
- Film grain is one still tile in the field **under** the work — never over the
  owner's pixels.
- Motion: exposure change between pieces (~120 ms lift, ~300 ms develop), View-Transition
  morph sheet↔piece (~420 ms), field cross-fade ~320 ms. Everything is a cut under
  `prefers-reduced-motion`.

## Architecture & performance
- Next.js (app router), **static export** (`output: "export"`); deploys on **push to
  `main`** via Cloudflare Pages. Keep everything export-safe.
- The whole site is one client component (`LitShowcase`) fed by server-read content; the
  three.js stack (`SpecimenScene`) is lazy-imported and only mounts for 3D pieces.
- `DisplayModeProvider` (`app/lib/display-mode.ts`) decides live 3D vs. set photograph:
  reduced motion, Save-Data, or low memory/cores → the photograph, and index videos stay
  on their poster. The site must be complete in that mode.
- `SpecimenScene` serves both the lit set (`set` prop: cyclorama, spot-lit, lights turn
  with the camera, lights come up when the model is ready) and its original studio mode.
- Comprehensible without WebGL and navigable without JS: an `sr-only` link list to every
  `/work/[slug]`.
- TypeScript strict: `npx tsc --noEmit`, `npx eslint app/`, and `npx next build` must all
  pass before shipping.

## Hard-won gotchas (don't relearn these)
- Global `img { max-width: 100% }`-style rules break oversized layers — set
  `max-width: none` on anything meant to bleed.
- Lit-set lights must be **spots aimed at the subject**; directional fills light the
  whole floor evenly and kill the falloff. Keep `envMapIntensity` low on the set paint.
- While a 3D asset loads, never show a placeholder picture over the set; the set photo
  (same camera) covers the load and cross-fades to the live view.
- Keyboard handlers: `e.target` may be `window`/`document` (no `.closest`) — guard with
  `instanceof Element`.
- Field-QA URL flags are sanctioned, read-only, and never affect content: `?fps`/`?debug`,
  `?displayMode=reduced`, `?slow=N` (all transitions N× slower, for review), `?still=1`
  (set-photography mode for the 3D viewer).

## Not in use (kept in the repo, unmounted)
The pre-2026-11 starfield-era components in `app/components/` and
`app/components/site/` (VoidBackground, EffectsOverlay, CursorFollower, GlassRefraction,
SmoothScroll/Lenis, HeroIntro, WorkShowcase, SpecimenViewer, …) are no longer mounted.
They were not ported because they paint atmosphere with code. Remove them only with the
owner's OK.
