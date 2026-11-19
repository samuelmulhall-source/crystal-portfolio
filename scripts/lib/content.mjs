// Reading and writing content/work/*.json the way the repo keeps them
// (2-space JSON, the file's own line endings preserved).
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

export const ROOT = process.env.ASSET_ROOT ?? process.cwd();
export const WORK = join(ROOT, "content/work");
export const ARCHIVE = join(ROOT, "content/archive");
export const PUBLIC = join(ROOT, "public");

/** A public URL ("/Image renders/x.webp") → its file path. */
export const fileOf = (url) => join(PUBLIC, decodeURIComponent(url));
/** A file path inside public/ → its public URL. */
export const urlOf = (file) => "/" + file.slice(PUBLIC.length + 1).replace(/\\/g, "/");

export function readEntry(path) {
  const raw = readFileSync(path, "utf8");
  return { path, crlf: raw.includes("\r\n"), data: JSON.parse(raw) };
}
export function writeEntry({ path, crlf, data }) {
  let out = JSON.stringify(data, null, 2) + "\n";
  if (crlf) out = out.replace(/\n/g, "\r\n");
  writeFileSync(path, out);
}
export function entries() {
  return readdirSync(WORK)
    .filter((f) => f.endsWith(".json"))
    .map((f) => readEntry(join(WORK, f)))
    .sort((a, b) => a.data.sortOrder - b.data.sortOrder);
}
export function entry(slug) {
  const e = entries().find((x) => x.data.slug === slug);
  if (!e) throw new Error(`No entry "${slug}". Have: ${entries().map((x) => x.data.slug).join(", ")}`);
  return e;
}
export const pathFor = (slug) => join(WORK, `${slug}.json`);
export const exists = (slug) => existsSync(pathFor(slug));

export const slugify = (s) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
/** "evening_fishing-v2_FINAL" → "Evening Fishing" (a starting point only). */
export const titleFrom = (name) =>
  name
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b(final|v\d+|scaled|fullscale|render|copy)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
