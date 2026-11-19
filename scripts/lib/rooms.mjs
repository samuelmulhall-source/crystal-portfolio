// The room engine: the colour-theory rules (CLAUDE.md, "Rooms") as code, so a
// new piece gets a room designed the same way the tuned ones were.
//
//   deriveRoom(stats, { shape })  → { room, notes }   stills and video
//   deriveStage(albedoStats)      → { stage, notes }  3D set paint + field + accent
//   checkRoom(room, stats)        → [problems]        value + contrast rules
//
// stats come from colour.analyse(): { Lmed, Lp95, meanC, peaks, hue, share }.
import { hex, contrast, over, CREAM } from "./colour.mjs";

const dist = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

/** Hues that keep their identity at very low lightness (OKLCH hue °). */
const STABLE = [
  { h: 18, name: "crimson" },
  { h: 150, name: "deep green" },
  { h: 200, name: "teal" },
  { h: 255, name: "navy" },
  { h: 292, name: "violet" },
];
/** Orange → yellow → olive turn brown in the dark. */
const unstable = (h) => h > 32 && h < 128;

/** The lightness at which a hue reads truest as a small accent mark. */
function accentL(h) {
  if (h < 40 || h >= 345) return 0.7; // red
  if (h < 75) return 0.8; // orange
  if (h < 118) return 0.86; // yellow
  if (h < 170) return 0.82; // green
  if (h < 215) return 0.84; // cyan
  if (h < 272) return 0.8; // blue
  if (h < 320) return 0.78; // violet
  return 0.74; // magenta
}
const warm = (h) => h < 110 || h >= 340;
/** A warm light lands on one of the two warm hues that still read as colour
 *  at a wall's value: ember (46°) for the complements of blues, gold (80°) for
 *  the complements of violets. Anything between turns brown or olive. */
const warmLight = (comp) => (comp <= 70 ? { h: 46, C: 0.125, name: "ember" } : { h: 80, C: 0.1, name: "gold" });

/** An accent in hue h, at its truest lightness, raised until it reads as text
 *  (≥ 4.5:1) on the shadow. */
function accentFor(h, shadowHex, chroma = 0.15) {
  let L = accentL(h);
  let a = hex([L, chroma, h]);
  while (contrast(a, shadowHex) < 4.5 && L < 0.95) {
    L += 0.02;
    a = hex([L, chroma, h]);
  }
  return a;
}

export function deriveRoom(stats, { shape = "pool" } = {}) {
  const notes = [];
  const achromatic = stats.meanC < 0.012;
  const manyHued = !achromatic && stats.share < 0.45;
  const lightCap = Math.min(stats.Lp95 - 0.2, 0.4);
  let shadow, light, accentHue;

  if (achromatic) {
    // The one place for a bold light: vermilion across a navy-black shadow.
    shadow = [0.105, 0.04, 262];
    light = [Math.min(0.31, lightCap), 0.125, 32];
    notes.push("achromatic work → bold light (vermilion) on navy-black");
  } else if (manyHued) {
    // Many hues → near-neutral: cool-neutral shadow, warm-neutral light.
    shadow = [0.095, 0.012, 262];
    light = [Math.min(0.25, lightCap), 0.022, 70];
    accentHue = stats.peaks[0].h;
    notes.push(`many-hued (top hue only ${(stats.share * 100).toFixed(0)}%) → near-neutral room`);
  } else {
    const h = stats.hue;
    const comp = (h + 180) % 360;
    // Shadow: the darkness-stable hue nearest the work's own family; a warm
    // (unstable) work gets an indigo shadow (cool, and holds in the dark).
    const anchor = unstable(h) ? { h: 272, name: "indigo" } : STABLE.reduce((b, s) => (dist(s.h, h) < dist(b.h, h) ? s : b));
    shadow = [0.115, 0.045, anchor.h];
    // Light: the complement. A warm light needs value to read as colour (and
    // snaps to ember or gold); a cool light reads at a lower value.
    let lightName = `${Math.round(comp)}°, the complement`;
    if (unstable(comp)) {
      const w = warmLight(comp);
      light = [Math.max(0.22, Math.min(0.38, lightCap)), w.C, w.h];
      lightName = `${w.name} ${w.h}° (complement ${Math.round(comp)}°, snapped)`;
    } else if (warm(comp)) {
      light = [Math.max(0.22, Math.min(0.34, lightCap)), 0.12, comp];
    } else {
      light = [Math.max(0.22, Math.min(0.29, lightCap)), 0.072, comp];
    }
    accentHue = h;
    notes.push(`dominant hue ${h}° (${(stats.share * 100).toFixed(0)}% of its colour) → shadow ${anchor.name} ${anchor.h}°, light ${lightName}`);
  }
  if (light[0] < 0.22 + 1e-9 && stats.Lp95 - 0.2 < 0.22) notes.push("dark work: the light is held low so the work stays brightest");
  const shadowHex = hex(shadow);
  const accent = achromatic ? hex([0.88, 0.03, 235]) : accentFor(accentHue, shadowHex);
  return { room: { shadow: shadowHex, light: hex(light), accent, shape }, notes };
}

