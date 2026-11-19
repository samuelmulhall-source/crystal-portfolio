import fs from "node:fs";
import path from "node:path";
import type { LitPiece } from "../components/lit/LitShowcase";
import { getWorkCategory, getWorkEntries } from "./content";

/** Smaller renditions made by `npm run asset -- derive`, if present. */
function srcsetFor(slug: string): string | undefined {
  const parts = [1280, 1920]
    .filter((w) => fs.existsSync(path.join(process.cwd(), "public/images/sized", `${slug}-${w}.webp`)))
    .map((w) => `/images/sized/${slug}-${w}.webp ${w}w`);
  return parts.length ? parts.join(", ") : undefined;
}

/** The phone catalogue's small card (256 px), if derive has made one. */
function cardFor(slug: string): string | undefined {
  return fs.existsSync(path.join(process.cwd(), "public/images/thumbs", `${slug}-card.webp`)) ? `/images/thumbs/${slug}-card.webp` : undefined;
}

/** Every work entry, shaped for the showcase. Reads content/work/*.json only —
 *  adding or editing an entry needs no component change. */
export function getLitPieces(): LitPiece[] {
  return getWorkEntries().map((e, i) => {
    const base = {
      slug: e.slug,
      no: i + 1,
      title: e.title,
      cat: getWorkCategory(e),
      year: e.year,
      discipline: e.discipline,
      summary: e.summary,
      role: e.role,
      tools: e.tools,
      seoTitle: e.seo.title,
      draft: e.draft || undefined,
    };
    // Fallback room for entries without one: the render's own edge colour.
    const edge = e.edgeColors ?? ["#0b0b0b", "#050505"];
    const room = e.room ?? { shadow: edge[1], light: edge[0], accent: "#f1e9dc", shape: "pool" as const };
    if (e.assets?.length || e.specimen) {
      const assets = (e.assets?.length ? e.assets : [{ id: e.slug, title: e.title, summary: undefined, specimen: e.specimen! }]).map((a) => ({
        id: a.id,
        title: a.title,
        summary: a.summary,
        specimen: a.specimen,
      }));
      // The asset that stands for the pack in the index (content `cover`).
      const coverIdx = Math.max(0, assets.findIndex((a) => a.id === e.cover));
      const cover = assets[coverIdx];
      const still = cover.specimen.setStill;
      return {
        ...base,
        media: { kind: "model", assets, rigged: !!e.specimen?.rigged },
        tile: still ? { src: still.thumb, ar: 4 / 3 } : { src: cover.specimen.poster, ar: 4 / 3 },
        field: cover.specimen.stage?.field ?? ["#16130f", "#0a0806"],
        room: cover.specimen.stage
          ? { light: cover.specimen.stage.field[0], shadow: cover.specimen.stage.field[1], accent: cover.specimen.stage.accent ?? "#f1e9dc", shape: "pool" }
          : room,
        cover: coverIdx,
      } satisfies LitPiece;
    }
    const f = e.facts;
    const video = e.gallery.find((g) => g.kind === "video") ?? (e.heroMedia.kind === "video" ? e.heroMedia : undefined);
    const field = e.edgeColors ?? ["#0b0b0b", "#050505"];
    if (video && f?.fps) {
      const poster = video.poster ?? e.thumbnail.src;
      return {
        ...base,
        media: { kind: "video", src: video.src, poster, w: f.width, h: f.height, fps: f.fps, frames: f.frames ?? 0, dur: f.duration ?? 0, audio: !!f.audio },
        tile: { src: poster, ar: f.width / f.height },
        card: cardFor(e.slug),
        field,
        room,
      } satisfies LitPiece;
    }
    const w = f?.width ?? e.heroMedia.width ?? 1600;
    const h = f?.height ?? e.heroMedia.height ?? 900;
    return {
      ...base,
      media: { kind: "image", src: e.heroMedia.src, thumb: e.thumbnail.src, w, h },
      tile: { src: e.thumbnail.src, ar: w / h },
      field,
      room,
      srcset: srcsetFor(e.slug),
      card: cardFor(e.slug),
    } satisfies LitPiece;
  });
}
