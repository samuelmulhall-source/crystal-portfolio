# Crystal Portfolio Overhaul Contract

## Product goal
- Build a clients-first portfolio that keeps the atmospheric identity but makes the primary experience clear, modern, and easy to evaluate.
- The default information architecture is:
  - `/` curated landing page — pinned hero intro → unified Work showcase (`#selected-work`) → contact.
  - `/work` the same Work showcase without the hero (a direct, hero-free entry point that deep links and the footer/CTAs point at).
  - `/work/[slug]` project detail / case-study pages.
- The Work showcase is one component (`WorkShowcase`) shared by `/` and `/work`; the home scroll and the header "Work" link land at the same place. Categories are tabbed (Models · Rigged Characters · Video · Images); collection entries (asset packs) expand into one steppable slide per asset.
- The old HUD-first cinematic journey is not the default product. Do not reintroduce it into the main navigation or content-discovery flow.

## Audience and decision filter
- Primary audience: clients, art directors, and collaborators evaluating fit.
- Every design or implementation decision should answer:
  - does this improve trust?
  - does this improve clarity?
  - does this improve presentation quality?
- If a change is impressive but makes project review slower or less legible, reject it.

## Visual system rules
- Keep the mood: deep midnight backgrounds, slate surfaces, soft ice text, restrained cyan accents.
- Typography is intentional. Roles: **Archivo** for body/UI/display (CSS var `--font-archivo`), **IBM Plex Mono** for meta/labels (`--font-plex-mono`), and the self-hosted **VTKS Trunkset** woff2 for the hero wordmark only (`--font-display`). Mono is for labels, indices, and technical readouts — never body copy.
- Glass UI (frosted `backdrop-filter` + specular edge) is for small chrome only — showcase tab selection, case-study pill, video frame + player controls, the inspector toggle. Never on the pinned site header: full-width `backdrop-filter` over the animated starfield is the proven perf killer.
- Motion is accent, not scaffolding. The site must still feel complete with reduced motion and reduced effects.

## Architecture rules
- Work entries live in `content/work/` and should generate showcase/detail behavior without component edits (categories derive from media; an explicit `category` field overrides; `assets[]` makes an entry a steppable pack).
- Global settings live in `content/site/`.
- The main site must remain static-export friendly and readable without WebGL. The Work showcase carries an `sr-only` static link list so every entry is reachable without JS.
- Field-QA URL flags are sanctioned, not debug cruft: `?off=<layer>`, `?fps`/`?debug`, `?q=1|2|3`, `?displayMode=`. They are read-only and never affect content.


## Performance posture
- Default stance: progressive enhancement.
- HTML, typography, and media hierarchy must land before any decorative enhancement.
- No heavy offscreen media preloading in the main path.
- No always-on fullscreen canvas requirement for navigation or comprehension.
- Respect reduced motion, data saver, and lower-tier devices.

## Content and copy rules
- Write for external evaluation, not for internal lore.
- Do not invent client outcomes, production metrics, or collaboration details that are not real.

## Pending (owner to resolve)
- **Email / contact:** all contact CTAs point at X (`x.com/multiscatter`). A real email is intentionally deferred until the custom domain is chosen (email will attach there). Add a `mailto:` to `content/site/settings.json` (`contact.primaryHref`) once the domain lands.
- **Content is intentionally minimal** while the structure settles; full copy/media arrive later. The empty **Rigged Characters** tab is kept on purpose as a placeholder for incoming work.
- **OG image:** generated 1200×630 JPEGs live in `public/images/og/` (built from posters via `sharp`). Regenerate when hero art changes.


