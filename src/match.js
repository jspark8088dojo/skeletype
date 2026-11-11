// Answer matching: accent/case folding, edit distance and verdicts.

const COMBINING = /[\u0300-\u036f]/g;

/** Lowercase and strip accents so "Calcanéus" and "calcaneus" compare equal. */
export function fold(s) {
  return String(s).normalize('NFD').replace(COMBINING, '').toLowerCase().replace(/œ/g, 'oe').replace(/æ/g, 'ae');
}

/** Fold, drop apostrophes, turn any other punctuation into spaces and collapse whitespace. */
export function normalize(s) {
  return fold(s).replace(/['’`´]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** True when a single typed character matches the expected character (accent- and case-insensitive). */
export function sameChar(typed, expected) {
  if (expected === undefined) return false;
  if (expected === ' ') return typed === ' ';
  return fold(typed) === fold(expected);
}

/** Optimal-string-alignment distance (Levenshtein plus adjacent transpositions). */
export function distance(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev2 = null;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v;
    }
    prev2 = prev;
    prev = cur;
  }
  return prev[n];
}

/** Every accepted answer for an item in a language, normalized. The canonical answer comes first. */
export function answersFor(item, lang) {
  const list = [item[lang], ...(item[`${lang}Aliases`] || [])];
  return [...new Set(list.map(normalize).filter(Boolean))];
}

/** True when the input is exactly the canonical answer (used to auto-accept without Enter). */
export function isCanonical(input, item, lang) {
  return normalize(input) === normalize(item[lang]);
}

/**
 * Judge a free-typed answer.
 * @returns {{verdict:'empty'}|{verdict:'correct'}|{verdict:'other', other:object}|{verdict:'close'|'wrong', distance:number}}
 *   'other' = the input is the exact name of a different item (a classic mix-up, e.g. medial vs lateral cuneiform).
 */
export function judge(input, item, lang, pool = []) {
  const x = normalize(input);
  if (!x) return { verdict: 'empty' };
  const own = answersFor(item, lang);
  if (own.includes(x)) return { verdict: 'correct' };
  for (const other of pool) {
    if (other.key !== item.key && answersFor(other, lang).includes(x)) return { verdict: 'other', other };
  }
  const target = normalize(item[lang]);
  const d = Math.min(...own.map((a) => distance(x, a)));
  const tolerance = Math.max(1, Math.round(target.length * 0.2));
  return { verdict: d <= tolerance ? 'close' : 'wrong', distance: d };
}
