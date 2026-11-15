// Air-quality logic for TerraWatch: status bands, pollution-source guess, alert drafting + number audit, volunteer missions.
// Everything here is pure and deterministic so it can be unit-checked and explained on screen.

// ------------------------------------------------------------------ 1. traffic-light status
export type AirLevel = 'good' | 'moderate' | 'hazardous';

export interface AirBand {
  level: AirLevel;
  label: string;
  /** Upper edge of the band in µg/m³ (inclusive). */
  max: number;
  color: string;
  outdoorsOk: boolean;
  advice: string;
}

/** The app's simple three-band scale for PM2.5 (µg/m³). Deliberately looser than the WHO 24-hour guideline of 15 µg/m³ — see LIMITS. */
export const AIR_BANDS: readonly AirBand[] = [
  { level: 'good', label: 'Good', max: 35, color: '#3fd9a3', outdoorsOk: true, advice: 'Outdoor activity can go ahead as normal.' },
  { level: 'moderate', label: 'Moderate', max: 150, color: '#f5c13b', outdoorsOk: true, advice: 'Children, older people and anyone with asthma should keep outdoor time short.' },
  { level: 'hazardous', label: 'Hazardous', max: Infinity, color: '#ef5b4c', outdoorsOk: false, advice: 'Pause outdoor activity, wear a mask if you must go out, and keep children indoors.' },
];

export function airBand(pm25: number): AirBand {
  return AIR_BANDS.find((b) => pm25 <= b.max) ?? AIR_BANDS[AIR_BANDS.length - 1];
}

// ------------------------------------------------------------------ 2. "why is the air dirty?"
export type CauseId = 'clear' | 'traffic' | 'dust' | 'burning' | 'smog';

export interface CauseInput { pm25: number; pm10: number; no2: number | null; windKmh: number | null; hour: number }
export interface Cause { id: CauseId; label: string; sentence: string; evidence: string[] }

const RUSH_HOURS = new Set([7, 8, 9, 13, 14, 15]); // school drop-off and pick-up windows
const EVENING = (h: number) => h >= 18 && h <= 23;
const one = (v: number) => v.toFixed(1);

/** Classify the likely source from time of day, NO₂, wind and the fine/coarse particle ratio. A rule of thumb, not attribution science. */
export function classifyCause(i: CauseInput): Cause {
  const { pm25, pm10, no2, windKmh, hour } = i;
  const ratio = pm10 > 0 ? pm25 / pm10 : null;
  const ratioTxt = ratio == null ? 'n/a' : ratio.toFixed(2);

  if (pm25 <= AIR_BANDS[0].max) {
    return { id: 'clear', label: 'No spike', sentence: `No pollution spike: PM2.5 is ${one(pm25)} µg/m³, inside the good range.`, evidence: [`PM2.5 ${one(pm25)} µg/m³ ≤ ${AIR_BANDS[0].max}`] };
  }
  if (RUSH_HOURS.has(hour) && no2 != null && no2 > 40) {
    return {
      id: 'traffic', label: 'School-gate traffic',
      sentence: `Likely school-gate traffic exhaust: rush hour with NO₂ at ${one(no2)} µg/m³.`,
      evidence: [`${String(hour).padStart(2, '0')}:00 falls in a school rush window (07–09 or 13–15)`, `NO₂ ${one(no2)} µg/m³ is above 40`],
    };
  }
  if (windKmh != null && windKmh > 18 && ratio != null && ratio < 0.35) {
    return {
      id: 'dust', label: 'Blowing dust',
      sentence: `Likely blowing road dust: wind at ${one(windKmh)} km/h and mostly coarse particles.`,
      evidence: [`Wind ${one(windKmh)} km/h is above 18`, `PM2.5/PM10 = ${ratioTxt}, below 0.35 (coarse particles dominate)`],
    };
  }
  if (EVENING(hour) && ratio != null && ratio > 0.65) {
    return {
      id: 'burning', label: 'Trash burning',
      sentence: 'Likely trash-burning smoke: evening hours and mostly fine, smoke-sized particles.',
      evidence: [`${String(hour).padStart(2, '0')}:00 is in the evening burn window (18–23)`, `PM2.5/PM10 = ${ratioTxt}, above 0.65 (fine particles dominate)`],
    };
  }
  return {
    id: 'smog', label: 'General urban smog',
    sentence: 'Likely general urban smog: no single source signature stands out.',
    evidence: ['No rush-hour, dust or evening-smoke signature matched', `PM2.5/PM10 = ${ratioTxt}${windKmh != null ? `, wind ${one(windKmh)} km/h` : ''}`],
  };
}

// ------------------------------------------------------------------ 3. alert drafting + number audit
export interface AlertFacts { place: string; pm25: number; pm10: number; no2: number | null; windKmh: number | null; band: AirBand; cause: Cause }

/** Unicode bidi isolate: keeps Latin names and numbers from scrambling the word order inside right-to-left Urdu text. */
const iso = (s: string) => `⁨${s}⁩`;

