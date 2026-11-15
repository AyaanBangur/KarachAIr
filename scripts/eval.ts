// Measures how well the volunteer guide and the mission generator work, on a labelled test set, and writes docs/RESULTS.md.
// Run with `npm run eval`. The sentences are written by us (not by real students), which the results sheet says openly.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AREAS, TYPES, parseArea, parseAreaFuzzy, parseSetting, parseTypes, registerAreas, respond, startChat, type GCtx, type GState } from '../src/lib/guide';
import { computeBaseline, DEFAULT_WEIGHTS, scoreAll } from '../src/lib/risk';
import { generateTasks, unitNeeds } from '../src/lib/needs';
import { intentSwitch } from '../src/lib/intent';
import { INTENT_TRAINING } from '../src/lib/intentData';
import type { LiveAir, LiveWeather } from '../src/lib/hooks';

const dir = join(process.cwd(), 'public', 'data');
const units = JSON.parse(readFileSync(join(dir, 'units.geojson'), 'utf8')).features;
const meta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8'));
registerAreas(units);
const scores = scoreAll(units, computeBaseline(units), DEFAULT_WEIGHTS);
const ctx: GCtx = { name: 'Amina', tasks: [], airFor: () => ({ pm25: 10, label: 'Good', outdoorOk: true, triggered: [] }), today: 'today', rng: () => 0 };

interface Result { name: string; correct: number; total: number; misses: string[] }
const score = <T>(name: string, cases: [string, T][], run: (t: string) => T, same: (a: T, b: T) => boolean = (a, b) => a === b): Result => {
  const misses: string[] = []; let ok = 0;
  for (const [text, want] of cases) { const got = run(text); if (same(got, want)) ok++; else misses.push(`"${text}": got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`); }
  return { name, correct: ok, total: cases.length, misses };
};
const areaName = (id: string) => AREAS.find((a) => a.unitId === id)!.name;
const arr = (a: number[] | null, b: number[] | null) => JSON.stringify(a) === JSON.stringify(b);

// ---- 1. Areas: how people really write places (official names, short names, nicknames, typos, speech-to-text slips)
const areas: [string, string | null][] = [
  ...units.flatMap((u: any) => [[u.properties.short, areaName(u.properties.id)], [u.properties.name.toLowerCase(), areaName(u.properties.id)]] as [string, string | null][]),
  ['Clifton', areaName('clifton-cantonment')], ['DHA', areaName('clifton-cantonment')], ['Defence', areaName('clifton-cantonment')], ['Gulshan', areaName('gulshan-e-iqbal-town')], ['PECHS', areaName('jamshed-town')],
  ['Nazimabad', areaName('north-nazimabad-town')], ['Keamari', areaName('kiamari-town')], ['near university road', areaName('gulshan-e-iqbal-town')], ['I live in Korangi', areaName('korangi-town')],
  ['Orangey', areaName('orangi-town')], ['karangee', areaName('korangi-town')], ['Malear', areaName('malir-town')], ['Lyary', areaName('lyari-town')], ['Saddr', areaName('saddar-town')], ['Gadapp', areaName('gadap-town')],
  ['Liyaquatabad', areaName('liaquatabad-town')], ['Landi', areaName('landhi-town')], ['Baldiya', areaName('baldia-town')],
  ['the market', null], ['I like trees', null], ['what is the weather', null], ['Lahore', null], ['Islamabad', null], ['hello', null], ['near my school', null], ['yes', null], ['Karachi', null],
];
const areaResult = score('Places (24 towns, nicknames, typos, and sentences that are not places)', areas, (t) => parseArea(t) ?? parseAreaFuzzy(t));

