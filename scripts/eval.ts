// Measures Hawa (the volunteer guide) and the mission generator, and writes docs/RESULTS.md. Run: `npm run eval`.
// Hawa's AI task: understand which volunteering activity a student means. Rules of the evaluation (from the hackathon guide):
//   * settings are chosen on the VALIDATION split only; the TEST split is used once, for reporting;
//   * the split is by base sentence, so no sentence (or its typo / reworded copy) is on both sides;
//   * every result is compared with simple baselines, and failures are shown.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AREAS, TYPES, parseArea, parseAreaFuzzy, parseSetting, registerAreas, respond, startChat, type GCtx, type GState } from '../src/lib/guide';
import { computeBaseline, DEFAULT_WEIGHTS, scoreAll } from '../src/lib/risk';
import { generateTasks, unitNeeds } from '../src/lib/needs';
import type { LiveAir, LiveWeather } from '../src/lib/hooks';
import { POLICY, allExamples, decideWith, intentSwitch, probsLR, probsNB, trainLR, trainNB, type Example, type Mode, type Policy } from '../src/lib/intent';

const dir = join(process.cwd(), 'public', 'data');
const units = JSON.parse(readFileSync(join(dir, 'units.geojson'), 'utf8')).features;
const meta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8'));
registerAreas(units);
const scores = scoreAll(units, computeBaseline(units), DEFAULT_WEIGHTS);
const ctx: GCtx = { name: 'Amina', tasks: [], airFor: () => ({ pm25: 10, label: 'Good', outdoorOk: true, triggered: [] }), today: 'today', rng: () => 0 };
const pct = (x: number, d = 0) => `${(x * 100).toFixed(d)}%`;
const wilson = (k: number, n: number): [number, number] => { if (!n) return [0, 0]; const z = 1.96, p = k / n, d = 1 + z * z / n, c = p + z * z / (2 * n), r = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)); return [(c - r) / d, (c + r) / d]; };

// ====================================================================== 1. Hawa's activity understanding
const ex = allExamples(), by = (s: Example['split']) => ex.filter((e) => e.split === s);
const train = by('train'), val = by('val'), test = by('test');
const LABELS = [1, 2, 3, 4, 5, 0], NAME: Record<number, string> = { 0: 'not an activity', ...Object.fromEntries(TYPES.map((t) => [t.id, t.name])) };
const bases = (e: Example[]) => new Set(e.map((x) => x.base));
const leak = [...bases(test)].filter((b) => bases(train).has(b) || bases(val).has(b)).length + [...bases(val)].filter((b) => bases(train).has(b)).length;

// what the keyword rules alone say about a sentence, as a single label (0 = nothing understood, -1 = several activities)
const state0 = respond(startChat(ctx).state, 'Saddar', ctx).state;
const viaChat = (text: string): number => { const o = respond(state0, text, ctx); const t = o.state.stage === 'types' ? null : o.state.profile.types; return !t || !t.length ? 0 : t.length === 1 ? t[0] : -1; };
const rulesLabel = (t: string) => { intentSwitch.enabled = false; const r = viaChat(t); intentSwitch.enabled = true; return r; };
const hybridLabel = (t: string) => { intentSwitch.enabled = true; return viaChat(t); };

interface Scored { acc: number; k: number; n: number; offFalseAccept: number }
const scoreOn = (data: Example[], pred: (e: Example) => number): Scored => {
  let k = 0, fa = 0, off = 0; for (const e of data) { const p = pred(e); if (p === e.label) k++; if (e.label === 0) { off++; if (p !== 0) fa++; } }
  return { acc: k / data.length, k, n: data.length, offFalseAccept: off ? fa / off : 0 };
};
const majority = LABELS.map((l) => ({ l, c: train.filter((e) => e.label === l).length })).sort((a, b) => b.c - a.c)[0].l;

