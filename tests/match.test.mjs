import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fold, normalize, sameChar, distance, answersFor, judge, isCanonical } from '../src/match.js';

const talus = { key: 'talus', en: 'talus', enAliases: ['astragalus'], fr: 'talus', frAliases: ['astragale'] };
const calc = { key: 'calcaneus', en: 'calcaneus', enAliases: [], fr: 'calcanéus', frAliases: ['calcanéum'] };
const med = { key: 'cun_med', en: 'medial cuneiform', enAliases: [], fr: 'cunéiforme médial', frAliases: [] };
const lat = { key: 'cun_lat', en: 'lateral cuneiform', enAliases: [], fr: 'cunéiforme latéral', frAliases: [] };
const mt1 = { key: 'mt1', en: 'first metatarsal', enAliases: ['1st metatarsal'], fr: 'premier métatarsien', frAliases: [] };
const mt5 = { key: 'mt5', en: 'fifth metatarsal', enAliases: ['5th metatarsal'], fr: 'cinquième métatarsien', frAliases: [] };
const pool = [talus, calc, med, lat, mt1, mt5];

test('fold strips accents and case', () => {
  assert.equal(fold('Calcanéus'), 'calcaneus');
  assert.equal(fold('CUBOÏDE'), 'cuboide');
  assert.equal(fold('Œil'), 'oeil');
});

test('normalize collapses punctuation and whitespace', () => {
  assert.equal(normalize('  Medial   Cuneiform '), 'medial cuneiform');
  assert.equal(normalize('os cunéiforme-médial'), 'os cuneiforme medial');
  assert.equal(normalize("l'hallux"), 'lhallux');
});

test('sameChar is accent-insensitive but strict about spaces', () => {
  assert.ok(sameChar('e', 'é'));
  assert.ok(sameChar('E', 'e'));
  assert.ok(sameChar(' ', ' '));
  assert.ok(!sameChar('a', ' '));
  assert.ok(!sameChar(' ', 'a'));
  assert.ok(!sameChar('a', undefined));
});

test('distance counts edits and adjacent swaps', () => {
  assert.equal(distance('', 'abc'), 3);
  assert.equal(distance('talus', 'talus'), 0);
  assert.equal(distance('navicualr', 'navicular'), 1); // transposition
  assert.equal(distance('naviculer', 'navicular'), 1);
  assert.equal(distance('kitten', 'sitting'), 3);
});

test('answersFor lists canonical first, deduplicated', () => {
  assert.deepEqual(answersFor(talus, 'en'), ['talus', 'astragalus']);
  assert.deepEqual(answersFor(calc, 'fr'), ['calcaneus', 'calcaneum']);
});

test('judge verdicts', () => {
  assert.equal(judge('', talus, 'en', pool).verdict, 'empty');
  assert.equal(judge('Talus', talus, 'en', pool).verdict, 'correct');
  assert.equal(judge('astragalus', talus, 'en', pool).verdict, 'correct');
  assert.equal(judge('calcaneus', calc, 'fr', pool).verdict, 'correct'); // accents optional
  assert.equal(judge('calcaneum', calc, 'fr', pool).verdict, 'correct');
  assert.equal(judge('calcaneous', calc, 'en', pool).verdict, 'close');
  assert.equal(judge('cuboid', calc, 'en', pool).verdict, 'wrong');
  const mix = judge('lateral cuneiform', med, 'en', pool);
  assert.equal(mix.verdict, 'other');
  assert.equal(mix.other.key, 'cun_lat');
  assert.equal(judge('fifth metatarsal', mt1, 'en', pool).verdict, 'other');
  assert.equal(judge('1st metatarsal', mt1, 'en', pool).verdict, 'correct');
});

test('isCanonical only accepts the canonical answer', () => {
  assert.ok(isCanonical('Talus ', talus, 'en'));
  assert.ok(!isCanonical('astragalus', talus, 'en'));
  assert.ok(isCanonical('cuneiforme medial', med, 'fr'));
});
