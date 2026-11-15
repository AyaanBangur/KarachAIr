// "Hawa", the TerraWatch volunteer guide: a RULE-BASED, scripted assistant (keywords and regular expressions only).
// It is not a person and not an AI language model, and it says so. The logic is pure so it can be tested without the UI.

export const BOT_NAME = 'Hawa';

// ------------------------------------------------------------------ data
export interface Area { name: string; lat: number; lon: number; unitId: string; aliases: string[] }
/** Spec areas, each mapped to the nearest TerraWatch unit so live air quality can be looked up (approximate). */
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
  { id: 1, name: 'Waste & burning', emoji: '♻️', key: 'waste' }, { id: 2, name: 'Traffic & no-idling', emoji: '🚗', key: 'traffic' },
  { id: 3, name: 'Trees & dust', emoji: '🌳', key: 'trees' }, { id: 4, name: 'Health & masks', emoji: '😷', key: 'health' }, { id: 5, name: 'Sensors & data', emoji: '📡', key: 'sensors' },
];
export interface Task { id: string; type: number; title: string; area: string; dLat: number; dLon: number; indoor: boolean; hours: number }
/** EXAMPLE sites for the prototype. */
export const TASKS: Task[] = [
  { id: 'V01', type: 1, title: 'Zero-burn audit walk (photo + GPS log)', area: 'Orangi', dLat: .006, dLon: .004, indoor: false, hours: 2 },
  { id: 'V02', type: 1, title: 'School recycling and segregation bins', area: 'Korangi', dLat: .004, dLon: -.005, indoor: true, hours: 2 },
  { id: 'V03', type: 2, title: 'No-idling gate campaign (sidewalk, with placards)', area: 'Saddar', dLat: .005, dLon: .003, indoor: false, hours: 1 },
  { id: 'V04', type: 2, title: 'Carpool and bus-pool matching survey', area: 'University Road', dLat: .004, dLon: .004, indoor: true, hours: 2 },
  { id: 'V05', type: 3, title: 'Plant native saplings along a school wall', area: 'Malir', dLat: .005, dLon: -.004, indoor: false, hours: 3 },
  { id: 'V06', type: 3, title: 'Weekly sapling watering roster', area: 'Shahrah-e-Faisal', dLat: .004, dLon: .004, indoor: false, hours: 1 },
  { id: 'V07', type: 4, title: 'Make Urdu/English air-quality posts and notices', area: 'Saddar', dLat: -.006, dLon: -.004, indoor: true, hours: 2 },
  { id: 'V08', type: 4, title: 'Mask and hydration drive for outdoor workers', area: 'Lyari', dLat: .004, dLon: .005, indoor: false, hours: 2 },
  { id: 'V09', type: 5, title: 'Campus air-sensor weekly check', area: 'Malir', dLat: -.006, dLon: .005, indoor: false, hours: 1 },
  { id: 'V10', type: 5, title: 'Log local pollution events for analysts', area: 'Orangi', dLat: -.005, dLon: -.005, indoor: false, hours: 1 },
];
export const areaOf = (name: string | null) => AREAS.find((a) => a.name === name) ?? null;
export const typeOf = (id: number) => TYPES.find((t) => t.id === id)!;
export const taskOf = (id: string) => TASKS.find((t) => t.id === id)!;

export function haversine(lat1: number, lon1: number, lat2: number, lon2: number) {
  const r = (d: number) => (d * Math.PI) / 180, a = Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lon2 - lon1) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
export const taskPos = (t: Task) => { const a = areaOf(t.area)!; return { lat: a.lat + t.dLat, lon: a.lon + t.dLon }; };

// ------------------------------------------------------------------ state
export type Setting = 'Indoor' | 'Outdoor' | 'Any';
export interface Profile { nick: string | null; area: string | null; types: number[]; setting: Setting | null; hours: number | null; radius: number }
export type Stage = 'nick' | 'area' | 'types' | 'setting' | 'hours' | 'tasks' | 'more' | 'ended';
export interface GState { stage: Stage; profile: Profile; pool: string[]; shown: number; decisions: Record<string, 'accept' | 'decline'>; fails: number }
export interface AirInfo { pm25: number | null; label: string; outdoorOk: boolean; triggered: number[] }
export interface GCtx { airFor: (area: string | null) => AirInfo; today: string; rng?: () => number }
export interface TaskView { task: Task; distKm: number; needed: boolean }
export interface BotMsg { text: string; chips?: string[]; tasks?: TaskView[] }
export interface Out { state: GState; msgs: BotMsg[] }

