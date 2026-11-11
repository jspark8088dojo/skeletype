import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Session, statusFor } from '../src/engine.js';

const TARSALS = [
  ['talus', 'talus'], ['calcaneus', 'calcanéus'], ['navicular', 'naviculaire'], ['cuboid', 'cuboïde'],
  ['medial cuneiform', 'cunéiforme médial'], ['intermediate cuneiform', 'cunéiforme intermédiaire'], ['lateral cuneiform', 'cunéiforme latéral'],
].map(([en, fr]) => ({ key: en.replace(' ', '_'), en, fr, enAliases: [], frAliases: [] }));

function clock(step = 100) {
  let t = 1_000_000;
  return () => (t += step);
}

function type(s, text) {
  let ev;
  for (const ch of text) ev = s.key(ch);
  return ev;
}

test('round 1 refuses wrong keys and solves on the last letter', () => {
  const s = new Session({ items: TARSALS, rounds: [1], now: clock() }).start();
  assert.equal(s.phase, 'prompt');
  assert.equal(s.item.key, 'talus');
  assert.equal(s.key('x').type, 'error');
  assert.equal(s.pos, 0);
  assert.equal(s.key('T').type, 'hit');
  assert.equal(type(s, 'alus').type, 'correct');
  assert.equal(s.phase, 'correct');
  assert.equal(s.key('a').type, 'ignored');
  assert.equal(s.next().type, 'prompt');
  assert.equal(s.item.key, 'calcaneus');
});

test('round 1 needs the space typed and accepts accents loosely', () => {
  const s = new Session({ items: TARSALS, rounds: [1], lang: 'fr', now: clock() }).start();
  type(s, 'talus'); s.next();
  assert.equal(type(s, 'calcaneus').type, 'correct'); // é typed as e
  s.next(); type(s, 'naviculaire'); s.next(); type(s, 'cuboide'); s.next();
  assert.equal(type(s, 'cuneiforme').type, 'hit');
  assert.equal(s.key('m').type, 'error'); // a space is expected here
  assert.equal(type(s, ' medial').type, 'correct');
});

test('backspace does nothing in round 1 and edits in later rounds', () => {
  const s = new Session({ items: TARSALS, rounds: [1, 2], now: clock() }).start();
  s.key('t');
  assert.equal(s.backspace().type, 'ignored');
  assert.equal(s.pos, 1);
});

test('round 2 judges when the blanks are filled and re-queues a miss', () => {
  const s = new Session({ items: TARSALS.slice(0, 3), rounds: [2], gap: 2, now: clock() }).start();
  const first = s.item;
  assert.equal(s.total, 3);
  const wrong = first.en.slice(0, -1) + (first.en.endsWith('z') ? 'y' : 'z');
  const ev = type(s, wrong);
  assert.equal(ev.type, 'miss');
  assert.equal(ev.verdict.verdict, 'close');
  assert.equal(ev.verdict.requeued, true);
  assert.equal(s.total, 4, 'denominator grows when a miss comes back');
  assert.equal(s.queue[3], first.key, 'comes back after the other two');
  assert.equal(s.enter().type, 'prompt');
});

test('round 2 Enter submits early; empty Enter is ignored', () => {
  const s = new Session({ items: TARSALS, rounds: [2], now: clock() }).start();
  assert.equal(s.enter().type, 'ignored');
  s.key('q');
  const ev = s.enter();
  assert.equal(ev.type, 'miss');
  assert.equal(ev.verdict.verdict, 'wrong');
});

test('round 2 waits when the input is the start of a longer bone name, then names the mix-up', () => {
  const med = TARSALS.find((t) => t.key === 'medial_cuneiform');
  const s = new Session({ items: [med], pool: TARSALS, rounds: [2], now: clock() }).start();
  assert.equal(type(s, 'lateral cuneifor').type, 'input', 'blanks are full but "lateral cuneiform" is still being typed');
  const ev = s.key('m');
  assert.equal(ev.type, 'miss');
  assert.equal(ev.verdict.verdict, 'other');
  assert.equal(ev.verdict.other.key, 'lateral_cuneiform');
});

test('round 2 still judges at full length for a same-length mix-up', () => {
  const mt1 = { key: 'mt1', en: 'first metatarsal', enAliases: ['first metatarsal bone'], fr: 'premier métatarsien', frAliases: [] };
  const mt5 = { key: 'mt5', en: 'fifth metatarsal', enAliases: ['fifth metatarsal bone'], fr: 'cinquième métatarsien', frAliases: [] };
  const s = new Session({ items: [mt1], pool: [mt1, mt5], rounds: [2], now: clock() }).start();
  const ev = type(s, 'fifth metatarsal');
  assert.equal(ev.type, 'miss');
  assert.equal(ev.verdict.verdict, 'other');
});

test('a leading space never starts an answer in the recall rounds', () => {
  const s = new Session({ items: TARSALS.slice(0, 1), rounds: [2], now: clock() }).start();
  assert.equal(s.key(' ').type, 'ignored');
  assert.equal(s.input, '');
  assert.equal(type(s, 'talus').type, 'correct', 'judged on the full name, not one letter early');
});

test('round 2 keeps listening while the input is the start of a longer accepted synonym', () => {
  const dist = { key: 'dist', en: 'distal phalanges', enAliases: [], fr: 'phalanges distales', frAliases: ['phalanges unguéales'] };
  const s = new Session({ items: [dist], rounds: [2], lang: 'fr', now: clock() }).start();
  assert.equal(type(s, 'phalanges unguéale').type, 'input', 'blanks are full but the synonym is still being typed');
  const ev = s.key('s');
  assert.equal(ev.type, 'correct');
  assert.equal(s.summary().accuracy, 1, 'a synonym typed cleanly is 100% accurate');
});

