import { describe, expect, it } from 'vitest';
import { POLICY, activityProbs, allExamples, decideWith, features, splitOf, trainLR, trainNB, probsLR, probsNB } from '../src/lib/intent';

describe('dataset and split', () => {
  it('is deterministic and roughly 60 / 20 / 20 by base sentence', () => {
    const ex = allExamples(), again = allExamples(); expect(ex.map((e) => e.text)).toEqual(again.map((e) => e.text));
    const bases = [...new Set(ex.map((e) => e.base))], share = (s: string) => bases.filter((b) => splitOf(b) === s).length / bases.length;
    expect(share('train')).toBeGreaterThan(0.5); expect(share('train')).toBeLessThan(0.7); expect(share('val')).toBeGreaterThan(0.12); expect(share('test')).toBeGreaterThan(0.12);
  });
  it('keeps a sentence and all its copies in one split, and covers all six labels in every split', () => {
    const ex = allExamples(); for (const b of new Set(ex.map((e) => e.base))) expect(new Set(ex.filter((e) => e.base === b).map((e) => e.split)).size).toBe(1);
    for (const sp of ['train', 'val', 'test'] as const) expect(new Set(ex.filter((e) => e.split === sp).map((e) => e.label))).toEqual(new Set([0, 1, 2, 3, 4, 5]));
  });
  it('has typo and reworded copies that differ from the original', () => {
    const ex = allExamples(), typos = ex.filter((e) => e.variant === 'typo'), framed = ex.filter((e) => e.variant === 'framed');
    expect(typos.filter((e) => e.text !== e.base).length / typos.length).toBeGreaterThan(0.8); expect(framed.every((e) => e.text.length > e.base.length)).toBe(true);
  });
});

describe('features and models', () => {
  it('letter triples keep a misspelt word close to the right one', () => {
    const a = new Set(features('recycling')), b = new Set(features('recycilng')), shared = [...a].filter((f) => b.has(f)).length; expect(shared / a.size).toBeGreaterThan(0.4);
  });
  it('both models learn a toy problem and return probabilities that sum to 1', () => {
    const data = [{ label: 1, text: 'pick up rubbish' }, { label: 1, text: 'clean the garbage' }, { label: 3, text: 'plant trees' }, { label: 3, text: 'grow saplings' }, { label: 0, text: 'tell me a joke' }, { label: 0, text: 'how are you' }];
    for (const [m, f] of [[trainNB(data), probsNB], [trainLR(data), probsLR]] as const) { const p = (f as any)(m, 'collect rubbish'); expect(p[0].label).toBe(1); expect(p.reduce((a: number, c: { p: number }) => a + c.p, 0)).toBeCloseTo(1, 5); }
  });
  it('the deployed model returns a valid label for any input, including nonsense', () => {
    for (const t of ['', 'x', 'qwertyuiop', '12345', 'plant trees'.repeat(40)]) { const p = activityProbs(t); expect(p.every((x) => [0, 1, 2, 3, 4, 5].includes(x.label))).toBe(true); }
  });
});

describe('how the model and the rules are combined', () => {
  const probs = [{ label: 3, p: 0.8 }, { label: 0, p: 0.2 }], unsure = [{ label: 0, p: 0.6 }, { label: 3, p: 0.4 }]; // probabilities are always sorted best-first
  it('combinations always come from the rules', () => { for (const mode of ['model-only', 'model-first', 'rules-first'] as const) expect(decideWith({ model: 'lr', mode, tau: 0.5 }, probs, [3, 4])).toEqual([3, 4]); });
  it('model-first uses a confident model and falls back to the rules', () => {
    const p = { model: 'lr', mode: 'model-first', tau: 0.5 } as const; expect(decideWith(p, probs, [1])).toEqual([3]); expect(decideWith(p, [{ label: 3, p: 0.3 }], [1])).toEqual([1]);
  });
  it('rules-first prefers the rules, model-only trusts the model including "not an activity"', () => {
    expect(decideWith({ model: 'lr', mode: 'rules-first', tau: 0.5 }, probs, [1])).toEqual([1]);
    expect(decideWith({ model: 'lr', mode: 'model-only', tau: 0.5 }, unsure, [1])).toBeNull();
  });
  it('the deployed settings are valid', () => { expect(['nb', 'lr']).toContain(POLICY.model); expect(POLICY.tau).toBeGreaterThan(0); expect(POLICY.tau).toBeLessThanOrEqual(1); });
});
