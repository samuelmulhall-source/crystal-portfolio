# Multiscatter — portfolio

Portfolio for **Multiscatter**, a 3D generalist / technical artist. Next.js (app
router) with a **pure static export** (`output: "export"`), React Three Fiber for
the interactive model viewers, GSAP + Lenis for the pinned hero intro and smooth
scroll.

Live: https://crystal-portfolio.pages.dev/

## Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Work entries live in
`content/work/*.json` (Zod schema in `app/lib/content.ts`); adding or editing an
entry requires no component changes. See `CLAUDE.md` for the working contract
(information architecture, visual system, hard-won gotchas).

Fonts: Archivo (body/UI) and IBM Plex Mono (technical labels) via
`next/font/google`, plus a self-hosted VTKS Trunkset subset for the hero
wordmark via `next/font/local`.

## Build & deploy — Cloudflare Pages (static)

Deploys automatically on push to `main`. Do **not** use the "Next.js" preset
(OpenNext) on Cloudflare — this is a plain static export.

- **Framework preset:** None (or "Static site")
- **Build command:** `npm run build` (runs a 25 MiB per-file asset guard, then `next build`)
- **Build output directory:** `out`

No Workers runtime required. Note Cloudflare Pages rejects the entire deploy if
any single file exceeds 25 MiB — heavy DCC sources belong in the gitignored
`art-source/`, converted to Draco GLB for `public/` (decoder self-hosted in
`public/draco/`).
