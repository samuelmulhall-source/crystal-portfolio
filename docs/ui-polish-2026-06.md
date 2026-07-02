# UI polish pass — June 2026

Design critique (external notes) triaged against taste + the project decision filter
(trust / clarity / presentation quality; atmosphere serves the work). Each item is
marked **Apply**, **Adapt**, or **Defer** with rationale + status.

> **Standing rule — no showcase→detail CTA.** The showcase must NOT link out to
> `/work/[slug]` (no "View details" / "Closer look" / expansion link). This was added
> once in error and removed; do not reintroduce it. See CLAUDE.md "Information architecture".

## Durable principles added (see CLAUDE.md "Visual system")
- **Typographic contrast:** mono (IBM Plex Mono, UPPERCASE, tracked) is reserved for
  HUD / technical readouts — eyebrows, the stats badge, channel chips, tab labels,
  the on-render caption. The **datasheet field labels** (Format/Discipline/Role/Tools)
  use **Archivo, Title-case** for an editorial voice that breaks the all-caps monotony.
- **Border economy:** prefer spacing over outlines; no per-row hairlines on list data.
- **One gradient focal per view:** gradient text is reserved for the single content
  hero (the entry title); page-level headings are solid.
- **Optical, not mathematical, spacing:** more air above a heading than below it.
- **Motion + focus tokens:** `--ease-out`, `--dur-1/2/3`, `--focus-ring` (already added).

## Decisions

1. **All-caps monotony** — *Apply (Adapt).* Datasheet field labels → Archivo Title-case,
   muted; mono stays the HUD voice. **Done.**
2. **Datasheet left-alignment / rhythm** — *Adapt.* Solved with optical spacing and a
   calmly centered datasheet, rather than indents (indents read as accidental). **Done.**
3. **Metadata dividers heavy / repeated ×5** — *Apply.* Removed per-row hairlines; rows
   now read on spacing alone. **Done.**
4. **Viewer needs more drama / "photographed"** — *Apply (CSS).* Richer media backing:
   soft contact shadow beneath the asset, deeper vignette, lifted core glow + top rim.
   Live-3D rim-light/shadow-catcher is a further step (needs on-device check). **Done (CSS).**
5. **Thumbnail strip** — *Apply.* Active thumb scales up; labels fade in on hover/active
   (cleaner strip, more satisfying selection). **Done.**
6. **Stats badge kissing the frame** — *Apply.* Badge + controls inset 0.7rem → ~1.15rem. **Done.**
7. **Optical spacing pass** — *Apply.* More space above the title; calmer rhythm. **Done.**
8. **Borders, remove ~30%** — *Apply.* Spec-row borders removed (5 gone); glass-chip
   edges + viewer reticles kept (they carry the material/HUD read). **Done.**
9. **Tabs/buttons feel static** — *Apply (restrained).* Designed easing + hover tint +
   pressed scale + active prominence (added this pass). Skipped the literal "highlight
   sweep" — reads gimmicky against the restrained system. **Done.**

## Deferred (need owner OK / on-device verification — WebGL can't be screenshotted here)

- **Star size distribution (80/15/5).** The field already has spectral color, per-star
  brightness, twinkle, and Milky-Way clustering — it is *not* uniform/random. The only
  gap is a size skew toward many tiny + few bright. Proposed: rebalance layer counts
  (`LAYERS_DESKTOP` — defined in both `app/components/VoidBackground.tsx` and
  `app/scene/VoidContext.ts`; there is no `STAR_LAYERS` constant) toward ~80/15/5 and/or
  add per-star size jitter in `app/scene/Starfield.tsx`. Held because it re-tunes a
  confirmed-good, hard-to-verify layer.
- **Live-3D presentation drama.** ~~Optional rim-light bump + shadow-catcher plane in
  `SpecimenScene` StudioLights~~ — **the shadow-catcher shipped in Pass 6** (see below);
  only the optional rim-light bump remains open, verify on device.
- **Hero front-smoke offset.** Only the back layer was dropped (15%); front untouched
  unless requested.

---

## Pass 2 — triage of a 17-item external critique (judge-panel resolved)

Four art-director lenses (hierarchy / spacing-density / interaction / cohesion-risk)
evaluated all 17 items against the live code. Consensus below.

**Applied (reduced-mode verifiable):**
- **#1 bigger viewer** — default `infoFr` 0.36 → 0.34 (more to the viewer; divider still
  owns the trade-off, MIN_FR 0.26 kept); stage `min-height` → taller.
- **#2 tighter metadata** — `.showcase__spec` padding 0.5→0.4rem, `.showcase__specs` gap
  0.15→0.12rem (keep the 2-col grid; do NOT pack two fields per row — long Role/Tools
  values need the room).
