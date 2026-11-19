// Files the site derives from a piece's own media: thumbnails, phone
// renditions, share images, video posters, set-photograph crops. Each writes
// at the tool's conventional path (images/<kind>/<slug>…) and returns the URL.
import sharp from "sharp";
import { spawnSync } from "node:child_process";
import { mkdirSync, existsSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { PUBLIC, urlOf } from "./content.mjs";
import { serve } from "./serve.mjs";
import { launch } from "./browser.mjs";

export const DIRS = {
  thumbs: join(PUBLIC, "images/thumbs"),
  sized: join(PUBLIC, "images/sized"),
  og: join(PUBLIC, "images/og"),
  posters: join(PUBLIC, "images/posters"),
  set: join(PUBLIC, "images/set"),
};
/** The conventional URL of each derived file. */
export const conv = {
  thumb: (slug) => `/images/thumbs/${slug}.webp`,
  og: (slug) => `/images/og/${slug}.jpg`,
  poster: (slug) => `/images/posters/${slug}.webp`,
  set: (id) => `/images/set/${id}.webp`,
  tile: (id) => `/images/set/${id}-tile.webp`,
};
export const SIZES = [1280, 1920];

async function toFile(img, file) {
  mkdirSync(dirname(file), { recursive: true });
  return img.toFile(file);
}

/** Card-sized still (960 px wide) for the index and phones. */
export async function makeThumb(src, slug, outDir = DIRS.thumbs) {
  const file = join(outDir, `${slug}.webp`);
  const info = await toFile(sharp(src).resize({ width: 960, withoutEnlargement: true }).webp({ quality: 82 }), file);
  return { url: urlOf(file), width: info.width, height: info.height };
}

/** Phone catalogue card: 256 px wide (its 84 px box at 3× density). Picked up
 *  by app/lib/lit-pieces.ts when present. */
export async function makeCard(src, slug, outDir = DIRS.thumbs) {
  const file = join(outDir, `${slug}-card.webp`);
  await toFile(sharp(src).resize({ width: 256, withoutEnlargement: true }).webp({ quality: 80 }), file);
  return urlOf(file);
}

/** Phone / small-window renditions (picked up by srcset automatically). */
export async function makeSizes(src, slug, outDir = DIRS.sized) {
  const { width } = await sharp(src).metadata();
  const made = [];
  for (const w of SIZES) {
    if (w >= width) continue;
    const file = join(outDir, `${slug}-${w}.webp`);
    await toFile(sharp(src).resize({ width: w }).webp({ quality: 86 }), file);
    made.push(urlOf(file));
  }
  return made;
}

/** Share image, 1200 × 630. `focus` "attention" finds the work's subject; a
 *  set photograph is cropped from its centre (the model stands there). */
export async function makeOg(src, slug, { focus = "attention", outDir = DIRS.og } = {}) {
  const file = join(outDir, `${slug}.jpg`);
  const position = focus === "centre" ? "centre" : sharp.strategy.attention;
  await toFile(sharp(src).resize(1200, 630, { fit: "cover", position }).jpeg({ quality: 86, mozjpeg: true }), file);
  return urlOf(file);
}

/** A set photograph (canvas pixels) → the wide still + its 4:3 tile.
 *  The backdrop carries the set's film grain, which WebP can only keep above
 *  ~q66 (below that the encoder smooths it away); q74 keeps it. The tile only
 *  feeds small cards and peeks, so it is 480 × 360. */
export const TILE = { width: 480, height: 360 };
export async function writeSetPhoto(png, id, outDir = DIRS.set) {
  const meta = await sharp(png).metadata();
  const wide = join(outDir, `${id}.webp`), tile = join(outDir, `${id}-tile.webp`);
  await toFile(sharp(png).webp({ quality: 74 }), wide);
  const tw = Math.round((meta.height * 4) / 3);
  await toFile(sharp(png).extract({ left: Math.round((meta.width - tw) / 2), top: 0, width: tw, height: meta.height }).resize(TILE.width, TILE.height).webp({ quality: 80 }), tile);
  return { src: urlOf(wide), width: meta.width, height: meta.height, thumb: urlOf(tile), wideFile: wide };
}

// ── video frames ────────────────────────────────────────────────────────────
const hasFfmpeg = () => spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0;

/** PNG buffers of the frames at `times` (seconds). ffmpeg when it's on the
 *  PATH, else the headless browser decodes the file itself. */
export async function videoFrames(file, times) {
  if (hasFfmpeg()) {
    return times.map((t) => {
      const r = spawnSync("ffmpeg", ["-v", "error", "-ss", String(t), "-i", file, "-frames:v", "1", "-f", "image2pipe", "-c:v", "png", "-"], { maxBuffer: 256 * 1024 * 1024 });
      if (r.status !== 0 || !r.stdout?.length) throw new Error(`ffmpeg couldn't read a frame at ${t}s: ${r.stderr}`);
      return r.stdout;
    });
  }
  const page = `<!doctype html><video id=v muted playsinline preload=auto src="/${encodeURIComponent(basename(file))}"></video><script>
window.grab = (t) => new Promise((res, rej) => {
  const v = document.getElementById("v");
  const go = () => { v.currentTime = t; };
  v.onseeked = () => { const c = document.createElement("canvas"); c.width = v.videoWidth; c.height = v.videoHeight; c.getContext("2d").drawImage(v, 0, 0); res(c.toDataURL("image/png")); };
  v.onerror = () => rej(String(v.error && v.error.message));
  if (v.readyState >= 1) go(); else v.onloadedmetadata = go;
});</script>`;
  const srv = await serve(dirname(file), { "/__frame": (req, res) => res.writeHead(200, { "content-type": "text/html" }).end(page) });
  const b = await launch({ width: 800, height: 600 });
  try {
    await b.go(`${srv.base}/__frame`);
    const out = [];
    for (const t of times) {
      const url = await b.eval(`grab(${t})`);
      if (!url) throw new Error(`the browser couldn't decode ${basename(file)} (codec?) ${b.errors.join(" ")}`);
      out.push(Buffer.from(url.split(",")[1], "base64"));
    }
    return out;
  } finally {
    await b.close();
    srv.close();
  }
}

/** Video poster: the most detailed of a few frames (or the one at `at`). */
export async function makePoster(file, slug, { duration, at, outDir = DIRS.posters } = {}) {
  const times = at !== undefined ? [at] : [0.15, 0.3, 0.45, 0.6, 0.75].map((f) => Math.round(f * duration * 100) / 100);
  const frames = await videoFrames(file, times);
  let best = 0, score = -1;
  for (let i = 0; i < frames.length; i++) {
    const { entropy } = await sharp(frames[i]).stats();
    if (entropy > score) [best, score] = [i, entropy];
  }
  const outFile = join(outDir, `${slug}.webp`);
  const info = await toFile(sharp(frames[best]).resize({ width: 1280, withoutEnlargement: true }).webp({ quality: 84 }), outFile);
  return { url: urlOf(outFile), at: times[best], width: info.width, height: info.height, frames };
}

export const exists = (url) => !!url && existsSync(join(PUBLIC, decodeURIComponent(url)));
