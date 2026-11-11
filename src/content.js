// Regions, levels and camera choices. All wording lives in copy.js (foot) and copy-extra.js (skull, organs).

import FOOT from './copy.js';
import EXTRA from './copy-extra.js';

const COPY = {
  items: { ...FOOT.items, ...EXTRA.items },
  levels: { ...FOOT.levels, ...EXTRA.levels },
  meshes: { ...FOOT.meshes, ...EXTRA.meshes },
};

const both = (key) => [`${key}_r`, `${key}_l`];

// Which meshes are painted for each item, and the camera pose per round (see POSES in viewer.js).
// Rounds without a pose use the region's defaults.
const STRUCTURE = {
  // foot
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

  // skull
  frontal: { meshes: ['frontal'], cam: { r1: 'frontRight', r2: 'front', r3: 'top' } },
  parietal: { meshes: both('parietal'), cam: { r1: 'backRight', r2: 'top', r3: 'right' } },
  occipital: { meshes: ['occipital'], cam: { r1: 'backRight', r2: 'back', r3: 'bottom' } },
  temporal: { meshes: both('temporal'), cam: { r1: 'right', r2: 'frontRight', r3: 'bottom' } },
  sphenoid: { meshes: ['sphenoid'], cam: { r1: 'right', r2: 'bottom', r3: 'frontLeft' } },
  ethmoid: { meshes: ['ethmoid'], cam: { r1: 'frontRight', r2: 'front', r3: 'top' } },
  mandible: { meshes: ['mandible'], cam: { r1: 'frontRight', r2: 'right', r3: 'below' } },
  maxilla: { meshes: both('maxilla'), cam: { r1: 'front', r2: 'frontRight', r3: 'below' } },
  zygomatic: { meshes: both('zygomatic'), cam: { r1: 'frontRight', r2: 'front', r3: 'right' } },
  nasal: { meshes: both('nasal'), cam: { r1: 'front', r2: 'frontRight', r3: 'right' } },
  lacrimal: { meshes: both('lacrimal'), cam: { r1: 'frontRight', r2: 'front', r3: 'frontLeft' } },
  vomer: { meshes: ['vomer'], cam: { r1: 'front', r2: 'below', r3: 'backRight' } },
  palatine: { meshes: both('palatine'), cam: { r1: 'below', r2: 'bottom', r3: 'backRight' } },
  concha: { meshes: both('concha'), cam: { r1: 'front', r2: 'frontRight', r3: 'below' } },

  // organs
  heart: { meshes: ['heart'], cam: {} },
  lung_r: { meshes: ['lung_ru', 'lung_rm', 'lung_rl'], cam: { r2: 'frontRight', r3: 'backRight' } },
  lung_l: { meshes: ['lung_lu', 'lung_ll'], cam: { r2: 'frontLeft', r3: 'backLeft' } },
  trachea: { meshes: ['trachea'], cam: {} },
  bronchi: { meshes: ['bronchi'], cam: {} },
  esophagus: { meshes: ['esophagus'], cam: { r1: 'left', r2: 'backLeft', r3: 'front' } },
  aorta: { meshes: ['aorta_asc', 'aorta_arch', 'aorta_desc'], cam: { r1: 'frontLeft', r2: 'left', r3: 'back' } },
  stomach: { meshes: ['stomach'], cam: {} },
  duodenum: { meshes: ['duodenum'], cam: { r2: 'frontRight' } },
  jejunum: { meshes: ['jejunum'], cam: {} },
  ileum: { meshes: ['ileum'], cam: { r2: 'frontRight' } },
  appendix: { meshes: ['appendix'], cam: { r2: 'frontRight', r3: 'right' } },
  colon: { meshes: ['colon'], cam: {} },
  rectum: { meshes: ['rectum'], cam: { r1: 'left', r2: 'backLeft', r3: 'back' } },
  liver: { meshes: ['liver'], cam: { r2: 'frontRight', r3: 'backRight' } },
  gallbladder: { meshes: ['gallbladder'], cam: { r1: 'frontRight', r2: 'front', r3: 'below' } },
  pancreas: { meshes: ['pancreas'], cam: {} },
  spleen: { meshes: ['spleen'], cam: { r1: 'backLeft', r2: 'left', r3: 'front' } },
  kidneys: { meshes: both('kidney'), cam: { r1: 'back', r2: 'backLeft', r3: 'front' } },
  adrenals: { meshes: both('adrenal'), cam: { r1: 'back', r2: 'backRight', r3: 'front' } },
  ureters: { meshes: both('ureter'), cam: { r1: 'back', r2: 'front', r3: 'backLeft' } },
  bladder: { meshes: ['bladder'], cam: { r1: 'front', r2: 'left', r3: 'back' } },
};

