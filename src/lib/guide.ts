// "Hawa", the KarachAir volunteer guide: a RULE-BASED, scripted assistant (keywords and regular expressions only).
// It is not a person and not an AI language model, and it says so. The logic is pure so it can be tested without the UI.

export const BOT_NAME = 'Hawa';
/** Every example task is a 2-hour task, so the guide no longer asks how much time a student has. */
export const DEFAULT_HOURS = 2;

// ------------------------------------------------------------------ data
export interface Area { name: string; lat: number; lon: number; unitId: string; aliases: string[] }
/** Spec areas, each mapped to the nearest KarachAir unit so live air quality can be looked up (approximate). */
export const AREAS: Area[] = [
  { name: 'Saddar', lat: 24.860, lon: 67.010, unitId: 'saddar-town', aliases: ['saddar', 'sadar', 'sadr'] },
  { name: 'Korangi', lat: 24.830, lon: 67.130, unitId: 'korangi-town', aliases: ['korangi'] },
  { name: 'Malir', lat: 24.893, lon: 67.200, unitId: 'malir-town', aliases: ['malir'] },
  { name: 'Orangi', lat: 24.950, lon: 66.990, unitId: 'orangi-town', aliases: ['orangi'] },
  { name: 'Lyari', lat: 24.855, lon: 66.998, unitId: 'lyari-town', aliases: ['lyari'] },
  { name: 'University Road', lat: 24.933, lon: 67.115, unitId: 'gulshan-e-iqbal-town', aliases: ['university road', 'university rd', 'uni road', 'uni rd', 'university'] },
  { name: 'Shahrah-e-Faisal', lat: 24.870, lon: 67.080, unitId: 'jamshed-town', aliases: ['shahrah-e-faisal', 'shahrah e faisal', 'shara e faisal', 'shahrah', 'faisal'] },
];
export interface VType { id: number; name: string; emoji: string; key: string }
export const TYPES: VType[] = [
  { id: 1, name: 'Clean up waste & burning', emoji: '♻️', key: 'waste' }, { id: 2, name: 'Traffic no-idling shifts', emoji: '🚗', key: 'traffic' },
  { id: 3, name: 'Plant trees & fight dust', emoji: '🌳', key: 'trees' }, { id: 4, name: 'Health awareness & mask drives', emoji: '😷', key: 'health' }, { id: 5, name: 'Track air & heat data', emoji: '📡', key: 'sensors' },
];
/** A task generated from live data and the report (see needs.ts). Nothing is preset. */
export interface Task { id: string; type: number; title: string; area: string; lat: number; lon: number; indoor: boolean; hours: number; unitId: string; focus: 'air' | 'heat'; reason: string; need: number }
/** Extra names people use for Karachi towns (so "Clifton", "DHA", "PECHS" or "Nazimabad" are all understood). */
const EXTRA_ALIASES: Record<string, string[]> = {
  'clifton-cantonment': ['clifton', 'dha', 'defence', 'defense', 'clifton cantt', 'clifton cantonment'],
  'gulshan-e-iqbal-town': ['gulshan', 'gulshan e iqbal'], 'jamshed-town': ['jamshed', 'pechs', 'tariq road', 'jamshed road'],
  'north-nazimabad-town': ['north nazimabad', 'nazimabad', 'n nazimabad'], 'liaquatabad-town': ['liaquatabad', 'lalukhet'],
  'kiamari-town': ['kiamari', 'keamari'], 'bin-qasim-town': ['bin qasim', 'port qasim'], 'site-town': ['site town', 'sindh industrial'],
  'gulberg-town': ['gulberg', 'federal b area'], 'karachi-cantonment': ['karachi cantt', 'karachi cantonment'], 'faisal-cantonment': ['faisal cantt', 'faisal cantonment'],
  'malir-cantonment': ['malir cantt', 'malir cantonment'], 'korangi-creek-cantonment': ['korangi creek'], 'manora-cantonment': ['manora'],
};
const cleanName = (x: string) => x.toLowerCase().replace(/\./g, '').replace(/[^a-z\- ]/g, ' ').replace(/\s+/g, ' ').trim();
/** Make every one of Karachi's units a place Hawa understands (the 7 curated places above plus all the others, from the map data). */
export function registerAreas(units: { properties: { id: string; name: string; short: string; centroid: [number, number] } }[]) {
  for (const u of units) {
    const p = u.properties, extras = EXTRA_ALIASES[p.id] ?? [];
    const own = AREAS.find((a) => a.unitId === p.id);
    const names = [p.short, p.name, p.name.replace(/ (town|cantonment)$/i, ''), ...extras].map(cleanName).filter(Boolean);
    if (own) { own.aliases = [...new Set([...own.aliases, ...names.filter((n) => !['university', 'faisal'].includes(n))])]; continue; }
    AREAS.push({ name: p.short, lat: p.centroid[1], lon: p.centroid[0], unitId: p.id, aliases: [...new Set(names)] });
  }
}
export const areaOf = (name: string | null) => AREAS.find((a) => a.name === name) ?? null;
export const typeOf = (id: number) => TYPES.find((t) => t.id === id)!;