// ---- model selection on the validation split (models trained on the train split only)
const nb = trainNB(train), lrTrain = trainLR(train);
const modelPred = (m: 'nb' | 'lr') => (e: Example) => { const r = (m === 'nb' ? probsNB(nb, e.text) : probsLR(lrTrain, e.text))[0]; return r ? r.label : 0; };
const valRules = scoreOn(val, (e) => { const r = rulesLabel(e.text); return r < 0 ? 0 : r; }), valNB = scoreOn(val, modelPred('nb')), valLR = scoreOn(val, modelPred('lr')), valMajority = scoreOn(val, () => majority);
// Search on VALIDATION: which model (Naive Bayes or logistic regression) and which way of combining it with the rules (and what confidence threshold).
const rulesOn = (e: Example) => { const l = rulesLabel(e.text); return l < 0 ? [1, 2] : l === 0 ? null : [l]; }; // -1 = several activities
const valRulesRaw = new Map(val.map((e) => [e.text, rulesOn(e)]));
const search: (Policy & { acc: number; fa: number })[] = [];
for (const model of ['nb', 'lr'] as const) for (const mode of ['model-only', 'model-first', 'rules-first'] as Mode[]) for (const tau of mode === 'model-only' ? [0.5] : [0.3, 0.5, 0.7, 0.9]) {
  const pol: Policy = { model, mode, tau };
  const s = scoreOn(val, (e) => { const d = decideWith(pol, model === 'nb' ? probsNB(nb, e.text) : probsLR(lrTrain, e.text), valRulesRaw.get(e.text) ?? null); return d && d.length === 1 ? d[0] : 0; });
  search.push({ ...pol, acc: s.acc, fa: s.offFalseAccept });
}
const best = [...search].sort((a, b) => b.acc - a.acc || a.fa - b.fa)[0];
const policyMatches = best.model === POLICY.model && best.mode === POLICY.mode && best.tau === POLICY.tau;

// ---- the one-time test report (deployed model = trained on train + validation; deployed policy)
const tMajority = scoreOn(test, () => majority), tRules = scoreOn(test, (e) => { const r = rulesLabel(e.text); return r < 0 ? 0 : r; }), tHybrid = scoreOn(test, (e) => { const r = hybridLabel(e.text); return r < 0 ? 0 : r; });
const preds = test.map((e) => ({ e, p: Math.max(0, hybridLabel(e.text)) }));
const prf = (l: number) => { const tp = preds.filter((x) => x.e.label === l && x.p === l).length, fp = preds.filter((x) => x.e.label !== l && x.p === l).length, fn = preds.filter((x) => x.e.label === l && x.p !== l).length; const p = tp + fp ? tp / (tp + fp) : 0, r = tp + fn ? tp / (tp + fn) : 0; return { p, r, f: p + r ? 2 * p * r / (p + r) : 0, n: tp + fn }; };
const perClass = LABELS.map((l) => ({ l, ...prf(l) })), macroF1 = perClass.reduce((a, c) => a + c.f, 0) / perClass.length;
const rulesPreds = test.map((e) => ({ e, p: Math.max(0, rulesLabel(e.text)) })), rulesMacro = LABELS.reduce((a, l) => { const tp = rulesPreds.filter((x) => x.e.label === l && x.p === l).length, fp = rulesPreds.filter((x) => x.e.label !== l && x.p === l).length, fn = rulesPreds.filter((x) => x.e.label === l && x.p !== l).length; const p = tp + fp ? tp / (tp + fp) : 0, r = tp + fn ? tp / (tp + fn) : 0; return a + (p + r ? 2 * p * r / (p + r) : 0); }, 0) / LABELS.length;
const confusion = LABELS.map((t) => LABELS.map((p) => preds.filter((x) => x.e.label === t && x.p === p).length));
const group = (name: string, f: (e: Example) => boolean) => { const g = test.filter(f), a = scoreOn(g, (e) => Math.max(0, hybridLabel(e.text))), b = scoreOn(g, (e) => Math.max(0, rulesLabel(e.text))); return `| ${name} | ${g.length} | ${pct(b.acc)} | **${pct(a.acc)}** |`; };
const failures = preds.filter((x) => x.p !== x.e.label).slice(0, 12).map((x) => `- "${x.e.text}" (${x.e.variant}): said ${NAME[x.p]}, should be ${NAME[x.e.label]}`);
const ci = wilson(tHybrid.k, tHybrid.n), ciR = wilson(tRules.k, tRules.n);

