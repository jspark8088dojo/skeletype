// Packs the BodyParts3D foot STLs into one compact, indexed binary file.
//
// Usage: node tools/pack-meshes.mjs <stl-dir> <out-file>
//
// Output layout (little-endian):
//   'SKPK'            4-byte magic
//   u32               header byte length
//   header            UTF-8 JSON (see `header` below), padded with spaces to a multiple of 4
//   data              per mesh: Uint16 quantized positions (x,y,z per vertex), then Uint16 indices,
//                     each block padded to a multiple of 4 bytes
//
// Frame: BodyParts3D is millimetres with +Z up, toes toward -Y, and the right foot's medial side at +X.
// We rotate -90° about X (a proper rotation, no mirroring) and convert to centimetres:
//   x' = (x - cx) / 10   (+X = medial for this right foot, so lateral is -X)
//   y' = (z - zFloor) / 10 (+Y = up, sole of the foot rests on y = 0)
//   z' = -(y - cy) / 10  (+Z = anterior, toward the toes)
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const MESHES = [
  ['tibia', 'FMA24477'], ['fibula', 'FMA24480'],
  ['talus', 'FMA24482'], ['calcaneus', 'FMA24497'], ['navicular', 'FMA24500'], ['cuboid', 'FMA24528'],
  ['cun_med', 'FMA24521'], ['cun_int', 'FMA24523'], ['cun_lat', 'FMA24525'],
  ['mt1', 'FMA24507'], ['mt2', 'FMA24509'], ['mt3', 'FMA24511'], ['mt4', 'FMA24513'], ['mt5', 'FMA24515'],
  ['pp1', 'FMA43253'], ['pp2', 'FMA32634'], ['pp3', 'FMA32636'], ['pp4', 'FMA32638'], ['pp5', 'FMA32640'],
  ['mp2', 'FMA32642'], ['mp3', 'FMA32644'], ['mp4', 'FMA32646'], ['mp5', 'FMA230986'],
  ['dp1', 'FMA32650'], ['dp2', 'FMA32652'], ['dp3', 'FMA32654'], ['dp4', 'FMA32656'], ['dp5', 'FMA32658'],
];
const LEG = new Set(['tibia', 'fibula']);
const LEG_CUT_CM = 26; // drop leg triangles that lie entirely above this height (the shader fades the leg out below it)

const [stlDir, outFile] = process.argv.slice(2);
if (!stlDir || !outFile) {
  console.error('usage: node tools/pack-meshes.mjs <stl-dir> <out-file>');
  process.exit(1);
}

function readStl(path) {
  const buf = readFileSync(path);
  const n = buf.readUInt32LE(80);
  if (buf.length !== 84 + 50 * n) throw new Error(`${path}: not a binary STL (size mismatch)`);
  const tris = new Float32Array(n * 9);
  for (let i = 0; i < n; i++) {
    const o = 84 + i * 50 + 12; // skip the stored facet normal
    for (let k = 0; k < 9; k++) tris[i * 9 + k] = buf.readFloatLE(o + k * 4);
  }
  return tris;
}

const raw = MESHES.map(([key, fma]) => ({ key, fma, tris: readStl(join(stlDir, `${fma}.stl`)) }));

// Foot reference: centre of the foot bones' bounding box (x, y) and the lowest point of the sole (z).
const fmin = [Infinity, Infinity, Infinity], fmax = [-Infinity, -Infinity, -Infinity];
for (const m of raw) {
  if (LEG.has(m.key)) continue;
  for (let i = 0; i < m.tris.length; i += 3) {
    for (let a = 0; a < 3; a++) {
      fmin[a] = Math.min(fmin[a], m.tris[i + a]);
      fmax[a] = Math.max(fmax[a], m.tris[i + a]);
    }
  }
}
const cx = (fmin[0] + fmax[0]) / 2, cy = (fmin[1] + fmax[1]) / 2, zFloor = fmin[2];
const xf = (x, y, z) => [(x - cx) / 10, (z - zFloor) / 10, -(y - cy) / 10];

