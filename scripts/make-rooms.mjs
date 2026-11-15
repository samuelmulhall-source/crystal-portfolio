// The rooms each piece sits in, chosen by colour theory from measured colour
// (run `node scripts/make-rooms.mjs` after editing ROOMS; it writes hex values
// into content/work/*.json and prints a contrast / value report). Values are
// OKLCH: [lightness, chroma, hue°]. Out-of-gamut colours are mapped back into
// sRGB by lowering chroma (never by clipping, which shifts the hue).
//
// Rules (second pass, 2026-11-15 — see CLAUDE.md, "Rooms"):
//  • HUE AT DEPTH. Blue, violet, teal and crimson keep their identity at very
//    low lightness; orange, yellow and gold do not (they turn brown/olive). So
//    the WALL in shadow is always a hue that survives the dark — and a warm
//    complement is carried by LIGHT, bright enough to read as colour.
//  • TEMPERATURE CONTRAST. Light and shadow sit on opposite sides of the wheel
//    (warm light / cool shadow, the painter's rule), so rooms read as lit
//    spaces, not flat monochrome. The light is the COMPLEMENT of the work's
//    dominant hue, so the work's colour reads stronger by simultaneous
//    contrast; the shadow is near the work's own hue family, so the work's
//    edges settle into it.
//  • VALUE HIERARCHY. Large areas of wall stay below the work's median value;
//    only a small, shaped light may approach it, and the work's highlights top
//    the wall's peak by at least 0.2 L. The darkest values frame the edges,
//    and the type sits in that shadow.
//  • ACCENT. The work's own hue, on a few small marks (the lit number, the
//    active category, the current tick, the scrubber, active controls), at the
//    lightness where that hue reads truest, and at 4.5:1 or more against the
//    shadow, because the numbers are text.
//  • SHAPE is the light's character: "pool" (gallery light behind the work),
//    "low" (rising from below — firelight), "rake" (a diagonal sweep),
//    "horizon" (a flat band at the work's lower third — a horizon glow). The
//    work casts a soft shadow on the wall, away from that light.
//  • Many-hued (iridescent) works get near-neutral light; achromatic works are
//    the one place for a bold, saturated light.
//
// 3D assets: the set's paint follows the complement rule against the asset's
// albedo hue (measured: sword 268°, dagger 44°, shield 30°, bow 75°, torch
// achromatic, Rubia 23°). Re-shoot the set photographs after changing them.
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// Each work's measured value structure (OKLab L): median and 95th percentile.
const WORK_L = {
  "soulbound-lantern": [0.32, 0.62],
  "fourteenth-study": [0.2, 0.6],
  "evening-fishing": [0.42, 0.87],
  "holography-study": [0.08, 0.71],
  "camera-icon": [0.21, 0.49],
};

const ROOMS = {
  // blue lantern (247°, 78%) → navy-black shadow (its own family, so the
  // frame's navy edges settle in) + ember light rising from below (the
  // complement, carried as light so it reads as fire, not brown)
  "soulbound-lantern": { shadow: [0.115, 0.045, 255], light: [0.36, 0.125, 46], accent: [0.8, 0.11, 238], shape: "low" },
  // violet neon VCR (277–292°) → violet-black shadow + a gold horizon band at
  // the machine's floor (the complement; echoes its gold lettering)
  "fourteenth-study": { shadow: [0.11, 0.05, 292], light: [0.38, 0.1, 80], accent: [0.78, 0.15, 288], shape: "horizon" },
  // green + orange dusk scene → deep twilight: violet-leaning shadow, a cooler
  // blue light behind (the complement of the scene's warm light); accent the
  // warm reflection
  "evening-fishing": { shadow: [0.115, 0.045, 272], light: [0.29, 0.072, 248], accent: [0.8, 0.13, 58], shape: "pool" },
  // iridescent (cyan + violet) → neutral: cool-neutral shadow, warm-neutral light
  "holography-study": { shadow: [0.095, 0.012, 262], light: [0.245, 0.022, 70], accent: [0.84, 0.11, 192], shape: "pool" },
  // achromatic → the bold light: vermilion raking across a navy-black shadow
  "camera-icon": { shadow: [0.105, 0.04, 262], light: [0.29, 0.125, 32], accent: [0.88, 0.03, 235], shape: "rake" },
};
const STAGES = {
  // [set paint], field = [pool light, shadow], accent = the asset's own hue.
  // Cool paints sit lower in lightness than warm ones: under the key light a
  // teal or slate reads paler than a red of the same L (Helmholtz–Kohlrausch).
  sword: { paint: [0.35, 0.05, 66], light: [0.24, 0.045, 66], shadow: [0.095, 0.018, 66], accent: [0.78, 0.11, 266] },
  "ornate-dagger": { paint: [0.305, 0.048, 238], light: [0.22, 0.042, 238], shadow: [0.09, 0.018, 238], accent: [0.82, 0.1, 58] },
  shield: { paint: [0.305, 0.048, 214], light: [0.22, 0.042, 214], shadow: [0.09, 0.018, 214], accent: [0.8, 0.1, 42] },
  bow: { paint: [0.305, 0.05, 280], light: [0.22, 0.044, 280], shadow: [0.09, 0.018, 280], accent: [0.84, 0.1, 82] },
  torch: { paint: [0.33, 0.058, 44], light: [0.23, 0.05, 44], shadow: [0.095, 0.02, 44], accent: [0.86, 0.09, 78] },
  rubia: { paint: [0.31, 0.062, 198], light: [0.22, 0.052, 198], shadow: [0.09, 0.02, 198], accent: [0.72, 0.17, 25] },
};

