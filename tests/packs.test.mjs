import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { REGIONS, ITEMS, MESH_INFO } from '../src/content.js';

function packKeys(id) {
  const buf = readFileSync(new URL(`../assets/${id}.pack`, import.meta.url));
  assert.equal(buf.toString('ascii', 0, 4), 'SKPK');
  const header = JSON.parse(buf.toString('utf8', 8, 8 + buf.readUInt32LE(4)));
  return header.bones.map((b) => b.key);
}

test('every region pack holds exactly the meshes the content refers to', () => {
  for (const r of REGIONS) {
    const keys = new Set(packKeys(r.id));
    const used = r.levels.flatMap((l) => l.items.flatMap((k) => ITEMS[k].meshes));
    for (const k of used) assert.ok(keys.has(k), `${r.id}: item mesh ${k} is not in the pack`);
    for (const g of r.mapGroups) for (const k of g.keys) assert.ok(keys.has(k), `${r.id}: map mesh ${k} is not in the pack`);
    const listed = new Set(r.mapGroups.flatMap((g) => g.keys));
    for (const k of keys) {
      assert.ok(MESH_INFO[k], `${r.id}: pack mesh ${k} has no label`);
      assert.ok(listed.has(k), `${r.id}: pack mesh ${k} is missing from the body map`);
    }
  }
});