export function haversine(lat1: number, lon1: number, lat2: number, lon2: number) {
  const r = (d: number) => (d * Math.PI) / 180, a = Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lon2 - lon1) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
export const taskPos = (t: Task) => ({ lat: t.lat, lon: t.lon });
const HIGH = 55;

// ------------------------------------------------------------------ state
export type Setting = 'Indoor' | 'Outdoor' | 'Any';
export interface Profile { /** first name from the account, never asked in the chat */ nick: string | null; area: string | null; types: number[]; setting: Setting | null; hours: number | null; radius: number }
export type Stage = 'area' | 'types' | 'setting' | 'tasks' | 'more' | 'ended';
export interface GState { stage: Stage; profile: Profile; pool: string[]; shown: number; decisions: Record<string, 'accept' | 'decline'>; fails: number }
export interface AirInfo { pm25: number | null; label: string; outdoorOk: boolean; triggered: number[] }
export interface GCtx { /** first name of the signed-in volunteer */ name?: string; /** tasks generated from live data, highest need first */ tasks: Task[]; airFor: (area: string | null) => AirInfo; today: string; rng?: () => number }
export interface TaskView { task: Task; distKm: number; needed: boolean }
export interface BotMsg { text: string; chips?: string[]; tasks?: TaskView[] }
export interface Out { state: GState; msgs: BotMsg[] }

export const freshState = (nick: string | null = null): GState => ({ stage: 'area', profile: { nick, area: null, types: [], setting: null, hours: DEFAULT_HOURS, radius: 15 }, pool: [], shown: 0, decisions: {}, fails: 0 });
const pick = <T,>(a: T[], ctx: GCtx): T => a[Math.floor((ctx.rng ?? Math.random)() * a.length)];
const clone = (s: GState): GState => ({ ...s, profile: { ...s.profile, types: [...s.profile.types] }, pool: [...s.pool], decisions: { ...s.decisions } });

// ------------------------------------------------------------------ parsers

// ------------------------------------------------------------------ forgiving matching (typos, speech-to-text slips)
/** A rough "how it sounds" key, so "Orangey", "Orangee" and "Orangi" all become the same thing. */
const phon = (w: string) => w.toLowerCase().replace(/[^a-z]/g, '')
  .replace(/ph/g, 'f').replace(/ck/g, 'k').replace(/c(?![ei])/g, 'k').replace(/c/g, 's').replace(/q/g, 'k').replace(/x/g, 'ks')
  .replace(/ee|ea|ey|ie|ei|ay|y/g, 'i').replace(/oo|ou|u/g, 'o').replace(/e/g, 'i').replace(/j/g, 'g').replace(/w/g, 'v').replace(/z/g, 's')
  .replace(/h/g, '').replace(/(.)\1+/g, '$1');
