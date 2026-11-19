// The asset workflow — add work to the site and keep what it states true.
//
//   npm run asset -- help
//
// Everything the site says about a piece that can be read off its files
// (pixel size, frame rate, duration, sound, triangle and map counts, colours,
// the room it hangs in) is measured here, never typed by hand. New work comes
// in as a draft: visible in `npm run dev`, never in a production build, until
// `publish`. Nothing here deletes files.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { basename, dirname, extname, join, relative } from "node:path";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { ROOT, PUBLIC, WORK, ARCHIVE, entries, entry, readEntry, writeEntry, pathFor, fileOf, urlOf, slugify, titleFrom } from "./lib/content.mjs";
import { probeImage, probeMp4, probeGlb } from "./lib/media.mjs";
import { analyse, edgeColors, contrast, CREAM } from "./lib/colour.mjs";
import { deriveRoom, deriveStage, checkRoom } from "./lib/rooms.mjs";
import { DIRS, TILE, conv, SIZES, makeCard, makeThumb, makeSizes, makeOg, makePoster, videoFrames, writeSetPhoto, exists } from "./lib/derive.mjs";
import { serve } from "./lib/serve.mjs";
import { launch, sleep } from "./lib/browser.mjs";

const HELP = `
The asset workflow. Run from the project folder:  npm run asset -- <command>

  status [slug]            What every entry has, what's stale or missing, and
                           the command that fixes it. Also lists unused files.
  add <file> [options]     Bring in a new piece as a DRAFT. <file> is a still
                           (.png .jpg .webp .tif), a video (.mp4) or a model
                           (.fbx with its maps beside it, or .glb). Copies it
                           into public/, measures it, makes the thumbnail,
                           phone sizes, share image and poster, designs its
                           room (or set paint), and photographs 3D sets.
      --title "…"            (default: from the file name)
      --slug x               (default: from the title)
      --year 2026            (default: the file's year)
      --discipline "…"  --summary "…"
      --shape pool|low|rake|horizon   the room's light (stills and video)
      --pack <slug>          add a model to an asset pack instead
      --maps <prefix>        the model's maps are named <prefix>_color… (default:
                             the model's file name; else any maps beside it)
      --extra <file>         a second model merged into the same view (FBX), with
      --extra-maps <prefix>  its own maps (e.g. a grip wrap with an alpha cut-out)
      --rigged / --not-rigged   override rig detection (GLB)
      --keep                 copy a still as it is (no WebP re-encode)
      --no-shoot             skip the set photograph (run \`shoot\` later)
  derive <slug|--all>      Re-measure facts, edge colours and dimensions from
                           the files; make any missing thumbnail, sizes,
                           share image, poster, room or set paint.
      --force                also rebuild derived images that already exist
      --at <seconds>         (video) take the poster from this moment
  room <slug>              Show the room the colour rules design for a piece,
                           next to its current one, with the contrast report.
      --shape s  --write     write it (replaces the current room)
      --asset id             3D packs: one asset's set paint (needed with --write)
  shoot [slug…]            Photograph 3D pieces on their lit sets (builds the
                           site with drafts, serves it, captures each asset).
                           Records triangle / map counts and the set photos.
      --asset id             only this asset of a pack
      --out <dir>            write the photos there, change no content
      --no-build             reuse the last build in out/
  order [slug position]    List the running order, or move a piece.
  cover <pack> <asset-id>  Which asset stands for a pack in the index.
  publish <slug>           Take a draft live (refuses while text is missing
                           or anything is stale). unpublish <slug> reverses it.
  archive <slug> [--yes]   Take a piece off the site: moves its entry to
                           content/archive/ (files stay; lists the ones only it
                           used). Without --yes, only shows what would happen.
  check                    status + content references + file size limits.

Then: npm run dev (drafts show, marked Draft) → write the text in
content/work/<slug>.json (leave out anything you can't state — never invent
clients, metrics or credits) → publish → commit and push to deploy.
`;

// ── arguments ───────────────────────────────────────────────────────────────
const BOOL = new Set(["force", "yes", "write", "no-shoot", "no-build", "keep", "all", "rigged", "not-rigged", "help"]);
const argv = process.argv.slice(2);
const cmd = argv[0] && !argv[0].startsWith("--") ? argv.shift() : "help";
const args = [];
const opts = {};
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (!a.startsWith("--")) args.push(a);
  else if (BOOL.has(a.slice(2))) opts[a.slice(2)] = true;
  else opts[a.slice(2)] = argv[++i];
}

const say = (...m) => console.log(...m);
const fail = (m) => {
  console.error(`✖ ${m}`);
  process.exit(1);
};
const rel = (f) => relative(ROOT, f).replace(/\\/g, "/");
const mb = (n) => `${(n / 1048576).toFixed(1)} MB`;
const LIMIT = 25 * 1024 * 1024; // Cloudflare Pages per-file limit
const IMG = new Set([".png", ".jpg", ".jpeg", ".webp", ".tif", ".tiff"]);
const VID = new Set([".mp4", ".m4v", ".mov", ".webm"]);
const MDL = new Set([".fbx", ".glb"]);
const pad = (n) => String(n).padStart(2, "0");

// ── what kind of piece an entry is ──────────────────────────────────────────
const isModel = (d) => !!(d.assets?.length || d.specimen);
const videoOf = (d) => (d.heroMedia?.kind === "video" ? d.heroMedia : d.gallery?.find((g) => g.kind === "video"));
const kindOf = (d) => (isModel(d) ? "3d" : videoOf(d) ? "video" : "still");
const assetsOf = (d) => (d.assets?.length ? d.assets.map((a) => ({ id: a.id, title: a.title, sp: a.specimen })) : d.specimen ? [{ id: d.slug, title: d.title, sp: d.specimen }] : []);
const mtime = (url) => (exists(url) ? statSync(fileOf(url)).mtimeMs : 0);

