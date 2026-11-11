# skeletype · bones of the foot

Learn the bones of the foot by typing their names while a 3D X-ray foot highlights each one.

- **Round 1 · copy**: the name is shown; type over it. Wrong keys are refused and the right key lights up on the on-screen keyboard.
- **Round 2 · first letter**: only the first letter and one blank per letter, plus a location clue.
- **Round 3 · from memory**: no text at all. The foot turns over (sole, side) and you name the glowing bone.
- Misses get a reveal ("almost", "that's the *other* bone, shown in blue") and come back later in the round.
- **Results**: first-try recall, next review date (spaced repetition), words per minute and accuracy, three stars, a card per bone, and three "exam angle" clinical notes.
- **Levels**: the seven tarsals · metatarsals · phalanges (the big toe has no middle) · a timed speed run over all 16 names.
- **Bone of the day**, a **body map** (drag to turn the foot, hover or tap any of the 28 bones), **EN/FR** answers (accents optional), sound, and a typeface toggle.
- Works with a physical keyboard, with the on-screen keyboard on phones, and without WebGL (no 3D, typing still works). Progress is kept in the browser's localStorage.

## Run it

**Easiest:** open `dist/skeletype.html` in a browser. It's one self-contained file (about 2 MB) and needs no server or internet.

**From source** (for editing):

```bash
node tools/serve.mjs 4173
```

Then open http://127.0.0.1:4173/. ES modules can't load from `file://`, so the source version needs the server.

## Project layout

| Path | What it is |
| --- | --- |
| `index.html`, `src/styles.css` | page shell and styles |
| `src/engine.js` | round/queue/scoring engine (pure, unit-tested) |
| `src/match.js` | accent-insensitive matching, edit distance, verdicts |
| `src/srs.js` | review scheduling in local calendar days |
| `src/viewer.js` | three.js X-ray renderer, camera poses, picking |
| `src/app.js` | screens, typing flow, results, home, body map |
| `src/content.js` | which bones each item lights up and the camera per round |
| `src/copy.js` | all wording (names, aliases, cues, facts, clinical notes), generated |
| `assets/foot.pack` | the 28 meshes, packed (built from `assets/bodyparts3d/*.stl`) |
| `vendor/three/` | three.js 0.187 (MIT) |
| `tools/` | mesh packer, copy generator, single-file builder, dev server |
| `tests/` | `node --test tests/*.test.mjs` |

## Rebuilding

```bash
node tools/pack-meshes.mjs assets/bodyparts3d assets/foot.pack
```

```bash
node tools/build-single.mjs
```

```bash
node --test tests/*.test.mjs
```

The wording in `src/copy.js` was drafted and then fact-checked by a separate reviewing pass (anatomy, French terminology, clinical accuracy). Edit it directly if you want to change any text. The content tests check that clues never contain their own answer and that no two bones share an accepted answer.

## Credits and licences

- **3D models**: BodyParts3D, © 2008 Life Science Integrated Database Center, licensed [CC BY-SA 2.1 Japan](https://creativecommons.org/licenses/by-sa/2.1/jp/deed.en). The STL files come from [Kevin-Mattheus-Moerman/BodyParts3D](https://github.com/Kevin-Mattheus-Moerman/BodyParts3D) at commit `f0eeb6e`. `assets/foot.pack` is an adaptation of them (rotated, recentred, trimmed and re-indexed), so it, and any copy of `dist/skeletype.html` that embeds it, has to stay under CC BY-SA with this credit.
- **Rendering**: [three.js](https://threejs.org) (MIT, see `vendor/three/LICENSE`).