// ---- 2. Activities, measured through the REAL chat path (rules, typo-correction, then the trained fallback).
// The paraphrases below are NOT in the classifier's training phrases (src/lib/intentData.ts).
const A: Record<number, string[]> = {
  1: ['tidy up the neighbourhood rubbish', 'stop trash being set on fire', 'clear the plastic from the drain', 'sort recyclables at school', 'help get rid of garbage heaps', 'pick up bottles and wrappers', 'burning of leaves and rubbish', 'make the lanes clean'],
  2: ['ask parents to turn off car engines', 'fewer cars idling near the school', 'persuade drivers to stop idling', 'fumes from vehicles at drop off', 'share rides to school', 'public bus instead of private cars', 'tackle exhaust smoke from buses', 'hold a placard at the traffic signal'],
  3: ['plant more trees in our area', 'help saplings grow', 'make a green belt against dust', 'water the new plants after school', 'less dust through greenery', 'grow neem trees', 'put seedlings in the ground', 'shade trees on the road'],
  4: ['give people face masks', 'talk to families about air health', 'poster about staying safe in smog', 'hydration and cooling help for labourers', 'run a safety awareness session', 'tell people to protect their lungs', 'share health tips', 'explain asthma risks to students'],
  5: ['measure how hot the ground is', 'record the numbers daily', 'look after our air monitor', 'chart the pollution readings', 'collect temperature observations', 'help scientists with measurements', 'make a graph from our data', 'check readings on the thermometer'],
};
const exact: [string, number[] | null][] = [
  ...TYPES.map((t) => [t.name, [t.id]] as [string, number[] | null]), ['trees and masks', [3, 4]], ['plant trees, measure data', [3, 5]], ['everything', [1, 2, 3, 4, 5]], ['surprise me', [1, 2, 3, 4, 5]],
  ['plantin trees', [3]], ['tres', [3]], ['recycilng', [1]], ['sensers', [5]],
];
const paraphrases: [string, number[] | null][] = Object.entries(A).flatMap(([l, ts]) => ts.map((t) => [t, [Number(l)]] as [string, number[] | null]));
const offTopic: [string, number[] | null][] = ['i like cricket', 'what is for lunch', 'maybe next week', 'tell me about yourself', 'is it going to rain', 'okay whatever', 'my phone is dead', 'how old are you', 'play a song', 'good night'].map((t) => [t, null]);
const viaChat = (text: string): number[] | null => { const s0 = respond(startChat(ctx).state, 'Saddar', ctx).state; const o = respond(s0, text, ctx); return o.state.stage === 'types' ? null : o.state.profile.types; };
const activityRun = (label: string) => [
  score(`${label}: the six buttons, combinations and typos`, exact, viaChat, arr),
  score(`${label}: new paraphrases it was never given`, paraphrases, viaChat, arr),
  score(`${label}: off-topic answers correctly NOT treated as an activity`, offTopic, viaChat, arr),
];
intentSwitch.enabled = false; const rulesOnly = activityRun('Activities, keyword rules only');
intentSwitch.enabled = true; const withModel = activityRun('Activities, rules + trained classifier');


// ---- 3. Indoor / outdoor
const settings: [string, string | null][] = [['indoors', 'Indoor'], ['inside please', 'Indoor'], ['classroom', 'Indoor'], ['outdoors', 'Outdoor'], ['outside', 'Outdoor'], ['out door', 'Outdoor'], ['either', 'Any'], ['both', 'Any'], ['doesn\'t matter', 'Any'], ['no preference', 'Any'], ['banana', null], ['trees', null]];
const settingResult = score('Indoor / outdoor', settings, (t) => parseSetting(t));

// ---- 4. Conversation: saying hi again, continue / new, stopping
const asked = (): GState => respond(respond(startChat(ctx).state, 'Saddar', ctx).state, 'hi', ctx).state;
const flow: [string, string][] = [
  ['Continue where we left off', 'continue'], ['continue', 'continue'], ['yes', 'continue'], ['carry on', 'continue'], ['the old one', 'continue'], ['resume', 'continue'],
  ['Start a new conversation', 'new'], ['new one', 'new'], ['start over', 'new'], ['fresh start', 'new'], ['restart', 'new'],
  ['bye', 'ended'], ['stop', 'ended'], ['banana', 'asks again'],
];
const flowResult = score('Hi-again prompt: continue, start new, stop, or unclear', flow, (t) => {
  const o = respond(asked(), t, ctx);
  return o.reset ? 'new' : o.state.stage === 'ended' ? 'ended' : o.state.ask === 'resume' ? 'asks again' : 'continue';
});
const greets = ['hi', 'hello', 'hey', 'salam', 'Hi!', 'hello hello'];
const greetResult = score('Greetings are answered and the conversation goes on', greets.map((g) => [g, 'ok'] as [string, string]), (g) => { const o = respond(startChat(ctx).state, g, ctx); return o.msgs.length >= 2 && o.state.stage === 'area' ? 'ok' : 'bad'; });