/** Walk an entry's string values that look like public files. */
function refs(node, out = []) {
  if (typeof node === "string") {
    if (node.startsWith("/") && (node.split("/").pop() ?? "").includes(".")) out.push(node);
  } else if (Array.isArray(node)) node.forEach((v) => refs(v, out));
  else if (node && typeof node === "object") Object.values(node).forEach((v) => refs(v, out));
  return out;
}

// ── inspect: what's stale, missing or still to write ────────────────────────
async function inspect(d) {
  // errors block a build; stale = derive/shoot fixes it; todo = text to write;
  // advice = worth doing by hand, never blocks.
  const errors = [], stale = [], todo = [], advice = [];
  for (const r of new Set(refs(d))) if (!exists(r)) errors.push(`missing file ${r}`);
  if (!d.summary?.trim()) todo.push("summary");
  if (!d.discipline?.trim()) todo.push("discipline");
  const kind = kindOf(d);

  if (kind === "still" && exists(d.heroMedia?.src)) {
    const p = await probeImage(fileOf(d.heroMedia.src));
    const dims = `${p.width}×${p.height}`;
    if (!d.facts) stale.push("no facts (pixel size)");
    else if (d.facts.width !== p.width || d.facts.height !== p.height) stale.push(`facts say ${d.facts.width}×${d.facts.height}, the file is ${dims}`);
    if (d.heroMedia.width !== p.width || d.heroMedia.height !== p.height) stale.push(`heroMedia says ${d.heroMedia.width}×${d.heroMedia.height}, the file is ${dims}`);
    d.gallery?.forEach((g, i) => {
      if (g.src === d.heroMedia.src && (g.width !== p.width || g.height !== p.height)) stale.push(`gallery[${i}] says ${g.width}×${g.height}, the file is ${dims}`);
    });
    if (p.width > SIZES[0] && !existsSync(join(DIRS.sized, `${d.slug}-${SIZES[0]}.webp`))) stale.push("no phone sizes");
    else if (existsSync(join(DIRS.sized, `${d.slug}-${SIZES[0]}.webp`)) && statSync(join(DIRS.sized, `${d.slug}-${SIZES[0]}.webp`)).mtimeMs + 60000 < mtime(d.heroMedia.src)) stale.push("phone sizes are older than the still");
    if (exists(d.thumbnail?.src) && d.thumbnail.src !== d.heroMedia.src) {
      const t = await probeImage(fileOf(d.thumbnail.src));
      if (t.width !== d.thumbnail.width || t.height !== d.thumbnail.height) stale.push(`thumbnail says ${d.thumbnail.width}×${d.thumbnail.height}, the file is ${t.width}×${t.height}`);
    }
  }
  if (kind === "video") {
    const v = videoOf(d);
    if (exists(v.src)) {
      const p = probeMp4(fileOf(v.src));
      const f = d.facts;
      if (!f?.fps) stale.push("no facts (timing) — the piece shows as a still until it has them");
      else {
        const diff = ["width", "height", "fps", "frames", "duration", "audio"].filter((k) => f[k] !== p[k]);
        if (diff.length) stale.push(`facts differ from the file: ${diff.map((k) => `${k} ${f[k]} → ${p[k]}`).join(", ")}`);
      }
      if (statSync(fileOf(v.src)).size > LIMIT) errors.push(`${v.src} is ${mb(statSync(fileOf(v.src)).size)} (limit 25 MB)`);
      if (!p.faststart) advice.push("the video's index is at the end of the file, so playback starts late — re-mux once: ffmpeg -i in.mp4 -c copy -movflags +faststart out.mp4");
    }
    if (!v.poster) stale.push("no poster");
  }
  if (kind !== "3d") {
    if (!d.edgeColors) stale.push("no edge colours");
    if (!d.room) stale.push("no room");
    else {
      const p = checkRoom(d.room);
      if (p.length) stale.push(`room: ${p.join("; ")}`);
    }
  }
  if (kind === "3d") {
    const list = assetsOf(d);
    if (d.assets?.length > 1 && d.cover && !d.assets.some((a) => a.id === d.cover)) errors.push(`cover "${d.cover}" is not one of its assets`);
    for (const a of list) {
      const sp = a.sp;
      const tag = list.length > 1 ? `${a.id}: ` : "";
      if (!sp.stage) stale.push(`${tag}no set paint (stage)`);
      else if (sp.stage.accent && contrast(sp.stage.accent, sp.stage.field[1]) < 4.5) stale.push(`${tag}accent under 4.5:1 on the set's shadow`);
      if (!sp.setStill) stale.push(`${tag}not photographed on its set`);
      else {
        const shot = mtime(sp.setStill.src);
        const src = [sp.modelPath, sp.extraModelPath, ...Object.values(sp.textures ?? {}), ...Object.values(sp.extraTextures ?? {})].filter(Boolean);
        if (src.some((u) => mtime(u) > shot + 60000)) stale.push(`${tag}the model or a map changed after its set photograph`);
      }
      if (!sp.facts) stale.push(`${tag}no triangle / map counts`);
      if (/\.fbx$/i.test(sp.modelPath) && !Object.values(sp.textures ?? {}).some(Boolean)) stale.push(`${tag}FBX with no maps listed — it shows in a plain material`);
    }
  }
  if (d.seo?.ogImage && exists(d.seo.ogImage)) {
    const o = await probeImage(fileOf(d.seo.ogImage));
    if (o.width !== 1200 || o.height !== 630) stale.push(`share image is ${o.width}×${o.height} (want 1200×630)`);
  }
  return { kind, errors, stale, todo, advice };
}

