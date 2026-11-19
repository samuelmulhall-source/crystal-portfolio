// Pre-ship check for the static export. Run after `npx next build`:
//
//   node scripts/check-site.mjs
//
// Serves out/ locally, drives a headless Chromium (Edge on Windows by default;
// set CHROME_PATH to use another) over the DevTools protocol, and checks the
// things that have broken before: layouts at short/wide/ultrawide sizes and on
// phones, labels running under the top bar or into each other, index titles
// wrapping, horizontal overflow, the phone index fitting one screen, the
// server HTML carrying real content (no-JS), and script errors.
// Screenshots go to .check/ (git-ignored). Exits 1 if anything fails.
import { existsSync, mkdirSync, writeFileSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { serve } from "./lib/serve.mjs";
import { launch, sleep } from "./lib/browser.mjs";

const ROOT = process.cwd();
const OUT = join(ROOT, "out");
const SHOTS = join(ROOT, ".check");
if (!existsSync(join(OUT, "index.html"))) {
  console.error("No out/index.html — run `npx next build` first.");
  process.exit(1);
}
mkdirSync(SHOTS, { recursive: true });

const srv = await serve(OUT);
const BASE = srv.base;
let b;
try {
  b = await launch({ width: 1440, height: 900 });
} catch (e) {
  console.error(e.message);
  srv.close();
  process.exit(1);
}
const { send, errors } = b;
const evaluate = b.eval;

// The pieces to load: the first published still, 3D piece and video in the
// running order (so the check follows the content, whatever it holds).
const entries = readdirSync(join(ROOT, "content/work"))
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(join(ROOT, "content/work", f), "utf8")))
  .filter((e) => !e.draft)
  .sort((x, y) => x.sortOrder - y.sortOrder);
const kind = (e) =>
  e.category === "rigged" || e.specimen?.rigged ? "rigged" : e.assets?.length || e.specimen ? "3d" : e.heroMedia?.kind === "video" || e.gallery?.some((g) => g.kind === "video") ? "video" : "still";
const first = (k) => entries.find((e) => kind(e) === k)?.slug;
// (a rigged character's label carries the most controls: motions, pose, hands)
const PIECES = ["still", "3d", "video", "rigged"].map(first).filter(Boolean).map((slug) => `/work/${slug}`);
const PHONE_PIECE = `/work/${first("video") ?? first("still") ?? entries[0].slug}`;
const NOJS_PIECE = `/work/${first("rigged") ?? first("3d") ?? entries[0].slug}`;

const results = [];
const check = (name, ok, detail = "") => results.push({ name, ok: !!ok, detail });

async function load(path, w, h, { mobile = false, js = true } = {}) {
  await b.size(w, h, 1, mobile);
  await send("Emulation.setScriptExecutionDisabled", { value: !js });
  errors.length = 0;
  await send("Page.navigate", { url: BASE + path });
  await sleep(js ? 3500 : 1500);
  if (js) await evaluate("document.fonts ? document.fonts.ready.then(() => true) : true");
}
async function shot(name) {
  const s = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(SHOTS, `${name}.png`), Buffer.from(s.result.data, "base64"));
}

// In-page measurements (selectors use the CSS-module names' readable part).
// CSS-module classes look like "lit-module__<hash>__copy"; match the exact
// local name (a token ending in "__copy"), never a prefix like "__copyBtn".
const MEASURE = `(() => {
  const by = (name) => [...document.querySelectorAll("[class]")].filter((e) => [...e.classList].some((c) => c.endsWith("__" + name)));
  const one = (name) => by(name).find((e) => e.offsetParent || getComputedStyle(e).position === "fixed") || null;
  const r = (el) => el && el.getBoundingClientRect();
  const bar = r(one("bar"));
  const copy = r(one("copy"));
  const title = r(document.querySelector("h1:not([class*=__sr])"));
  const sum = r(one("sum"));
  const overlap = (a, b) => a && b && !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
  const items = by("itemTitle").filter((e) => e.offsetParent);
  const lh = items[0] ? parseFloat(getComputedStyle(items[0]).lineHeight) || parseFloat(getComputedStyle(items[0]).fontSize) * 1.1 : 0;
  const cards = by("pcard").filter((e) => e.offsetParent);
  const intro = r(by("intro").find((e) => e.offsetParent && e.parentElement && [...e.parentElement.classList].some((c) => c.endsWith("__indexCol"))) || null);
  const list = r(one("list"));
  return {
    found: { bar: !!bar, copy: !!copy, title: !!title, sum: !!sum, items: items.length, cards: cards.length },
    barBottom: bar ? bar.bottom : 0,
    copyTop: copy ? copy.top : null,
    titleSumOverlap: !!overlap(title, sum),
    wrapped: items.filter((e) => e.getBoundingClientRect().height > lh * 1.6).map((e) => e.textContent),
    overflowX: document.documentElement.scrollWidth - innerWidth,
    introListOverlap: !!overlap(intro, list),
    found2: { intro: !!intro, list: !!list },
    lastCardBottom: cards.length ? r(cards[cards.length - 1]).bottom : null,
    maxCardHeight: Math.max(0, ...cards.map((c) => r(c).height)),
    innerHeight,
  };
})()`;

