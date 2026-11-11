import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ITEMS, LEVELS, REGIONS, MESH_INFO, allItems } from '../src/content.js';
import { normalize, answersFor } from '../src/match.js';

const MESHES = Object.keys(MESH_INFO);
// Words that appear in answers but give nothing away on their own.
const GENERIC = new Set(['the', 'of', 'bone', 'bones', 'os', 'de', 'du', 'des', 'la', 'le', 'l', 'phalanx', 'phalanges', 'phalange',
  'foot', 'toe', 'toes', 'pied', 'orteil', 'orteils', 'pedis']);

test('every item has the fields the app reads, within length limits', () => {
  for (const it of allItems()) {
    for (const f of ['en', 'fr', 'describe', 'cue', 'card', 'fact']) assert.ok(typeof it[f] === 'string' && it[f].trim(), `${it.key}.${f} missing`);
    assert.ok(Array.isArray(it.meshes) && it.meshes.length, `${it.key}.meshes`);
    for (const m of it.meshes) assert.ok(MESHES.includes(m), `${it.key}: unknown mesh ${m}`);
    assert.ok(it.describe.length <= 64, `${it.key}.describe too long (${it.describe.length})`);
    assert.ok(it.cue.length <= 95, `${it.key}.cue too long (${it.cue.length})`);
    assert.ok(it.card.length <= 75, `${it.key}.card too long (${it.card.length})`);
    assert.ok(it.fact.length <= 240, `${it.key}.fact too long (${it.fact.length})`);
    assert.equal(it.en, it.en.toLowerCase(), `${it.key}.en should be lowercase`);
    assert.equal(it.fr, it.fr.normalize('NFC'), `${it.key}.fr should be NFC`);
  }
});

test('round-2 cues never give away the answer', () => {
  for (const it of allItems()) {
    const cue = ` ${normalize(it.cue)} `;
    const words = new Set([...answersFor(it, 'en'), ...answersFor(it, 'fr'), normalize(it.latin || '')]
      .flatMap((a) => a.split(' ')).filter((w) => w.length > 2 && !GENERIC.has(w)));
    for (const w of words) assert.ok(!cue.includes(` ${w} `), `${it.key}: cue contains "${w}": ${it.cue}`);
  }
});

test('no accepted answer belongs to two different items', () => {
  for (const lang of ['en', 'fr']) {
    const owner = new Map();
    for (const it of allItems()) {
      for (const a of answersFor(it, lang)) {
        assert.ok(!owner.has(a) || owner.get(a) === it.key, `"${a}" (${lang}) accepted for both ${owner.get(a)} and ${it.key}`);
        owner.set(a, it.key);
      }
    }
  }
});

test('no accepted answer merely extends another answer of the same item (it could never be completed)', () => {
  for (const it of allItems()) {
    for (const lang of ['en', 'fr']) {
      const all = answersFor(it, lang);
      for (const a of all) for (const b of all) {
        assert.ok(a === b || !a.startsWith(`${b} `), `${it.key} (${lang}): "${a}" extends "${b}"`);
      }
    }
  }
});

test('levels reference real items and carry their notes', () => {
  for (const lv of LEVELS) {
    for (const k of lv.items) assert.ok(ITEMS[k], `${lv.id}: unknown item ${k}`);
    if (!lv.speed) {
      assert.equal(lv.examAngle.length, 3, `${lv.id} should have 3 exam notes`);
      assert.ok(lv.headline && lv.headline.length <= 100, `${lv.id} headline`);
      for (const n of lv.examAngle) assert.ok(n.term && n.text && n.text.length <= 230, `${lv.id} note ${n.term}`);
    }
  }
  for (const r of REGIONS) {
    const taught = r.levels.filter((l) => !l.speed).flatMap((l) => l.items);
    assert.deepEqual([...r.levels.find((l) => l.speed).items].sort(), [...taught].sort(), `${r.id} speed run covers its levels`);
    for (const g of r.mapGroups) for (const k of g.keys) assert.ok(MESH_INFO[k], `${r.id} map: unknown mesh ${k}`);
  }
  assert.equal(new Set(LEVELS.map((l) => l.id)).size, LEVELS.length, 'level ids are unique');
  assert.deepEqual(REGIONS.flatMap((r) => r.levels.filter((l) => !l.speed).flatMap((l) => l.items)).sort(), Object.keys(ITEMS).sort());
});

test('every mesh has a body-map label in both languages', () => {
  assert.equal(MESHES.length, 80);
  for (const m of MESHES) {
    assert.ok(MESH_INFO[m], `missing label for ${m}`);
    assert.ok(MESH_INFO[m].en && MESH_INFO[m].fr && MESH_INFO[m].describe, `incomplete label for ${m}`);
  }
});
