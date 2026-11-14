import type { LitPiece } from "../components/lit/LitShowcase";
import { getWorkCategory, getWorkEntries } from "./content";

// The asset whose set photograph stands for an asset pack in the index — the
// one whose materials read best. Falls back to the pack's first asset.
const PACK_COVER = "ornate-dagger";

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
    };
    if (e.assets?.length || e.specimen) {
      const assets = (e.assets?.length ? e.assets : [{ id: e.slug, title: e.title, summary: undefined, specimen: e.specimen! }]).map((a) => ({
        id: a.id,
        title: a.title,
        summary: a.summary,
        specimen: a.specimen,
      }));
      const coverIdx = Math.max(0, assets.findIndex((a) => a.id === PACK_COVER));
      const cover = assets[coverIdx];
      const still = cover.specimen.setStill;
      return {
        ...base,
        media: { kind: "model", assets, rigged: !!e.specimen?.rigged },
        tile: still ? { src: still.thumb, ar: 4 / 3 } : { src: cover.specimen.poster, ar: 4 / 3 },
        field: cover.specimen.stage?.field ?? ["#16130f", "#0a0806"],
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
        field,
      } satisfies LitPiece;
    }
    const w = f?.width ?? e.heroMedia.width ?? 1600;
    const h = f?.height ?? e.heroMedia.height ?? 900;
    return {
      ...base,
      media: { kind: "image", src: e.heroMedia.src, thumb: e.thumbnail.src, w, h },
      tile: { src: e.thumbnail.src, ar: w / h },
      field,
    } satisfies LitPiece;
  });
}