const DESKTOP = [[1280, 720], [1440, 900], [1920, 1080], [2560, 1080]];
for (const [w, h] of DESKTOP) {
  await load("/", w, h);
  let m = await evaluate(MEASURE);
  check(`index ${w}×${h}: titles on one line (${m.found.items} found)`, m.found.items >= 1 && m.wrapped.length === 0, m.wrapped.join(", ") || "no titles found");
  check(`index ${w}×${h}: no sideways overflow`, m.overflowX <= 1, `${m.overflowX}px`);
  check(`index ${w}×${h}: intro clear of the titles`, m.found2.intro && m.found2.list && !m.introListOverlap, JSON.stringify(m.found2));
  check(`index ${w}×${h}: no script errors`, errors.length === 0, errors.join(" | "));
  await shot(`index-${w}x${h}`);
  for (const p of PIECES) {
    await load(p, w, h);
    m = await evaluate(MEASURE);
    const name = p.split("/").pop();
    check(`${name} ${w}×${h}: label clear of the top bar (label ${Math.round(m.copyTop)}px, bar ends ${Math.round(m.barBottom)}px)`, m.found.copy && m.found.bar && m.copyTop >= m.barBottom - 1, JSON.stringify(m.found));
    check(`${name} ${w}×${h}: title and note don't overlap`, m.found.title && m.found.sum && !m.titleSumOverlap, JSON.stringify(m.found));
    check(`${name} ${w}×${h}: no sideways overflow`, m.overflowX <= 1, `${m.overflowX}px`);
    check(`${name} ${w}×${h}: no script errors`, errors.length === 0, errors.join(" | "));
    await shot(`${name}-${w}x${h}`);
  }
}
for (const [w, h] of [[390, 844], [375, 667]]) {
  await load("/", w, h, { mobile: true });
  const m = await evaluate(MEASURE);
  // Up to 8 pieces the phone catalogue is one screen; past that it may scroll,
  // but every row stays a small proof (never a feed of large images).
  if (m.found.cards <= 8) check(`phone index ${w}×${h}: every piece on one screen`, m.lastCardBottom !== null && m.lastCardBottom <= m.innerHeight + 1, `last row ends at ${Math.round(m.lastCardBottom)} of ${m.innerHeight}`);
  else check(`phone index ${w}×${h}: ${m.found.cards} pieces as compact rows`, m.maxCardHeight <= 96, `tallest row ${Math.round(m.maxCardHeight)}px`);
  check(`phone index ${w}×${h}: no sideways overflow`, m.overflowX <= 1, `${m.overflowX}px`);
  await shot(`phone-index-${w}x${h}`);
  await load(PHONE_PIECE, w, h, { mobile: true });
  const m2 = await evaluate(MEASURE);
  check(`phone piece ${w}×${h}: no sideways overflow`, m2.overflowX <= 1, `${m2.overflowX}px`);
  check(`phone piece ${w}×${h}: no script errors`, errors.length === 0, errors.join(" | "));
  await shot(`phone-piece-${w}x${h}`);
}
// Without JavaScript the HTML must carry the work (titles, labels).
await load("/", 1440, 900, { js: false });
const noJs = await evaluate(`[...document.querySelectorAll("[class]")].filter((e) => [...e.classList].some((c) => c.endsWith("__itemTitle"))).length`);
check("no-JS index: titles are in the HTML", noJs >= 1, `${noJs} titles`);
await shot("nojs-index");
await load(NOJS_PIECE, 1440, 900, { js: false });
const noJsPiece = await evaluate(`(document.querySelector("h1:not([class*=__sr])") || {}).textContent || ""`);
check("no-JS piece: the label is in the HTML", !!noJsPiece, String(noJsPiece));
await send("Emulation.setScriptExecutionDisabled", { value: false });

await b.close();
srv.close();

const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.ok || !r.detail ? "" : `  — ${r.detail}`}`);
console.log(`\n${results.length - failed.length}/${results.length} checks passed. Screenshots in .check/`);
process.exit(failed.length ? 1 : 0);