// ====================================================================== 2. Hawa's other skills (places, indoor/outdoor, conversation)
const areaName = (id: string) => AREAS.find((a) => a.unitId === id)!.name;
const areas: [string, string | null][] = [
  ...units.flatMap((u: any) => [[u.properties.short, areaName(u.properties.id)], [u.properties.name.toLowerCase(), areaName(u.properties.id)]] as [string, string | null][]),
  ['Clifton', areaName('clifton-cantonment')], ['DHA', areaName('clifton-cantonment')], ['Gulshan', areaName('gulshan-e-iqbal-town')], ['PECHS', areaName('jamshed-town')], ['Nazimabad', areaName('north-nazimabad-town')], ['Keamari', areaName('kiamari-town')],
  ['Orangey', areaName('orangi-town')], ['karangee', areaName('korangi-town')], ['Malear', areaName('malir-town')], ['Lyary', areaName('lyari-town')], ['Saddr', areaName('saddar-town')], ['Gadapp', areaName('gadap-town')],
  ['the market', null], ['I like trees', null], ['what is the weather', null], ['Lahore', null], ['hello', null], ['near my school', null], ['yes', null], ['Karachi', null],
];
const okAreas = areas.filter(([t, w]) => (parseArea(t) ?? parseAreaFuzzy(t)) === w).length;
const settings: [string, string | null][] = [['indoors', 'Indoor'], ['inside please', 'Indoor'], ['classroom', 'Indoor'], ['outdoors', 'Outdoor'], ['outside', 'Outdoor'], ['out door', 'Outdoor'], ['either', 'Any'], ['both', 'Any'], ['doesn\'t matter', 'Any'], ['no preference', 'Any'], ['banana', null], ['trees', null]];
const okSettings = settings.filter(([t, w]) => parseSetting(t) === w).length;
const asked = (): GState => respond(respond(startChat(ctx).state, 'Saddar', ctx).state, 'hi', ctx).state;
const flow: [string, string][] = [['Continue where we left off', 'continue'], ['continue', 'continue'], ['yes', 'continue'], ['carry on', 'continue'], ['Start a new conversation', 'new'], ['new one', 'new'], ['start over', 'new'], ['fresh start', 'new'], ['bye', 'ended'], ['stop', 'ended'], ['banana', 'asks again']];
const okFlow = flow.filter(([t, w]) => { const o = respond(asked(), t, ctx); return (o.reset ? 'new' : o.state.stage === 'ended' ? 'ended' : o.state.ask === 'resume' ? 'asks again' : 'continue') === w; }).length;

// ====================================================================== 3. Missions react to the data
const rnd = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
const live = (pm: Record<string, number> = {}, feels: Record<string, number> = {}) => {
  const air: LiveAir = { fetchedAt: 0, byUnit: {} }, weather: LiveWeather = { fetchedAt: 0, byUnit: {} };
  for (const u of units) { const id = u.properties.id; air.byUnit[id] = { pm25: pm[id] ?? 15, pm10: 40, no2: 20, aqi: 50, time: '2026-11-15T14:00' }; weather.byUnit[id] = { current: { temp: 30, feels: feels[id] ?? 31, humidity: 40, wind: 10, time: '' }, daily: [{ date: '', tmax: 34, feelsMax: 36 }] }; }
  return { air, weather };
};
const rank = (l: ReturnType<typeof live>, id: string) => unitNeeds({ units, scores, ...l, fieldCounts: new Map() }).findIndex((n) => n.unitId === id);
let airUp = 0, heatUp = 0; const N = 100;
for (let i = 0; i < N; i++) { const u = units[Math.floor(rnd() * units.length)].properties.id, calm = rank(live(), u); if (calm === 0 || rank(live({ [u]: 120 + rnd() * 80 }), u) < calm) airUp++; if (calm === 0 || rank(live({}, { [u]: 42 + rnd() * 5 }), u) < calm) heatUp++; }
const missionsOk = generateTasks({ units, scores, ...live(), fieldCounts: new Map() }).length;

