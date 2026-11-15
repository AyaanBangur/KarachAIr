// A small TRAINED text classifier (multinomial Naive Bayes over words and letter-triples) that helps Hawa understand which
// activity a student means when her keyword rules do not recognise the wording ("pick up rubbish", "hand out face coverings").
// It is only a fallback: the rules answer first, so behaviour that already worked cannot get worse. It trains in the browser
// at start-up from the labelled phrases in intentData.ts (a few milliseconds), and scripts/eval.ts measures it on phrases it was NOT trained on.
import { INTENT_TRAINING } from './intentData';

export interface IntentModel { labels: number[]; logPrior: Map<number, number>; logLik: Map<number, Map<string, number>>; unk: Map<number, number> }

export function features(text: string): string[] {
  const words = text.toLowerCase().replace(/[^a-z ]/g, ' ').split(/\s+/).filter((w) => w.length > 1);
  const out: string[] = [...words];
  for (const w of words) { const p = `^${w}$`; for (let i = 0; i + 3 <= p.length; i++) out.push('#' + p.slice(i, i + 3)); } // letter triples survive typos
  return out;
}

export function train(data: { label: number; text: string }[]): IntentModel {
  const labels = [...new Set(data.map((d) => d.label))];
  const counts = new Map<number, Map<string, number>>(), totals = new Map<number, number>(), docs = new Map<number, number>(), vocab = new Set<string>();
  for (const l of labels) { counts.set(l, new Map()); totals.set(l, 0); docs.set(l, 0); }
  for (const d of data) {
    docs.set(d.label, docs.get(d.label)! + 1);
    for (const f of features(d.text)) { vocab.add(f); const m = counts.get(d.label)!; m.set(f, (m.get(f) ?? 0) + 1); totals.set(d.label, totals.get(d.label)! + 1); }
  }
  const V = vocab.size, logPrior = new Map<number, number>(), logLik = new Map<number, Map<string, number>>(), unk = new Map<number, number>();
  for (const l of labels) {
    logPrior.set(l, Math.log(docs.get(l)! / data.length));
    const denom = totals.get(l)! + V, m = new Map<string, number>();
    for (const [f, c] of counts.get(l)!) m.set(f, Math.log((c + 1) / denom));
    logLik.set(l, m); unk.set(l, Math.log(1 / denom));
  }
  return { labels, logPrior, logLik, unk };
}

/** Probabilities for each label, best first. */
export function classify(model: IntentModel, text: string): { label: number; p: number }[] {
  const fs = features(text); if (!fs.length) return [];
  const raw = model.labels.map((l) => ({ label: l, s: model.logPrior.get(l)! + fs.reduce((a, f) => a + (model.logLik.get(l)!.get(f) ?? model.unk.get(l)!), 0) }));
  const max = Math.max(...raw.map((r) => r.s)), exps = raw.map((r) => Math.exp(r.s - max)), sum = exps.reduce((a, b) => a + b, 0);
  return raw.map((r, i) => ({ label: r.label, p: exps[i] / sum })).sort((a, b) => b.p - a.p);
}

let model: IntentModel | null = null;
export const activityModel = () => (model ??= train(INTENT_TRAINING));
/** Turn the on/off switch for the fallback (the evaluation compares rules alone with rules plus the model). */
export const intentSwitch = { enabled: true };

/** Which activity (1-5) the text means, or null when unsure or it is off topic (label 0). Needs a clear winner (90% sure), so it stays quiet rather than guess. */
export function activityFromText(text: string, minP = 0.9): number | null {
  if (!intentSwitch.enabled) return null;
  const r = classify(activityModel(), text); const top = r[0];
  return top && top.label !== 0 && top.p >= minP ? top.label : null;
}
