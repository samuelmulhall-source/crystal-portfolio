// Compare two GLBs structurally: joints, bind (node world) matrices, inverse binds, meshes,
// materials, images. node glb-compare.mjs <old.glb> <new.glb>
import { readFileSync } from "node:fs";
const load = (p) => {
  const buf = readFileSync(p);
  const len = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + len).toString("utf8"));
  const binStart = 20 + len + 8;
  return { json, bin: buf.subarray(binStart), size: buf.length };
};
const [A, B] = process.argv.slice(2).map(load);
const mul = (a, b) => { const r = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let rr = 0; rr < 4; rr++) for (let k = 0; k < 4; k++) r[c * 4 + rr] += a[k * 4 + rr] * b[c * 4 + k]; return r; };
const local = (n) => {
  if (n.matrix) return n.matrix;
  const [x, y, z, w] = n.rotation ?? [0, 0, 0, 1], [sx, sy, sz] = n.scale ?? [1, 1, 1], [tx, ty, tz] = n.translation ?? [0, 0, 0];
  return [(1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0, 2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0, 2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0, tx, ty, tz, 1];
};
const worlds = (g) => {
  const parent = new Map();
  g.json.nodes.forEach((n, i) => (n.children ?? []).forEach((c) => parent.set(c, i)));
  const memo = new Map();
  const W = (i) => { if (memo.has(i)) return memo.get(i); const m = parent.has(i) ? mul(W(parent.get(i)), local(g.json.nodes[i])) : local(g.json.nodes[i]); memo.set(i, m); return m; };
  const out = new Map();
  g.json.nodes.forEach((n, i) => out.set(n.name, W(i)));
  return out;
};
const jA = A.json.skins[0].joints.map((i) => A.json.nodes[i].name);
const jB = B.json.skins[0].joints.map((i) => B.json.nodes[i].name);
console.log("size", A.size, "->", B.size);
console.log("extensionsUsed", JSON.stringify(A.json.extensionsUsed), "->", JSON.stringify(B.json.extensionsUsed));
console.log("joints", jA.length, "->", jB.length, "same set:", jA.length === jB.length && jA.every((n) => jB.includes(n)), "same order:", jA.join() === jB.join());
const wA = worlds(A), wB = worlds(B);
let maxD = 0, worst = "";
for (const n of jA) {
  const a = wA.get(n), b = wB.get(n);
  if (!b) { console.log("missing joint", n); continue; }
  const d = Math.max(...a.map((v, i) => Math.abs(v - b[i])));
  if (d > maxD) { maxD = d; worst = n; }
}
console.log("max |bind world matrix diff| over joints:", maxD.toExponential(2), "at", worst);
console.log("meshes", A.json.meshes.length, "->", B.json.meshes.length, "| primitives", A.json.meshes.reduce((s, m) => s + m.primitives.length, 0), "->", B.json.meshes.reduce((s, m) => s + m.primitives.length, 0));
const attrs = (g) => [...new Set(g.json.meshes.flatMap((m) => m.primitives.map((p) => Object.keys(p.attributes).sort().join(","))))];
console.log("attributes", attrs(A), "->", attrs(B));
const cnt = (g) => g.json.meshes.map((m) => `${m.name}:${m.primitives.map((p) => g.json.accessors[p.indices].count / 3 + "t/" + g.json.accessors[p.attributes.POSITION].count + "v").join("+")}`).sort();
const cA = cnt(A), cB = cnt(B);
console.log("mesh tri/vert counts identical:", cA.join() === cB.join());
if (cA.join() !== cB.join()) { console.log(" A", cA.join(" ")); console.log(" B", cB.join(" ")); }
const tris = (g) => g.json.meshes.reduce((s, m) => s + m.primitives.reduce((t, p) => t + g.json.accessors[p.indices].count / 3, 0), 0);
console.log("triangles", tris(A), "->", tris(B));
const mats = (g) => g.json.materials.map((m) => JSON.stringify({ n: m.name, pbr: { ...m.pbrMetallicRoughness, baseColorTexture: !!m.pbrMetallicRoughness?.baseColorTexture, metallicRoughnessTexture: !!m.pbrMetallicRoughness?.metallicRoughnessTexture }, nt: !!m.normalTexture, ds: m.doubleSided ?? false, am: m.alphaMode ?? "OPAQUE", ext: m.extensions ? Object.fromEntries(Object.entries(m.extensions).map(([k, v]) => [k, Object.fromEntries(Object.entries(v).filter(([kk]) => !/Texture$/.test(kk)))])) : null })).sort();
const mA = mats(A), mB = mats(B);
console.log("materials", mA.length, "->", mB.length, "identical:", mA.join() === mB.join());
if (mA.join() !== mB.join()) for (let i = 0; i < Math.max(mA.length, mB.length); i++) if (mA[i] !== mB[i]) console.log(" A", mA[i], "\n B", mB[i]);
const imgs = (g) => g.json.images.map((im) => `${im.mimeType}:${g.json.bufferViews[im.bufferView].byteLength}`).sort();
console.log("images identical (mime:bytes):", imgs(A).join() === imgs(B).join(), imgs(B).length);
const ibm = (g) => { const s = g.json.skins[0]; const acc = g.json.accessors[s.inverseBindMatrices]; const bv = g.json.bufferViews[acc.bufferView]; const f = new Float32Array(g.bin.buffer.slice(g.bin.byteOffset + (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0), g.bin.byteOffset + (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0) + acc.count * 64)); const m = new Map(); s.joints.forEach((ji, k) => m.set(g.json.nodes[ji].name, Array.from(f.slice(k * 16, k * 16 + 16)))); return m; };
const iA = ibm(A), iB = ibm(B);
let maxI = 0;
for (const [n, a] of iA) { const b = iB.get(n); if (b) maxI = Math.max(maxI, ...a.map((v, i) => Math.abs(v - b[i]))); }
console.log("max |inverse bind diff|:", maxI.toExponential(2));
const nodeNames = (g) => g.json.nodes.map((n) => n.name).sort().join();
console.log("node names identical:", nodeNames(A) === nodeNames(B), A.json.nodes.length, "->", B.json.nodes.length);