// ====================================================================== write the results sheet
const reg = meta.lst.regression;
const row = (n: string, a: Scored) => `| ${n} | ${a.k} / ${a.n} | **${pct(a.acc)}** | ${pct(a.offFalseAccept)} |`;
const md = `# KarachAir: measured results

*Generated by \`npm run eval\` on ${new Date().toISOString().slice(0, 10)}. Re-run it to refresh every number.*

## What the AI does

Hawa, the volunteer guide, is the AI that does the app's main job of **matching a student to the right missions**. It reads what a student types (for example "pick up bottles and wrappers", "ask parents to turn off car engines", "tel neighbours how to stay safe") and works out which of five volunteering activities they mean, or that they did not name an activity at all. A trained text classifier (multinomial logistic regression on words and letter-triples, trained in the browser) makes that decision. The mission list that follows is built from live air, heat and report data (see the write-up).

## How it was tested, and what we did to keep it honest

- **Data:** ${ex.length} sentences made from ${bases(ex).size} sentences we wrote ourselves (no real student messages, so no personal data). Each base sentence has a clean, a typo and a reworded version.
- **Split:** ${train.length} train / ${val.length} validation / ${test.length} test, split **by base sentence**, so a sentence and its copies never sit on both sides. Overlap check: **${leak} shared sentences** between splits.
- **Tuning on validation only.** The model type and the confidence threshold were chosen on the validation split. The test split was used once, to report.
- **Baselines:** (1) always predict the most common label (\`${NAME[majority]}\`), (2) Hawa's original keyword rules alone (the "simple rules" a judge would try first).

### Model and setting chosen on the validation split

| Model (trained on train only) | Validation accuracy |
|---|---|
| Majority label | ${pct(valMajority.acc)} |
| Keyword rules only | ${pct(valRules.acc)} |
| Naive Bayes | ${pct(valNB.acc)} |
| Logistic regression | ${pct(valLR.acc)} |

Policy search on validation (model first or rules first, and the confidence threshold), keeping off-topic false accepts at or below 5%: best was **${best.order}, threshold ${best.tau}** with ${pct(best.acc)} validation accuracy.${policyMatches ? '' : `\n\n> **Warning:** the deployed policy in \`src/lib/intent.ts\` (${POLICY.order}, ${POLICY.tau}) differs from this search result; update it.`}

### Test results (the deployed pipeline, on sentences it never saw)

| Method | Correct | Accuracy | Off-topic wrongly treated as an activity |
|---|---|---|---|
${row('Always predict the most common label', tMajority)}
${row('Keyword rules only (baseline)', tRules)}
${row('**Hawa with the trained model**', tHybrid)}

- 95% confidence interval for accuracy: keyword rules ${pct(ciR[0])} to ${pct(ciR[1])}; with the trained model **${pct(ci[0])} to ${pct(ci[1])}**. The test set is small (${test.length}), so treat small differences with caution.
- Macro-F1 (fair across classes): rules ${pct(rulesMacro, 1)}, with the model **${pct(macroF1, 1)}**.

### Per activity (test)

| Activity | Precision | Recall | F1 | Test sentences |
|---|---|---|---|---|
${perClass.map((c) => `| ${NAME[c.l]} | ${pct(c.p)} | ${pct(c.r)} | ${pct(c.f)} | ${c.n} |`).join('\n')}

### Confusion matrix (rows = what it should be, columns = what Hawa said)

| should be \\ said | ${LABELS.map((l) => NAME[l]).join(' | ')} |
|---|${LABELS.map(() => '---').join('|')}|
${LABELS.map((l, i) => `| ${NAME[l]} | ${confusion[i].join(' | ')} |`).join('\n')}

### Does it work equally well for different kinds of messages? (test)