const gam = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
function linRgb([L, C, h]) {
  const a = C * Math.cos((h * Math.PI) / 180), b = C * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
}
const inGamut = (c) => linRgb(c).every((v) => v >= -0.0005 && v <= 1.0005);
const mapped = new Map();
/** Gamut-map by lowering chroma at fixed L and hue (keeps hue and value true). */
function fit(c) {
  if (inGamut(c)) return c;
  let lo = 0, hi = c[1];
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut([c[0], mid, c[2]])) lo = mid;
    else hi = mid;
  }
  mapped.set(c.join(", "), lo);
  return [c[0], lo, c[2]];
}
function hex(c) {
  return "#" + linRgb(fit(c)).map((v) => Math.round(Math.max(0, Math.min(1, gam(v))) * 255).toString(16).padStart(2, "0")).join("");
}
// WCAG relative luminance / contrast from hex (and alpha compositing).
const lum = (h) => {
  const v = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
};
const over = (fg, a, bg) => "#" + [1, 3, 5].map((i) => Math.round(parseInt(fg.slice(i, i + 2), 16) * a + parseInt(bg.slice(i, i + 2), 16) * (1 - a)).toString(16).padStart(2, "0")).join("");
const cr = (x, y) => {
  const [p, q] = [lum(x), lum(y)].sort((u, v) => v - u);
  return ((p + 0.05) / (q + 0.05)).toFixed(1);
};
const CREAM = "#f1e9dc";


const dir = join(process.cwd(), "content/work");
for (const f of readdirSync(dir).filter((x) => x.endsWith(".json"))) {
  const path = join(dir, f);
  const raw = readFileSync(path, "utf8");
  const crlf = raw.includes("\r\n");
  const j = JSON.parse(raw);
  const r = ROOMS[j.slug];
  if (r) j.room = { shadow: hex(r.shadow), light: hex(r.light), accent: hex(r.accent), shape: r.shape };
  const setStage = (id, sp) => {
    const s = STAGES[id];
    if (!s || !sp) return;
    sp.stage = { ...sp.stage, color: hex(s.paint), field: [hex(s.light), hex(s.shadow)], accent: hex(s.accent) };
  };
  if (j.assets) for (const a of j.assets) setStage(a.id, a.specimen);
  if (j.specimen) setStage(j.slug === "rubia-rigged-character" ? "rubia" : j.assets?.[0]?.id, j.specimen);
  let out = JSON.stringify(j, null, 2) + "\n";
  if (crlf) out = out.replace(/\n/g, "\r\n");
  writeFileSync(path, out);
  if (r) console.log(j.slug.padEnd(20), JSON.stringify(j.room));
}
for (const [id, s] of Object.entries(STAGES)) console.log(("set " + id).padEnd(20), hex(s.paint), "field", hex(s.light), hex(s.shadow), "accent", hex(s.accent), "accent/shadow", cr(hex(s.accent), hex(s.shadow)) + ":1");

console.log("\nReport — contrast (WCAG) and value margins:");
for (const [slug, r] of Object.entries(ROOMS)) {
  const sh = hex(r.shadow), li = hex(r.light), ac = hex(r.accent);
  const [med, p95] = WORK_L[slug];
  const flags = [];
  if (r.light[0] > p95 - 0.2) flags.push("light too close to the work's highlights");
  if (+cr(ac, sh) < 4.5) flags.push("accent under 4.5:1 on shadow");
  console.log(
    slug.padEnd(20),
    `text ${cr(CREAM, sh)}:1, on light ${cr(CREAM, li)}:1`,
    `| dim titles ${cr(over(CREAM, 0.44, sh), sh)}:1`,
    `| accent ${cr(ac, sh)}:1`,
    `| light L ${r.light[0]} vs work median ${med}, p95 ${p95}`,
    flags.length ? "  ! " + flags.join("; ") : "  ok",
  );
}
for (const [k, c] of mapped) console.log("gamut-mapped [" + k + "] -> chroma " + c.toFixed(3));