- **#3 wider measure** — `.showcase__summary` max-width 42ch → 46ch (premise of "35ch"
  was stale; 46ch stays inside the readable ceiling).
- **#7 integrate rail** — `.showcase__rail` margin-top 0.85→0.55rem; resting thumb border
  → transparent (keep the is-active border). Do NOT embed it inside the media box.
- **#11 contact-meta rhythm** — vertical gap 0.6→0.9rem; pair gap 0.3→0.35rem. No
  fabricated fields (content contract).
- **#12 bigger contact CTAs** — `.button-link` min-height 2.9→3.3rem, padding →0.95/1.9rem,
  border alpha 0.18→0.24, + pressed `:active` scale.
- **#13 targeted border removal** — drop `.section-head` bottom hairline + `.site-footer`
  top hairline (spacing covers them). KEEP viewer reticles + glass-chip edges (contract).
- **#14 contact legibility** — strengthen the existing local `.contact-section::before`
  scrim (0.52→0.6); do NOT globally dim the starfield (cross-component side effect).
- **#15 viewer as hero (no frame)** — soft outer drop-shadow on `.showcase__media` + a
  touch more core-glow; the sanctioned "rule-break" without re-boxing the seamless viewer.
- **#17 footer mark** — calmer end-mark (0.72→0.68rem, recede to `--ice`); pairs with the
  removed footer border.

**Rejected / already-done (with reason):**
- **#5** asset already ~71% live (the 40% is the static poster; poster crop is content work).
- **#9** N/A — the showcase has no detail-page CTA at all (removed; see standing rule above).
- **#15-as-card / #6 dust** — no hard frame, no animated dust (seamless backing + motion budget).
- **#16** nav active state (is-active + aria-current + underline) already shipped.
- **#1 "80-100px column"** rejected — split already ~36/64 and divider-resizable.
- **#4 / #8** channel chips are already a segmented control; drag-hint tweaks are 3D-only,
  unverifiable here, low value — left alone.

**Still deferred (need on-device WebGL check):** live rim-light (the shadow-catcher half
shipped in Pass 6); star size-tier skew; any channel-chip / drag-hint micro-polish
(renders only in the live WebGL stage).

---

## Pass 3 — legibility (refs: WCAG AA 4.5:1 / 3:1; dark-mode halation guidance — avoid pure
white on near-black; small tracked labels need contrast headroom)

- **Halation:** gradient titles now start at off-white `#eef5ff` instead of pure `#fff`
  (`.showcase__title`, `.section-head__title`) — keeps the bright read, kills the worst
  glow/halo over the `#000005` void.
- **Low labels raised toward a comfortable floor:** `.contact-status` 0.55→0.66,
  `.section-head__link` 0.55→0.66, `.contact-meta dt` 0.58→0.64, `dd` 0.82→0.88. Body/value
  text was already 10-15:1 and untouched; the label↔value hierarchy is preserved.
- **Mono size floor:** `.specimen-viewer__channel` 0.54→0.56rem (meets the ≥0.56rem floor),
  colour 0.66→0.70.
- **Scrim over bright media (contract rule):** `.specimen-viewer__hint` gains a dark
  `text-shadow` + 0.6→0.74 alpha so it stays readable over a bright/white model (it floats
  with no panel of its own). [3D-only — not screenshot-verifiable here.]
- Datasheet field labels kept at `--text-muted` (#7aa0b8 ≈ 7.5:1 on the void) — legible AA
  and deliberately subordinate to the bright values.

---

## Pass 4 — model-viewer HUD chrome visibility (research-backed, workflow wf_34483783-4ba)

Owner: "the visibility and overall quality and style of the model viewer and selection UI
here is lacking." Researched via 4 parallel sweeps (AAA item-inspect UIs, premium product
configurators, glass/HUD material craft, dark-UI contrast standards) — see chat log for the
full source list (scifiinterfaces.com, kube.io Liquid Glass, Material Design 3 dark theme,
Atlassian elevation, gameuidatabase.com, et al.). Root cause: several chrome pieces were
**invisible at rest**, not just understated — an unselected channel chip had
`border: 1px solid transparent`, the badge/rack blur was 0.5–2px with 0.1–0.16 alpha borders,
reticle corners were a fixed 22px/0.22-alpha decoration, and the hint/nav arrows relied on
`text-shadow` alone with no fill of their own.

