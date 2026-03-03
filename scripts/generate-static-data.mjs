#!/usr/bin/env node
/**
 * Generates public/data.json by scanning public/models, public/Video renders,
 * public/Image renders. Used for static export (no API routes on Cloudflare).
 * Run before build: npm run generate-data && next build
 *
 * Optional: if sharp is installed, generates tiny WebP thumbnails for each
 * model from its color/albedo texture and adds a "thumbnail" URL to the model.
 */

import { readdir, readFile } from "fs/promises";
import { join } from "path";
import { writeFile } from "fs/promises";
import { existsSync } from "fs";

let sharp = null;
try {
  sharp = (await import("sharp")).default;
} catch {
  // sharp not installed — skip thumbnail generation
}

const SUFFIX_MAP = [
  ["_color", "map"],
  ["_colour", "map"],
  ["_albedo", "map"],
  ["_diffuse", "map"],
  ["_basecolor", "map"],
  ["_normal", "normalMap"],
  ["_roughness", "roughnessMap"],
  ["_metallic", "metalnessMap"],
  ["_metalness", "metalnessMap"],
  ["_transmission", "transmissionMap"],
  ["_alpha", "alphaMap"],
  ["_opacity", "alphaMap"],
];

function classifyTexture(filename) {
  const stem = filename.toLowerCase().replace(/\.(png|jpe?g|webp)$/i, "");
  for (const [suffix, slot] of SUFFIX_MAP) {
    if (stem.endsWith(suffix)) {
      return { baseName: stem.slice(0, stem.length - suffix.length), slot };
    }
  }
  return null;
}

async function scanModels(absDir, urlBase) {
  let entries;
  try {
    entries = await readdir(absDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const results = [];
  const fbxFiles = entries.filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".fbx"));
  const imageFiles = entries.filter((e) => e.isFile() && /\.(png|jpe?g|webp)$/i.test(e.name));

  if (fbxFiles.length > 0) {
    const texByBase = new Map();
    for (const img of imageFiles) {
      const result = classifyTexture(img.name);
      if (!result) continue;
      const { baseName, slot } = result;
      if (!texByBase.has(baseName)) texByBase.set(baseName, {});
      texByBase.get(baseName)[slot] = `${urlBase}/${img.name}`;
    }

    const folderName = absDir.split(/[/\\]/).pop() ?? "";
    const folderLower = folderName.toLowerCase();
    const primaryFBX = fbxFiles.find(
      (f) => f.name.toLowerCase().replace(/\.fbx$/, "") === folderLower
    );
    const toEmit = primaryFBX ? [primaryFBX] : fbxFiles;

    for (const f of toEmit) {
      const base = f.name.toLowerCase().replace(/\.fbx$/, "");
      const baseUnderscored = base.replace(/\s+/g, "_");
      const folderUnderscored = folderLower.replace(/\s+/g, "_");
      const textures =
        texByBase.get(base) ??
        texByBase.get(baseUnderscored) ??
        texByBase.get(folderUnderscored) ??
        {};
      const title = folderName
        .split(" ")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
      results.push({
        path: `${urlBase}/${f.name}`,
        title,
        category: "3D · Blender",
        year: "2026",
        textures,
      });
    }
  }

  for (const sub of entries.filter((e) => e.isDirectory())) {
    const subResults = await scanModels(join(absDir, sub.name), `${urlBase}/${sub.name}`);
    results.push(...subResults);
  }

  return results;
}

async function main() {
  const root = join(process.cwd(), "public");
  const outPath = join(root, "data.json");

  // Load hand-written overrides (descriptions, corrected titles, etc.)
  // Keyed by model title, video filename, or image filename.
  let overrides = { models: {}, videos: {}, images: {} };
  try {
    const raw = await readFile(join(process.cwd(), "scripts/data-overrides.json"), "utf8");
    overrides = JSON.parse(raw);
  } catch {
    // file missing or invalid — skip overrides silently
  }

  let models = [];
  let videos = [];
  let images = [];

  try {
    models = await scanModels(join(root, "models"), "/models");
    // Merge model overrides (keyed by title)
    models = models.map((m) => ({ ...m, ...(overrides.models?.[m.title] ?? {}) }));
  } catch (e) {
    console.warn("models scan failed:", e.message);
  }

  try {
    const videoDir = join(root, "Video renders");
    const videoFiles = await readdir(videoDir);
    videos = videoFiles
      .filter((f) => /\.(mp4|webm|mov)$/i.test(f))
      .map((f, i) => {
        const ov = overrides.videos?.[f] ?? {};
        return {
          id: `vid-${i}`,
          path: `/Video renders/${f}`,
          title: f.replace(/\.(mp4|webm|mov)$/i, ""),
          ...ov,
        };
      });
  } catch (e) {
    console.warn("videos scan failed:", e.message);
  }

  try {
    const imageDir = join(root, "Image renders");
    const imageFiles = await readdir(imageDir);
    images = imageFiles
      .filter((f) => /\.(jpg|jpeg|png|webp|gif|avif)$/i.test(f))
      .map((f, i) => {
        const ov = overrides.images?.[f] ?? {};
        return {
          id: `img-${i}`,
          path: `/Image renders/${f}`,
          title: f
            .replace(/\.(jpg|jpeg|png|webp|gif|avif)$/i, "")
            .replace(/[-_]/g, " ")
            .replace(/\b\w/g, (c) => c.toUpperCase()),
          ...ov,
        };
      });
  } catch (e) {
    console.warn("images scan failed:", e.message);
  }

  // Optional: generate tiny WebP placeholders for work grid (if sharp is installed)
  if (sharp && models.length > 0) {
    const root = join(process.cwd(), "public");
    for (const model of models) {
      const mapUrl = model.textures?.map;
      if (!mapUrl || typeof mapUrl !== "string") continue;
      const srcPath = join(root, mapUrl.replace(/^\//, ""));
      const relDir = model.path.replace(/\/[^/]+$/, "");
      const outPathThumb = join(root, relDir.replace(/^\//, ""), "thumb.webp");
      try {
        if (existsSync(srcPath)) {
          await sharp(srcPath)
            .resize(120, 120, { fit: "cover" })
            .webp({ quality: 72 })
            .toFile(outPathThumb);
          model.thumbnail = `${relDir}/thumb.webp`;
        }
      } catch (e) {
        console.warn("Thumbnail failed for", model.title, e.message);
      }
    }
  }

  const data = { models, videos, images };
  await writeFile(outPath, JSON.stringify(data, null, 0), "utf8");
  console.log("Wrote public/data.json:", models.length, "models,", videos.length, "videos,", images.length, "images.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