function lev(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)] as number[]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
/** How many slips we forgive for a word of this length (short words must match exactly, so we do not guess wildly). */
const allowed = (len: number) => (len <= 4 ? 0 : len <= 6 ? 1 : len <= 10 ? 2 : 3);
const wordsOf = (t: string) => t.toLowerCase().split(/[^a-z]+/).filter(Boolean);
/** Closest vocabulary word for a (possibly misspelt) word, or null when nothing is close enough or two words tie. */
function nearest(word: string, vocab: string[]): string | null {
  const w = phon(word);
  if (w.length < 4) return null;
  let best: string | null = null, bd = Infinity, tie = false;
  for (const v of vocab) {
    const pv = phon(v), d = lev(w, pv);
    if (d > allowed(pv.length) || Math.abs(w.length - pv.length) > 2) continue;
    if (d < bd) { bd = d; best = v; tie = false; } else if (d === bd && best && phon(best) !== pv) tie = true;
  }
  return tie ? null : best;
}
/** Re-spell each word of the answer to the nearest word this question could expect. */
const correct = (t: string, vocab: string[]) => wordsOf(t).map((w) => (vocab.includes(w) ? w : nearest(w, vocab) ?? w)).join(' ');
const TYPE_WORDS = ['trash', 'waste', 'garbage', 'recycling', 'burning', 'litter', 'compost', 'plastic', 'traffic', 'cars', 'idling', 'engines', 'carpool', 'bus', 'rickshaw', 'commute', 'trees', 'plant', 'planting', 'saplings', 'garden', 'green', 'dust', 'water', 'forest', 'masks', 'health', 'posters', 'awareness', 'campaign', 'notices', 'sensors', 'data', 'monitoring', 'science', 'measure', 'research', 'everything', 'anything'];
const SETTING_WORDS = ['indoor', 'indoors', 'outdoor', 'outdoors', 'inside', 'outside', 'classroom', 'either', 'both'];

