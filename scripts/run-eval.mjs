// Bundles a TypeScript script with esbuild (already installed with Vite) and runs it: `node scripts/run-eval.mjs [script]`, default scripts/eval.ts.
import { build } from 'esbuild';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const entry = process.argv[2] ?? 'scripts/eval.ts';
const out = join(tmpdir(), 'karachair-run.mjs');
await build({ entryPoints: [entry], bundle: true, platform: 'node', format: 'esm', outfile: out, define: { 'import.meta.env': '{}' }, logLevel: 'error' });
await import(pathToFileURL(out).href + '?t=' + Date.now());
