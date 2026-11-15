// Hawa's AI: a small TRAINED text classifier that works out which volunteering activity a student means.
// It is trained in the browser at start-up (a fraction of a second) from the team-written dataset in intentCorpus.ts.
//   labels: 1 waste & burning, 2 traffic no-idling, 3 trees & dust, 4 health & masks, 5 data & sensors, 0 = not an activity answer.
// scripts/eval.ts compares it with simple baselines on test sentences it never saw, and docs/RESULTS.md reports the numbers.
import { CORPUS } from './intentCorpus';

// ------------------------------------------------------------------ dataset, split and augmentation
export type Variant = 'clean' | 'typo' | 'framed';
export type Split = 'train' | 'val' | 'test';
export interface Example { text: string; base: string; label: number; variant: Variant; split: Split }

const hash = (s: string) => { let x = 2166136261; for (const c of s) { x ^= c.charCodeAt(0); x = Math.imul(x, 16777619); } return x >>> 0; };
/** The split is decided per BASE sentence, so a sentence and its typo / reworded copies are always on the same side. */
export const splitOf = (base: string): Split => { const b = hash('split:' + base) % 10; return b < 6 ? 'train' : b < 8 ? 'val' : 'test'; };
const rngFor = (seed: string) => { let s = hash(seed) || 1; return () => (s = Math.imul(s, 1103515245) + 12345 >>> 0) / 4294967296; };

const typoOf = (text: string, rnd: () => number): string => {
  const ws = text.split(' '), cand = ws.map((w, i) => [w, i] as const).filter(([w]) => w.length >= 5);
  const n = Math.min(cand.length, 1 + Math.floor(rnd() * 2));
  for (let k = 0; k < n; k++) {
    const [w, i] = cand[Math.floor(rnd() * cand.length)]; const p = 1 + Math.floor(rnd() * (w.length - 2)), kind = Math.floor(rnd() * 4);
    ws[i] = kind === 0 ? w.slice(0, p) + w[p + 1] + w[p] + w.slice(p + 2) : kind === 1 ? w.slice(0, p) + w.slice(p + 1) : kind === 2 ? w.slice(0, p) + w[p] + w.slice(p) : w.slice(0, p) + (/[aeiou]/.test(w[p]) ? 'aeiou'[Math.floor(rnd() * 5)] : w[p]) + w.slice(p + 1);
  }
  return ws.join(' ');
};
const FRAMES = ['i want to ', 'can i ', 'maybe ', 'i would like to ', 'something like ', 'let me ', 'how about ', 'i think ', 'please '];
export function allExamples(): Example[] {
  const out: Example[] = [];
  for (const [l, texts] of Object.entries(CORPUS)) for (const base of texts) {
    const rnd = rngFor('aug:' + base), split = splitOf(base), label = Number(l);
    out.push({ text: base, base, label, variant: 'clean', split }, { text: typoOf(base, rnd), base, label, variant: 'typo', split }, { text: FRAMES[Math.floor(rnd() * FRAMES.length)] + base, base, label, variant: 'framed', split });
  }
  return out;
}

// ------------------------------------------------------------------ features
export function features(text: string): string[] {
  const words = text.toLowerCase().replace(/[^a-z ]/g, ' ').split(/\s+/).filter((w) => w.length > 1);
  const out: string[] = [...words];
  for (const w of words) { const p = `^${w}$`; for (let i = 0; i + 3 <= p.length; i++) out.push('#' + p.slice(i, i + 3)); } // letter triples survive typos
  return out;
}

// ------------------------------------------------------------------ model 1: multinomial Naive Bayes
export interface NBModel { labels: number[]; logPrior: Map<number, number>; logLik: Map<number, Map<string, number>>; unk: Map<number, number> }
export function trainNB(data: { label: number; text: string }[]): NBModel {
  const labels = [...new Set(data.map((d) => d.label))];
  const counts = new Map<number, Map<string, number>>(), totals = new Map<number, number>(), docs = new Map<number, number>(), vocab = new Set<string>();
  for (const l of labels) { counts.set(l, new Map()); totals.set(l, 0); docs.set(l, 0); }
  for (const d of data) { docs.set(d.label, docs.get(d.label)! + 1); for (const f of features(d.text)) { vocab.add(f); const m = counts.get(d.label)!; m.set(f, (m.get(f) ?? 0) + 1); totals.set(d.label, totals.get(d.label)! + 1); } }
  const V = vocab.size, logPrior = new Map<number, number>(), logLik = new Map<number, Map<string, number>>(), unk = new Map<number, number>();
  for (const l of labels) { logPrior.set(l, Math.log(docs.get(l)! / data.length)); const denom = totals.get(l)! + V, m = new Map<string, number>(); for (const [f, c] of counts.get(l)!) m.set(f, Math.log((c + 1) / denom)); logLik.set(l, m); unk.set(l, Math.log(1 / denom)); }
  return { labels, logPrior, logLik, unk };
}
export function probsNB(m: NBModel, text: string): { label: number; p: number }[] {
  const fs = features(text); if (!fs.length) return [];
  const raw = m.labels.map((l) => ({ label: l, s: m.logPrior.get(l)! + fs.reduce((a, f) => a + (m.logLik.get(l)!.get(f) ?? m.unk.get(l)!), 0) }));
  const max = Math.max(...raw.map((r) => r.s)), ex = raw.map((r) => Math.exp(r.s - max)), sum = ex.reduce((a, b) => a + b, 0);
  return raw.map((r, i) => ({ label: r.label, p: ex[i] / sum })).sort((a, b) => b.p - a.p);
}