export function parseArea(t: string): string | null {
  const l = t.toLowerCase();
  const all = AREAS.flatMap((a) => a.aliases.map((al) => ({ a: a.name, al }))).sort((x, y) => y.al.length - x.al.length);
  const hit = all.find(({ al }) => new RegExp(`(^|[^a-z])${al.replace(/[-]/g, '[- ]')}($|[^a-z])`).test(l))?.a;
  if (hit) return hit;
  return l.trim() === 'site' ? AREAS.find((a) => a.unitId === 'site-town')?.name ?? null : null;
}
/** Used only while the guide is asking for the area: "Orangey" or "Korangee" still means Orangi / Korangi. */
export function parseAreaFuzzy(t: string): string | null {
  const ws = wordsOf(t); let best: string | null = null, bd = Infinity, tie = false;
  for (const a of AREAS) for (const al of a.aliases) {
    const pa = phon(al);
    for (let n = 1; n <= 3; n++) for (let i = 0; i + n <= ws.length; i++) {
      const w = phon(ws.slice(i, i + n).join(''));
      if (w.length < 4) continue;
      const d = lev(w, pa);
      if (d > allowed(pa.length)) continue;
      if (d < bd) { bd = d; best = a.name; tie = false; } else if (d === bd && best !== a.name) tie = true;
    }
  }
  return tie ? null : best;
}
const TYPE_RE: [number, RegExp][] = [
  [1, /\b(trash|waste|garbage|recycl\w*|burn\w*|litter|compost|plastic|kachra|kooda|dhua|dhuan)/], [2, /\b(traffic|cars?|idl\w*|engines?|carpool\w*|bus(es)?|rickshaws?|commut\w*|drop-?off)/],
  [3, /\b(trees?|plant\w*|sapling\w*|garden\w*|green|dust|water\w*|forest|darakht|paudh\w*|paani|pani|mitti)/], [4, /\b(masks?|health|posters?|awareness|urdu|campaign\w*|social media|notices?)/],
  [5, /\b(sensors?|data|monitor\w*|science|measur\w*|logs?|research|tech\w*)/],
];
export function parseTypes(t: string, existing: number[]): number[] | null {
  const l = t.toLowerCase();
  if (/\b(all|any|anything|everything|surprise me|show all types)\b/.test(l) && !/\b(any ?time|any ?where|any length)\b/.test(l)) return [1, 2, 3, 4, 5];
  const found = TYPE_RE.filter(([, re]) => re.test(l)).map(([id]) => id);
  if (!found.length) return null;
  return /\balso\b|\bas well\b|\bplus\b/.test(l) ? [...new Set([...existing, ...found])].sort() : found;
}
export function parseSetting(t: string): Setting | null {
  const l = t.toLowerCase();
  const out = /\b(outdoors?|outside|out ?door)/.test(l), inn = /\b(indoors?|inside|classroom|in ?door)/.test(l);
  if ((out && inn) || /\b(either|both|doesn'?t matter|does not matter|no preference|don'?t mind)\b/.test(l)) return 'Any';
  return out ? 'Outdoor' : inn ? 'Indoor' : null;
}
export function parseHours(t: string, bare: boolean): number | null {
  const l = t.toLowerCase();
  if (/\b(flexible|any length|all day|whole day|as long as)\b/.test(l)) return 99;
  const m = l.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/);
  if (m) return Math.min(12, Math.max(1, Math.round(parseFloat(m[1]))));
  if (/\bcouple of hours\b|\ba couple\b/.test(l)) return 2;
  if (/\b(an hour|one hour|1 hour)\b|\bhalf an hour\b/.test(l)) return 1;
  if (bare) { const b = l.match(/^\s*(\d{1,2})\s*$/); if (b) return Math.min(12, Math.max(1, parseInt(b[1], 10))); }
  return null;
}
export function parseDistance(t: string): number | null {
  const m = t.toLowerCase().match(/(\d{1,2})\s*(?:km|kilomet\w+)/);
  return m ? Math.min(40, Math.max(2, parseInt(m[1], 10))) : null;
}
const isGreeting = (t: string) => /^\s*((hi|hello|hey|salam|salaam|assalam\w*|yo|hola)[\s!.,]*)+$/i.test(t);

// ------------------------------------------------------------------ matching
export function buildPool(p: Profile, ctx: GCtx): { views: TaskView[]; hiddenAir: number } {
  const a = areaOf(p.area)!;
  const air = ctx.airFor(p.area);
  let hiddenAir = 0;
  const views: TaskView[] = [];
  for (const task of ctx.tasks) {
    if (!p.types.includes(task.type)) continue;
    if (p.setting === 'Indoor' && !task.indoor) continue;
    if (p.setting === 'Outdoor' && task.indoor) continue;
    if (p.hours != null && p.hours !== 99 && task.hours > p.hours) continue;
    const pos = taskPos(task), distKm = haversine(a.lat, a.lon, pos.lat, pos.lon);
    if (distKm > p.radius) continue;
    if (!task.indoor && !air.outdoorOk) { hiddenAir++; continue; }
    views.push({ task, distKm, needed: task.need >= HIGH });
  }
  views.sort((x, y) => y.task.need - x.task.need || x.distKm - y.distKm);
  return { views, hiddenAir };
}

