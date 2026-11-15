// Bundles scripts/eval.ts with esbuild (already installed with Vite) and runs it, so `npm run eval` needs nothing extra.
import { build } from 'esbuild';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const out = join(tmpdir(), 'karachair-eval.mjs');
await build({ entryPoints: ['scripts/eval.ts'], bundle: true, platform: 'node', format: 'esm', outfile: out, define: { 'import.meta.env': '{}' }, logLevel: 'error' });
await import(pathToFileURL(out).href);
