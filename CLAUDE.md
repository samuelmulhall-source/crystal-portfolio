# Multiscatter Portfolio — Working Contract

Portfolio for **Multiscatter**, a 3D generalist / technical artist. The site pairs an
atmospheric identity (deep-midnight void, ice/cyan light) with a clear, fast,
clients-first way to evaluate the work.

## Decision filter
Every change must improve at least one of: **trust**, **clarity**, **presentation
quality** — for clients, art directors, and collaborators sizing up fit. If something is
impressive but makes the work slower or harder to evaluate, cut it. Atmosphere serves the
work; it never gets in its way.

## Information architecture
- `/` — curated landing: pinned "fly-into-smoke" hero intro → Work showcase
  (`#selected-work`) → contact.
- `/work` — the **same** `WorkShowcase` component, without the hero. The header "Work"
  link, the hero scroll cue, and footer/CTAs all resolve to the showcase.
- `/work/[slug]` — lean "closer look": title + summary + interactive viewer + gallery +
  contact. **No case studies** — that feature was removed; don't reintroduce a narrative
  block or a "Case study" / "View details" CTA unless asked.
- Showcase categories are tabbed: **Models · Rigged Characters · Video · Images**.
  Categories derive from each entry's media (`specimen` → models, video hero → video,
  else images); an explicit `category` field overrides. The empty **Rigged Characters**
  tab is intentional — a placeholder for incoming work; keep it.
- Collection entries (asset packs) set `assets[]` and become one steppable slide per
  asset in the showcase, with a pill switcher on the detail page (see
  `medieval-asset-pack.json`).

## Content
- Work entries live in `content/work/*.json`; global config in `content/site/`. The Zod
  schema is `app/lib/content.ts`. Adding/editing an entry must require **no component
  edits**.
- Write for external evaluation, not internal lore. **Never invent** clients, metrics, or
  collaboration details. When information is genuinely missing, say so plainly or leave an
  honest placeholder — don't fabricate.
- Content is intentionally minimal while the structure settles; fuller copy/media arrive
  later. Don't pad with filler to fill space.

## Visual system
- Mood: deep-midnight backgrounds, slate surfaces, soft ice text, restrained cyan accents.
  Color tokens live in `:root` (`--void`, `--ice`, `--ice-bright`, `--text-*`); reach for
  them before hardcoding new rgba values.
- Typography roles:
  - **Archivo** — body / UI / display (`--font-archivo`).
  - **IBM Plex Mono** — labels, indices, technical readouts only (`--font-plex-mono`).
    Never body copy.
  - **VTKS Trunkset** — the hero wordmark only (`--font-display`), self-hosted as a subset
    woff2.
- **Glass UI** (frosted `backdrop-filter` + specular edge) is for small chrome only:
  showcase tab selection, the video player, the inspector toggle/readout. **Never** put
  `backdrop-filter` on the pinned site header — a full-width blur over the animated
  starfield is the proven performance killer.
- Layout uses one shared container token, `--shell`, on the header, content, and footer so
  every horizontal edge aligns; it grows on ultrawide. Use it for new full-width sections.
- Legibility floor: keep readable mono labels at roughly ≥0.56rem and ice text alpha ≥~0.55
  over the void; give any label that sits over a bright model/video its own scrim.
- Motion is accent, not scaffolding. The site must feel complete with reduced motion and
  reduced effects.

## Architecture & performance
- Next.js (app router), **static export** (`output: "export"`); deploys on **push to
  `main`** via Cloudflare Pages. Keep everything export-safe.
- Progressive enhancement: HTML, type, and media hierarchy land first; decoration enhances
  after. The heavy three.js stack is lazy-imported so it stays out of first-load JS, and
  the WebGL model viewer defers until scrolled near. No heavy offscreen media preloading.
- The site must be comprehensible without WebGL and navigable without JS — the showcase
  carries an `sr-only` static link list to every entry.
- Respect `prefers-reduced-motion`, Save-Data, and lower-tier devices; the quality tiers
  (`app/lib/quality.ts`, `deviceTier.ts`) and DisplayMode provider gate the heavy layers.
- TypeScript strict: `npx tsc --noEmit`, `npx eslint app/`, and `npx next build` must all
  pass before shipping.

## Hard-won gotchas (don't relearn these)
- The pinned hero sits above the work section (z-index 4 over 2). It must stay
  `pointer-events: none` (with only its real links re-enabled) or it silently eats every
  click meant for the showcase.
- Write `backdrop-filter` **unprefixed only** — Tailwind v4's lightningcss emits the
  `-webkit-` form and strips `url()` filters.
- Field-QA URL flags are sanctioned, read-only, and never affect content:
  `?off=<layer>`, `?fps`/`?debug`, `?q=1|2|3`, `?displayMode=reduced`.

## Pending (owner to resolve)
- **Contact / email:** all CTAs point at X (`x.com/multiscatter`). A real email is deferred
  until the custom domain is chosen; add a `mailto:` to `content/site/settings.json`
  (`contact.primaryHref`) once it lands.
- **OG images:** 1200×630 JPEGs in `public/images/og/` (built from posters via `sharp`);
  regenerate when hero art changes.