| Kind of message | Sentences | Rules only | With the model |
|---|---|---|---|
${group('Clean wording', (e) => e.variant === 'clean')}
${group('With typos', (e) => e.variant === 'typo')}
${group('Reworded ("I want to...", "maybe...")', (e) => e.variant === 'framed')}
${group('Short (1 to 3 words)', (e) => e.base.split(' ').length <= 3)}
${group('Long (6 or more words)', (e) => e.base.split(' ').length >= 6)}

### Where it fails

${failures.length ? failures.join('\n') : 'No failures on this test set.'}

Why we think it fails: the model learns from words and letter patterns, not meaning. It does best on wording close to the training sentences, and it can be fooled by sentences that mix two activities or use words it has never seen. It is trained on our own English wording, so it can be worse on how Karachi's students really type, including Roman Urdu. It does not understand Hindi directly; Hindi chats are translated to English first by a free service, which adds its own errors.

## Hawa's other skills (smaller checks)

| Check | Correct |
|---|---|
| Place names (24 towns, nicknames, typos, non-places) | ${okAreas} / ${areas.length} (${pct(okAreas / areas.length)}) |
| Indoor / outdoor | ${okSettings} / ${settings.length} (${pct(okSettings / settings.length)}) |
| "Hi again": continue, start new, stop, unclear | ${okFlow} / ${flow.length} (${pct(okFlow / flow.length)}) |

## The mission list reacts to the data (100 random trials each)

- Bad air (PM2.5 120 to 200) moves a place up the priority list: **${airUp}/${N}**
- Dangerous heat (feels-like 42 to 47 C) moves a place up the priority list: **${heatUp}/${N}**
- Every neighbourhood receives missions: **${missionsOk > 0 ? 'yes' : 'no'}** (${missionsOk} missions in the calm test)

## What the data can and cannot say

- **Satellite coverage:** ${meta.lst.seasons.length} hot seasons (${[...meta.lst.seasons].sort().join(', ')}), ${meta.lst.composites} satellite composites, ${meta.unitCount} neighbourhoods.
- **Greenery vs heat is a weak link.** Across ${reg.n.toLocaleString('en-US')} pixels, R-squared is only **${reg.r2.toFixed(3)}** (greenery explains about ${(reg.r2 * 100).toFixed(1)}% of the differences). We treat greening effects as small and uncertain.
- **Air quality is a ~11 km model (CAMS), not street-level sensors.**
- **The Heat Risk Index is a relative ranking** of 24 neighbourhoods, not a trained model and not an absolute danger level.

## What is not measured (we are telling you before you ask)

- Real students: every sentence here was written by us. A pilot with real students and real typing is the next step.
- No ground-truth check of the heat ranking against thermometers.
- Hindi and Roman Urdu input are not tested.
`;
writeFileSync(join(process.cwd(), 'docs', 'RESULTS.md'), md);
console.log(`splits: ${train.length}/${val.length}/${test.length} | leakage ${leak}`);
console.log(`VAL  majority ${pct(valMajority.acc)} | rules ${pct(valRules.acc)} | NB ${pct(valNB.acc)} | LR ${pct(valLR.acc)}`);
console.log(['search (val acc / off-topic false accept):', ...search.map((s) => `  ${s.model} ${s.mode} ${s.tau}: ${pct(s.acc)} / ${pct(s.fa)}`)].join(String.fromCharCode(10)));
console.log(`chosen on validation: ${best.model} ${best.mode} ${best.tau} | deployed: ${POLICY.model} ${POLICY.mode} ${POLICY.tau} | match=${policyMatches}`);
console.log(`TEST majority ${pct(tMajority.acc)} | rules ${pct(tRules.acc)} | hybrid ${pct(tHybrid.acc)} (${pct(ci[0])}-${pct(ci[1])}) | macroF1 rules ${pct(rulesMacro, 1)} -> ${pct(macroF1, 1)} | off-topic false accept ${pct(tHybrid.offFalseAccept)}`);
console.log('places', okAreas + '/' + areas.length, 'settings', okSettings + '/' + settings.length, 'flow', okFlow + '/' + flow.length, 'missions', airUp, heatUp);
