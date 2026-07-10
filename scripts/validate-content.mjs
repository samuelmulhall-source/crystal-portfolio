// Build guard: content/**/*.json is Zod-validated for SHAPE (app/lib/content.ts),
// but nothing checks that referenced FILES exist — a typo'd src/poster/ogImage/
// modelPath ships silently and 404s in production. This walks every JSON value:
// any string that starts with "/" and whose last segment has an extension must
// exist under public/. Also asserts home.hero.featuredSlug resolves to a work
// entry. Runs before `next build` (including Cloudflare's build) via npm scripts.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const PUBLIC = "public";
const problems = [];

/** A string is a public-asset path if it's root-relative and file-like. */
function isAssetPath(value) {
  if (typeof value !== "string" || !value.startsWith("/")) return false;
  const last = value.split("/").pop() ?? "";
  return last.includes("."); // "/work" (a route) has no extension → skipped
}

function walkValues(node, file, trail) {
  if (typeof node === "string") {
    if (isAssetPath(node) && !existsSync(join(PUBLIC, decodeURIComponent(node)))) {
      problems.push(`${file} → ${trail}: "${node}" not found under ${PUBLIC}/`);
    }
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((v, i) => walkValues(v, file, `${trail}[${i}]`));
    return;
  }
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      walkValues(v, file, trail ? `${trail}.${k}` : k);
    }
  }
}

function readJson(p) {
  return JSON.parse(readFileSync(p, "utf8"));
}

// 1) Every referenced asset file must exist.
const contentFiles = [];
for (const dir of ["content/site", "content/work"]) {
  for (const name of readdirSync(dir)) {
    if (name.endsWith(".json")) contentFiles.push(join(dir, name));
  }
}
for (const file of contentFiles) {
  walkValues(readJson(file), file, "");
}

// 2) The hero's featured slug must resolve to a work entry.
const home = readJson("content/site/home.json");
const slugs = readdirSync("content/work")
  .filter((n) => n.endsWith(".json"))
  .map((n) => readJson(join("content/work", n)).slug);
if (!slugs.includes(home.hero.featuredSlug)) {
  problems.push(
    `content/site/home.json → hero.featuredSlug: "${home.hero.featuredSlug}" matches no work entry (have: ${slugs.join(", ")})`,
  );
}

if (problems.length) {
  for (const p of problems) console.error(`✖ ${p}`);
  console.error(`${problems.length} content reference problem(s) — fix before shipping.`);
  process.exit(1);
}
console.log(`✓ content references OK (${contentFiles.length} files, all asset paths resolve, featured slug valid)`);