export const freshState = (): GState => ({ stage: 'nick', profile: { nick: null, area: null, types: [], setting: null, hours: null, radius: 15 }, pool: [], shown: 0, decisions: {}, fails: 0 });
const pick = <T,>(a: T[], ctx: GCtx): T => a[Math.floor((ctx.rng ?? Math.random)() * a.length)];
const clone = (s: GState): GState => ({ ...s, profile: { ...s.profile, types: [...s.profile.types] }, pool: [...s.pool], decisions: { ...s.decisions } });

// ------------------------------------------------------------------ parsers
const STOPNICK = new Set(['near', 'in', 'from', 'at', 'into', 'looking', 'interested', 'a', 'an', 'the', 'based', 'around', 'flexible', 'fine', 'good', 'ok', 'okay', 'outdoors', 'outdoor', 'indoors', 'indoor', 'either', 'both', 'not', 'just', 'so', 'really', 'very', 'here', 'there', 'student', 'volunteer', 'happy', 'ready', 'sorry', 'tired', 'busy', 'well', 'great', 'new', 'sure', 'also', 'yes', 'no', 'hi', 'hello', 'hey', 'thanks', 'thank', 'cool', 'nice', 'bye', 'help', 'stop']);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

export function parseNick(t: string): string | null {
  const m = t.match(/\b(?:call me|my name is|my nickname is|name'?s|i am called|i'?m|im|i am)\s+([a-z][a-z'-]{1,15})\b/i);
  if (m && !STOPNICK.has(m[1].toLowerCase())) return cap(m[1]);
  return null;
}
export function parseArea(t: string): string | null {
  const l = t.toLowerCase();
  const all = AREAS.flatMap((a) => a.aliases.map((al) => ({ a: a.name, al }))).sort((x, y) => y.al.length - x.al.length);
  return all.find(({ al }) => new RegExp(`(^|[^a-z])${al.replace(/[-]/g, '[- ]')}($|[^a-z])`).test(l))?.a ?? null;
}
const TYPE_RE: [number, RegExp][] = [
  [1, /\b(trash|waste|garbage|recycl\w*|burn\w*|litter|compost|plastic)/], [2, /\b(traffic|cars?|idl\w*|engines?|carpool\w*|bus(es)?|rickshaws?|commut\w*|drop-?off)/],
  [3, /\b(trees?|plant\w*|sapling\w*|garden\w*|green|dust|water\w*|forest)/], [4, /\b(masks?|health|posters?|awareness|urdu|campaign\w*|social media|notices?)/],
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
  for (const task of TASKS) {
    if (!p.types.includes(task.type)) continue;
    if (p.setting === 'Indoor' && !task.indoor) continue;
    if (p.setting === 'Outdoor' && task.indoor) continue;
    if (p.hours != null && p.hours !== 99 && task.hours > p.hours) continue;
    const pos = taskPos(task), distKm = haversine(a.lat, a.lon, pos.lat, pos.lon);
    if (distKm > p.radius) continue;
    if (!task.indoor && !air.outdoorOk) { hiddenAir++; continue; }
    views.push({ task, distKm, needed: air.triggered.includes(task.type) });
  }
  views.sort((x, y) => Number(y.needed) - Number(x.needed) || x.distKm - y.distKm);
  return { views, hiddenAir };
}

// ------------------------------------------------------------------ questions and acknowledgements
const missing = (p: Profile): Stage | null => (!p.nick ? 'nick' : !p.area ? 'area' : !p.types.length ? 'types' : !p.setting ? 'setting' : p.hours == null ? 'hours' : null);
export function question(stage: Stage, ctx: GCtx): BotMsg {
  switch (stage) {
    case 'nick': return { text: pick(['So, what should I call you? A nickname is perfect, no full names please.', 'First things first, what nickname would you like me to use?', 'What\'s a nickname I can use for you? Nothing personal, just something to call you.'], ctx) };
    case 'area': return { text: pick(['Which part of Karachi are you closest to?', 'Where are you based? Pick the nearest area and I\'ll look around there.', 'Which area is closest to you?'], ctx), chips: AREAS.map((a) => a.name) };
    case 'types': return { text: pick(['What kind of volunteering sounds good to you? You can name more than one.', 'What would you enjoy doing? Trees, traffic, health awareness, data, waste... anything catch your eye?', 'So what are you into? Planting, spreading the word, working with data, cleaning up?'], ctx), chips: [...TYPES.map((t) => t.name), 'Surprise me'] };
    case 'setting': return { text: pick(['Would you rather be indoors, outdoors, or does it not matter?', 'Do you prefer indoor tasks, outdoor ones, or either?', 'Indoors or outdoors, which feels better to you?'], ctx), chips: ['Indoors', 'Outdoors', 'Either is fine'] };
    case 'hours': return { text: pick(['Last one: how much time can you give? Most tasks take one to three hours.', 'And how many hours could you spare for one task?', 'Nearly there. How much time do you have for a task?'], ctx), chips: ['1 hour', '2 hours', '3 hours', 'I\'m flexible'] };
    default: return { text: '' };
  }
}
function ack(p: Profile, was: Profile, ctx: GCtx): string {
  const parts: string[] = [];
  if (p.nick && p.nick !== was.nick) parts.push(pick([`Nice to meet you, ${p.nick}.`, `Great to meet you, ${p.nick}.`, `Hi ${p.nick}, lovely to meet you.`], ctx));
  if (p.area && p.area !== was.area) parts.push(pick([`Got it, around ${p.area}.`, `${p.area}, noted.`, `Okay, ${p.area} it is.`], ctx));
  if (p.types.length && p.types.join() !== was.types.join()) parts.push(p.types.length === 5 ? 'Love it, a bit of everything.' : `Love it: ${p.types.map((id) => typeOf(id).name.toLowerCase()).join(', ')}.`);
  if (p.setting && p.setting !== was.setting) parts.push(p.setting === 'Any' ? 'Either setting works, great.' : `Noted, ${p.setting.toLowerCase()} tasks.`);
  if (p.hours != null && p.hours !== was.hours) parts.push(p.hours === 99 ? 'Flexible on time, perfect.' : `About ${p.hours} hour${p.hours === 1 ? '' : 's'} it is.`);
  if (p.radius !== was.radius) parts.push(`Searching within ${p.radius} km.`);
  return parts.join(' ');
}
const ADVICE: Record<string, string> = { Good: 'Normal outdoor activity is fine.', Moderate: 'Keep outdoor time short, especially with asthma, and consider a mask.', Hazardous: 'Stay indoors where you can, and wear a well-fitted mask if you must go out.' };
const DISCLAIMER = 'Prototype, general guidance, not medical advice.';

// ------------------------------------------------------------------ starting
export function startChat(ctx: GCtx): Out {
  const air = ctx.airFor(null);
  const level = air.pm25 != null ? `${air.label.toLowerCase()}, about ${air.pm25.toFixed(0)} micrograms per cubic metre` : 'unclear because I could not load live air data';
  return { state: freshState(), msgs: [
    { text: `Hey! I'm ${BOT_NAME}. Quick heads-up so there's no confusion: I'm an automated assistant, not a real person. But I'd love to help you find something good to do for Karachi's air.` },
    { text: `Air-wise, ${ctx.today} looks ${level}, so I'll keep that in mind. If you'd rather talk than type, tap the Hands-free button at the top and I'll listen.` },
    question('nick', ctx),
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
  msgs.push({ text: `Okay ${p.nick}, here ${s.shown === 1 ? 'is 1 task that fits' : `are ${s.shown} tasks that fit`} you for ${ctx.today}. Tap Accept or Decline on each one. These are example sites.`, tasks: views.slice(0, s.shown) });
  if (hiddenAir) msgs.push({ text: `I hid ${hiddenAir} outdoor task${hiddenAir === 1 ? '' : 's'} because the air is ${air.label.toLowerCase()} today. ${DISCLAIMER}` });
  msgs.push({ text: 'Anything you accept stays pending until a teacher or NGO coordinator confirms it, and please never go to a site alone. Want to change anything? Just tell me, for example a different area.', chips: ['Start over', 'Within 40 km', 'Show all types'] });
  return { state: s, msgs };
}
const viewsFor = (s: GState, ctx: GCtx, from: number, to: number): TaskView[] => {
  const a = areaOf(s.profile.area)!, air = ctx.airFor(s.profile.area);
  return s.pool.slice(from, to).map((id) => { const t = taskOf(id), pos = taskPos(t); return { task: t, distKm: haversine(a.lat, a.lon, pos.lat, pos.lon), needed: air.triggered.includes(t.type) }; });
};

// ------------------------------------------------------------------ decisions (Accept / Decline buttons)
const MORE_Q: BotMsg = { text: 'Would you like to see more choices, or is that enough for now?', chips: ['Show me more', 'That\'s enough'] };
export function onDecision(state: GState, id: string, decision: 'accept' | 'decline', ctx: GCtx): Out {
  const s = clone(state); s.decisions[id] = decision;
  const t = taskOf(id), offered = s.pool.slice(0, s.shown), undecided = offered.filter((x) => !s.decisions[x]).length;
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
  if (/\b(your name|who are you|who (built|made|created) you|who built)\b/.test(l)) return `${BOT_LINE} I was built for TerraWatch, Karachi's Clean-Air Hub.`;
  if (/\b(thanks|thank you|thx|shukria)\b/.test(l)) return pick(['You\'re welcome!', 'Anytime!', 'Happy to help.'], ctx);
  if (/\b(how do you work|how does this work)\b|\bcan you (really )?(think|talk)\b/.test(l)) return 'Honestly: I\'m a guided script. I match keywords in what you type, and the browser reads my replies aloud and listens through your microphone. I don\'t think or understand like a person or an AI model.';
  if (/\b(what can you do|what do you do|help me)\b/.test(l)) return 'I ask a few questions, then suggest example volunteering tasks near you that you can accept or decline.';
  if (/\bwhy (do you|d'you) need\b|\bwhy are you asking\b|\bprivacy\b/.test(l)) return 'I only ask a nickname and general preferences so I can match tasks. No full names, no phone numbers, no emails, please.';
  if (/\b(what is|what'?s|whats) (the )?(aqi|pm ?2\.?5)\b/.test(l)) return 'PM2.5 means tiny particles in the air, thinner than a hair, that can get deep into your lungs. AQI is a simple score for how clean or dirty the air is.';
  if (/\bsafe to go outside\b|\bis it safe\b|\b(safe|ok|okay)\b.*\boutside\b/.test(l)) { const a = ctx.airFor(s.profile.area); return `Right now the air looks ${a.label.toLowerCase()}${a.pm25 != null ? `, about ${a.pm25.toFixed(0)} micrograms per cubic metre` : ''}. ${ADVICE[a.label] ?? 'I could not load live air data, so please check the Air quality tab first.'} ${DISCLAIMER}`; }
  if (/\b(joke|funny)\b/.test(l)) return pick(['Why did the tree get a mask? It heard the air was a bit dusty today.', 'What do you call a sapling that works out? A bit of a bush-lifter.'], ctx);
  if (/\b(tired|exhausted|busy|exams?|homework|stress\w*)\b/.test(l)) return 'That sounds like a lot. No pressure at all, even one small task is plenty.';
  if (/\b(i don'?t know|dunno|not sure|no idea|idk)\b/.test(l)) return s.stage === 'area' ? 'No problem. You could try Saddar, it\'s central. Or tell me the nearest landmark.' : s.stage === 'hours' ? 'That\'s okay. You can say "flexible" and I\'ll show everything.' : 'That\'s okay, take your time. Any answer is fine and you can change it later.';
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
  if (raw.includes('@') || raw.replace(/[\s()+-]/g, '').match(/\d{6,}/)) return { state, msgs: [{ text: 'Let\'s keep contact details out of this chat. A nickname is all I need, and your teacher or coordinator will handle the rest.' }] };

  if (/\b(start over|restart|reset)\b/.test(l)) { const f = freshState(); return { state: f, msgs: [{ text: 'No problem, a fresh start!' }, question('nick', ctx)] }; }

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
  const nick = parseNick(raw); if (nick) p.nick = nick;
  const area = parseArea(raw); if (area) p.area = area;
  const types = parseTypes(raw, p.types); if (types) p.types = types;
  const setting = parseSetting(raw); if (setting) p.setting = setting;
  const hours = parseHours(raw, s.stage === 'hours'); if (hours != null) p.hours = hours;
  const dist = parseDistance(raw); if (dist != null) p.radius = dist;
  let lead = ack(p, was, ctx);

  if (!lead) {
    const talk = smallTalk(raw, s, ctx);
    if (talk) {
      const back = s.stage === 'tasks' || s.stage === 'more' ? [] : [question(s.stage, ctx)];
      return { state: s, msgs: [{ text: talk }, ...back] };
    }
    // a bare short reply at the nickname stage is the nickname
    if (s.stage === 'nick' && /^[a-z][a-z' -]{1,19}$/i.test(raw) && raw.split(/\s+/).length <= 3 && !STOPNICK.has(l)) { p.nick = cap(raw.split(/\s+/)[0]); lead = ack(p, was, ctx); }
    else {
      s.fails++;
      const q = s.stage === 'tasks' || s.stage === 'more' ? { text: 'Tap Accept or Decline on the cards, or tell me what to change, for example a different area.', chips: ['Show me more', 'Start over', 'That\'s enough'] } : question(s.stage, ctx);
      return { state: s, msgs: [{ text: pick(['Hmm, I didn\'t quite catch that.', 'Sorry, I\'m not sure I got that.'], ctx) + (s.stage === 'area' ? ` The areas I know are ${AREAS.map((a) => a.name).join(', ')}.` : '') }, q] };
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
