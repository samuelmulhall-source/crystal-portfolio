// Card-sized derivatives of the full-resolution stills.
//
// The showcase wall and the index rail show stills at a few hundred pixels
// wide; pointing them at the 2880–3840px originals ships megabytes for a
// thumbnail (static export = no on-the-fly image optimisation). This writes a
// 960px-wide WebP per still entry to public/images/thumbs/<slug>.webp — the
// entry's `thumbnail.src` points there, while `heroMedia.src` keeps the
// original for the stage and the detail page.
//
// Source → runtime mapping is the content itself: every work entry whose
// heroMedia is an image wider than MIN_SOURCE gets a thumb named after its slug.
//
// Run by hand when a still is added or re-rendered (not part of `npm run build`):
//   node scripts/make-thumbs.mjs            # only writes thumbs that don't exist
//   node scripts/make-thumbs.mjs --force    # re-encode all of them
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const OUT_DIR = "public/images/thumbs";
const WIDTH = 960;
const MIN_SOURCE = 1400;
const force = process.argv.includes("--force");

mkdirSync(OUT_DIR, { recursive: true });

for (const name of readdirSync("content/work").filter((n) => n.endsWith(".json"))) {
  const entry = JSON.parse(readFileSync(join("content/work", name), "utf8"));
  if (entry.heroMedia?.kind !== "image") continue;

  const source = join("public", decodeURIComponent(entry.heroMedia.src));
  const meta = await sharp(source).metadata();
  if (!meta.width || meta.width < MIN_SOURCE) continue; // already card-sized

  const out = join(OUT_DIR, `${entry.slug}.webp`);
  if (existsSync(out) && !force) {
    console.log(`= ${out} exists (use --force to re-encode)`);
    continue;
  }
  const info = await sharp(source)
    .resize({ width: WIDTH, withoutEnlargement: true })
    .webp({ quality: 82 })
    .toFile(out);
  console.log(
    `+ ${out}  ${info.width}x${info.height}  ${(info.size / 1024).toFixed(0)} KB  (source ${meta.width}x${meta.height})`,
  );
}
