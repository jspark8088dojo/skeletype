# skeletype · an anatomy atlas you learn by typing

Learn bones and organs by typing their names while a 3D model shows each one in red.

**Live:** https://jspark8088dojo.github.io/skeletype/

## What's in it

| Plate | Region | Levels |
| --- | --- | --- |
| I | Foot & ankle (26 bones) | the seven tarsals · metatarsals · phalanges · speed run |
| II | Skull (22 bones) | the braincase · the face · speed run |
| III | Organs (chest & abdomen) | the chest · the digestive tract · solid organs & urinary tract · speed run |

- **Round 1 · copy**: the name is shown; type over it. Wrong keys are refused and the right key is marked on the on-screen keyboard.
- **Round 2 · first letter**: only the first letter and one blank per letter, plus a location clue.
- **Round 3 · from memory**: no text at all. The model turns to a less familiar side and you name the part in red.
- Misses get a reveal ("almost", "that's the *other* one, shown in blue") and come back later in the round.
- **Results**: first-try recall, next review date (spaced repetition), typing speed and accuracy, three stars, a line per structure, and three "exam angle" clinical notes.
- **Today's structure**, a **body map** per region (drag to turn, hover or tap to name), **English/French** answers (accents optional), sound, and a typeface toggle.
- Works with a physical keyboard, with the on-screen keyboard on phones, and without WebGL (no 3D, typing still works). Progress is kept in the browser's localStorage.

## Run it

**Easiest:** open `dist/skeletype.html` in a browser. It's one self-contained file (about 4 MB) and needs no server or internet.

**From source** (for editing):

```bash
node tools/serve.mjs 4173
```

Then open http://127.0.0.1:4173/. ES modules can't load from `file://`, so the source version needs the server.

## Project layout

| Path | What it is |
| --- | --- |
| `index.html`, `src/styles.css` | page shell and the atlas styling |
| `src/engine.js` | round/queue/scoring engine (pure, unit-tested) |
| `src/match.js` | accent-insensitive matching, edit distance, verdicts |
| `src/srs.js` | review scheduling in local calendar days |
| `src/viewer.js` | three.js ink-study renderer, camera poses, picking |
| `src/app.js` | screens, typing flow, results, index, body map |
| `src/content.js` | regions, levels, which meshes each item paints, cameras |
| `src/copy.js` | foot wording (generated, then fact-checked by a separate pass) |
| `src/copy-extra.js` | skull and organ wording (hand-written) |
| `assets/*.pack` | packed meshes, one file per region |
| `vendor/three/` | three.js 0.187 (MIT) |
| `tools/` | mesh packers, model downloader, single-file builder, dev server |
| `tests/` | `node --test tests/*.test.mjs` |

## Rebuilding the models

The foot's source STLs are in `assets/bodyparts3d/`. The skull and organ sources are large, so they are downloaded on demand into `assets/raw/` (not committed) and simplified while packing:

```bash
node tools/pack-meshes.mjs assets/bodyparts3d assets/foot.pack
```

```bash
node tools/fetch-raw.mjs skull organs
```

```bash
node tools/pack-region.mjs skull
```

```bash
node tools/pack-region.mjs organs
```

```bash
node tools/build-single.mjs
```

To add a region: list its meshes in `tools/regions.mjs`, pack it, then add the region, its items and wording in `src/content.js` and `src/copy-extra.js`. The tests check that clues never contain their own answer, that no two structures share an accepted answer, and that packs and content agree.

## Credits and licences

- **3D models**: BodyParts3D, © 2008 Life Science Integrated Database Center, licensed [CC BY-SA 2.1 Japan](https://creativecommons.org/licenses/by-sa/2.1/jp/deed.en). The STL files come from [Kevin-Mattheus-Moerman/BodyParts3D](https://github.com/Kevin-Mattheus-Moerman/BodyParts3D) at commit `f0eeb6e`. The `.pack` files are adaptations of them (rotated, recentred, trimmed, simplified and re-indexed), so they, and any copy of `dist/skeletype.html` that embeds them, have to stay under CC BY-SA with this credit.
- **Rendering**: [three.js](https://threejs.org) (MIT, see `vendor/three/LICENSE`).