const nfc = (s) => (typeof s === 'string' ? s.normalize('NFC') : s);

/** Items keyed by id: structure merged with the wording. */
export const ITEMS = Object.fromEntries(
  Object.entries(STRUCTURE).map(([key, s]) => {
    const c = COPY.items[key];
    if (!c) throw new Error(`missing copy for ${key}`);
    return [key, {
      key, ...s, ...c,
      en: nfc(c.en), fr: nfc(c.fr),
      enAliases: (c.enAliases || []).map(nfc), frAliases: (c.frAliases || []).map(nfc),
    }];
  }),
);

const FOOT_ITEMS = ['talus', 'calcaneus', 'navicular', 'cuboid', 'cun_med', 'cun_int', 'cun_lat', 'mt1', 'mt2', 'mt3', 'mt4', 'mt5', 'prox', 'mid', 'dist', 'hallux'];
const BRAINCASE = ['frontal', 'parietal', 'occipital', 'temporal', 'sphenoid', 'ethmoid'];
const FACE = ['mandible', 'maxilla', 'zygomatic', 'nasal', 'lacrimal', 'vomer', 'palatine', 'concha'];
const CHEST = ['heart', 'lung_r', 'lung_l', 'trachea', 'bronchi', 'esophagus', 'aorta'];
const GUT = ['stomach', 'duodenum', 'jejunum', 'ileum', 'appendix', 'colon', 'rectum'];
const SOLID = ['liver', 'gallbladder', 'pancreas', 'spleen', 'kidneys', 'adrenals', 'ureters', 'bladder'];