async function status() {
  const list = entries();
  let bad = 0, warn = 0;
  const only = args[0];
  if (only && !list.some((e) => e.data.slug === only)) fail(`No entry "${only}".`);
  say("");
  for (const [i, e] of list.entries()) {
    const d = e.data;
    if (only && d.slug !== only) continue;
    const r = await inspect(d);
    const kind = r.kind === "3d" ? `3D${d.assets?.length > 1 ? ` ×${d.assets.length}` : ""}` : r.kind;
    const state = r.errors.length ? `${r.errors.length} error(s)` : r.stale.length ? `${r.stale.length} to refresh` : "ok";
    say(` ${pad(i + 1)}  ${d.slug.padEnd(26)} ${kind.padEnd(7)} ${d.draft ? "DRAFT  " : "       "}${state}`);
    for (const m of r.errors) say(`       ✖ ${m}`);
    for (const m of r.stale) say(`       · ${m}`);
    for (const m of r.advice) say(`       ! ${m}`);
    if (r.todo.length) say(`       ✎ to write: ${r.todo.join(", ")}${d.draft ? "" : "  (live!)"}`);
    const needsShoot = r.stale.some((m) => /photograph|triangle/.test(m));
    if (r.stale.length) say(`       → npm run asset -- ${needsShoot ? "shoot" : "derive"} ${d.slug}`);
    bad += r.errors.length;
    warn += r.stale.length;
  }
  if (!only) orphans(list);
  say(`\n${list.length} entries · ${list.filter((e) => e.data.draft).length} draft(s) · ${bad} error(s) · ${warn} to refresh`);
  return bad;
}

