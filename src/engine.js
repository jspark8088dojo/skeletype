// Session engine: rounds, prompts, re-queueing misses and the numbers on the results screen.
// Pure logic with no DOM and no timers, so it can be unit-tested in Node.
//
// Rounds:
//   1  copy          the full name is shown; type over it (a wrong key is refused and counted as an error)
//   2  first letter  first letter + blanks; free typing, judged when the blanks are filled or on Enter
//   3  recall        nothing shown; free typing, accepted the moment it matches, otherwise judged on Enter
//
// Phases: 'intro' (a new round is about to start) -> 'prompt' (typing) -> 'correct' | 'reveal' -> next() ...
//         -> 'done'. The UI decides how long to linger on 'correct' and when to call next().

import { judge, sameChar, normalize, answersFor, distance } from './match.js';

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(list, rnd) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const MAX_RECALL_INPUT = 48;
const MAX_WPM = 250;

export class Session {
  /**
   * @param {object} o
   * @param {object[]} o.items      items with at least {key, en, fr, enAliases?, frAliases?}
   * @param {number[]} [o.rounds]   e.g. [1,2,3], [2,3] or [3]
   * @param {'en'|'fr'} [o.lang]
   * @param {object[]} [o.pool]     items used to recognise "that's another bone's name"
   * @param {number} [o.maxAttempts] attempts per item per round before it stops coming back
   * @param {number} [o.gap]        how many other prompts come before a missed one returns
   * @param {number} [o.seed]
   * @param {() => number} [o.now]  clock in ms
   * @param {string} [o.mode]       free-form tag for the UI ('lesson' | 'practice' | 'review' | 'speed' | 'daily')
   */
  constructor({ items, rounds = [1, 2, 3], lang = 'en', pool, maxAttempts = 3, gap = 2, seed = 1, now = () => Date.now(), mode = 'lesson' }) {
    if (!items?.length) throw new Error('Session needs at least one item');
    this.items = items;
    this.byKey = new Map(items.map((i) => [i.key, i]));
    this.rounds = rounds;
    this.lang = lang;
    this.pool = pool || items;
    this.maxAttempts = maxAttempts;
    this.gap = gap;
    this.now = now;
    this.mode = mode;
    this.rnd = mulberry32(seed);

    this.ri = -1;
    this.queue = [];
    this.qi = 0;
    this.phase = 'idle';
    this.input = '';
    this.pos = 0;
    this.promptKeys = 0;
    this.verdict = null;
    this.lastKey = null;

    this.rec = new Map(items.map((i) => [i.key, { r1Errors: 0 }]));
    this.keystrokes = 0;
    this.correctKeystrokes = 0;
    this.activeMs = 0;
    this.promptStart = null;
    this.startedAt = null;
    this.endedAt = null;
    this.recallMisses = { 2: 0, 3: 0 };
  }

  get round() { return this.rounds[this.ri]; }
  get item() { return this.byKey.get(this.queue[this.qi]); }
  get answer() { return this.item[this.lang]; }
  get index() { return this.qi + 1; }
  get total() { return this.queue.length; }
  get isLastRound() { return this.ri === this.rounds.length - 1; }

  start() {
    this._beginRound(0);
    return this;
  }

  /** Switch answer language mid-session; the current prompt starts over. */
  setLang(lang) {
    if (lang === this.lang) return;
    this.lang = lang;
    if (this.phase === 'prompt') this._resetPrompt();
  }