const chunks = [];
let offset = 0;
const pushBlock = (u8) => {
  chunks.push(u8);
  offset += u8.byteLength;
  const pad = (4 - (u8.byteLength % 4)) % 4;
  if (pad) { chunks.push(new Uint8Array(pad)); offset += pad; }
};

const bones = [];
let totalTris = 0, totalVerts = 0;
for (const m of raw) {
  const map = new Map();
  const verts = [];
  const idx = [];
  const n = m.tris.length / 9;
  for (let t = 0; t < n; t++) {
    const tri = [];
    for (let v = 0; v < 3; v++) {
      const o = t * 9 + v * 3;
      const p = xf(m.tris[o], m.tris[o + 1], m.tris[o + 2]);
      const k = p.map((c) => Math.round(c * 1e4)).join(',');
      let id = map.get(k);
      if (id === undefined) { id = verts.length; map.set(k, id); verts.push(p); }
      tri.push(id);
    }
    if (tri[0] === tri[1] || tri[1] === tri[2] || tri[0] === tri[2]) continue; // degenerate
    if (LEG.has(m.key) && Math.min(verts[tri[0]][1], verts[tri[1]][1], verts[tri[2]][1]) > LEG_CUT_CM) continue;
    idx.push(...tri);
  }
  // Re-index so dropped triangles do not leave unused vertices behind.
  const remap = new Int32Array(verts.length).fill(-1);
  const used = [];
  for (let i = 0; i < idx.length; i++) {
    const v = idx[i];
    if (remap[v] < 0) { remap[v] = used.length; used.push(verts[v]); }
    idx[i] = remap[v];
  }
  if (used.length > 65535) throw new Error(`${m.key}: too many vertices for Uint16 indices`);

  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity], sum = [0, 0, 0];
  for (const p of used) for (let a = 0; a < 3; a++) {
    min[a] = Math.min(min[a], p[a]); max[a] = Math.max(max[a], p[a]); sum[a] += p[a];
  }
  const q = new Uint16Array(used.length * 3);
  used.forEach((p, i) => {
    for (let a = 0; a < 3; a++) {
      const span = max[a] - min[a] || 1;
      q[i * 3 + a] = Math.round(((p[a] - min[a]) / span) * 65535);
    }
  });
  const ind = Uint16Array.from(idx);

  const vOffset = offset; pushBlock(new Uint8Array(q.buffer));
  const iOffset = offset; pushBlock(new Uint8Array(ind.buffer));
  const r = (x) => +x.toFixed(4);
  bones.push({
    key: m.key, fma: m.fma, vCount: used.length, iCount: ind.length, vOffset, iOffset,
    min: min.map(r), max: max.map(r), centroid: sum.map((s) => r(s / used.length)),
  });
  totalTris += ind.length / 3; totalVerts += used.length;
}

const header = {
  version: 1,
  units: 'cm',
  frame: 'right foot; +X medial, +Y up, +Z anterior; sole at y=0',
  source: 'BodyParts3D (c) 2008 Life Science Integrated Database Center, CC BY-SA 2.1 JP',
  legCutCm: LEG_CUT_CM,
  bones,
};
let hjson = JSON.stringify(header);
while (Buffer.byteLength(hjson) % 4) hjson += ' ';
const hbuf = Buffer.from(hjson, 'utf8');
const pre = Buffer.alloc(8);
pre.write('SKPK', 0, 'ascii');
pre.writeUInt32LE(hbuf.length, 4);
const out = Buffer.concat([pre, hbuf, ...chunks.map((c) => Buffer.from(c.buffer, c.byteOffset, c.byteLength))]);
writeFileSync(outFile, out);
console.log(`wrote ${outFile}: ${(out.length / 1024).toFixed(0)} KB, ${bones.length} meshes, ${totalVerts} verts, ${totalTris} tris`);
for (const b of bones) console.log(`  ${b.key.padEnd(10)} v=${String(b.vCount).padStart(5)} t=${String(b.iCount / 3).padStart(5)}  min=${b.min.map((x) => x.toFixed(1))}  max=${b.max.map((x) => x.toFixed(1))}`);