test('round 3 auto-accepts an accepted synonym too', () => {
  const talus = { key: 'talus', en: 'talus', enAliases: ['astragalus'], fr: 'talus', frAliases: [] };
  const s = new Session({ items: [talus], rounds: [3], now: clock() }).start();
  assert.equal(type(s, 'astragalus').type, 'correct');
});

test('the run ends at the last answer, not after the pause that follows it', () => {
  let t = 0;
  const s = new Session({ items: TARSALS.slice(0, 2), rounds: [3], now: () => t }).start();
  for (let i = 0; i < 2; i++) {
    t += 100;
    for (const ch of s.answer) { t += 10; s.key(ch); }
    if (i === 0) s.next();
  }
  const answeredAt = t;
  t += 5000; // the UI lingers before calling next()
  assert.equal(s.next().type, 'complete');
  assert.equal(s.endedAt, answeredAt);
  assert.equal(s.summary().totalMs, answeredAt - s.startedAt);
});

test('a miss stops coming back after maxAttempts', () => {
  const s = new Session({ items: TARSALS.slice(0, 1), rounds: [3], maxAttempts: 2, now: clock() }).start();
  s.key('x'); assert.equal(s.enter().verdict.requeued, true);
  assert.equal(s.next().type, 'prompt');
  s.key('x'); assert.equal(s.enter().verdict.requeued, false);
  assert.equal(s.next().type, 'complete');
  const sum = s.summary();
  assert.equal(sum.recall, 0);
  assert.equal(sum.perItem[0].status.tone, 'bad');
});

test('round 3 auto-accepts the canonical answer; a wrong answer waits for Enter', () => {
  const s = new Session({ items: TARSALS.slice(1, 2), rounds: [3], now: clock() }).start();
  assert.equal(type(s, 'calcaneu').type, 'input');
  assert.equal(s.key('s').type, 'correct');
  const t = new Session({ items: TARSALS.slice(1, 2), rounds: [3], now: clock() }).start();
  assert.equal(type(t, 'calcanues').type, 'input', 'not accepted, no auto-judge');
  assert.equal(t.enter().type, 'miss');
});

test('"other" verdict when typing a different bone of the pool', () => {
  const s = new Session({ items: TARSALS, rounds: [3], seed: 9, now: clock() }).start();
  const target = s.item;
  const other = TARSALS.find((t) => t.key !== target.key);
  type(s, other.en);
  const ev = s.phase === 'reveal' ? { type: 'miss', verdict: s.verdict } : s.enter();
  assert.equal(ev.type, 'miss');
  assert.equal(ev.verdict.verdict, 'other');
  assert.equal(ev.verdict.other.key, other.key);
});

test('full lesson: the results numbers match a realistic run (12/14 first-try = 86%)', () => {
  const s = new Session({ items: TARSALS, rounds: [1, 2, 3], seed: 42, now: clock(50) }).start();
  // Round 1: copy all seven.
  for (let i = 0; i < 7; i++) {
    assert.equal(type(s, s.answer).type, 'correct');
    const ev = s.next();
    if (i < 6) assert.equal(ev.type, 'prompt');
    else assert.deepEqual(ev, { type: 'round', round: 2 });
  }
  assert.equal(s.phase, 'intro');
  assert.equal(s.next().type, 'prompt');
  // Round 2: miss navicular and intermediate cuneiform once each, then get them right.
  const missOnce = new Set(['navicular', 'intermediate_cuneiform']);
  let guard = 0;
  while (s.round === 2 && guard++ < 50) {
    const key = s.item.key;
    if (missOnce.has(key)) {
      missOnce.delete(key);
      s.key('z');
      assert.equal(s.enter().type, 'miss');
    } else {
      assert.equal(type(s, s.answer).type, 'correct');
    }
    s.next();
  }
  assert.equal(s.round, 3);
  s.next(); // leave the intro
  while (s.phase !== 'done') {
    assert.equal(type(s, s.answer).type, 'correct');
    s.next();
  }
  const sum = s.summary();
  assert.equal(sum.firstOk, 12);
  assert.equal(sum.firstN, 14);
  assert.equal(Math.round(sum.recall * 100), 86);
  assert.equal(sum.cleanLastRound, true);
  assert.ok(sum.wpm > 0);
  const nav = sum.perItem.find((p) => p.key === 'navicular');
  assert.equal(nav.status.text, 'missed in round 2 · solid in round 3');
  assert.equal(sum.perItem.find((p) => p.key === 'talus').status.text, 'first try');
});

test('accuracy counts wrong keystrokes', () => {
  const s = new Session({ items: TARSALS.slice(0, 1), rounds: [1], now: clock() }).start();
  s.key('x');
  type(s, 'talus');
  const sum = s.summary();
  assert.equal(sum.accuracy, 5 / 6);
});

test('setLang restarts the current prompt in the other language', () => {
  const s = new Session({ items: TARSALS, rounds: [1], now: clock() }).start();
  s.key('t');
  s.setLang('fr');
  assert.equal(s.pos, 0);
  assert.equal(s.answer, 'talus');
  s.next(); // ignored: still prompting
  assert.equal(s.phase, 'prompt');
});

test('statusFor wording', () => {
  assert.equal(statusFor([]).text, 'copied');
  assert.equal(statusFor([{ round: 2, first: true, solved: true }, { round: 3, first: false, solved: true }]).text, 'slipped in round 3 · fixed on retry');
  assert.equal(statusFor([{ round: 3, first: false, solved: true }]).text, 'needed a second try');
});
