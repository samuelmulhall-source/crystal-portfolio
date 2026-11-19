// Media probing: the facts the site states about a file are read off the file.
//   probeImage(path) → { width, height, format }
//   probeMp4(path)   → { width, height, duration, fps, frames, audio, codec, faststart }
//   probeGlb(path)   → { skins, animations, materials, baseColorImages, draco }
// No ffmpeg/ffprobe needed: MP4 is parsed by walking its box tree.
import { readFileSync, openSync, readSync, closeSync, statSync } from "node:fs";
import sharp from "sharp";

export async function probeImage(path) {
  const m = await sharp(path).metadata();
  return { width: m.width, height: m.height, format: m.format };
}

/** Iterate the boxes in buf[start, end). */
function* boxes(buf, start, end) {
  let p = start;
  while (p + 8 <= end) {
    let size = buf.readUInt32BE(p);
    const type = buf.toString("latin1", p + 4, p + 8);
    let header = 8;
    if (size === 1) {
      size = Number(buf.readBigUInt64BE(p + 8));
      header = 16;
    } else if (size === 0) size = end - p;
    if (size < header || p + size > end) return;
    yield { type, start: p, body: p + header, end: p + size };
    p += size;
  }
}
const child = (buf, box, type) => {
  for (const b of boxes(buf, box.body, box.end)) if (b.type === type) return b;
  return null;
};

/** Read the moov box, wherever it is (front- or back-loaded MP4). `first`:
 *  the index comes before the media data, so playback can start at once. */
function readMoov(path) {
  const size = statSync(path).size;
  const fd = openSync(path, "r");
  try {
    let p = 0;
    let sawMdat = false;
    const head = Buffer.alloc(16);
    while (p + 8 <= size) {
      readSync(fd, head, 0, 16, p);
      let s = head.readUInt32BE(0);
      const type = head.toString("latin1", 4, 8);
      if (s === 1) s = Number(head.readBigUInt64BE(8));
      else if (s === 0) s = size - p;
      if (s < 8) break;
      if (type === "mdat") sawMdat = true;
      if (type === "moov") {
        const buf = Buffer.alloc(s);
        readSync(fd, buf, 0, s, p);
        buf.first = !sawMdat;
        return buf;
      }
      p += s;
    }
  } finally {
    closeSync(fd);
  }
  throw new Error(`${path}: no moov box — not an MP4/MOV file?`);
}

export function probeMp4(path) {
  const buf = readMoov(path);
  const moov = { body: 8, end: buf.length };
  const out = { width: 0, height: 0, duration: 0, fps: 0, frames: 0, audio: false, codec: "", faststart: buf.first };
  for (const trak of boxes(buf, moov.body, moov.end)) {
    if (trak.type !== "trak") continue;
    const mdia = child(buf, trak, "mdia");
    if (!mdia) continue;
    const hdlr = child(buf, mdia, "hdlr");
    const handler = hdlr ? buf.toString("latin1", hdlr.body + 8, hdlr.body + 12) : "";
    if (handler === "soun") out.audio = true;
    if (handler !== "vide") continue;
    const tkhd = child(buf, trak, "tkhd");
    if (tkhd) {
      const v = buf[tkhd.body];
      const o = tkhd.body + (v === 1 ? 88 : 76);
      out.width = Math.round(buf.readUInt32BE(o) / 65536);
      out.height = Math.round(buf.readUInt32BE(o + 4) / 65536);
    }
    const mdhd = child(buf, mdia, "mdhd");
    if (mdhd) {
      const v = buf[mdhd.body];
      const scale = buf.readUInt32BE(mdhd.body + (v === 1 ? 20 : 12));
      const dur = v === 1 ? Number(buf.readBigUInt64BE(mdhd.body + 24)) : buf.readUInt32BE(mdhd.body + 16);
      out.duration = Math.round((dur / scale) * 100) / 100;
    }
    const stbl = child(buf, child(buf, mdia, "minf") ?? mdia, "stbl");
    if (stbl) {
      const stsz = child(buf, stbl, "stsz");
      if (stsz) out.frames = buf.readUInt32BE(stsz.body + 8);
      const stsd = child(buf, stbl, "stsd");
      if (stsd) out.codec = buf.toString("latin1", stsd.body + 12, stsd.body + 16);
    }
  }
  if (out.duration && out.frames) out.fps = Math.round((out.frames / out.duration) * 100) / 100;
  // Common rates read cleanly (23.976 → 23.98, 24.0x → 24).
  for (const r of [23.976, 24, 25, 29.97, 30, 50, 59.94, 60]) if (Math.abs(out.fps - r) < 0.08) out.fps = r;
  if (!out.width) throw new Error(`${path}: no video track found`);
  return out;
}

/** GLB: the base-colour images embedded in the file (for colour analysis),
 *  and whether it carries skins / animations (a rig). */
export function probeGlb(path) {
  const buf = readFileSync(path);
  if (buf.toString("latin1", 0, 4) !== "glTF") throw new Error(`${path}: not a GLB file`);
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString("utf8"));
  const binStart = 20 + jsonLen + 8;
  const idx = new Set();
  for (const m of json.materials ?? []) {
    const t = m.pbrMetallicRoughness?.baseColorTexture;
    if (t) idx.add(t.index);
  }
  const images = [];
  for (const ti of idx) {
    const tex = json.textures?.[ti];
    const src = tex?.source ?? Object.values(tex?.extensions ?? {}).map((e) => e.source).find((v) => v !== undefined);
    const img = json.images?.[src];
    if (!img || img.bufferView === undefined) continue;
    const bv = json.bufferViews[img.bufferView];
    images.push(buf.subarray(binStart + (bv.byteOffset ?? 0), binStart + (bv.byteOffset ?? 0) + bv.byteLength));
  }
  return {
    skins: (json.skins ?? []).length,
    animations: (json.animations ?? []).length,
    materials: (json.materials ?? []).length,
    baseColorImages: images,
    draco: (json.extensionsUsed ?? []).includes("KHR_draco_mesh_compression"),
  };
}