  /** A printable character was typed. */
  key(ch) {
    if (this.phase !== 'prompt' || typeof ch !== 'string' || [...ch].length !== 1) return { type: 'ignored' };
    // A leading space never starts a typed answer (it would eat a blank and shift the length check).
    if (this.round !== 1 && !this.input && !ch.trim()) return { type: 'ignored' };
    this._touch();
    const answer = this.answer;

    if (this.round === 1) {
      const expected = answer[this.pos];
      this.keystrokes++;
      if (sameChar(ch, expected)) {
        this.correctKeystrokes++;
        this.pos++;
        if (this.pos >= answer.length) return this._solved({ verdict: 'correct' });
        return { type: 'hit' };
      }
      this.rec.get(this.item.key).r1Errors++;
      return { type: 'error', expected };
    }

    if (this.input.length >= MAX_RECALL_INPUT) return { type: 'ignored' };
    // Recall-round keystrokes are credited when the prompt is judged (see _evaluate), so typing an
    // accepted synonym doesn't count as a string of errors against the canonical spelling.
    this.keystrokes++;
    this.promptKeys++;
    this.input += ch;
    if (this.round === 2 && this.input.length >= answer.length && this._judgeNow()) return this._evaluate();
    if (this.round === 3 && this._judgeNow()) return this._evaluate();
    return { type: 'input' };
  }

  /**
   * Whether to judge without waiting for Enter.
   * Round 3: only the moment the input is an accepted answer for this item.
   * Round 2 (called once the blanks are full): judge now unless what's typed is the start of a longer
   * accepted name, this item's (e.g. "phalanges unguéale…") or another bone's (e.g. "lateral cuneifor…"
   * while the answer is "medial cuneiform"), so synonyms aren't cut off and mix-ups get named properly.
   */
  _judgeNow() {
    const x = normalize(this.input);
    const own = answersFor(this.item, this.lang);
    if (own.includes(x)) return true;
    if (this.round === 3) return false;
    const others = this.pool.filter((o) => o.key !== this.item.key).map((o) => answersFor(o, this.lang));
    if (others.some((list) => list.includes(x))) return true;
    const longer = (a) => a.length > x.length && a.startsWith(x);
    return !(own.some(longer) || others.some((list) => list.some(longer)));
  }

  _isFinalPrompt() {
    return this.isLastRound && this.qi === this.queue.length - 1;
  }

  backspace() {
    if (this.phase !== 'prompt' || this.round === 1 || !this.input) return { type: 'ignored' };
    this.input = this.input.slice(0, -1);
    return { type: 'input' };
  }

  enter() {
    if (this.phase === 'prompt') {
      if (this.round === 1 || !this.input.trim()) return { type: 'ignored' };
      return this._evaluate();
    }
    if (this.phase === 'intro' || this.phase === 'correct' || this.phase === 'reveal') return this.next();
    return { type: 'ignored' };
  }

  /** Move on from 'intro', 'correct' or 'reveal'. */
  next() {
    if (this.phase === 'intro') {
      this.phase = 'prompt';
      return { type: 'prompt' };
    }
    if (this.phase !== 'correct' && this.phase !== 'reveal') return { type: 'ignored' };
    if (this.qi + 1 < this.queue.length) {
      this.qi++;
      this._resetPrompt();
      this.phase = 'prompt';
      return { type: 'prompt' };
    }
    if (this.ri + 1 < this.rounds.length) {
      this._beginRound(this.ri + 1);
      return { type: 'round', round: this.round };
    }
    this.phase = 'done';
    if (this.endedAt == null) this.endedAt = this.now();
    return { type: 'complete' };
  }

  summary() {
    const recallRounds = this.rounds.filter((r) => r !== 1);
    let firstOk = 0;
    let firstN = 0;
    const perItem = this.items.map((item) => {
      const rec = this.rec.get(item.key);
      const rounds = recallRounds.map((r) => ({ round: r, ...(rec[`r${r}`] || { first: null, attempts: 0, solved: false }) }));
      for (const x of rounds) {
        firstN++;
        if (x.first === true) firstOk++;
      }
      return { key: item.key, item, rounds, r1Errors: rec.r1Errors, status: statusFor(rounds) };
    });
    const minutes = this.activeMs / 60000;
    const end = this.endedAt ?? this.now();
    return {
      recall: firstN ? firstOk / firstN : 1,
      firstOk,
      firstN,
      // Clamped: pasted or scripted input can arrive in ~0 ms and would report absurd speeds.
      wpm: minutes > 0 ? Math.min(MAX_WPM, Math.round(this.correctKeystrokes / 5 / minutes)) : 0,
      accuracy: this.keystrokes ? this.correctKeystrokes / this.keystrokes : 1,
      cleanLastRound: this.rounds.includes(3) ? this.recallMisses[3] === 0 : this.recallMisses[2] === 0,
      totalMs: this.startedAt == null ? 0 : end - this.startedAt,
      perItem,
    };
  }

