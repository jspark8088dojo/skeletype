// Shared by the packers: makes a mesh's data compress well when the host gzips it.
//   1. Triangles are reordered by walking from each triangle to a neighbour that shares an edge.
//   2. Vertices are renumbered in order of first use.
//   3. Positions are quantized to QMAX steps per axis of the mesh's bounding box (under 0.1 mm here).
//   4. Each index is stored as 0 for "the next new vertex", else as its distance back from the newest
//      vertex; each position component as a zigzag delta from the previous vertex's.
// After this most values are tiny, so their high bytes are zero and gzip does the rest.
// viewer.js parsePack() reverses it when the header says enc: 'delta3'.
export const ENCODING = 'delta3';
export const QMAX = 4095;

const zig = (d) => ((d << 1) ^ (d >> 31)) & 0xffff;

function walkOrder(ind) {
  const n = ind.length / 3;
  const edges = new Map();
  const key = (a, b) => (a < b ? a * 65536 + b : b * 65536 + a);
  for (let t = 0; t < n; t++) {
    for (let e = 0; e < 3; e++) {
      const k = key(ind[t * 3 + e], ind[t * 3 + ((e + 1) % 3)]);
      const list = edges.get(k);
      if (list) list.push(t); else edges.set(k, [t]);
    }
  }
  const done = new Uint8Array(n);
  const order = [];
  let scan = 0;
  while (order.length < n) {
    while (done[scan]) scan++;
    let t = scan;
    while (t >= 0) {
      done[t] = 1;
      order.push(t);
      let next = -1;
      for (let e = 0; e < 3 && next < 0; e++) {
        for (const u of edges.get(key(ind[t * 3 + e], ind[t * 3 + ((e + 1) % 3)]))) if (!done[u]) { next = u; break; }
      }
      t = next;
    }
  }
  return order;
}

/** q: Uint16 positions quantized to 0..65535 per axis; ind: Uint16 triangle indices. */
export function encodeMesh(q, ind) {
  const tris = walkOrder(ind);
  const remap = new Int32Array(q.length / 3).fill(-1);
  const verts = [];
  const idx = new Uint16Array(ind.length);
  tris.forEach((t, n) => {
    for (let c = 0; c < 3; c++) {
      const v = ind[t * 3 + c];
      // 0 = a new vertex (the next number); otherwise how far back from the newest vertex it is.
      if (remap[v] < 0) { remap[v] = verts.length; verts.push(v); idx[n * 3 + c] = 0; }
      else idx[n * 3 + c] = verts.length - remap[v];
    }
  });
  const pos = new Uint16Array(verts.length * 3);
  const prev = [0, 0, 0];
  verts.forEach((v, n) => {
    for (let a = 0; a < 3; a++) {
      const val = Math.round((q[v * 3 + a] / 65535) * QMAX);
      pos[n * 3 + a] = zig(val - prev[a]);
      prev[a] = val;
    }
  });
  return { pos, idx, vCount: verts.length };
}
