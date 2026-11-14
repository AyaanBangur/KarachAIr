// TerraWatch AI data pipeline — fetches REAL open data and writes static JSON to public/data/.
//   node scripts/pipeline/run.mjs            full run (satellite stage takes ~10-25 min the first time; everything is cached)
//   node scripts/pipeline/run.mjs --only=boundaries,worldpop,osm,climate
//   node scripts/pipeline/run.mjs --skip-modis
// Raw API responses are cached in data-cache/ (gitignored), so re-runs are fast and reproducible.
import path from 'node:path';
import { ensureDirs, writeJson, readJson, exists, OUT, CACHE, log } from './lib.mjs';
import { runBoundaries } from './stages/boundaries.mjs';
import { runWorldPop } from './stages/worldpop.mjs';
import { runOsm } from './stages/osm.mjs';
import { runClimate } from './stages/climate.mjs';
import { runModis } from './stages/modis.mjs';
import { build } from './stages/build.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const only = args.only ? args.only.split(',') : null;
const want = (s) => !only || only.includes(s);

await ensureDirs();
const stageFile = (n) => path.join(CACHE, `stage-${n}.json`);
async function stage(name, fn, { skip = false } = {}) {
  if (skip || !want(name)) {
    if (await exists(stageFile(name))) { log(name, 'using previous stage output'); return readJson(stageFile(name)); }
    log(name, 'skipped (no previous output)'); return null;
  }
  const t0 = Date.now();
  const out = await fn();
  await writeJson(stageFile(name), out);
  log(name, `done in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  return out;
}

const boundaries = await stage('boundaries', runBoundaries);
const pop = await stage('worldpop', () => runWorldPop(boundaries));
const osm = await stage('osm', () => runOsm(boundaries));
const climate = await stage('climate', () => runClimate(boundaries));
const modis = await stage('modis', () => runModis(boundaries, pop), { skip: 'skip-modis' in args });

const bundle = build({ boundaries, pop, osm, climate, modis });
for (const [file, data] of Object.entries(bundle)) await writeJson(path.join(OUT, file), data);
log('build', `wrote ${Object.keys(bundle).join(', ')} to public/data/`);