// ------------------------------------------------------------------ questions and acknowledgements
const missing = (p: Profile): Stage | null => (!p.area ? 'area' : !p.types.length ? 'types' : !p.setting ? 'setting' : null);
export function question(stage: Stage, ctx: GCtx): BotMsg {
  switch (stage) {
    case 'area': return { text: pick(['Which part of Karachi are you closest to?', 'Where are you based? Pick the nearest area and I\'ll look around there.', 'Which area is closest to you?'], ctx), chips: AREAS.slice(0, 12).map((a) => a.name) };
    case 'types': return { text: `What would you like to do as a volunteer? Choose the kind of activity you want to help with: ${TYPES.map((t) => t.name).join('; ')}; or Surprise me. Tap a button, or type it. You can choose more than one.`, chips: [...TYPES.map((t) => t.name), 'Surprise me'] };
    case 'setting': return { text: pick(['Would you rather be indoors, outdoors, or does it not matter?', 'Do you prefer indoor tasks, outdoor ones, or either?', 'Indoors or outdoors, which feels better to you?'], ctx), chips: ['Indoors', 'Outdoors', 'Either is fine'] };
    default: return { text: '' };
  }
}
function ack(p: Profile, was: Profile, ctx: GCtx): string {
  const parts: string[] = [];
  if (p.area && p.area !== was.area) parts.push(pick([`Got it, around ${p.area}.`, `${p.area}, noted.`, `Okay, ${p.area} it is.`], ctx));
  if (p.types.length && p.types.join() !== was.types.join()) parts.push(p.types.length === 5 ? 'Love it, a bit of everything.' : `Love it: ${p.types.map((id) => typeOf(id).name.toLowerCase()).join(', ')}.`);
  if (p.setting && p.setting !== was.setting) parts.push(p.setting === 'Any' ? 'Either setting works, great.' : `Noted, ${p.setting.toLowerCase()} tasks.`);
  if (p.radius !== was.radius) parts.push(`Searching within ${p.radius} km.`);
  return parts.join(' ');
}
const ADVICE: Record<string, string> = { Good: 'Normal outdoor activity is fine.', Moderate: 'Keep outdoor time short, especially with asthma, and consider a mask.', Hazardous: 'Stay indoors where you can, and wear a well-fitted mask if you must go out.' };
const DISCLAIMER = 'Prototype, general guidance, not medical advice.';

// ------------------------------------------------------------------ starting
export function startChat(ctx: GCtx): Out {
  const nick = ctx.name?.trim() || null;
  const air = ctx.airFor(null);
  const level = air.pm25 != null ? `${air.label.toLowerCase()}, about ${air.pm25.toFixed(0)} micrograms per cubic metre` : 'unclear because I could not load live air data';
  return { state: freshState(nick), msgs: [
    { text: `Hey${nick ? ` ${nick}` : ''}! I'm ${BOT_NAME}. Quick heads-up so there's no confusion: I'm an automated assistant, not a real person. But I'd love to help you find something good to do for Karachi's air.` },
    { text: `Air-wise, ${ctx.today} looks ${level}, so I'll keep that in mind. If you'd rather talk than type, tap the Hands-free button at the top and I'll listen.` },
    question('area', ctx),
  ] };
}

// ------------------------------------------------------------------ building the list
function list(state: GState, ctx: GCtx, lead: string): Out {
  const s = clone(state), p = s.profile;
  const { views, hiddenAir } = buildPool(p, ctx);
  s.pool = views.map((v) => v.task.id); s.shown = Math.min(6, views.length); s.stage = 'tasks'; s.fails = 0;
  const msgs: BotMsg[] = [{ text: `${lead}That's everything I need. Give me a moment to find your matches.`.trim() }];
  const air = ctx.airFor(p.area);
  if (!views.length) {
    msgs.push({ text: `I couldn't find tasks that fit all of that${hiddenAir ? `, and ${hiddenAir} outdoor task${hiddenAir === 1 ? ' was' : 's were'} hidden because the air is ${air.label.toLowerCase()}` : ''}. Want to loosen something?`, chips: ['Within 40 km', 'Show all types', 'Either setting is fine', 'I\'m flexible'] });
    return { state: s, msgs };
  }
  msgs.push({ text: `Okay${p.nick ? ` ${p.nick}` : ''}, here ${s.shown === 1 ? 'is 1 task that fits' : `are ${s.shown} tasks that fit`} you for ${ctx.today}. Tap Accept or Decline on each one. They come from today's live air, heat and report data, with the places that need help most first.`, tasks: views.slice(0, s.shown) });
  if (hiddenAir) msgs.push({ text: `I hid ${hiddenAir} outdoor task${hiddenAir === 1 ? '' : 's'} because the air is ${air.label.toLowerCase()} today. ${DISCLAIMER}` });
  msgs.push({ text: 'Anything you accept stays pending until a teacher or NGO coordinator confirms it, and please never go to a site alone. Want to change anything? Just tell me, for example a different area.', chips: ['Start over', 'Within 40 km', 'Show all types'] });
  return { state: s, msgs };
}
const viewsFor = (s: GState, ctx: GCtx, from: number, to: number): TaskView[] => {
  const a = areaOf(s.profile.area)!;
  return s.pool.map((id) => ctx.tasks.find((x) => x.id === id)).filter((t): t is Task => !!t).slice(from, to).map((t) => { const pos = taskPos(t); return { task: t, distKm: haversine(a.lat, a.lon, pos.lat, pos.lon), needed: t.need >= HIGH }; });
};

