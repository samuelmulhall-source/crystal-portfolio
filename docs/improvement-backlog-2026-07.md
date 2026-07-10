# Improvement Backlog — July 2026 (for the next working session)

Formulated 2026-07-10 from a full structure + code pass on `claude/elegant-mendel`
(`b1880ff`). Ordered by priority; each item is scoped to be picked up independently.
Read CLAUDE.md first — the guardrails at the bottom of this file are non-negotiable.

## P0 — Ship & safety nets

1. **Fast-forward `main` and deploy.** `origin/main` (`5f8cd67`) is 14 commits behind
   `claude/elegant-mendel`, 0 ahead — a clean fast-forward. The deployed site
   (crystal-portfolio.pages.dev) is missing: the viewer overhaul (side flyout menus,
   pan, rigged channels, quad hidden-line wire), the textured Rubia GLB + IK/joint
   limits/hand poses, the glass/IOR material fix, and the entire hero letter-flight
   (refraction paths, typed eyebrow preface, scrim standout). **Owner must say ship**;
   then merge, push, and eyeball production. After deploy: quick Lighthouse pass.

2. ~~**Content-asset existence validation.**~~ **DONE 2026-07-10** —
   `scripts/validate-content.mjs` (every root-relative file-like string in
   `content/**/*.json` must exist under `public/`; `featuredSlug` must resolve),
   chained into `npm run build` alongside the asset-size guard. All 9 content
   files pass.

3. ~~**CI gate.**~~ **DONE 2026-07-10** — `.github/workflows/ci.yml`: eslint, tsc,
   and `npm run build` (which runs both guards + the static export) on push to
   main and on PRs. Goes live once main is pushed.

## P1 — Content depth (owner-gated — never fabricate)

4. **Entry copy + galleries are thin.** Every entry has a ~160-char `summary`, none
   has `description` (the detail lede falls back to summary), galleries are 0–1
   items (Rubia: 0). The structure renders fine but reads sparse on `/work/[slug]`.
   This is owner-supplied material: prepare per-entry prompts/placeholders listing
   exactly what's missing (description, 2–4 gallery frames, `created` dates), and
   leave honest gaps rather than filler. CLAUDE.md: content is intentionally
   minimal while structure settles — so treat this as *ready-to-receive*, not
   *invent-now*.

5. **Contact email** — deferred until the custom domain lands (owner). Then set
   `contact.primaryHref` to the `mailto:` in `content/site/settings.json` and
   update `primaryLabel`. Also update `deployment.siteUrl` + regenerate OG images
   when the domain changes (canonical/OG URLs bake the Pages domain today).

6. **More rigged entries** are expected to land in the Rigged Characters tab
   (currently only Rubia). The pipeline is documented in memory + the polish log:
   Blender headless FBX→GLB (strip animations BEFORE `transform_apply`), Draco,
   optional edges-only wire GLB (`use_mesh_edges=True`).

## P2 — Code health

7. **Split `SpecimenScene.tsx` (1,324 lines).** It currently holds loaders, PBR
   material channels, rig sync, procedural clips, CCD IK, joint limits, hand poses,
   studio lights, keyboard orbit, wire overlay, shadow catcher, and the scene root.
   Mechanical extraction into `app/scene/rig/{rigSync,clips,ik,limits,poses}.ts` +
   `StudioLights.tsx`/`KeyboardOrbit.tsx`/`WireOverlay.tsx`. No behavior change;
   gates: tsc/eslint/build + a manual viewer pass (orbit, channels, wire, IK drag,
   hand poses, clips) on both Models and Rigged tabs.

8. ~~**Delete dead code.**~~ **DONE 2026-07-10** — removed `app/lib/audio/*`
   (AudioEngine, ambientDrone, sfx, useAudio) and `app/scene/wireframeShader.ts`
   after a fresh import trace, plus the entirely-unread `featureFlags` object
   (schema + settings.json). Everything else suspected stale is LIVE:
   VoidBackground/EffectsOverlay/CursorFollower mount via `EnhancementLayers`;
   `loadingOrchestrator` via `HeroIntro`.

9. ~~**Stable accessible name for the hero `<h1>`.**~~ **DONE 2026-07-10** —
   `aria-label={home.hero.title}` on the h1, `aria-hidden` on the letter-span
   wrapper and on the eyebrow's typed preface (per-character churn a reader
   shouldn't narrate). Verified in the static export.

10. ~~**JSON-LD structured data.**~~ **DONE 2026-07-10** — Person + WebSite
    `@graph` in `layout.tsx`; `VisualArtwork` (name/description/image/url/
    dateCreated/creator) per `/work/[slug]`. Verified present in the export.

## P3 — Design & performance polish

11. **Deferred owner-OK visual items** (from `docs/ui-polish-2026-06.md` — still
    wanted, need on-device WebGL eyeballing): star size-tier skew ~80/15/5
    (`LAYERS_DESKTOP`, defined in BOTH `VoidBackground.tsx` and
    `app/scene/VoidContext.ts` — keep in sync), optional rim-light bump in the
    asset viewer, and an on-device check of the shipped shadow catcher
    (`SpecimenScene.tsx`, Pass 6).

12. **On-device mobile pass.** Verify the showcase recomposes on touch: the
    draggable divider is pointer-driven (confirm it's hidden/inert on touch), tabs
    wrap, the rail is reachable, the glass video controls hit-target well. Hero:
    cue link is hidden on touch and the flight is pointer:fine-gated — confirm the
    static composition still reads. (Harness can't do this; needs a phone.)

13. **Performance budget snapshot.** Baseline recorded 2026-07-10 from the static
    export: the home page references **12 script chunks, 742 KB raw** (pre-gzip;
    the three.js stack stays lazy, out of first load). Still to do: per-route
    numbers, gzip/brotli figures, GLB/Draco payload table (`rubia.glb` 965 KB +
    wire GLB), and a prod Lighthouse run after deploy. Defend the 742 KB number.

14. **Hero video poster pipeline.** When hero art changes: regenerate
    `public/images/og/*` (sharp, 1200×630) per the CLAUDE.md pending note.

## Guardrails (read before picking anything up)

- **Never** add a showcase→detail link/CTA (`/work/[slug]` stays reachable only via
  the sr-only nav + direct URL). Firm, repeated owner rule — survives "apply all".
- Don't re-propose the two owner-rejected directions recorded in
  `docs/ui-polish-2026-06.md`.
- Never invent clients/metrics/collaborations in content.
- `backdrop-filter` unprefixed only; never on the pinned header.
- The pinned hero stays `pointer-events: none` (only real links re-enabled).
- Static export (`output: "export"`) — everything must stay export-safe.
- Ship gates: `npx tsc --noEmit` · `npx eslint app/` · `npx next build`.
