// Smaller renditions of each still (1280 / 1920 px wide WebP) so phones and
// smaller windows don't download the full-resolution file. Writes
// public/images/sized/<slug>-<width>.webp; skips sizes at or above the original.
// Re-run when a still is added or replaced:  node scripts/make-sizes.mjs
import { readdirSync, readFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const ROOT = process.cwd();
const OUT = join(ROOT, "public/images/sized");
mkdirSync(OUT, { recursive: true });
const WIDTHS = [1280, 1920];
for (const f of readdirSync(join(ROOT, "content/work")).filter((x) => x.endsWith(".json"))) {
  const e = JSON.parse(readFileSync(join(ROOT, "content/work", f), "utf8"));
  if (e.heroMedia?.kind !== "image") continue;
  const src = join(ROOT, "public", e.heroMedia.src);
  if (!existsSync(src)) continue;
  const { width } = await sharp(src).metadata();
  for (const w of WIDTHS) {
    if (w >= width) continue;
    const out = join(OUT, `${e.slug}-${w}.webp`);
    await sharp(src).resize({ width: w }).webp({ quality: 86 }).toFile(out);
    console.log("wrote", out);
  }
}
