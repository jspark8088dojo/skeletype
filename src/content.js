// Level structure and camera choices. All wording (names, cues, facts, clinical notes) lives in copy.js.

import COPY from './copy.js';

// Which meshes glow for each item, and the camera pose for each round (see POSES in viewer.js).
// r1 defaults to the familiar dorsal view; r2 shows the bone at its clearest; r3 picks an unfamiliar angle.
const STRUCTURE = {
  talus: { meshes: ['talus'], cam: { r2: 'lateral', r3: 'medial' } },
  calcaneus: { meshes: ['calcaneus'], cam: { r2: 'lateral', r3: 'plantar' } },
  navicular: { meshes: ['navicular'], cam: { r2: 'dorsomedial', r3: 'plantarMedial' } },
  cuboid: { meshes: ['cuboid'], cam: { r2: 'dorsolateral', r3: 'plantarLateral' } },
  cun_med: { meshes: ['cun_med'], cam: { r2: 'dorsomedial', r3: 'plantar' } },
  cun_int: { meshes: ['cun_int'], cam: { r2: 'dorsal', r3: 'plantar' } },
  cun_lat: { meshes: ['cun_lat'], cam: { r2: 'dorsolateral', r3: 'plantarLateral' } },
  mt1: { meshes: ['mt1'], cam: { r2: 'dorsomedial', r3: 'plantar' } },
  mt2: { meshes: ['mt2'], cam: { r2: 'dorsal', r3: 'plantar' } },
  mt3: { meshes: ['mt3'], cam: { r2: 'dorsal', r3: 'plantarLateral' } },
  mt4: { meshes: ['mt4'], cam: { r2: 'dorsolateral', r3: 'plantar' } },
  mt5: { meshes: ['mt5'], cam: { r2: 'lateral', r3: 'plantarLateral' } },
  prox: { meshes: ['pp1', 'pp2', 'pp3', 'pp4', 'pp5'], cam: { r1: 'dorsal', r2: 'dorsal', r3: 'plantar', zoom: 0.78, focus: 0.65 } },
  mid: { meshes: ['mp2', 'mp3', 'mp4', 'mp5'], cam: { r1: 'dorsal', r2: 'dorsal', r3: 'anterior', zoom: 0.78, focus: 0.65 } },
  dist: { meshes: ['dp1', 'dp2', 'dp3', 'dp4', 'dp5'], cam: { r1: 'dorsal', r2: 'anterior', r3: 'plantar', zoom: 0.78, focus: 0.65 } },
  hallux: { meshes: ['pp1', 'dp1'], cam: { r1: 'dorsal', r2: 'dorsomedial', r3: 'plantarMedial', zoom: 0.82, focus: 0.55 } },
};

const nfc = (s) => (typeof s === 'string' ? s.normalize('NFC') : s);

/** Items keyed by id: structure merged with the fact-checked copy. */
export const ITEMS = Object.fromEntries(
  Object.entries(STRUCTURE).map(([key, s]) => {
    const c = COPY.items[key];
    if (!c) throw new Error(`missing copy for ${key}`);
    return [key, {
      key,
      ...s,
      ...c,
      en: nfc(c.en),
      fr: nfc(c.fr),
      enAliases: (c.enAliases || []).map(nfc),
      frAliases: (c.frAliases || []).map(nfc),
    }];
  }),
);

export const LEVELS = [
  { id: 'L1', n: 1, title: 'The seven tarsals', blurb: 'heel to midfoot', unit: 'bones', items: ['talus', 'calcaneus', 'navicular', 'cuboid', 'cun_med', 'cun_int', 'cun_lat'] },
  { id: 'L2', n: 2, title: 'Metatarsals', blurb: 'counted from the big toe', unit: 'bones', items: ['mt1', 'mt2', 'mt3', 'mt4', 'mt5'] },
  { id: 'L3', n: 3, title: 'Phalanges', blurb: 'the big toe has no middle', unit: 'groups', items: ['prox', 'mid', 'dist', 'hallux'] },
  { id: 'SR', n: 4, title: 'Speed run', blurb: 'every name, against the clock', unit: 'names', speed: true, parTimeMs: 90_000, items: Object.keys(STRUCTURE) },
].map((lv) => ({ ...lv, ...(COPY.levels[lv.id] || { examAngle: [], headline: '' }) }));

export const levelById = (id) => LEVELS.find((l) => l.id === id);

/** Every item, in teaching order (the pool for "that's another bone's name" and the bone of the day). */
export const allItems = () => Object.values(ITEMS);

/** Label for every individual mesh in the body map. */
export const MESH_INFO = COPY.meshes;

/** Which level teaches a mesh (for the body map). */
export function levelOfMesh(meshKey) {
  for (const lv of LEVELS) {
    if (lv.speed) continue;
    if (lv.items.some((k) => ITEMS[k].meshes.includes(meshKey))) return lv;
  }
  return null;
}

/** The name in the other language, shown under the prompt (e.g. "cunéiforme intermédiaire (deuxième cunéiforme)"). */
export function altName(item, lang) {
  if (lang === 'fr') return item.en;
  return item.frNote ? `${item.fr} (${item.frNote})` : item.fr;
}

export const BODY_MAP_GROUPS = [
  { title: 'Tarsals', keys: ['talus', 'calcaneus', 'navicular', 'cuboid', 'cun_med', 'cun_int', 'cun_lat'] },
  { title: 'Metatarsals', keys: ['mt1', 'mt2', 'mt3', 'mt4', 'mt5'] },
  { title: 'Proximal phalanges', keys: ['pp1', 'pp2', 'pp3', 'pp4', 'pp5'] },
  { title: 'Middle phalanges', keys: ['mp2', 'mp3', 'mp4', 'mp5'] },
  { title: 'Distal phalanges', keys: ['dp1', 'dp2', 'dp3', 'dp4', 'dp5'] },
  { title: 'Leg', keys: ['tibia', 'fibula'] },
];