const REGION_DEFS = [
  {
    id: 'foot', plate: 'I', title: 'Foot & ankle', tally: '26 bones', noun: 'bone', figure: 'right foot',
    poses: { r1: 'dorsal', r2: 'dorsal', r3: 'plantar', home: 'hero', map: 'dorsolateral', inset: { 1: 'lateral', 2: 'dorsal', 3: 'lateral' }, insetAlt: 'medial' },
    turnNote: 'No hints now. The foot turns over to show the sole.',
    mapViews: [['top', 'dorsal'], ['sole', 'plantar'], ['outside', 'lateral'], ['inside', 'medial']],
    autoFrame: false, ink: { inkOpacity: 0.55, inkCore: 0.06 },
    levels: [
      { id: 'L1', title: 'The seven tarsals', blurb: 'heel to midfoot', unit: 'bones', items: FOOT_ITEMS.slice(0, 7) },
      { id: 'L2', title: 'Metatarsals', blurb: 'counted from the big toe', unit: 'bones', items: FOOT_ITEMS.slice(7, 12) },
      { id: 'L3', title: 'Phalanges', blurb: 'the big toe has no middle', unit: 'groups', items: FOOT_ITEMS.slice(12) },
      { id: 'SR', title: 'Speed run', blurb: 'every name, against the clock', unit: 'names', speed: true, parTimeMs: 90_000, items: FOOT_ITEMS },
    ],
    mapGroups: [
      { title: 'Tarsals', keys: ['talus', 'calcaneus', 'navicular', 'cuboid', 'cun_med', 'cun_int', 'cun_lat'] },
      { title: 'Metatarsals', keys: ['mt1', 'mt2', 'mt3', 'mt4', 'mt5'] },
      { title: 'Proximal phalanges', keys: ['pp1', 'pp2', 'pp3', 'pp4', 'pp5'] },
      { title: 'Middle phalanges', keys: ['mp2', 'mp3', 'mp4', 'mp5'] },
      { title: 'Distal phalanges', keys: ['dp1', 'dp2', 'dp3', 'dp4', 'dp5'] },
      { title: 'Leg', keys: ['tibia', 'fibula'] },
    ],
  },
  {
    id: 'skull', plate: 'II', title: 'Skull', tally: '22 bones', noun: 'bone', figure: 'skull',
    poses: { r1: 'frontRight', r2: 'front', r3: 'right', home: 'frontRight', map: 'frontRight', inset: { 1: 'right', 2: 'front', 3: 'back' }, insetAlt: 'frontLeft' },
    turnNote: 'No hints now. The skull turns to less familiar sides.',
    mapViews: [['front', 'front'], ['side', 'right'], ['back', 'back'], ['top', 'top'], ['base', 'bottom']],
    autoFrame: true, ink: { inkOpacity: 0.34, inkCore: 0.04 },
    levels: [
      { id: 'SK1', title: 'The braincase', blurb: 'vault and skull base', unit: 'bones', items: BRAINCASE },
      { id: 'SK2', title: 'The face', blurb: 'jaws, cheeks, nose and orbit', unit: 'bones', items: FACE },
      { id: 'SKR', title: 'Speed run', blurb: 'every name, against the clock', unit: 'names', speed: true, parTimeMs: 75_000, items: [...BRAINCASE, ...FACE] },
    ],
    mapGroups: [
      { title: 'Braincase', keys: ['frontal', ...both('parietal'), 'occipital', ...both('temporal'), 'sphenoid', 'ethmoid'] },
      { title: 'Face', keys: ['mandible', ...both('maxilla'), ...both('zygomatic'), ...both('nasal'), ...both('lacrimal'), 'vomer', ...both('palatine'), ...both('concha')] },
    ],
  },
  {
    id: 'organs', plate: 'III', title: 'Organs', tally: 'chest & abdomen', noun: 'organ', figure: 'trunk',
    poses: { r1: 'front', r2: 'frontLeft', r3: 'back', home: 'front', map: 'front', inset: { 1: 'left', 2: 'back', 3: 'right' }, insetAlt: 'front' },
    turnNote: 'No hints now. You\'ll see the organs from behind and from the side.',
    mapViews: [['front', 'front'], ['back', 'back'], ['right', 'right'], ['left', 'left']],
    autoFrame: true, ink: { inkOpacity: 0.26, inkCore: 0.035 },
    levels: [
      { id: 'OR1', title: 'The chest', blurb: 'heart, lungs and the great tubes', unit: 'organs', items: CHEST },
      { id: 'OR2', title: 'The digestive tract', blurb: 'stomach to rectum', unit: 'organs', items: GUT },
      { id: 'OR3', title: 'Solid organs & urinary tract', blurb: 'liver to bladder', unit: 'organs', items: SOLID },
      { id: 'ORR', title: 'Speed run', blurb: 'every name, against the clock', unit: 'names', speed: true, parTimeMs: 100_000, items: [...CHEST, ...GUT, ...SOLID] },
    ],
    mapGroups: [
      { title: 'Chest', keys: ['heart', 'lung_ru', 'lung_rm', 'lung_rl', 'lung_lu', 'lung_ll', 'trachea', 'bronchi', 'esophagus', 'aorta_asc', 'aorta_arch', 'aorta_desc'] },
      { title: 'Digestive tract', keys: ['stomach', 'duodenum', 'jejunum', 'ileum', 'appendix', 'colon', 'rectum'] },
      { title: 'Solid organs', keys: ['liver', 'gallbladder', 'pancreas', 'spleen'] },
      { title: 'Urinary tract', keys: [...both('kidney'), ...both('adrenal'), ...both('ureter'), 'bladder'] },
    ],
  },
];

export const REGIONS = REGION_DEFS.map((r) => ({
  ...r,
  levels: r.levels.map((lv, i) => ({ ...lv, n: i + 1, region: r.id, ...(COPY.levels[lv.id] || { examAngle: [], headline: '' }) })),
}));

export const LEVELS = REGIONS.flatMap((r) => r.levels);
export const regionById = (id) => REGIONS.find((r) => r.id === id) || REGIONS[0];
export const levelById = (id) => LEVELS.find((l) => l.id === id);
export const regionOfLevel = (id) => regionById(levelById(id)?.region);

/** Every item, in teaching order. */
export const allItems = () => Object.values(ITEMS);

/** The items taught in one region. */
export const itemsOfRegion = (id) => regionById(id).levels.find((l) => l.speed).items.map((k) => ITEMS[k]);

export function regionOfItem(key) {
  return REGIONS.find((r) => r.levels.some((l) => l.items.includes(key)));
}

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