// ------------------------------------------------------------------ model 2: softmax (multinomial logistic) regression
const DIM = 1 << 13;
export interface LRModel { labels: number[]; W: Float64Array[]; b: Float64Array }
const idx = (f: string) => hash('f:' + f) % DIM;
function vec(text: string): { i: number[]; v: number[] } {
  const m = new Map<number, number>(); for (const f of features(text)) m.set(idx(f), (m.get(idx(f)) ?? 0) + 1);
  const norm = Math.sqrt([...m.values()].reduce((a, c) => a + c * c, 0)) || 1; return { i: [...m.keys()], v: [...m.values()].map((c) => c / norm) };
}
export function trainLR(data: { label: number; text: string }[], o: { epochs?: number; lr?: number; l2?: number } = {}): LRModel {
  const { epochs = 40, lr = 0.6, l2 = 1e-5 } = o, labels = [...new Set(data.map((d) => d.label))].sort((a, b) => a - b), K = labels.length;
  const W = labels.map(() => new Float64Array(DIM)), b = new Float64Array(K), xs = data.map((d) => ({ ...vec(d.text), y: labels.indexOf(d.label) })), rnd = rngFor('lr');
  for (let e = 0; e < epochs; e++) {
    for (let k = xs.length - 1; k > 0; k--) { const j = Math.floor(rnd() * (k + 1)); [xs[k], xs[j]] = [xs[j], xs[k]]; }
    const step = lr / (1 + 0.05 * e);
    for (const x of xs) {
      const s = labels.map((_, c) => { let t = b[c]; for (let q = 0; q < x.i.length; q++) t += W[c][x.i[q]] * x.v[q]; return t; });
      const mx = Math.max(...s), ex = s.map((t) => Math.exp(t - mx)), sum = ex.reduce((a, c) => a + c, 0);
      for (let c = 0; c < K; c++) { const g = ex[c] / sum - (c === x.y ? 1 : 0); b[c] -= step * g; for (let q = 0; q < x.i.length; q++) W[c][x.i[q]] -= step * (g * x.v[q] + l2 * W[c][x.i[q]]); }
    }
  }
  return { labels, W, b };
}
export function probsLR(m: LRModel, text: string): { label: number; p: number }[] {
  const x = vec(text); if (!x.i.length) return [];
  const s = m.labels.map((_, c) => { let t = m.b[c]; for (let q = 0; q < x.i.length; q++) t += m.W[c][x.i[q]] * x.v[q]; return t; });
  const mx = Math.max(...s), ex = s.map((t) => Math.exp(t - mx)), sum = ex.reduce((a, c) => a + c, 0);
  return m.labels.map((l, c) => ({ label: l, p: ex[c] / sum })).sort((a, b) => b.p - a.p);
}

// ------------------------------------------------------------------ the deployed model and how Hawa uses it
export type Mode = 'model-only' | 'model-first' | 'rules-first';
export interface Policy { model: 'nb' | 'lr'; mode: Mode; tau: number }
/** Deployed settings, CHOSEN ON THE VALIDATION SPLIT by `npm run eval` (it prints the search and warns if these drift). */
export const POLICY: Policy = { model: 'nb', mode: 'rules-first', tau: 0.7 };

/**
 * Combine the model's probabilities with what the keyword rules understood.
 *  - model-only:  the model decides (including "this is not an activity"); rules only supply combinations such as "trees and masks".
 *  - model-first: a confident model answer wins, otherwise the rules answer.
 *  - rules-first: the rules answer if they understood, otherwise a confident model answer.
 */
export function decideWith(policy: Policy, probs: { label: number; p: number }[], rules: number[] | null): number[] | null {
  if (rules && rules.length > 1) return rules; // combinations and "everything" always come from the rules
  const top = probs[0], conf = top && top.p >= policy.tau ? top.label : null, single = rules && rules.length === 1 ? rules : null;
  if (policy.mode === 'model-only') return top ? (top.label === 0 ? null : [top.label]) : single;
  const m = conf && conf !== 0 ? [conf] : null;
  return policy.mode === 'model-first' ? m ?? single : single ?? m;
}

let deployed: { nb?: NBModel; lr?: LRModel } | null = null;
/** After choosing settings on the validation split, the deployed model is trained on train + validation (the test split stays untouched for reporting). */
export function activityProbs(text: string): { label: number; p: number }[] {
  if (!deployed) { const data = allExamples().filter((e) => e.split !== 'test'); deployed = POLICY.model === 'nb' ? { nb: trainNB(data) } : { lr: trainLR(data) }; }
  return deployed.nb ? probsNB(deployed.nb, text) : probsLR(deployed.lr!, text);
}
export const intentSwitch = { enabled: true };
/** Hawa's decision for the activity question: `rules` is what the keyword rules understood (or null). Switch the model off with intentSwitch to measure the rules alone. */
export function decideActivity(text: string, rules: number[] | null): number[] | null {
  return intentSwitch.enabled ? decideWith(POLICY, activityProbs(text), rules) : rules;
}