**Applied (verified live in enhanced/WebGL mode, both Shaded and Wire channels):**
- **Real resting borders** — `.specimen-viewer__channel` and `.showcase__rail-thumb`:
  transparent → `rgba(205,232,255,0.1–0.12)`. An invisible border isn't restraint, it's a
  missing affordance; active-state borders (0.3/0.42) stay the clear "lit" delta.
- **Reticle corners scaled proportionally** — `22px` fixed → `clamp(32px,4vw,48px)`, alpha
  `0.22→0.4`, plus a dark `drop-shadow` contact-outline so the hairline survives passing
  behind a bright PBR/albedo render.
- **Badge + chip-rack fill/elevation** — lightened background, added a real
  `box-shadow: 0 4px 16px rgba(0,0,0,.35)` alongside the existing inset highlight, and a
  **directional (angle-biased) border** (brighter top/left) matching the implied light
  direction of the site's existing `GlassRefraction.tsx` specular pass.
- **Active chip — fewer stacked effects** — dropped the gradient fill (was
  gradient+border+inset+glow = 4 effects) for a flat lightened background; border+inset+glow
  stays, capped at the 2–3-effects-per-state rule AAA rarity systems use.
- **Hint gets its own glass plate** (reuses the badge's fill recipe) instead of
  text-shadow-only, and **dismisses itself once the user actually drags** — `hasInteracted`
  state in `SpecimenViewer.tsx`, `pointerdown` on `.specimen-viewer__stage` → adds
  `.is-dismissed` (animation cleared, opacity transitions to 0). Resets when the specimen
  changes so a new asset re-shows it.
- **Nav chevrons get a quiet circular glass plate** behind the glyph (`::before`, 2.4rem
  circle, 0.4 alpha at rest → full + ice-bright border on hover/focus) — text-shadow-only
  chrome was the first thing to wash out over a bright model.

**Deferred:** an optional reduced-motion-gated breathing pulse on the reticle corners — the
research flagged it but noted to skip if it reads as busy; not applied. Needs an owner
on-device check like the other WebGL-only items in this doc (screenshots here go through the
`off=webgl,cursor,effects` flag combo to get a clean capture of just the model viewer).

---

## Pass 5 — full viewer-chrome redo (owner rejected Pass 4 outright: "rip out ALL the
visuals... and completely redo it"; cited-research rebuild, not another reticle iteration)

Root diagnosis: the "targeting reticle" concept itself (corner brackets, tick marks, a badge
"pill") was the problem, not its execution — no real professional 3D tool or product viewer
uses a decorative viewport frame. Rebuilt from real fetched/searched sources:
- **Stats readout → bare text, no panel at all.** Blender's viewport-overlay convention
  (docs.blender.org/manual, .../display/overlays.html): vertex/tri counts are plain top-left
  text, zero box/border/background. `.specimen-viewer__stats` — confirmed
  `background: transparent, border-width: 0px, box-shadow: none`.
- **Controls → a flat, OPAQUE bottom toolbar**, split from the stats readout at top —
  Sketchfab's actual layout (info top, controls bottom; chrome recedes once you interact —
  sketchfab.com/blogs/community/discover-new-viewer). Panel fill is a solid
  `rgba(15,19,28,0.94)`, no glass/blur/border/glow — Refactoring UI's dark-mode elevation
  guidance: shadows/borders barely read on dark backgrounds, a lighter flat shade does
  (medium.com/refactoring-ui/7-practical-tips-for-cheating-at-design).
- **Segmented control drops the site's decorative chip-skew** for this one component — Apple's
  real segmented controls are plain rectangles/capsules, never slanted
  (developer.apple.com/design/human-interface-guidelines/segmented-controls). Sliding
  indicator is a flat solid fill (`rgba(230,244,255,0.96)`, no glow) with dark
  (`var(--void)`) text on it for max contrast; its 4px radius = the rack's 8px radius minus
  4px padding — Apple's "concentric shapes" rule.
- **Thumbnail rail ("model preview bar") — zero borders anywhere.** Selection is carried
  purely by opacity + scale (0.5→1.0 opacity, 1→1.12 scale), the way Apple TV's carousel
  focus state works. Confirmed live: resting thumb `opacity:0.5, border:0px`; active
  `opacity:1, transform:scale(1.12), border:0px`.

**Process note:** the research workflow's subagents hit the session's token/rate limit
mid-run; pivoted to doing the WebSearch/WebFetch research directly (sequential, same rigor)
rather than losing the research entirely.

---

## Pass 6 — real shadow-catcher (owner: the CSS-gradient backing "feels weak")