// ---- 5. Mission generator: does bad air or dangerous heat move a place up the list?
const rnd = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
const live = (pm: Record<string, number> = {}, feels: Record<string, number> = {}) => {
  const air: LiveAir = { fetchedAt: 0, byUnit: {} }, weather: LiveWeather = { fetchedAt: 0, byUnit: {} };
  for (const u of units) { const id = u.properties.id; air.byUnit[id] = { pm25: pm[id] ?? 15, pm10: 40, no2: 20, aqi: 50, time: '2026-11-15T14:00' }; weather.byUnit[id] = { current: { temp: 30, feels: feels[id] ?? 31, humidity: 40, wind: 10, time: '' }, daily: [{ date: '', tmax: 34, feelsMax: 36 }] }; }
  return { air, weather };
};
const rank = (l: ReturnType<typeof live>, id: string) => unitNeeds({ units, scores, ...l, fieldCounts: new Map() }).findIndex((n) => n.unitId === id);
let airUp = 0, heatUp = 0, airTask = 0, heatTask = 0; const N = 100;
for (let i = 0; i < N; i++) {
  const u = units[Math.floor(rnd() * units.length)].properties.id, calm = rank(live(), u);
  const smoky = live({ [u]: 120 + rnd() * 80 }), hot = live({}, { [u]: 42 + rnd() * 5 });
  if (calm === 0 || rank(smoky, u) < calm) airUp++; if (calm === 0 || rank(hot, u) < calm) heatUp++;
  if (generateTasks({ units, scores, ...smoky, fieldCounts: new Map() }).some((t) => t.unitId === u && t.focus === 'air' && t.need > 55)) airTask++;
  if (generateTasks({ units, scores, ...hot, fieldCounts: new Map() }).some((t) => t.unitId === u && t.focus === 'heat')) heatTask++;
}
const mission = [
  `Bad air (PM2.5 120-200) moves a place up the priority list: **${airUp}/${N}** random places`,
  `Dangerous heat (feels-like 42-47 C) moves a place up the priority list: **${heatUp}/${N}**`,
  `Bad air creates a high-need air mission there: **${airTask}/${N}**`,
  `Dangerous heat creates a heat mission there: **${heatTask}/${N}**`,
];

const results = [areaResult, ...rulesOnly, ...withModel, settingResult, flowResult, greetResult];
const pct = (r: Result) => `${Math.round((r.correct / r.total) * 100)}%`;
const reg = meta.lst.regression;
const md = `# KarachAir: measured results

*Generated by \`npm run eval\` on ${new Date().toISOString().slice(0, 10)}. Re-run it to refresh the numbers.*

## What was measured, and how honestly

The test sentences were written by us, not collected from real students, so these numbers show that the logic behaves as designed on realistic wording. They are **not** a user study. A pilot with real students is the next step (see "What is not measured").

## 1. The volunteer guide (Hawa) understands what people type

| Test | Correct | Accuracy |
|---|---|---|
${results.map((r) => `| ${r.name} | ${r.correct} / ${r.total} | **${pct(r)}** |`).join('\n')}

${results.some((r) => r.misses.length) ? '### Where it still fails\n\n' + results.filter((r) => r.misses.length).map((r) => `**${r.name}**\n\n` + r.misses.map((m) => `- ${m}`).join('\n')).join('\n\n') : 'No misses on this set.'}

### About the trained classifier

Hawa's keyword rules answer first. When they do not recognise an answer to the activity question, a small **trained** text classifier (multinomial Naive Bayes over words and letter-triples, ${INTENT_TRAINING.length} labelled phrases, trained in the browser at start-up) gets a chance, and it only answers when it is at least 90% sure; otherwise Hawa simply asks again. On phrases it was never trained on, this lifts understanding from **${pct(rulesOnly[1])} to ${pct(withModel[1])}** while keeping off-topic answers at **${pct(withModel[2])}** correct. Caveats: the test set is small (40 + 10 phrases), written by us, and the 90% threshold was chosen after looking at it, so treat the numbers as optimistic.

## 2. Missions react to the data (100 random trials each)

${mission.map((m) => `- ${m}`).join('\n')}

## 3. What the data can and cannot say

- **Satellite coverage:** ${meta.lst.seasons.length} hot seasons (${[...meta.lst.seasons].sort().join(', ')}), ${meta.lst.composites} satellite composites, ${meta.unitCount} neighbourhoods.
- **Greenery vs heat is a weak link.** Across ${reg.n.toLocaleString('en-US')} pixels, each +0.1 of vegetation (NDVI) goes with about ${reg.slopePer0p1Ndvi.toFixed(2)} C cooler afternoon surface, but R-squared is only **${reg.r2.toFixed(3)}** (greenery explains about ${(reg.r2 * 100).toFixed(1)}% of the differences between pixels). We therefore treat greening effects as small and uncertain, and we do not use this relationship to promise cooling.
- **Air quality is a ~11 km model (CAMS), not street-level sensors.** A school gate can differ from the number shown.
- **The Heat Risk Index is a relative ranking** (best to worst among 24 units), not an absolute danger scale, and not a trained model.

## What is not measured (we are telling you before you ask)

- No pilot with real students or coordinators yet. Mission acceptance, completion and verification rates are unknown.
- The Heat Risk Index has not been validated against ground thermometer readings, because the field-observation screen was replaced by missions. That is the first thing a pilot should collect.
- Hawa was tested on sentences we wrote; real teenage typing and speech-to-text will be messier.
`;
writeFileSync(join(process.cwd(), 'docs', 'RESULTS.md'), md);
console.log(md.split('## 2.')[0]);
console.log(mission.join('\n'));
