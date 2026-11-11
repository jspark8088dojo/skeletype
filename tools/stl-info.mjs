// Usage: node tools/stl-info.mjs <dir-with-stl-files>
// Prints per-file triangle count, bounding box and centroid (in source units).
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
const out = [];
for (const f of readdirSync(dir).filter((n) => n.endsWith('.stl')).sort()) {
  const buf = readFileSync(join(dir, f));
  const isAscii = buf.slice(0, 5).toString() === 'solid' && !/[\x00]/.test(buf.slice(80, 84).toString('latin1')) && buf.length !== 84 + 50 * buf.readUInt32LE(80);
  if (isAscii) { out.push({ f, ascii: true }); continue; }
  const n = buf.readUInt32LE(80);
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity], sum = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    const o = 84 + i * 50 + 12;
    for (let v = 0; v < 3; v++) for (let a = 0; a < 3; a++) {
      const x = buf.readFloatLE(o + v * 12 + a * 4);
      if (x < min[a]) min[a] = x; if (x > max[a]) max[a] = x; sum[a] += x;
    }
  }
  out.push({ f, tris: n, min: min.map((x) => +x.toFixed(1)), max: max.map((x) => +x.toFixed(1)), c: sum.map((s) => +(s / (n * 3)).toFixed(1)), size: max.map((x, a) => +(x - min[a]).toFixed(1)) });
}
for (const r of out) console.log(JSON.stringify(r));
