import { readdir } from "fs/promises";
import { join } from "path";
import { NextResponse } from "next/server";

// ── Texture slot names we auto-detect from filename suffixes ────────────────
const SUFFIX_MAP: Array<[string, string]> = [
  ["_color",        "map"],
  ["_colour",       "map"],
  ["_albedo",       "map"],
  ["_diffuse",      "map"],
  ["_basecolor",    "map"],
  ["_normal",       "normalMap"],
  ["_roughness",    "roughnessMap"],
  ["_metallic",     "metalnessMap"],
  ["_metalness",    "metalnessMap"],
  ["_transmission", "transmissionMap"],
  ["_alpha",        "alphaMap"],
  ["_opacity",      "alphaMap"],
];

function classifyTexture(
  filename: string,
): { baseName: string; slot: string } | null {
  const stem = filename.toLowerCase().replace(/\.(png|jpe?g|webp)$/i, "");
  for (const [suffix, slot] of SUFFIX_MAP) {
    if (stem.endsWith(suffix)) {
      return { baseName: stem.slice(0, stem.length - suffix.length), slot };
    }
  }
  return null;
}

type TextureSet = Record<string, string>;

interface ModelEntry {
  path:     string;
  title:    string;
  category: string;
  year:     string;
  textures: TextureSet;
}

async function scanDir(absDir: string, urlBase: string): Promise<ModelEntry[]> {
  let entries;
  try {
    entries = await readdir(absDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const results: ModelEntry[] = [];
  const fbxFiles   = entries.filter(e => e.isFile() && e.name.toLowerCase().endsWith(".fbx"));
  const imageFiles = entries.filter(e => e.isFile() && /\.(png|jpe?g|webp)$/i.test(e.name));

  if (fbxFiles.length > 0) {
    // Build baseName → TextureSet map from image files in this directory
    const texByBase = new Map<string, TextureSet>();
    for (const img of imageFiles) {
      const result = classifyTexture(img.name);
      if (!result) continue;
      const { baseName, slot } = result;
      if (!texByBase.has(baseName)) texByBase.set(baseName, {});
      texByBase.get(baseName)![slot] = `${urlBase}/${img.name}`;
    }

    // Only emit the "primary" FBX whose base name matches the folder name.
    // This skips accessory files like sword_wrap.fbx when the folder is "Sword".
    const folderName  = absDir.split(/[/\\]/).pop() ?? "";
    const folderLower = folderName.toLowerCase();
    const primaryFBX  = fbxFiles.find(
      f => f.name.toLowerCase().replace(/\.fbx$/, "") === folderLower,
    );
    // If no name match, emit all FBX in the directory
    const toEmit = primaryFBX ? [primaryFBX] : fbxFiles;

    for (const f of toEmit) {
      const base           = f.name.toLowerCase().replace(/\.fbx$/, "");
      const baseUnderscored = base.replace(/\s+/g, "_");
      // Try exact match first, then space→underscore, then folder name normalised
      const folderUnderscored = folderLower.replace(/\s+/g, "_");
      const textures =
        texByBase.get(base) ??
        texByBase.get(baseUnderscored) ??
        texByBase.get(folderUnderscored) ??
        {};
      // Title-case the folder name (handles "bow" → "Bow", "Ornate Dagger" stays)
      const title = folderName
        .split(" ")
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
      results.push({
        path:     `${urlBase}/${f.name}`,
        title,
        category: "3D · Blender",
        year:     "2026",
        textures,
      });
    }
  }

  // Recurse into sub-directories
  for (const sub of entries.filter(e => e.isDirectory())) {
    const subResults = await scanDir(
      join(absDir, sub.name),
      `${urlBase}/${sub.name}`,
    );
    results.push(...subResults);
  }

  return results;
}

export async function GET() {
  try {
    const root = join(process.cwd(), "public", "models");
    const models = await scanDir(root, "/models");
    return NextResponse.json({ models });
  } catch {
    return NextResponse.json({ models: [] });
  }
}
