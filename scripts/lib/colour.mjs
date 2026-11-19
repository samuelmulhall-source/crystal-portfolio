// Colour measurement and conversion (OKLab / OKLCH), shared by the asset tools.
import sharp from "sharp";

const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const gam = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

export function oklab(r, g, b) {
  r = lin(r / 255);
  g = lin(g / 255);
  b = lin(b / 255);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
function linRgb([L, C, h]) {
  const a = C * Math.cos((h * Math.PI) / 180), b = C * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
}
const inGamut = (c) => linRgb(c).every((v) => v >= -0.0005 && v <= 1.0005);
/** Gamut-map by lowering chroma at fixed L and hue (clipping would shift hue). */
export function fit(c) {
  if (inGamut(c)) return c;
  let lo = 0, hi = c[1];
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut([c[0], mid, c[2]])) lo = mid;
    else hi = mid;
  }
  return [c[0], lo, c[2]];
}
/** OKLCH [L, C, h] → #rrggbb (gamut-mapped). */
export function hex(c) {
  return "#" + linRgb(fit(c)).map((v) => Math.round(Math.max(0, Math.min(1, gam(v))) * 255).toString(16).padStart(2, "0")).join("");
}
/** #rrggbb → OKLCH [L, C, h]. */
export function toLch(h) {
  const [L, a, b] = oklab(...[1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)));
  return [L, Math.hypot(a, b), ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360];
}

// WCAG contrast.
const rel = (h) => {
  const v = [1, 3, 5].map((i) => lin(parseInt(h.slice(i, i + 2), 16) / 255));
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
};
export const contrast = (x, y) => {
  const [p, q] = [rel(x), rel(y)].sort((u, v) => v - u);
  return (p + 0.05) / (q + 0.05);
};
export const over = (fg, a, bg) => "#" + [1, 3, 5].map((i) => Math.round(parseInt(fg.slice(i, i + 2), 16) * a + parseInt(bg.slice(i, i + 2), 16) * (1 - a)).toString(16).padStart(2, "0")).join("");
export const CREAM = "#f1e9dc";

/**
 * Colour + value structure of an image (path or buffer, or several to pool):
 *   Lmed, Lp95  — value structure (OKLab L)
 *   meanC       — overall chroma
 *   coloured    — share of pixels with visible colour (chroma > 0.03)
 *   peaks       — chroma-weighted hue histogram peaks [{ h, share }]
 *   hue         — dominant hue (circular mean around the top peak)
 *   share       — how much of the colour sits near that hue (0–1)
 */
export async function analyse(sources) {
  const list = Array.isArray(sources) ? sources : [sources];
  const Ls = [];
  const bins = new Array(24).fill(0);
  let csum = 0, n = 0, coloured = 0;
  for (const src of list) {
    // Transparent texels (cut-out maps, UV padding with alpha) are not colour.
    const { data } = await sharp(src).resize(240, 240, { fit: "inside" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 128) continue;
      const [L, a, b] = oklab(data[i], data[i + 1], data[i + 2]);
      Ls.push(L);
      const C = Math.hypot(a, b);
      csum += C;
      n++;
      if (C > 0.03) {
        coloured++;
        bins[Math.floor((((Math.atan2(b, a) * 180) / Math.PI + 360) % 360) / 15)] += C * (0.3 + L);
      }
    }
  }
  if (!n) throw new Error("no opaque pixels to measure");
  Ls.sort((x, y) => x - y);
  const q = (p) => Ls[Math.floor(p * (Ls.length - 1))];
  const tot = bins.reduce((x, y) => x + y, 0) || 1;
  const peaks = bins.map((w, i) => ({ h: i * 15 + 7.5, share: w / tot })).sort((x, y) => y.share - x.share);
  // Circular mean of the bins within ±30° of the top peak.
  const top = peaks[0].h;
  let sx = 0, sy = 0, near = 0;
  bins.forEach((w, i) => {
    const h = i * 15 + 7.5;
    const d = Math.abs(((h - top + 540) % 360) - 180);
    if (d <= 30) {
      sx += w * Math.cos((h * Math.PI) / 180);
      sy += w * Math.sin((h * Math.PI) / 180);
      near += w;
    }
  });
  return {
    Lmed: +q(0.5).toFixed(3),
    Lp95: +q(0.95).toFixed(3),
    meanC: +(csum / n).toFixed(4),
    coloured: +(coloured / n).toFixed(4),
    peaks: peaks.slice(0, 4).map((p) => ({ h: p.h, share: +p.share.toFixed(3) })),
    hue: Math.round(((Math.atan2(sy, sx) * 180) / Math.PI + 360) % 360),
    share: +(near / tot).toFixed(3),
  };
}

/** The mean colour of an image's top and bottom edge bands → [top, bottom]. */
export async function edgeColors(src) {
  const { data, info } = await sharp(src).resize(200, 200, { fit: "fill" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const band = 6;
  const mean = (y0, y1) => {
    const s = [0, 0, 0];
    let k = 0;
    for (let y = y0; y < y1; y++)
      for (let x = 0; x < info.width; x++) {
        const i = (y * info.width + x) * 3;
        s[0] += data[i];
        s[1] += data[i + 1];
        s[2] += data[i + 2];
        k++;
      }
    return "#" + s.map((v) => Math.round(v / k).toString(16).padStart(2, "0")).join("");
  };
  return [mean(0, band), mean(info.height - band, info.height)];
}
