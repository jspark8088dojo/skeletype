// Downloads the source STL files for a region into assets/raw/<region>/ (not committed: they are large).
// Usage: node tools/fetch-raw.mjs <region> [<region> ...]
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REGIONS, SOURCE_BASE } from './regions.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
for (const region of process.argv.slice(2)) {
  const cfg = REGIONS[region];
  if (!cfg) throw new Error(`unknown region ${region}`);
  const dir = join(root, 'assets', 'raw', region);
  mkdirSync(dir, { recursive: true });
  let bytes = 0;
  for (const [, fma] of cfg.meshes) {
    const file = join(dir, `${fma}.stl`);
    if (!existsSync(file)) {
      const res = await fetch(`${SOURCE_BASE}/${fma}.stl`);
      if (!res.ok) throw new Error(`${fma}: HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      writeFileSync(file, buf);
      bytes += buf.length;
    }
  }
  console.log(`${region}: ${cfg.meshes.length} files in ${dir} (${(bytes / 1e6).toFixed(1)} MB downloaded)`);
}