  // ---- internals ----

  _beginRound(ri) {
    this.ri = ri;
    const r = this.round;
    const keys = this.items.map((i) => i.key);
    this.queue = r === 1 ? keys : shuffle(keys, this.rnd);
    if (this.queue.length > 1 && this.queue[0] === this.lastKey) {
      [this.queue[0], this.queue[1]] = [this.queue[1], this.queue[0]];
    }
    if (r !== 1) for (const k of keys) this.rec.get(k)[`r${r}`] = { first: null, attempts: 0, solved: false };
    this.qi = 0;
    this._resetPrompt();
    this.phase = ri === 0 ? 'prompt' : 'intro';
  }

  _resetPrompt() {
    this.input = '';
    this.pos = 0;
    this.promptKeys = 0;
    this.verdict = null;
    this.promptStart = null;
  }

  _touch() {
    const t = this.now();
    if (this.promptStart === null) this.promptStart = t;
    if (this.startedAt === null) this.startedAt = t;
  }

  _stopClock() {
    if (this.promptStart !== null) {
      this.activeMs += this.now() - this.promptStart;
      this.promptStart = null;
    }
  }

  _solved(verdict) {
    this._stopClock();
    this.lastKey = this.item.key;
    this.verdict = verdict;
    this.phase = 'correct';
    if (this._isFinalPrompt()) this.endedAt = this.now(); // the run ends at the last answer, not after the pause
    return { type: 'correct', verdict };
  }

  _evaluate() {
    const item = this.item;
    const verdict = judge(this.input, item, this.lang, this.pool);
    const rec = this.rec.get(item.key)[`r${this.round}`];
    rec.attempts++;
    // Credit the keystrokes that ended up right: the typed length minus how far it is from an accepted answer.
    const x = normalize(this.input);
    const off = verdict.verdict === 'correct' ? 0 : Math.min(...answersFor(item, this.lang).map((a) => distance(x, a)));
    this.correctKeystrokes += Math.max(0, Math.min(this.promptKeys, x.length - off));
    if (verdict.verdict === 'correct') {
      if (rec.first === null) rec.first = true;
      rec.solved = true;
      return this._solved(verdict);
    }
    this._stopClock();
    this.lastKey = item.key;
    if (rec.first === null) rec.first = false;
    this.recallMisses[this.round]++;
    let requeued = false;
    if (rec.attempts < this.maxAttempts) {
      const at = Math.min(this.qi + 1 + this.gap, this.queue.length);
      this.queue.splice(at, 0, item.key);
      requeued = true;
    }
    if (this._isFinalPrompt()) this.endedAt = this.now();
    this.verdict = { ...verdict, requeued, typed: this.input };
    this.phase = 'reveal';
    return { type: 'miss', verdict: this.verdict };
  }
}

/** One-line status for an item's card on the results screen. tone: good | mid | bad */
export function statusFor(rounds) {
  if (!rounds.length) return { tone: 'good', text: 'copied' };
  const missed = rounds.filter((x) => x.first === false);
  const last = rounds[rounds.length - 1];
  if (!missed.length) return { tone: 'good', text: 'first try' };
  if (!last.solved) return { tone: 'bad', text: 'still shaky · it comes back in review' };
  if (rounds.length === 1) return { tone: 'mid', text: 'needed a second try' };
  const [a, b] = rounds;
  if (a.first === false && b.first === true) return { tone: 'mid', text: `missed in round ${a.round} · solid in round ${b.round}` };
  if (a.first === true && b.first === false) return { tone: 'mid', text: `slipped in round ${b.round} · fixed on retry` };
  return { tone: 'bad', text: `missed in rounds ${a.round} and ${b.round} · fixed on retry` };
}