Diagnosis: a painted CSS gradient behind an already-lit 3D object always reads a little
disconnected, because the "light" implied by the gradient has nothing to do with the light
actually hitting the model. Fix is in the WebGL scene, not more CSS tuning:
- `SpecimenScene.tsx`: `<Canvas shadows="soft">` (PCFSoftShadowMap — confirmed live via
  `gl.shadowMap.type === 2`); the key light (`position=[-4,8,6]`, the brightest of the rig)
  gets `castShadow` + a shadow-camera frustum sized tight to the ~2-unit normalized asset
  (`±3` ortho bounds, near 0.5 / far 20, 1024×1024 map) — every OTHER light stays shadow-less
  fill, one defining shadow instead of an overlapping mess from six directions (confirmed:
  `keyLightShadowMapSize: [1024,1024]`, only one light has `castShadow`).
- All real model meshes get `castShadow` + `receiveShadow` (confirmed: 2/2 real meshes, the
  3rd "mesh" the check found was the catcher plane itself, correctly not casting).
- A new `ShadowCatcher` component: an invisible plane (`THREE.ShadowMaterial`, opacity 0.4,
  renders *only* where a shadow falls) positioned at the asset's true world-space base —
  derived from the real bounding box (`groundY = yOffset - ns * size.y / 2`), not guessed.
  Confirmed live for the sword asset: `shadowCatcherY: -1` (tall/thin prop, half its
  normalized height below center — checks out).
- Removed the old fake CSS contact-shadow ellipse from `.showcase__media`'s background stack
  (it would have doubled up with the real shadow now rendering above it); kept the core glow,
  vignette, and ring graticule — those are genuine atmosphere, not a faked shadow.

**Verification:** screenshots hang on WebGL pages in this session (a recurring harness
limitation, not a code issue — no console errors either time). Verified instead via a
temporary `onCreated` debug hook exposing the R3F `state` (renderer + scene), checked
`gl.shadowMap.enabled/type`, walked the scene graph for the catcher mesh + its material type/
position/opacity and the key light's shadow config, then removed the hook. Not yet confirmed
by eye — flag for an on-device check.

---

## Pass 7 — kill the "cheap blue haze" (owner: shadow-catcher didn't fix the real complaint)

Owner feedback after Pass 6: the shadow idea was fine, but it was never the actual problem —
the flat, centered, single-tone radial glow behind the model is what reads as cheap. Diagnosis:
a perfectly symmetric, saturated colored blob is exactly the generic-template "spotlight"
effect; it competes with the lit object for colour instead of receding, and a smooth CSS
gradient bands in a way that photographs never do.

- **Off-axis, not centered.** The highlight in both `.showcase__media` and the base
  `.specimen-viewer` background is now offset upper-left (`38% 30%`), matching the actual
  position of `SpecimenScene`'s key light (`[-4, 8, 6]` in `StudioLights`) instead of a
  generic centered wash.
- **Desaturated and small.** Dropped the mid-blue tone (`rgba(150,210,245)` at up to 0.5
  alpha, spanning ~half the frame) for a much quieter lift — `rgba(184,224,245)` (the site's
  own `--ice` hue, not a separate invented blue) at 0.15–0.16 alpha, tighter ellipse (~38%
  vs ~54%), earlier falloff. The wall should be quiet; the object supplies the colour.
  Also dropped the added violet "bounce-light" undertone from the first attempt at this pass
  — it wasn't visible against the vignette and one extra layer wasn't earning its keep.
- **Grain.** Added a tiled `feTurbulence` SVG data-URI as the first background layer (~5%
  alpha noise) on both rules — breaks up the gradient banding that's the other tell of a
  flat CSS wash. Confirmed via computed-style readback that lightningcss passes a
  `background-image: url("data:image/svg+xml,...")` through untouched (unlike the
  `backdrop-filter: url(#id)` case documented in Pass 3/CLAUDE.md — that stripping is
  specific to the filter property, not general `url()` handling).
- Kept the vignette and the centered ring graticule (turntable platform, unrelated to the
  light direction) from Pass 6 as-is.

**Verification:** screenshotted `/work` (Models tab, sword) and `/work/rubia-rigged-character`
(base `.specimen-viewer`, no showcase wrapper) after the change — both show a faint off-axis
lift instead of a dominant blue blob. Confirmed computed `background-image` includes the data
URI unmodified. `tsc --noEmit` clean.

---

## Pass 8 — strip to a studio wall ("less is more")

Owner feedback on Pass 7's off-axis lift: still cheap; *"less is more sometimes."* The problem
wasn't just the blob's saturation — it was the **quantity of decoration**. A real product/studio
backdrop is ONE smooth graduated sweep, not a stack of five effects. Reference basis (the same
class I've cited before — Sketchfab's default viewer, Marmoset, a photographic cyclorama, Apple's
dark hero sections): brightest behind the subject, falling to dark at the edges, near-neutral so
the lit object owns all the colour, and **no pattern**. (A focused research workflow was launched
first per ultracode, but every subagent + the synthesis died instantly on the account's session
limit — reset 8:20pm Sydney — so I applied the established principle directly, same as the Pass 5
research-workflow failure.)

