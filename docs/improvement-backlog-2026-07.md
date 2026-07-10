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

2. **Content-asset existence validation.** `app/lib/content.ts` (Zod) validates shape,
   not files — a typo'd `src`/`poster`/`ogImage`/`modelPath` in `content/**/*.json`
   ships silently and 404s in prod. Add a small validation script (walk every
   string field that looks like a path, assert it exists under `public/`), wired as
   `npm run validate` and called before `next build`. ~40 lines, no new deps.

3. **CI gate.** Deploys are push-to-`main` with zero remote checks. Add one GitHub
   Action running the local trio (`tsc --noEmit`, `eslint app/`, `next build` +
   the validator from #2) on push/PR. Keeps a bad push from becoming a bad deploy.

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

8. **Delete dead code.** Verified unreachable via import trace (2026-07-10):
   `app/lib/audio/AudioEngine.ts`, `ambientDrone.ts`, `sfx.ts`, `useAudio.ts`
   (only reference each other; `featureFlags.ambientAudio` is false and no
   component imports the hook) and `app/scene/wireframeShader.ts` (zero importers).
   Re-verify with a fresh trace, then remove; also consider dropping the
   `ambientAudio`/`experienceRoute` feature flags if nothing reads them.
   (Everything else suspected stale is LIVE: VoidBackground/EffectsOverlay/
   CursorFollower mount via `EnhancementLayers`; `loadingOrchestrator` via
   `HeroIntro`.)

9. **Stable accessible name for the hero `<h1>`.** The letter-flight mutates the
   h1's text content — keyboard-focusing the lantern doorway morphs the heading to
   "Soulbound Lantern" for screen readers too. Put `aria-label="Multiscatter"`
   (from `home.hero.title`) on the h1 and `aria-hidden="true"` on the letter-span
   wrapper so AT always reads the brand regardless of flight state.
   (`app/page.tsx` + `HeroWordmark.tsx`.)

10. **JSON-LD structured data.** `layout.tsx` has rich OG/Twitter meta but no
    JSON-LD. Add a `Person` (brand, sameAs → X) on the root and `CreativeWork` per
    `/work/[slug]`. Cheap, export-safe, real SEO trust for a portfolio.

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

13. **Performance budget snapshot.** Record first-load JS per route from `next
    build`, confirm the three.js stack stays out of first load (lazy chunks), note
    GLB/Draco payload sizes (`rubia.glb` 965 KB + wire 250k-edge GLB). Store the
    numbers in this doc as the baseline to defend.

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