/** Files in the media folders that no live entry points at (listed, never deleted). */
function orphans(list) {
  const site = ["settings.json", "home.json"].map((f) => join(ROOT, "content/site", f)).filter(existsSync).flatMap((f) => refs(JSON.parse(readFileSync(f, "utf8"))));
  const used = new Set([...list.flatMap((e) => refs(e.data)), ...site].map((u) => decodeURIComponent(u)));
  // Only files in git deploy (the host builds from the repository).
  const git = spawnSync("git", ["ls-files", "-z", "public"], { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const tracked = git.status === 0 ? new Set(git.stdout.split("\0").filter(Boolean).map((f) => f.slice("public".length))) : null;
  const slugs = new Set(list.map((e) => e.data.slug));
  const archived = existsSync(ARCHIVE) ? new Set(readdirSync(ARCHIVE).filter((f) => f.endsWith(".json")).flatMap((f) => refs(readEntry(join(ARCHIVE, f)).data))) : new Set();
  const groups = {};
  const walk = (dir) => {
    if (!existsSync(dir)) return;
    for (const n of readdirSync(dir)) {
      if (n.startsWith(".")) continue;
      const f = join(dir, n);
      if (statSync(f).isDirectory()) walk(f);
      else {
        const u = urlOf(f);
        if (used.has(u)) continue;
        if (u.startsWith("/images/sized/") && slugs.has(n.replace(/-\d+\.webp$/, ""))) continue;
        if (u.startsWith("/images/thumbs/") && slugs.has(n.replace(/-card\.webp$/, ""))) continue;
        const why0 = archived.has(u) ? "only used by archived entries" : /\.(png|tif|tiff)$/i.test(n) && existsSync(f.replace(/\.[^.]+$/, ".webp")) ? "source maps (the .webp beside each is used)" : "not used by any entry";
        const why = tracked ? `${why0} — ${tracked.has(u) ? "in git, so they deploy" : "not in git, so they don't deploy"}` : why0;
        (groups[why] ??= []).push([u, statSync(f).size]);
      }
    }
  };
  for (const d of ["Image renders", "Video renders", "models", "Rigged Characters", "images/thumbs", "images/sized", "images/set", "images/og", "images/posters"]) walk(join(PUBLIC, d));
  const keys = Object.keys(groups);
  if (!keys.length) return;
  say("\n Unused files in public/ (listed only — nothing is deleted):");
  for (const k of keys) {
    const g = groups[k];
    say(`   ${k}: ${g.length} file(s), ${mb(g.reduce((s, [, n]) => s + n, 0))}`);
    for (const [u, n] of g.slice(0, 8)) say(`     ${u}  ${mb(n)}`);
    if (g.length > 8) say(`     … and ${g.length - 8} more`);
  }
}

// ── derive ──────────────────────────────────────────────────────────────────
async function measureRoomSource(d) {
  if (kindOf(d) === "video") {
    const v = videoOf(d);
    const p = probeMp4(fileOf(v.src));
    const frames = await videoFrames(fileOf(v.src), [0.2, 0.4, 0.6, 0.8].map((f) => Math.round(f * p.duration * 100) / 100));
    return analyse(frames);
  }
  return analyse(fileOf(d.heroMedia.src));
}

async function albedoStats(sp) {
  if (sp.textures?.map && exists(sp.textures.map)) return analyse(fileOf(sp.textures.map));
  if (/\.glb$/i.test(sp.modelPath) && exists(sp.modelPath)) {
    const g = probeGlb(fileOf(sp.modelPath));
    if (g.baseColorImages.length) {
      try {
        return await analyse(g.baseColorImages);
      } catch {
        /* KTX2/basis maps can't be read here */
      }
    }
  }
  return null;
}

async function derive(e, { force = false, at } = {}) {
  const d = e.data;
  const changes = [];
  const set = (label, apply) => {
    apply();
    changes.push(label);
  };
  const kind = kindOf(d);

  if (kind === "still") {
    const src = fileOf(d.heroMedia.src);
    const p = await probeImage(src);
    const f = { width: p.width, height: p.height };
    if (JSON.stringify(d.facts) !== JSON.stringify(f)) set(`facts ${p.width}×${p.height}`, () => (d.facts = f));
    if (d.heroMedia.width !== p.width || d.heroMedia.height !== p.height) set("heroMedia size", () => Object.assign(d.heroMedia, f));
    d.gallery?.forEach((g, i) => {
      if (g.src === d.heroMedia.src && (g.width !== p.width || g.height !== p.height)) set(`gallery[${i}] size`, () => Object.assign(g, f));
    });
    if (!d.thumbnail || d.thumbnail.src === conv.thumb(d.slug)) {
      if (force || !exists(conv.thumb(d.slug))) {
        const t = await makeThumb(src, d.slug);
        set(`thumbnail ${t.width}×${t.height}`, () => (d.thumbnail = { kind: "image", src: t.url, alt: d.heroMedia.alt, width: t.width, height: t.height }));
      }
    }
    if (exists(d.thumbnail?.src)) {
      const t = await probeImage(fileOf(d.thumbnail.src));
      if (d.thumbnail.width !== t.width || d.thumbnail.height !== t.height) set("thumbnail size", () => Object.assign(d.thumbnail, { width: t.width, height: t.height }));
    }
    const sized = join(DIRS.sized, `${d.slug}-${SIZES[0]}.webp`);
    if (p.width > SIZES[0] && (force || !existsSync(sized) || statSync(sized).mtimeMs + 60000 < statSync(src).mtimeMs)) {
      const made = await makeSizes(src, d.slug);
      changes.push(`phone sizes (${made.length})`);
    }
    // Edge colours only seed a fallback room: measured once, not churned.
    if (!d.edgeColors || force) {
      const edge = await edgeColors(src);
      if (JSON.stringify(d.edgeColors) !== JSON.stringify(edge)) set("edge colours", () => (d.edgeColors = edge));
    }
    if (d.seo.ogImage === conv.og(d.slug) && (force || !exists(d.seo.ogImage))) {
      await makeOg(src, d.slug);
      changes.push("share image");
    }
  }

  if (kind === "video") {
    const v = videoOf(d);
    const file = fileOf(v.src);
    const p = probeMp4(file);
    const f = { width: p.width, height: p.height, fps: p.fps, frames: p.frames, duration: p.duration, audio: p.audio };
    if (JSON.stringify(d.facts) !== JSON.stringify(f)) set(`facts ${p.width}×${p.height}, ${p.fps} fps, ${p.frames} frames, ${p.duration}s${p.audio ? ", sound" : ""}`, () => (d.facts = f));
    const own = !v.poster || v.poster === conv.poster(d.slug);
    if (own && (force || at !== undefined || !exists(conv.poster(d.slug)))) {
      const ps = await makePoster(file, d.slug, { duration: p.duration, at: at === undefined ? undefined : Number(at) });
      set(`poster (frame at ${ps.at}s)`, () => {
        for (const m of [d.heroMedia, ...(d.gallery ?? [])]) if (m.kind === "video" && m.src === v.src) m.poster = ps.url;
        d.thumbnail = { kind: "image", src: ps.url, alt: d.thumbnail?.alt ?? v.alt, width: ps.width, height: ps.height };
      });
    }
    const poster = fileOf(videoOf(d).poster);
    if (existsSync(poster)) {
      if (!d.edgeColors || force) {
        const edge = await edgeColors(poster);
        if (JSON.stringify(d.edgeColors) !== JSON.stringify(edge)) set("edge colours", () => (d.edgeColors = edge));
      }
      if (d.seo.ogImage === conv.og(d.slug) && (force || !exists(d.seo.ogImage))) {
        await makeOg(poster, d.slug);
        changes.push("share image");
      }
    }
  }

  // The phone catalogue's card, from the thumbnail the index already uses.
  if (kind !== "3d" && exists(d.thumbnail?.src)) {
    const card = join(DIRS.thumbs, `${d.slug}-card.webp`);
    if (force || !existsSync(card) || statSync(card).mtimeMs + 60000 < statSync(fileOf(d.thumbnail.src)).mtimeMs) {
      await makeCard(fileOf(d.thumbnail.src), d.slug);
      changes.push("phone card");
    }
  }

  if (kind !== "3d" && !d.room) {
    const stats = await measureRoomSource(d);
    const { room, notes } = deriveRoom(stats, { shape: opts.shape ?? "pool" });
    set(`room (${notes.join("; ")})`, () => (d.room = room));
  }

  if (kind === "3d") {
    for (const a of assetsOf(d)) {
      if (a.sp.stage && !force) continue;
      const stats = await albedoStats(a.sp);
      const { stage, notes } = stats ? deriveStage(stats) : deriveStage({ coloured: 0, share: 0 });
      if (!stats) notes.unshift("no albedo to measure");
      set(`${a.id}: set paint (${notes.join("; ")})`, () => (a.sp.stage = { ...a.sp.stage, ...stage }));
    }
    const list = assetsOf(d);
    const cover = list.find((a) => a.id === d.cover) ?? list[0];
    if (cover?.sp.setStill && exists(cover.sp.setStill.src) && d.seo.ogImage === conv.og(d.slug) && (force || !exists(d.seo.ogImage))) {
      await makeOg(fileOf(cover.sp.setStill.src), d.slug, { focus: "centre" });
      changes.push("share image (from the set photograph)");
    }
  }
  if (changes.length) writeEntry(e);
  return changes;
}

async function cmdDerive() {
  const list = opts.all ? entries() : args.length ? args.map(entry) : fail("derive <slug> or derive --all");
  for (const e of list) {
    const c = await derive(e, { force: !!opts.force, at: opts.at });
    say(`${e.data.slug}: ${c.length ? c.join("\n   ") : "up to date"}`);
  }
}

// ── room ────────────────────────────────────────────────────────────────────
async function cmdRoom() {
  const e = entry(args[0] ?? fail("room <slug>"));
  const d = e.data;
  if (kindOf(d) === "3d") {
    const all = assetsOf(d);
    // Set paints are often hand-tuned: on a pack, --write touches one asset.
    if (opts.write && all.length > 1 && !opts.asset) fail(`${d.slug} has ${all.length} assets — say which one to repaint: --asset ${all.map((a) => a.id).join("|")}`);
    const list = opts.asset ? all.filter((a) => a.id === opts.asset) : all;
    if (!list.length) fail(`No asset "${opts.asset}" in ${d.slug}: ${all.map((a) => a.id).join(", ")}`);
    for (const a of list) {
      const stats = await albedoStats(a.sp);
      const { stage, notes } = deriveStage(stats ?? { coloured: 0, share: 0 });
      say(`${a.id}\n  albedo   ${stats ? `hue ${stats.hue}°, coloured ${(stats.coloured * 100).toFixed(1)}%` : "none measured"}\n  rules    ${JSON.stringify(stage)}\n           ${notes.join("; ")}\n  current  ${JSON.stringify(a.sp.stage ?? null)}`);
      if (opts.write) a.sp.stage = { ...a.sp.stage, ...stage };
    }
    if (opts.write) {
      writeEntry(e);
      say(`\nWritten. Re-shoot the set photograph:  npm run asset -- shoot ${d.slug}${opts.asset && all.length > 1 ? ` --asset ${opts.asset}` : ""}`);
    }
    return;
  }
  const stats = await measureRoomSource(d);
  const { room, notes } = deriveRoom(stats, { shape: opts.shape ?? d.room?.shape ?? "pool" });
  const report = (r) => {
    const p = checkRoom(r, stats);
    return `text ${contrast(CREAM, r.shadow).toFixed(1)}:1 · accent ${contrast(r.accent, r.shadow).toFixed(1)}:1 · ${p.length ? "! " + p.join("; ") : "rules ok"}`;
  };
  say(`${d.slug}\n  work     L median ${stats.Lmed}, p95 ${stats.Lp95}; chroma ${stats.meanC}; hue ${stats.hue}° (${(stats.share * 100).toFixed(0)}% of its colour); peaks ${stats.peaks.map((p) => `${p.h}°`).join(" ")}`);
  say(`  rules    ${JSON.stringify(room)}\n           ${notes.join("; ")}\n           ${report(room)}`);
  if (d.room) say(`  current  ${JSON.stringify(d.room)}\n           ${report(d.room)}`);
  if (opts.write) {
    d.room = room;
    writeEntry(e);
    say("\nWritten.");
  } else say("\n(--write to use the rules' room. Hand-tuned rooms live in scripts/make-rooms.mjs.)");
}

// ── shoot: photograph 3D sets from the live viewer ──────────────────────────
function build() {
  say("Building the site with drafts (next build, SHOW_DRAFTS=1)…");
  const next = join(ROOT, "node_modules/next/dist/bin/next");
  const r = spawnSync(process.execPath, [next, "build"], { cwd: ROOT, env: { ...process.env, SHOW_DRAFTS: "1" }, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) {
    console.error((r.stdout + r.stderr).split("\n").slice(-40).join("\n"));
    fail("the build failed — fix the error above (often a content field), then shoot again.");
  }
}

async function shoot(list, { assetId, outDir, noBuild } = {}) {
  if (!noBuild) build();
  if (!existsSync(join(ROOT, "out/index.html"))) fail("No out/ build — run without --no-build.");
  const srv = await serve(join(ROOT, "out"));
  const W = 2700, H = 900, DPR = 1.5;
  const b = await launch({ width: W, height: H, dpr: DPR, webgl: true });
  const shotDir = outDir ?? DIRS.set;
  try {
    for (const e of list) {
      const d = e.data;
      const all = assetsOf(d);
      for (const [i, a] of all.entries()) {
        if (assetId && a.id !== assetId) continue;
        const q = new URLSearchParams({ v: "frame", c: "all", p: d.slug, still: "1" });
        if (all.length > 1) q.set("a", String(i));
        await b.go(`${srv.base}/?${q}`);
        const ready = await b.until(`window.__litReady === ${JSON.stringify(a.sp.modelPath)}`, 180000, 500);
        if (!ready) {
          say(`✖ ${a.id}: the viewer never became ready ${b.errors.length ? `(${b.errors.join(" | ")})` : ""}`);
          continue;
        }
        await sleep(3500); // the set's lights come up; let a settled frame land
        const stats = await b.eval("window.__litStats || null");
        const url = await b.eval("(() => { const c = document.querySelector('canvas'); return c ? c.toDataURL('image/png') : ''; })()");
        if (!url) {
          say(`✖ ${a.id}: no canvas`);
          continue;
        }
        // A re-shoot keeps the photo's existing name (e.g. rubia.webp for the
        // rubia-rigged-character entry); a first shoot names it after the asset.
        const name = a.sp.setStill?.src ? basename(a.sp.setStill.src).replace(/\.webp$/i, "") : a.id;
        const photo = await writeSetPhoto(Buffer.from(url.split(",")[1], "base64"), name, shotDir);
        say(`✓ ${a.id}: ${photo.width}×${photo.height}${stats ? `, ${stats.triangles.toLocaleString("en")} triangles, ${stats.maps} maps` : ""} → ${rel(photo.wideFile)}`);
        if (outDir) continue;
        a.sp.setStill = { src: photo.src, width: photo.width, height: photo.height, thumb: photo.thumb };
        if (stats) a.sp.facts = { triangles: stats.triangles, maps: stats.maps };
        if (!exists(a.sp.poster)) a.sp.poster = photo.thumb;
        // A model entry's cards point at its tile until something else is chosen.
        for (const m of [d.thumbnail, d.heroMedia]) if (m && (!exists(m.src) || m.src === photo.thumb)) Object.assign(m, { kind: "image", src: photo.thumb, ...TILE });
      }
      if (outDir) continue;
      writeEntry(e);
      const cover = all.find((a) => a.id === d.cover) ?? all[0];
      if (d.seo.ogImage === conv.og(d.slug) && cover.sp.setStill && (!assetId || assetId === cover.id)) {
        await makeOg(fileOf(cover.sp.setStill.src), d.slug, { focus: "centre" });
        say(`  share image ← ${cover.id}`);
      }
    }
  } finally {
    await b.close();
    srv.close();
  }
}

async function cmdShoot() {
  const list = args.length ? args.map(entry) : entries().filter((e) => isModel(e.data));
  const bad = list.find((e) => !isModel(e.data));
  if (bad) fail(`${bad.data.slug} has no 3D model to photograph.`);
  if (opts.out) mkdirSync(opts.out, { recursive: true });
  await shoot(list, { assetId: opts.asset, outDir: opts.out, noBuild: !!opts["no-build"] });
}

// ── add ─────────────────────────────────────────────────────────────────────
const sha = (f) => createHash("sha1").update(readFileSync(f)).digest("hex");
/** Copy into public/ — never over a different file. */
function place(src, dest) {
  if (existsSync(dest)) {
    if (sha(src) === sha(dest)) return dest;
    fail(`${rel(dest)} already exists and is a different file. Choose another --slug (nothing was changed).`);
  }
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
  return dest;
}
async function encodeTo(img, dest, { max = 4096, normal = false } = {}) {
  if (existsSync(dest)) fail(`${rel(dest)} already exists. Choose another --slug (nothing was changed).`);
  mkdirSync(dirname(dest), { recursive: true });
  await sharp(img).resize({ width: max, height: max, fit: "inside", withoutEnlargement: true }).webp(normal ? { nearLossless: true, quality: 60 } : { quality: 92 }).toFile(dest);
  return dest;
}

/** Find a model's PBR maps beside it (and in a textures/ folder): files whose
 *  names start with `prefix` (default: the model's file name). The shortest
 *  name wins per kind, so "sword_color" beats "sword_grip_color". With no
 *  match, `fallback` takes any maps in the folder (the main model only). */
function findMaps(model, { prefix, fallback = true } = {}) {
  const dir = dirname(model);
  const base = (prefix ?? basename(model, extname(model))).toLowerCase();
  const files = [...new Set([dir, join(dir, "textures"), join(dir, "Textures")])]
    .filter((x) => existsSync(x) && statSync(x).isDirectory())
    .flatMap((x) => readdirSync(x).map((n) => join(x, n)))
    .filter((f) => IMG.has(extname(f).toLowerCase()));
  const mine = files.filter((f) => basename(f).toLowerCase().startsWith(base));
  const pool = (mine.length || !fallback ? mine : files).sort((a, b) => basename(a).length - basename(b).length);
  const KINDS = [
    ["skip", /(alpha|opacity|height|displace|ao\b|_ao|ambient|occlusion|emissi|orm\b|_orm|mask|id\b)/i],
    ["transmissionMap", /(transmission|_trans)/i],
    ["normalMap", /(normal|_nrm|_nor\b|_n\b)/i],
    ["roughnessMap", /(rough|_r\b)/i],
    ["metalnessMap", /(metal|_m\b)/i],
    ["map", /(base[_ -]?colou?r|albedo|diffuse|colou?r|_col\b|_bc\b|_d\b)/i],
  ];
  const maps = {}, skipped = [], unknown = [];
  let alpha;
  for (const f of pool) {
    const n = basename(f, extname(f));
    const k = KINDS.find(([, re]) => re.test(n))?.[0];
    if (!k) unknown.push(basename(f));
    else if (k === "skip") {
      skipped.push(basename(f));
      if (/(alpha|opacity)/i.test(n)) alpha ??= f;
    }
    else if (k === "normalMap" && maps.normalMap && /directx|_dx/i.test(n)) continue; // prefer OpenGL normals
    else if (!maps[k] || (k === "normalMap" && /opengl|_gl/i.test(n))) maps[k] = f;
  }
  return { maps, skipped, unknown, alpha };
}

async function cmdAdd() {
  const src = args[0] ?? fail("add <file>");
  if (!existsSync(src)) fail(`${src} not found.`);
  const ext = extname(src).toLowerCase();
  const kind = IMG.has(ext) ? "still" : VID.has(ext) ? "video" : MDL.has(ext) ? "3d" : fail(`Can't add ${ext} files (stills: .png .jpg .webp .tif; video: .mp4; models: .fbx .glb).`);
  const title = opts.title ?? titleFrom(basename(src));
  const pack = opts.pack ? entry(opts.pack) : null;
  if (pack && kind !== "3d") fail("--pack takes a model.");
  const slug = opts.slug ?? slugify(title);
  if (!slug) fail("Couldn't make a slug — pass --slug.");
  if (!pack && existsSync(pathFor(slug))) fail(`content/work/${slug}.json already exists — pass another --slug.`);
  if (pack && assetsOf(pack.data).some((a) => a.id === slug)) fail(`${opts.pack} already has an asset "${slug}".`);
  const year = opts.year ?? String(new Date(statSync(src).mtimeMs).getFullYear());
  const size = statSync(src).size;
  const made = [];

  // ── bring the file in ──
  let entryData;
  if (kind === "still") {
    const meta = await sharp(src).metadata();
    let dest;
    if (opts.keep && [".png", ".jpg", ".jpeg", ".webp"].includes(ext)) dest = place(src, join(PUBLIC, "Image renders", `${slug}${ext}`));
    else if (ext === ".webp" && meta.width <= 3840 && meta.height <= 3840) dest = place(src, join(PUBLIC, "Image renders", `${slug}.webp`));
    else dest = await encodeTo(src, join(PUBLIC, "Image renders", `${slug}.webp`), { max: 3840 });
    if (statSync(dest).size > LIMIT) fail(`${rel(dest)} is ${mb(statSync(dest).size)} — over the 25 MB limit.`);
    made.push(`${rel(dest)} (${mb(statSync(dest).size)}${dest.endsWith(ext) ? "" : `, from a ${mb(size)} ${ext}`})`);
    const p = await probeImage(dest);
    const media = { kind: "image", src: urlOf(dest), alt: title, width: p.width, height: p.height };
    // The card points at a 960 px thumbnail (made by derive) unless the still is already card-sized.
    const thumb = p.width > 1400 ? { kind: "image", src: conv.thumb(slug), alt: title } : { ...media };
    entryData = base(slug, title, year, "Still", { thumbnail: thumb, heroMedia: { ...media }, gallery: [{ ...media }] });
  } else if (kind === "video") {
    if (ext !== ".mp4" && ext !== ".m4v") fail(`Convert to H.264 MP4 first, e.g.\n  ffmpeg -i "${src}" -c:v libx264 -crf 20 -preset slow -pix_fmt yuv420p -movflags +faststart -c:a aac out.mp4`);
    const p = probeMp4(src);
    if (!/avc1|avc3|hvc1|hev1|av01|vp09/.test(p.codec)) fail(`Video codec "${p.codec}" won't play in browsers — re-encode to H.264.`);
    if (/hvc1|hev1/.test(p.codec)) say("! HEVC plays in Safari and recent Chrome/Edge only; H.264 is the safe choice.");
    if (size > LIMIT) fail(`${basename(src)} is ${mb(size)} — over the 25 MB per-file limit. Re-encode, e.g.\n  ffmpeg -i "${src}" -c:v libx264 -crf 23 -preset slow -pix_fmt yuv420p -movflags +faststart -c:a aac out.mp4`);
    if (!p.faststart) say("! The video's index is at the end of the file (slow start). Re-mux: ffmpeg -i in.mp4 -c copy -movflags +faststart out.mp4");
    const dest = place(src, join(PUBLIC, "Video renders", `${slug}.mp4`));
    made.push(`${rel(dest)} (${mb(size)}, ${p.width}×${p.height}, ${p.fps} fps, ${p.duration}s${p.audio ? ", sound" : ""})`);
    const media = { kind: "video", src: urlOf(dest), poster: conv.poster(slug), alt: title };
    entryData = base(slug, title, year, "Motion", { thumbnail: { kind: "image", src: conv.poster(slug), alt: title }, heroMedia: { ...media }, gallery: [{ ...media }] });
  } else {
    let rigged = false;
    if (ext === ".glb") {
      const g = probeGlb(src);
      rigged = opts["not-rigged"] ? false : !!opts.rigged || g.skins > 0;
      if (opts["not-rigged"] && g.skins) say("! It has a skin: shown as a prop it stands in its bind pose, and may sit at the wrong scale or off the floor.");
      say(`GLB: ${g.materials} material(s), ${g.baseColorImages.length} base-colour map(s)${g.skins ? `, ${g.skins} skin(s)` : ""}${g.animations ? `, ${g.animations} animation(s)` : ""}${g.draco ? ", Draco" : ""}`);
    }
    if (size > LIMIT) fail(`${basename(src)} is ${mb(size)} — over the 25 MB per-file limit. Export with Draco compression (GLB) or decimate.`);
    const folder = join(PUBLIC, rigged ? "Rigged Characters" : "models", slug);
    const modelDest = place(src, join(folder, basename(src)));
    made.push(`${rel(modelDest)} (${mb(size)})`);
    const textures = {};
    if (ext === ".fbx") {
      const { maps, skipped, unknown } = findMaps(src, { prefix: opts.maps });
      for (const [k, f] of Object.entries(maps)) {
        const dest = await encodeTo(f, join(folder, `${basename(f, extname(f))}.webp`), { normal: k === "normalMap" });
        textures[k] = urlOf(dest);
        made.push(`${rel(dest)} (${k})`);
      }
      if (!maps.map) say("! No colour map found beside the FBX (named *_color, *_albedo, *_basecolor…). It will show in a plain material.");
      const notMine = (n) => opts["extra-maps"] && n.toLowerCase().startsWith(opts["extra-maps"].toLowerCase());
      if (skipped.filter((n) => !notMine(n)).length) say(`  not used by the viewer: ${skipped.filter((n) => !notMine(n)).join(", ")}`);
      if (unknown.length) say(`  not recognised (rename to *_color / *_normal / *_roughness / *_metallic to use): ${unknown.join(", ")}`);
    }
    let extraModelPath;
    const extraTextures = {};
    if (opts.extra) {
      if (!existsSync(opts.extra)) fail(`${opts.extra} not found.`);
      const xDest = place(opts.extra, join(folder, basename(opts.extra)));
      extraModelPath = urlOf(xDest);
      made.push(`${rel(xDest)} (second model, ${mb(statSync(opts.extra).size)})`);
      // Its own maps (own UVs; an alpha map cuts it out, e.g. a grip wrap).
      const { maps, alpha } = findMaps(opts.extra, { prefix: opts["extra-maps"], fallback: false });
      if (!Object.keys(maps).length) say(`! No maps found for ${basename(opts.extra)} (named ${opts["extra-maps"] ?? basename(opts.extra, extname(opts.extra))}_*) — it wears the main model's material. --extra-maps <prefix> names them.`);
      for (const [k, f] of [...Object.entries(maps).filter(([k]) => k !== "transmissionMap"), ...(alpha ? [["alphaMap", alpha]] : [])]) {
        const dest = await encodeTo(f, join(folder, `${basename(f, extname(f))}.webp`), { normal: k === "normalMap" });
        extraTextures[k] = urlOf(dest);
        made.push(`${rel(dest)} (second model: ${k})`);
      }
    }
    const specimen = {
      modelPath: urlOf(modelDest),
      poster: conv.tile(slug),
      ...(extraModelPath ? { extraModelPath } : {}),
      ...(rigged ? { rigged: true } : {}),
      textures,
      ...(Object.keys(extraTextures).length ? { extraTextures } : {}),
    };
    if (pack) {
      const d = pack.data;
      d.assets = d.assets?.length ? d.assets : [{ id: d.slug, title: d.title, specimen: d.specimen }];
      d.assets.push({ id: slug, title, ...(opts.summary ? { summary: opts.summary } : {}), specimen });
      writeEntry(pack);
      say(`Added "${title}" to ${d.slug} (asset ${d.assets.length}).`);
    } else {
      const card = { kind: "image", src: conv.tile(slug), alt: title, ...TILE };
      entryData = base(slug, title, year, rigged ? "Rigged character" : "Model", { thumbnail: { ...card }, heroMedia: { ...card }, gallery: [], specimen, ...(rigged ? { category: "rigged" } : {}) });
    }
  }

  const e = pack ?? { path: pathFor(slug), crlf: entries()[0]?.crlf ?? false, data: entryData };
  if (!pack) writeEntry(e);
  say(`\nCopied:\n  ${made.join("\n  ")}`);
  const changes = await derive(e, {});
  if (changes.length) say(`Measured and made:\n  ${changes.join("\n  ")}`);
  if (kind === "3d") {
    if (opts["no-shoot"]) say("\nSet photograph skipped — run:  npm run asset -- shoot " + e.data.slug);
    else {
      say("");
      await shoot([readEntry(e.path)], { assetId: pack ? slug : undefined });
    }
  }
  const r = await inspect(readEntry(e.path).data);
  say(`\n${pack ? "Asset added" : "Draft created"}: content/work/${e.data.slug}.json`);
  if (!pack && !opts.year) say(`  year ${year} — from the file's date; change it if that's not when the piece was made`);
  for (const m of [...r.errors.map((x) => "✖ " + x), ...r.stale.map((x) => "· " + x)]) say("  " + m);
  say(`
Next:
  1. npm run dev — the piece is on the index, marked Draft.
  2. Write ${r.todo.length ? r.todo.join(" and ") : "the text"} (and role / tools if you can state them) in
     content/work/${e.data.slug}.json. Leave out what you can't state; never invent.
  3. Not happy with the room? npm run asset -- room ${e.data.slug} --shape low|rake|horizon --write
  4. npm run asset -- publish ${e.data.slug}   → commit and push to deploy.`);
}

function base(slug, title, year, format, media) {
  // sortOrder: after every existing entry; `order` moves it.
  const last = Math.max(0, ...entries().map((x) => x.data.sortOrder));
  return {
    slug,
    title,
    draft: true,
    sortOrder: last + 1,
    year,
    featured: false,
    format,
    discipline: opts.discipline ?? "",
    summary: opts.summary ?? "",
    tags: [],
    role: [],
    tools: [],
    ...media,
    seo: { title, description: opts.summary ?? "", ogImage: conv.og(slug) },
  };
}

// ── order, cover, publish, archive ──────────────────────────────────────────
function cmdOrder() {
  const list = entries();
  if (args.length >= 2) {
    const from = list.findIndex((x) => x.data.slug === args[0]);
    if (from < 0) fail(`No entry "${args[0]}".`);
    const to = Math.max(1, Math.min(list.length, Number(args[1]))) - 1;
    const [m] = list.splice(from, 1);
    list.splice(to, 0, m);
    list.forEach((x, i) => {
      if (x.data.sortOrder !== i + 1) {
        x.data.sortOrder = i + 1;
        writeEntry(x);
      }
    });
  }
  list.forEach((x, i) => say(` ${pad(i + 1)}  ${x.data.title}${x.data.draft ? "  (draft)" : ""}`));
}

function cmdCover() {
  const e = entry(args[0] ?? fail("cover <pack> <asset-id>"));
  const ids = assetsOf(e.data).map((a) => a.id);
  if (!ids.includes(args[1])) fail(`Assets of ${e.data.slug}: ${ids.join(", ")}`);
  e.data.cover = args[1];
  writeEntry(e);
  say(`${e.data.slug}: the index shows ${args[1]}. (Share image: npm run asset -- derive ${e.data.slug} --force)`);
}

async function cmdPublish(on) {
  const e = entry(args[0] ?? fail(`${on ? "publish" : "unpublish"} <slug>`));
  if (!on) {
    const { slug, title, draft: _, ...rest } = e.data;
    e.data = { slug, title, draft: true, ...rest };
    writeEntry(e);
    return say(`${e.data.slug} is a draft again (hidden from production builds).`);
  }
  const r = await inspect(e.data);
  const blockers = [...r.errors, ...r.todo.map((t) => `${t} is empty`), ...(opts.force ? [] : r.stale)];
  if (blockers.length) fail(`Not publishing ${e.data.slug}:\n  ${blockers.join("\n  ")}${r.errors.length || r.todo.length ? "" : "\n(--force publishes with stale items)"}`);
  if (!e.data.seo.description) e.data.seo.description = e.data.summary;
  delete e.data.draft;
  writeEntry(e);
  say(`${e.data.slug} is published. Check it (npm run build && npm run check:site), then commit and push to deploy.`);
}

function cmdArchive() {
  const e = entry(args[0] ?? fail("archive <slug>"));
  const others = new Set(entries().filter((x) => x.data.slug !== e.data.slug).flatMap((x) => refs(x.data)));
  const own = [...new Set(refs(e.data))].filter((u) => !others.has(u) && exists(u));
  const total = own.reduce((s, u) => s + statSync(fileOf(u)).size, 0);
  const dest = join(ARCHIVE, basename(e.path));
  say(`${opts.yes ? "Moving" : "Would move"} ${rel(e.path)} → ${rel(dest)}`);
  say(`Files only this entry uses (left in place — ${own.length} file(s), ${mb(total)}):\n  ${own.join("\n  ") || "(none)"}`);
  const home = JSON.parse(readFileSync(join(ROOT, "content/site/home.json"), "utf8"));
  if (home.hero?.featuredSlug === e.data.slug) fail("content/site/home.json → hero.featuredSlug points at this entry; change it first.");
  if (!opts.yes) return say("\nNothing changed. Run again with --yes to archive.");
  if (existsSync(dest)) fail(`${rel(dest)} already exists.`);
  mkdirSync(ARCHIVE, { recursive: true });
  renameSync(e.path, dest);
  say("Archived. To bring it back, move the file back into content/work/.");
}

async function cmdCheck() {
  const bad = await status();
  for (const s of ["validate-content.mjs", "check-asset-sizes.mjs"]) {
    const r = spawnSync(process.execPath, [join(ROOT, "scripts", s)], { cwd: ROOT, stdio: "inherit" });
    if (r.status !== 0) process.exitCode = 1;
  }
  if (bad) process.exitCode = 1;
}

// ── run ─────────────────────────────────────────────────────────────────────
if (!existsSync(WORK)) fail(`No content/work in ${ROOT}.`);
const RUN = {
  help: () => say(HELP),
  status: async () => {
    if (await status()) process.exitCode = 1;
  },
  doctor: async () => {
    if (await status()) process.exitCode = 1;
  },
  add: cmdAdd,
  derive: cmdDerive,
  room: cmdRoom,
  shoot: cmdShoot,
  order: cmdOrder,
  cover: cmdCover,
  publish: () => cmdPublish(true),
  unpublish: () => cmdPublish(false),
  archive: cmdArchive,
  check: cmdCheck,
};
if (!RUN[cmd]) fail(`Unknown command "${cmd}". npm run asset -- help`);
await RUN[cmd]();