Cut, on both `.showcase__media` and `.specimen-viewer`:
- **The concentric-ring graticule** (`repeating-radial-gradient`) — a dated turntable gimmick; the
  single busiest element and the biggest "cheap" tell.
- **The separate `linear-gradient(180deg)` darken** — redundant; folded its top-lighter/floor-darker
  read into the vignette by biasing the vignette centre slightly high (`50% 40%`), so the floor
  falls off on its own.

Changed:
- **Glow → faint neutral pool.** From a distinct blue lift (`rgba(184,224,245)`, tight ellipse) to a
  large, soft, near-neutral pool (`rgba(176,206,232,0.08–0.085)`, ellipse `70% 60% at 47% 40%`,
  falloff at 66%) with no discernible edge — reads as a lit wall, not a spotlight.
- **Lifted base colour** (`#05070e` / `#04060c`) instead of ending on a gradient, so the rounded
  panel reads as a surface rather than a hole punched in the void.
- **Grain kept but nudged down** (colour-matrix alpha `0.05 → 0.045`) — it stays only to kill
  dark-gradient banding (subtraction, not decoration).

Net: 5 background layers → 4 (grain, pool, vignette, base), and the removed one was the noisiest.

**Verification:** `/work` (sword) and `/work/rubia-rigged-character` both now read as a quiet
graduated studio wall — faint neutral pool behind the subject, dark falloff at the edges, no
rings, no blue smudge. Computed-style check confirms `repeating-radial-gradient` and
`linear-gradient` are gone and the grain data-URI survives lightningcss. No console errors.
`tsc --noEmit` clean.

---

## Pass 9 — hero lantern "doorway" into its work entry

New affordance (not the viewer): make the hero lantern a considered doorway down to its own
showcase entry. Started as a bare name chip on hover; owner wanted it richer — *"darken the rest
of the screen and some geometric flowing indicators… remember igloo influence."* Built on that
without tipping into HUD-gaudy (the earlier rejected direction):
- **Recede, don't just label.** On hover/focus a hero-level scrim (`.hero-focus-scrim`, owned by
  `HeroFocusProvider`) fades in — a radial that's cleared over the lantern and darkens outward, so
  the wordmark + starfield recede and the object is spotlit. Layered by z-index: wordmark (2) <
  scrim (4) < scroll cue (5) < lantern wrap (6), so the object and the descent's destination stay
  lit while everything else falls back.
- **Geometric descent current.** A line-art guide drops from the object's base with chevron marks
  (border-corner, rotated 45°) flowing downward on a staggered loop — "select this → travel down
  to it," in the igloo line-weight language. Anchored to the lantern (rides its parallax), above
  the scrim.
- **`◊`-tick caption** names the piece (ties to the HUD ◊ used in the viewer stats/empty states).
- **Coordination** is React state, not a global class: `HeroSpecimenCue` flips a shared
  `focusing` (context) on `onPointerEnter`/`onFocus`; the chip, descent, and scrim all reveal in
  lockstep. Click dispatches `work:focus` → `WorkShowcase` opens the Video/Soulbound-Lantern slide
  (lands on the piece, not the default Models tab) while the `#selected-work` anchor scrolls.
- **Safe by construction:** the target is an `<a>` (inherits `.hero-intro a { pointer-events:auto }`
  without re-enabling a larger container) and lives in the wrap the dive transforms off-screen, so
  it never eats clicks meant for the work section behind the pin. Scrim/descent are
  `pointer-events: none`. Disabled on touch (`hover: none`). Reduced-motion: scrim still dims, no
  flowing marks (a single static chevron), no lift.

**Verification:** on a healthy tier-1 viewport (`?q=1&displayMode=reduced`), dispatched a real
`pointerover` → React set `is-focusing` + scrim `is-on` (computed opacities 1); screenshot shows
the wordmark receding, the lantern spotlit, the chip + descent chevrons; `pointerout` clears it;
click lands on Video → Soulbound Lantern. `tsc`, `eslint app/`, and `next build` (static export,
14 pages) all clean.

(Process note: hit the recurring stale-CSS trap hard — Next 16 dev is Turbopack, cache at
`.next/dev/cache/turbopack`; clearing only `.next/cache` or restarting does nothing, must `rm -rf
.next`. Logged in the `preview-harness-limits` memory.)
