// Deploy guard: Cloudflare Pages rejects the ENTIRE deployment if any single
// file exceeds 25 MiB. This has nearly happened before (a 28.6 MiB source FBX
// was committed, then had to be converted to GLB). Runs before `next build`,
// including on Cloudflare's build, so an oversized re-export fails fast with a
// clear message instead of a mysterious rejected deploy.
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const LIMIT = 25 * 1024 * 1024; // Cloudflare Pages per-file limit
const WARN = 20 * 1024 * 1024; // headroom warning

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else out.push({ path: p, size: s.size });
  }
  return out;
}

const files = walk("public");
const over = files.filter((f) => f.size > LIMIT);
const nearLimit = files.filter((f) => f.size > WARN && f.size <= LIMIT);

for (const f of nearLimit) {
  console.warn(
    `⚠ ${f.path} is ${(f.size / 1048576).toFixed(1)} MiB — within ${((LIMIT - f.size) / 1048576).toFixed(1)} MiB of the 25 MiB Cloudflare Pages limit.`,
  );
}
if (over.length) {
  for (const f of over) {
    console.error(
      `✖ ${f.path} is ${(f.size / 1048576).toFixed(1)} MiB — exceeds the 25 MiB Cloudflare Pages per-file limit. The deploy WILL be rejected.`,
    );
  }
  console.error("Convert heavy models to Draco GLB (see public/draco + art-source/) or compress media.");
  process.exit(1);
}
console.log(`✓ asset sizes OK (${files.length} files in public/, largest under 25 MiB)`);