/** 3D: the set's paint is the complement of the asset's albedo hue; cool
 *  paints sit lower in L (they read paler under the warm key light). */
export function deriveStage(stats) {
  const notes = [];
  // Albedo maps are mostly low-chroma; a hue counts once a few percent of the
  // texels carry it.
  if (stats.coloured < 0.02 || stats.share === 0) {
    notes.push("achromatic albedo → warm ember set");
    const h = 44;
    return {
      stage: { color: hex([0.33, 0.058, h]), field: [hex([0.23, 0.05, h]), hex([0.095, 0.02, h])], accent: hex([0.86, 0.09, 78]) },
      notes,
    };
  }
  // The complement — but a paint between orange and olive reads brown under
  // the warm key, so it settles on amber (44–70°), as the tuned sets do.
  const comp = (stats.hue + 180) % 360;
  const h = unstable(comp) ? Math.min(70, Math.max(44, comp)) : comp;
  const cool = h >= 170 && h < 320;
  const L = cool ? 0.305 : 0.35;
  const C = cool ? 0.048 : 0.05;
  const shadowHex = hex([0.09, 0.018, h]);
  notes.push(`albedo hue ${stats.hue}° → set paint ${Math.round(h)}° (complement${h !== comp ? ` ${Math.round(comp)}°, held at amber` : ""}, ${cool ? "cool → lower L" : "warm"})`);
  return {
    stage: { color: hex([L, C, h]), field: [hex([L - 0.085, C * 0.88, h]), shadowHex], accent: accentFor(stats.hue, shadowHex, 0.1) },
    notes,
  };
}

/** The value and contrast rules, checked against a room. */
export function checkRoom(room, stats) {
  const problems = [];
  const lightL = toL(room.light);
  if (stats && lightL > stats.Lp95 - 0.2 + 0.005) problems.push(`light L ${lightL.toFixed(2)} is within 0.2 of the work's highlights (p95 ${stats.Lp95})`);
  if (contrast(room.accent, room.shadow) < 4.5) problems.push(`accent ${contrast(room.accent, room.shadow).toFixed(1)}:1 on the shadow (needs 4.5)`);
  if (contrast(CREAM, room.shadow) < 7) problems.push(`text ${contrast(CREAM, room.shadow).toFixed(1)}:1 on the shadow (want 7)`);
  if (contrast(over(CREAM, 0.44, room.shadow), room.shadow) < 3) problems.push("dimmed titles under 3:1");
  return problems;
}
function toL(h) {
  const v = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const l = Math.cbrt(0.4122214708 * v[0] + 0.5363325363 * v[1] + 0.0514459929 * v[2]);
  const m = Math.cbrt(0.2119034982 * v[0] + 0.6806995451 * v[1] + 0.1073969566 * v[2]);
  const s = Math.cbrt(0.0883024619 * v[0] + 0.2817188376 * v[1] + 0.6299787005 * v[2]);
  return 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
}