const URDU_LEVEL: Record<AirLevel, string> = { good: 'اچھی', moderate: 'درمیانی', hazardous: 'خطرناک' };
const URDU_ADVICE: Record<AirLevel, string> = {
  good: 'بیرونی سرگرمیاں معمول کے مطابق جاری رکھی جا سکتی ہیں۔',
  moderate: 'بچے، بزرگ اور دمہ کے مریض بیرونی سرگرمیاں محدود رکھیں۔',
  hazardous: 'بیرونی سرگرمیاں روک دیں، باہر جانا ضروری ہو تو ماسک پہنیں اور بچوں کو گھر کے اندر رکھیں۔',
};
const URDU_CAUSE: Record<CauseId, (f: AlertFacts) => string> = {
  clear: () => 'کسی خاص آلودگی کا اضافہ نہیں ہے۔',
  traffic: (f) => `ممکنہ وجہ: اسکول کے گیٹ پر گاڑیوں کا دھواں (${iso('NO₂')} کی سطح ${iso(`${one(f.no2 ?? 0)} µg/m³`)})۔`,
  dust: (f) => `ممکنہ وجہ: تیز ہوا سے اڑتی گرد (ہوا کی رفتار ${iso(`${one(f.windKmh ?? 0)} km/h`)})۔`,
  burning: () => 'ممکنہ وجہ: شام کے وقت کچرا جلنے کا دھواں۔',
  smog: () => 'ممکنہ وجہ: عمومی شہری دھند اور دھواں۔',
};

/** Template-based (no live LLM): fast, offline and fully reproducible. Numbers come only from the facts passed in. */
export function draftAlert(f: AlertFacts): { en: string; ur: string } {
  const en = `Air alert for ${f.place}: PM2.5 is ${one(f.pm25)} µg/m³ (${f.band.label}). ${f.cause.sentence} ${f.band.advice}`;
  const ur = `فضائی آلودگی کا الرٹ — ${iso(f.place)}۔ ${iso('PM2.5')} کی سطح ${iso(`${one(f.pm25)} µg/m³`)} ہے (${URDU_LEVEL[f.band.level]})۔ ${URDU_CAUSE[f.cause.id](f)} ${URDU_ADVICE[f.band.level]}`;
  return { en, ur };
}

export interface AuditRow { token: string; matches: string | null }
export interface Audit { rows: AuditRow[]; ok: boolean; mentionsPm25: boolean }

/** Every number in a message must equal a source value shown on screen; otherwise the draft is flagged. Parameter names (PM2.5, PM10, NO₂) are ignored. */
export function auditNumbers(text: string, facts: { name: string; value: number }[]): Audit {
  const cleaned = text.replace(/PM\s?2\.5|PM\s?10|NO\s?[2₂]/gi, ' ');
  const tokens = cleaned.match(/\d+(?:\.\d+)?/g) ?? [];
  const rows = tokens.map((token) => {
    const n = parseFloat(token);
    const hit = facts.find((f) => Math.abs(f.value - n) < 0.05);
    return { token, matches: hit ? hit.name : null };
  });
  const pm = facts.find((f) => f.name === 'PM2.5');
  const mentionsPm25 = !!pm && rows.some((r) => r.matches === 'PM2.5');
  return { rows, ok: rows.every((r) => r.matches) && mentionsPm25, mentionsPm25 };
}

// ------------------------------------------------------------------ 4. volunteer missions
export interface AirMission { id: string; title: string; detail: string; hours: number; where: 'indoor' | 'outdoor' }

export const AIR_MISSIONS: readonly AirMission[] = [
  { id: 'cards', title: 'Hand out clean-air health cards', detail: 'Share the colour-coded air guide with classmates and neighbours.', hours: 0.5, where: 'indoor' },
  { id: 'class', title: 'Teach a 10-minute PM2.5 lesson', detail: 'Explain the traffic-light status to a younger class.', hours: 1, where: 'indoor' },
  { id: 'idling', title: 'No-idling shift at the school gate', detail: 'Politely ask drivers to switch engines off while they wait.', hours: 1, where: 'outdoor' },
  { id: 'trees', title: 'Plant dust-barrier saplings', detail: 'Help plant a hedge row along a dusty road or boundary wall.', hours: 2, where: 'outdoor' },
];

export interface HourEntry { id: string; missionId: string; title: string; hours: number; at: string; place: string; level: AirLevel }

export function missionLocked(m: AirMission, band: AirBand | null): { locked: boolean; reason: string | null } {
  if (m.where === 'indoor') return { locked: false, reason: null };
  if (!band) return { locked: true, reason: 'Locked: live air status unavailable' };
  return band.outdoorsOk ? { locked: false, reason: null } : { locked: true, reason: `Locked: air is ${band.label.toLowerCase()} today` };
}

// ------------------------------------------------------------------ 5. honest limits
export const AIR_LIMITS = [
  'Readings are a ~11 km atmospheric model (CAMS via Open-Meteo), not street-level sensors. Hot spots such as a school gate, and neighbouring units that share a grid cell, can differ from what is shown.',
  'The source tag is a rule of thumb from time of day, NO₂, wind and the PM2.5/PM10 ratio. Rush-hour dust or evening cooking smoke can be mislabelled.',
  'Sudden local events (a smoke plume, a sea breeze that clears the air) can change faster than the model updates.',
  'The 35 / 150 µg/m³ bands are a simple app scale. The WHO 24-hour PM2.5 guideline is stricter at 15 µg/m³, so “Good” here does not mean “meets WHO guidance”.',
];
