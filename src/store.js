// Progress saved in localStorage (falls back to memory when storage is unavailable).

export const STORAGE_KEY = 'skeletype:v1';
const KEY = STORAGE_KEY;
let memory = null;

function defaults() {
  return {
    v: 1,
    settings: { lang: 'en', sound: true, face: 'serif', region: 'foot' },
    firstVisit: null,
    levels: {},
    daily: {},
  };
}

export function loadState() {
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { raw = memory; }
  const base = defaults();
  if (!raw || typeof raw !== 'object') return base;
  return {
    ...base,
    ...raw,
    settings: { ...base.settings, ...(raw.settings || {}) },
    levels: raw.levels || {},
    daily: raw.daily || {},
  };
}

export function saveState(state) {
  memory = state;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function levelState(state, id) {
  if (!state.levels[id]) {
    state.levels[id] = { stars: [false, false, false], plays: 0, best: null, clearedAt: null, interval: 0, nextReviewAt: null, lastReviewAt: null };
  }
  return state.levels[id];
}