// ------------------------------------------------------------------ decisions (Accept / Decline buttons)
const MORE_Q: BotMsg = { text: 'Would you like to see more choices, or is that enough for now?', chips: ['Show me more', 'That\'s enough'] };
export function onDecision(state: GState, id: string, decision: 'accept' | 'decline', ctx: GCtx): Out {
  const s = clone(state); s.decisions[id] = decision;
  const t = ctx.tasks.find((x) => x.id === id) ?? ({ title: 'this task' } as Task), offered = s.pool.slice(0, s.shown), undecided = offered.filter((x) => !s.decisions[x]).length;
  const acc = Object.values(s.decisions).filter((d) => d === 'accept').length;
  const msgs: BotMsg[] = [];
  if (decision === 'accept') {
    msgs.push({ text: `Wonderful, I've noted you down for "${t.title}". It's pending until an adult confirms.` });
    if (!undecided) msgs.push({ text: `That's all of them! You accepted ${acc}. Your coordinator can see this in their verification queue. Thank you for helping Karachi breathe a bit easier.` });
    msgs.push(MORE_Q); s.stage = 'more';
  } else {
    msgs.push({ text: pick(['No worries at all.', 'That\'s fine, not every task suits everyone.'], ctx) });
    if (!undecided) { msgs.push({ text: `That's all of them! You accepted ${acc}. Thank you for helping Karachi breathe a bit easier.` }); msgs.push(MORE_Q); s.stage = 'more'; }
  }
  return { state: s, msgs };
}

