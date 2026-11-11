// Builds dist/skeletype.html: one self-contained file (opens straight from disk, no server, no network).
//
// Usage: node tools/build-single.mjs [out-file]
//
// How: every ES module (three.js and the app) becomes a data: URL listed in the page's import map, with
// relative imports rewritten to bare names the import map resolves. The stylesheet is inlined and the
// mesh packs are embedded as base64 (viewer.js reads them from #pack-<region>).
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(process.argv[2] || join(root, 'dist', 'skeletype.html'));
const read = (p) => readFileSync(join(root, p), 'utf8');
const dataUrl = (code) => `data:text/javascript;base64,${Buffer.from(code, 'utf8').toString('base64')}`;

// three.js: the module build imports its core with a relative path; point it at a bare name instead.
const threeCore = read('vendor/three/three.core.js');
const threeModule = read('vendor/three/three.module.min.js');
const coreRefs = threeModule.match(/(["'])\.\/three\.core\.js\1/g) || [];
if (!coreRefs.length) throw new Error('three.module.min.js no longer imports ./three.core.js; update the build');
const threeModuleFixed = threeModule.replace(/(["'])\.\/three\.core\.js\1/g, '"three/core"');
if (/from\s*["']\.\.?\//.test(threeCore) || /from\s*["']\.\.?\//.test(threeModuleFixed)) throw new Error('unexpected relative import left in three.js');

// App modules: rewrite `from './x.js'` to `from 'skeletype/x.js'`.
const imports = { three: dataUrl(threeModuleFixed), 'three/core': dataUrl(threeCore) };
for (const file of readdirSync(join(root, 'src')).filter((f) => f.endsWith('.js'))) {
  let code = read(`src/${file}`);
  code = code.replace(/(from\s*|import\s*\(\s*)(["'])\.\/([\w.-]+\.js)\2/g, (_, pre, q, name) => `${pre}${q}skeletype/${name}${q}`);
  if (/from\s*["']\.\.?\//.test(code)) throw new Error(`relative import left in src/${file}`);
  imports[`skeletype/${file}`] = dataUrl(code);
}

const css = read('src/styles.css');
const packs = readdirSync(join(root, 'assets')).filter((f) => f.endsWith('.pack'))
  .map((f) => `<script type="application/octet-stream" id="pack-${f.slice(0, -5)}">${readFileSync(join(root, 'assets', f)).toString('base64')}</script>`).join('\n');
let html = read('index.html');

const swaps = [
  [/[ \t]*<!-- preload:start[\s\S]*?<!-- preload:end -->\n/, ''],
  [/<link rel="stylesheet" href="src\/styles\.css">/, `<style>\n${css}\n</style>`],
  [/<script type="importmap">[\s\S]*?<\/script>/, `<script type="importmap">${JSON.stringify({ imports })}</script>`],
  [/<script type="module" src="src\/main\.js"><\/script>/, `<script type="module">import 'skeletype/main.js';</script>`],
  [/<\/body>/, `${packs}\n</body>`],
];
for (const [re, rep] of swaps) {
  if (!re.test(html)) throw new Error(`build: pattern not found: ${re}`);
  html = html.replace(re, () => rep);
}

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log(`wrote ${out} (${(Buffer.byteLength(html) / 1024 / 1024).toFixed(2)} MB, ${Object.keys(imports).length} modules)`);
