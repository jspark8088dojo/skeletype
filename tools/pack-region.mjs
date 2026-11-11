// Packs a region's BodyParts3D STLs (assets/raw/<region>/) into assets/<region>.pack, simplifying each mesh
// to its triangle budget from tools/regions.mjs. Same file format as tools/pack-meshes.mjs.
//
// Usage: node tools/pack-region.mjs <region>
//
// Frame: centimetres, centred on the region's bounding box; +X = the body's left, +Y = up, +Z = anterior
// (BodyParts3D is millimetres with +Z up and anterior toward -Y; this is a pure rotation, no mirroring).
// Simplification is vertex clustering: vertices sharing a grid cell merge to their average, and the cell size
// is searched per mesh so the result lands just under its budget.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REGIONS } from './regions.mjs';
import { encodeMesh, ENCODING, QMAX } from './pack-encode.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const region = process.argv[2];
const cfg = REGIONS[region];
if (!cfg) { console.error(`usage: node tools/pack-region.mjs <${Object.keys(REGIONS).join('|')}>`); process.exit(1); }

function readStl(path) {
  const buf = readFileSync(path);
  const n = buf.readUInt32LE(80);
  if (buf.length !== 84 + 50 * n) throw new Error(`${path}: not a binary STL`);
  const tris = new Float32Array(n * 9);
  for (let i = 0; i < n; i++) {
    const o = 84 + i * 50 + 12;
    for (let k = 0; k < 9; k += 3) {
      const x = buf.readFloatLE(o + k * 4), y = buf.readFloatLE(o + k * 4 + 4), z = buf.readFloatLE(o + k * 4 + 8);
      tris[i * 9 + k] = x / 10; tris[i * 9 + k + 1] = z / 10; tris[i * 9 + k + 2] = -y / 10;
    }
  }
  return tris;
}

/** Cluster vertices on a grid of `cell` cm. Returns { verts: number[][], idx: number[] }. */
function cluster(tris, cell) {
  const map = new Map();
  const sums = [];
  const idx = [];
  const seen = new Set();
  const n = tris.length / 9;
  for (let t = 0; t < n; t++) {
    const tri = [0, 0, 0];
    for (let v = 0; v < 3; v++) {
      const o = t * 9 + v * 3;
      const x = tris[o], y = tris[o + 1], z = tris[o + 2];
      const k = `${Math.round(x / cell)},${Math.round(y / cell)},${Math.round(z / cell)}`;
      let id = map.get(k);
      if (id === undefined) { id = sums.length; map.set(k, id); sums.push([0, 0, 0, 0]); }
      const s = sums[id];
      s[0] += x; s[1] += y; s[2] += z; s[3]++;
      tri[v] = id;
    }
    if (tri[0] === tri[1] || tri[1] === tri[2] || tri[0] === tri[2]) continue;
    const key = [...tri].sort((a, b) => a - b).join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    idx.push(tri[0], tri[1], tri[2]);
  }
  return { verts: sums.map((s) => [s[0] / s[3], s[1] / s[3], s[2] / s[3]]), idx };
}

function simplify(tris, budget) {
  let best = cluster(tris, 0.001);
  if (best.idx.length / 3 <= budget) return best;
  let lo = 0.001, hi = 4;
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    const c = cluster(tris, mid);
    if (c.idx.length / 3 <= budget) { best = c; hi = mid; } else lo = mid;
  }
  return best;
}

const meshes = cfg.meshes.map(([key, fma, budget]) => {
  const tris = readStl(join(root, 'assets', 'raw', region, `${fma}.stl`));
  const m = simplify(tris, budget);
  if (m.verts.length > 65535) throw new Error(`${key}: too many vertices`);
  return { key, fma, src: tris.length / 9, ...m };
});

const bmin = [Infinity, Infinity, Infinity], bmax = [-Infinity, -Infinity, -Infinity];
for (const m of meshes) for (const p of m.verts) for (let a = 0; a < 3; a++) { bmin[a] = Math.min(bmin[a], p[a]); bmax[a] = Math.max(bmax[a], p[a]); }
const c = bmin.map((v, a) => (v + bmax[a]) / 2);
const radius = Math.hypot(...bmax.map((v, a) => (v - bmin[a]) / 2));

const chunks = [];
let offset = 0;
const push = (u8) => {
  chunks.push(Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength));
  offset += u8.byteLength;
  const pad = (4 - (u8.byteLength % 4)) % 4;
  if (pad) { chunks.push(Buffer.alloc(pad)); offset += pad; }
};
const r4 = (x) => +x.toFixed(4);
const bones = meshes.map((m) => {
  const verts = m.verts.map((p) => p.map((v, a) => v - c[a]));
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity], sum = [0, 0, 0];
  for (const p of verts) for (let a = 0; a < 3; a++) { min[a] = Math.min(min[a], p[a]); max[a] = Math.max(max[a], p[a]); sum[a] += p[a]; }
  const q = new Uint16Array(verts.length * 3);
  verts.forEach((p, i) => { for (let a = 0; a < 3; a++) q[i * 3 + a] = Math.round(((p[a] - min[a]) / (max[a] - min[a] || 1)) * 65535); });
  const enc = encodeMesh(q, Uint16Array.from(m.idx));
  const ind = enc.idx;
  const vOffset = offset; push(new Uint8Array(enc.pos.buffer));
  const iOffset = offset; push(new Uint8Array(ind.buffer));
  console.log(`  ${m.key.padEnd(12)} ${String(m.src).padStart(7)} -> ${String(ind.length / 3).padStart(5)} tris`);
  return { key: m.key, fma: m.fma, vCount: enc.vCount, iCount: ind.length, vOffset, iOffset, min: min.map(r4), max: max.map(r4), centroid: sum.map((s) => r4(s / verts.length)) };
});

const header = {
  version: 2, enc: ENCODING, qmax: QMAX, region, units: 'cm',
  frame: '+X body left, +Y up, +Z anterior; centred on the bounding box',
  source: 'BodyParts3D (c) 2008 Life Science Integrated Database Center, CC BY-SA 2.1 JP (simplified)',
  center: [0, 0, 0], radius: r4(radius), floorY: r4(bmin[1] - c[1]), context: [],
  bones,
};
let hjson = JSON.stringify(header);
while (Buffer.byteLength(hjson) % 4) hjson += ' ';
const hbuf = Buffer.from(hjson, 'utf8');
const pre = Buffer.alloc(8);
pre.write('SKPK', 0, 'ascii');
pre.writeUInt32LE(hbuf.length, 4);
const out = Buffer.concat([pre, hbuf, ...chunks]);
const file = join(root, 'assets', `${region}.pack`);
writeFileSync(file, out);
console.log(`wrote ${file}: ${(out.length / 1024).toFixed(0)} KB, ${bones.length} meshes, ${bones.reduce((s, b) => s + b.iCount / 3, 0)} tris, radius ${radius.toFixed(1)} cm`);