// ------------------------------------------------------------------ small talk
const BOT_LINE = `I'm ${BOT_NAME}, an automated assistant following a script, not a real person and not an AI language model.`;
function smallTalk(t: string, s: GState, ctx: GCtx): string | null {
  const l = t.toLowerCase().trim();
  if (/\b(are you|r u)\b.*\b(bot|human|real|ai|robot|person|chatgpt|machine)\b/.test(l)) return BOT_LINE;
  if (isGreeting(l)) return pick(['Hello again!', 'Hey there!', 'Hi! Good to see you.'], ctx);
  if (/\bhow are you\b|\bhow'?s it going\b/.test(l)) return 'I\'m doing well, thanks for asking! Happy to help.';
  if (/\b(your name|who are you|who (built|made|created) you|who built)\b/.test(l)) return `${BOT_LINE} I was built for KarachAir, Karachi's Clean-Air Hub.`;
  if (/\b(thanks|thank you|thx|shukria)\b/.test(l)) return pick(['You\'re welcome!', 'Anytime!', 'Happy to help.'], ctx);
  if (/\b(how do you work|how does this work)\b|\bcan you (really )?(think|talk)\b/.test(l)) return 'Honestly: I\'m a guided script. I match keywords in what you type, and the browser reads my replies aloud and listens through your microphone. I don\'t think or understand like a person or an AI model.';
  if (/\b(what can you do|what do you do|help me)\b/.test(l)) return 'I ask a few questions, then suggest example volunteering tasks near you that you can accept or decline.';
  if (/\bwhy (do you|d'you) need\b|\bwhy are you asking\b|\bprivacy\b/.test(l)) return 'I only ask for your area and general preferences so I can match tasks. Your name comes from your account, so please don\'t type phone numbers or emails here.';
  if (/\b(what is|what'?s|whats) (the )?(aqi|pm ?2\.?5)\b/.test(l)) return 'PM2.5 means tiny particles in the air, thinner than a hair, that can get deep into your lungs. AQI is a simple score for how clean or dirty the air is.';
  if (/\bsafe to go outside\b|\bis it safe\b|\b(safe|ok|okay)\b.*\boutside\b/.test(l)) { const a = ctx.airFor(s.profile.area); return `Right now the air looks ${a.label.toLowerCase()}${a.pm25 != null ? `, about ${a.pm25.toFixed(0)} micrograms per cubic metre` : ''}. ${ADVICE[a.label] ?? 'I could not load live air data, so please check the Air quality tab first.'} ${DISCLAIMER}`; }
  if (/\b(joke|funny)\b/.test(l)) return pick(['Why did the tree get a mask? It heard the air was a bit dusty today.', 'What do you call a sapling that works out? A bit of a bush-lifter.'], ctx);
  if (/\b(tired|exhausted|busy|exams?|homework|stress\w*)\b/.test(l)) return 'That sounds like a lot. No pressure at all, even one small task is plenty.';
  if (/\b(i don'?t know|dunno|not sure|no idea|idk)\b/.test(l)) return s.stage === 'area' ? 'No problem. You could try Saddar, it\'s central. Or tell me the nearest landmark.' : 'That\'s okay, take your time. Any answer is fine and you can change it later.';
  if (/^\s*(ok|okay|cool|nice|great|good|alright|got it|k)\W*$/.test(l)) return pick(['Great!', 'Cool.', 'Nice.'], ctx);
  if (/\b(repeat|say that again|pardon|what did you say)\b/.test(l)) return 'Sure, here it is again.';
  return null;
}

// ------------------------------------------------------------------ stopping
const STRONG_STOP = /\b(stop|quit|exit|no more|that'?s enough|enough for now|leave me alone|never ?mind|no thanks|no thank you|goodbye|bye|see you|i'?m done|im done|that'?s all)\b/;
const SOFT_STOP = /^\W*(no|nope|nah|nothing|enough|all good|i'?m good|im good|that'?s (okay|ok|fine)|it'?s (okay|ok|fine)|okay|ok|fine|good|done|not now|maybe later|later)\W*$/;
const MORE_YES = /\b(more|another|other|again|yes|yeah|yep|sure|please|show)\b/;
function ending(s: GState, ctx: GCtx): Out {
  const n = s.profile.nick ? `, ${s.profile.nick}` : '';
  const state = clone(s); state.stage = 'ended';
  return { state, msgs: [{ text: pick([`Sounds good${n}! Thanks for helping Karachi breathe easier. I'll leave you to it. Say hi any time to start again.`, `No problem${n}. Thank you for helping Karachi's air. I'll stay quiet now. Say hi if you want me again.`], ctx) }] };
}

// ------------------------------------------------------------------ main reply function
export function respond(state: GState, text: string, ctx: GCtx): Out {
  const raw = text.trim(); const l = raw.toLowerCase();
  if (!raw) return { state, msgs: [] };

  // a finished conversation stays quiet unless the student clearly wants to talk again
  if (state.stage === 'ended') {
    if (/\b(start over|restart|reset)\b/.test(l) || isGreeting(l) || /\b(more|volunteer|help)\b/.test(l)) {
      const s = clone(state); s.stage = missing(s.profile) ?? 'more';
      if (s.stage === 'more') return { state: s, msgs: [{ text: 'Welcome back!' }, MORE_Q] };
      return { state: s, msgs: [{ text: 'Welcome back!' }, question(s.stage, ctx)] };
    }
    return { state, msgs: [] };
  }

  // privacy: contact details are never stored
  if (raw.includes('@') || raw.replace(/[\s()+-]/g, '').match(/\d{6,}/)) return { state, msgs: [{ text: 'Let\'s keep contact details out of this chat. I don\'t need any of that, and your teacher or coordinator will handle the rest.' }] };

  if (/\b(start over|restart|reset)\b/.test(l)) { const f = freshState(state.profile.nick); return { state: f, msgs: [{ text: 'No problem, a fresh start!' }, question('area', ctx)] }; }

  // stopping: clear stop words anywhere; softer words once the student has been offered tasks
  if (STRONG_STOP.test(l)) return ending(state, ctx);
  if ((state.stage === 'more' || state.stage === 'tasks') && SOFT_STOP.test(l)) return ending(state, ctx);

  const s = clone(state), was = { ...s.profile, types: [...s.profile.types] };
  const p = s.profile;

  // "different area" asks again for the area
  if (/\b(different|another|other|new|change)\b.*\b(area|place|location)\b/.test(l) && !parseArea(raw)) { p.area = null; s.stage = 'area'; return { state: s, msgs: [{ text: 'Sure, let\'s change it.' }, question('area', ctx)] }; }

  // in the "more choices?" stage, a yes shows the next matches
  if (s.stage === 'more' && MORE_YES.test(l) && !parseArea(raw) && parseTypes(raw, p.types) === null && parseSetting(raw) === null) return showMore(s, ctx);

  // explicit extraction (works for several answers in one sentence)
  // while a question is open, forgive typos and speech-to-text slips by matching against what that question expects
  const area = parseArea(raw) ?? (s.stage === 'area' ? parseAreaFuzzy(raw) : null); if (area) p.area = area;
  const types = parseTypes(raw, p.types) ?? (s.stage === 'types' ? parseTypes(correct(raw, TYPE_WORDS), p.types) : null); if (types) p.types = types;
  const setting = parseSetting(raw) ?? (s.stage === 'setting' ? parseSetting(correct(raw, SETTING_WORDS)) : null); if (setting) p.setting = setting;
  const dist = parseDistance(raw); if (dist != null) p.radius = dist;
  let lead = ack(p, was, ctx);

  if (!lead) {
    const talk = smallTalk(raw, s, ctx);
    if (talk) {
      const back = s.stage === 'tasks' || s.stage === 'more' ? [] : [question(s.stage, ctx)];
      return { state: s, msgs: [{ text: talk }, ...back] };
    }
    {
      s.fails++;
      const q = s.stage === 'tasks' || s.stage === 'more' ? { text: 'Tap Accept or Decline on the cards, or tell me what to change, for example a different area.', chips: ['Show me more', 'Start over', 'That\'s enough'] } : question(s.stage, ctx);
      return { state: s, msgs: [{ text: pick(['Hmm, I didn\'t quite catch that.', 'Sorry, I\'m not sure I got that.'], ctx) + (s.stage === 'area' ? ` I know all 24 Karachi towns, for example ${AREAS.slice(0, 8).map((a) => a.name).join(', ')}. Type the name of yours.` : '') }, q] };
    }
  }

  const next = missing(p);
  const pre = lead ? `${lead} ` : '';
  if (next) { s.stage = next; const q = question(next, ctx); s.fails = 0; return { state: s, msgs: [{ text: `${pre}${q.text}`.trim(), chips: q.chips }] }; }
  return list(s, ctx, pre);
}

function showMore(s: GState, ctx: GCtx): Out {
  if (s.pool.length > s.shown) {
    const from = s.shown, to = Math.min(s.pool.length, from + 6); s.shown = to; s.stage = 'tasks';
    return { state: s, msgs: [{ text: `Here ${to - from === 1 ? 'is one more' : `are ${to - from} more`}. Tap Accept or Decline on each one.`, tasks: viewsFor(s, ctx, from, to) }] };
  }
  s.stage = 'tasks';
  return { state: s, msgs: [{ text: 'That\'s every match I have for your settings. Want me to widen the search?', chips: ['Within 40 km', 'Show all types', 'Either setting is fine', 'I\'m flexible', 'That\'s enough'] }] };
}
