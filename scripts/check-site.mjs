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
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { readFileSync, existsSync, mkdirSync, writeFileSync, statSync, rmSync } from "node:fs";
import { join, extname, resolve } from "node:path";
import { tmpdir } from "node:os";

const ROOT = process.cwd();
const OUT = join(ROOT, "out");
const SHOTS = join(ROOT, ".check");
if (!existsSync(join(OUT, "index.html"))) {
  console.error("No out/index.html — run `npx next build` first.");
  process.exit(1);
}
mkdirSync(SHOTS, { recursive: true });

// ── a tiny static server for out/ (directory → index.html, /x → /x.html) ──
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".ico": "image/x-icon", ".mp4": "video/mp4", ".woff2": "font/woff2", ".glb": "model/gltf-binary", ".fbx": "application/octet-stream", ".txt": "text/plain", ".xml": "application/xml", ".json": "application/json", ".wasm": "application/wasm" };
const server = createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  let f = resolve(join(OUT, p));
  if (!f.startsWith(OUT)) return res.writeHead(403).end();
  // Same lookup order as the host: /x → x.html first (the export also writes
  // an x/ folder of data files), then x/index.html.
  if (existsSync(f + ".html")) f += ".html";
  else if (existsSync(f) && statSync(f).isDirectory()) f = join(f, "index.html");
  if (!existsSync(f)) {
    res.writeHead(404, { "content-type": "text/html" });
    return res.end(existsSync(join(OUT, "404.html")) ? readFileSync(join(OUT, "404.html")) : "not found");
  }
  const body = readFileSync(f);
  const range = req.headers.range && /bytes=(\d+)-(\d*)/.exec(req.headers.range);
  if (range) {
    const a = +range[1], b = range[2] ? +range[2] : body.length - 1;
    res.writeHead(206, { "content-type": TYPES[extname(f)] ?? "application/octet-stream", "content-range": `bytes ${a}-${b}/${body.length}`, "accept-ranges": "bytes", "content-length": b - a + 1 });
    return res.end(body.subarray(a, b + 1));
  }
  res.writeHead(200, { "content-type": TYPES[extname(f)] ?? "application/octet-stream", "accept-ranges": "bytes" });
  res.end(body);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const BASE = `http://127.0.0.1:${server.address().port}`;

// ── headless browser over CDP ──
const BROWSER = process.env.CHROME_PATH ?? "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const port = 9400 + Math.floor(Math.random() * 400);
const profile = join(tmpdir(), "lit-check-" + Date.now());
const proc = spawn(BROWSER, ["--headless=new", "--no-first-run", "--mute-audio", "--hide-scrollbars", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let i = 0; i < 80 && !target; i++) {
  try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === "page"); } catch {}
  if (!target) await sleep(250);
}
if (!target) { console.error("Couldn't start the browser at", BROWSER); server.close(); process.exit(1); }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let id = 0;
const pending = new Map();
const errors = [];
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails?.exception?.description?.split("\n")[0] ?? "exception");
  if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") errors.push(m.params.args?.map((a) => a.value ?? a.description).join(" "));
});
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expr) => (await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
await send("Page.enable");
await send("Runtime.enable");

const results = [];
const check = (name, ok, detail = "") => results.push({ name, ok: !!ok, detail });

async function load(path, w, h, { mobile = false, js = true } = {}) {
  await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile });
  await send("Emulation.setTouchEmulationEnabled", { enabled: mobile, maxTouchPoints: mobile ? 5 : 0 });
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
  return {
    found: { bar: !!bar, copy: !!copy, title: !!title, sum: !!sum, items: items.length, cards: cards.length },
    barBottom: bar ? bar.bottom : 0,
    copyTop: copy ? copy.top : null,
    titleSumOverlap: !!overlap(title, sum),
    wrapped: items.filter((e) => e.getBoundingClientRect().height > lh * 1.6).map((e) => e.textContent),
    overflowX: document.documentElement.scrollWidth - innerWidth,
    lastCardBottom: cards.length ? r(cards[cards.length - 1]).bottom : null,
    innerHeight,
  };
})()`;

const DESKTOP = [[1280, 720], [1440, 900], [1920, 1080], [2560, 1080]];
const PIECES = ["/work/fourteenth-study", "/work/medieval-asset-pack", "/work/evening-fishing"];
for (const [w, h] of DESKTOP) {
  await load("/", w, h);
  let m = await evaluate(MEASURE);
  check(`index ${w}×${h}: titles on one line (${m.found.items} found)`, m.found.items >= 1 && m.wrapped.length === 0, m.wrapped.join(", ") || "no titles found");
  check(`index ${w}×${h}: no sideways overflow`, m.overflowX <= 1, `${m.overflowX}px`);
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
  check(`phone index ${w}×${h}: every piece on one screen`, m.lastCardBottom !== null && m.lastCardBottom <= m.innerHeight + 1, `last row ends at ${Math.round(m.lastCardBottom)} of ${m.innerHeight}`);
  check(`phone index ${w}×${h}: no sideways overflow`, m.overflowX <= 1, `${m.overflowX}px`);
  await shot(`phone-index-${w}x${h}`);
  await load("/work/evening-fishing", w, h, { mobile: true });
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
await load("/work/rubia-rigged-character", 1440, 900, { js: false });
const noJsPiece = await evaluate(`(document.querySelector("h1:not([class*=__sr])") || {}).textContent || ""`);
check("no-JS piece: the label is in the HTML", !!noJsPiece, String(noJsPiece));
await send("Emulation.setScriptExecutionDisabled", { value: false });

ws.close();
proc.kill();
server.close();
try { rmSync(profile, { recursive: true, force: true }); } catch {}

const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.ok || !r.detail ? "" : `  — ${r.detail}`}`);
console.log(`\n${results.length - failed.length}/${results.length} checks passed. Screenshots in .check/`);
process.exit(failed.length ? 1 : 0);
