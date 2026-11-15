// Optional translation layer for the volunteer guide. The guide's logic is English; for other languages the student's
// message is translated to English and the reply translated back, using the free MyMemory service (no key).
// Anything typed in a non-English language is therefore sent to that third-party service, which the UI warns about.

export interface Lang { code: string; name: string; mic: string; rtl?: boolean }
export const LANGS: Lang[] = [
  { code: 'en', name: 'English', mic: 'en-US' }, { code: 'hi', name: 'Hindi (हिन्दी)', mic: 'hi-IN' },
];
export const langOf = (code: string) => LANGS.find((l) => l.code === code) ?? LANGS[0];

const cache = new Map<string, string>();
const MAX = 450; // MyMemory accepts about 500 characters per request

function chunks(text: string): string[] {
  const out: string[] = []; let cur = '';
  for (const s of text.match(/[^.!?۔؟\n]+[.!?۔؟]*\s*/g) ?? [text]) {
    if ((cur + s).length > MAX && cur) { out.push(cur.trim()); cur = ''; }
    cur += s.length > MAX ? s.slice(0, MAX) : s;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

async function one(q: string, from: string, to: string): Promise<string> {
  const key = `${from}|${to}|${q}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(q)}&langpair=${from}|${to}`);
  if (!res.ok) throw new Error(`translate ${res.status}`);
  const json = (await res.json()) as { responseStatus?: number | string; responseData?: { translatedText?: string } };
  const t = json.responseData?.translatedText;
  if (Number(json.responseStatus) !== 200 || !t || /MYMEMORY WARNING|QUERY LENGTH LIMIT|INVALID/i.test(t)) throw new Error('translate failed');
  cache.set(key, t);
  return t;
}

/** Translate `text` between two language codes. Throws if the service is unavailable, so callers can fall back to English. */
export async function translate(text: string, from: string, to: string): Promise<string> {
  if (from === to || !text.trim()) return text;
  const parts = await Promise.all(chunks(text).map((c) => one(c, from, to)));
  return parts.join(' ');
}
