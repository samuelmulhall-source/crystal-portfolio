# Crystal Portfolio Overhaul Contract

## Product goal
- Build a clients-first portfolio that keeps the atmospheric identity but makes the primary experience clear, modern, and easy to evaluate.
- The default information architecture is:
  - `/` curated landing page
  - `/work` archive
  - `/work/[slug]` project detail pages
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
- Typography is intentional and split by role:
  - primary: Space Grotesk
  - technical/meta: IBM Plex Mono
- Tiny uppercase mono is for labels and metadata only.
- Primary CTAs, headings, and body copy must never depend on hover or hidden chrome to become legible.
- Motion is accent, not scaffolding. The site must still feel complete with reduced motion and reduced effects.

## Architecture rules
- Content is the source of truth. Do not rebuild the site around directory-scan order or hardcoded scene arrays.
- Work entries live in `content/work/` and should generate archive/detail behavior without component edits.
- Global settings live in `content/site/`.
- The main site must remain static-export friendly and readable without WebGL.
- Interactive or immersive work, if brought back later, must be optional and layered on top of the content system rather than replacing it.

## Performance posture
- Default stance: progressive enhancement.
- HTML, typography, and media hierarchy must land before any decorative enhancement.
- No heavy offscreen media preloading in the main path.
- No always-on fullscreen canvas requirement for navigation or comprehension.
- Respect reduced motion, data saver, and lower-tier devices.

## Content and copy rules
- Write for external evaluation, not for internal lore.
- Be specific about what a piece demonstrates: framing, lookdev, mood, material control, presentation, or realtime thinking.
- Do not invent client outcomes, production metrics, or collaboration details that are not real.
- If information is missing, state the work honestly as a personal study, R&D piece, or exploratory build.

## Claude collaboration protocol
- Claude is a design/content copilot and review partner, not the final product owner.
- Loop Claude in at four checkpoints:
  - after content schema or IA changes
  - after major visual-system changes
  - after the first new project-detail template changes materially
  - during final design QA and copy review
- Loop the user and Claude in before changing:
  - target audience
  - route structure
  - typography system
  - content schema shape
  - progressive-enhancement policy

## Current branch execution brief
- Current milestone: overhaul the default experience around typed content, archive/detail routes, and a lighter atmospheric shell.
- Required review artifacts for major milestones:
  - desktop home screenshot
  - mobile home screenshot
  - archive screenshot
  - one project-detail screenshot
  - lint/build results
- Migration priority:
  - featured case studies first
  - supporting archive entries second
  - immersive/legacy experiments only after the main portfolio path is strong
