// "Whisper Flow": raw speech-to-text is cleaned into what the speaker MEANT (no fillers, self-corrections resolved)
// before the chat guide sees it. Step 1 is the browser's speech recognition; step 2 (this file) is the cleaning layer.
// If an LLM endpoint is configured it is asked first (see vite.config.ts, GROQ_API_KEY); if it is missing, slow or
// fails, the local rules below run instead, so voice always works and nothing is blocked.

export const CLEAN_PROMPT = `You are an advanced transcription cleaner. Your ONLY job is to take raw, messy speech-to-text transcriptions and output the user's clean, finalized intent.
RULES:
1. Remove all filler words (um, uh, like, you know).
2. Resolve mid-sentence self-corrections (e.g., "Schedule it for 3, actually 4 pm" -> "Schedule it for 4 pm").
3. Fix grammatical inconsistencies caused by changing thought paths mid-sentence.
4. DO NOT add conversational responses (e.g., do not say "Sure, I fixed it").
5. DO NOT summarize. Keep the user's original tone, vocabulary, and length as much as possible.
6. Only output the final cleaned text, nothing else.`;

const FILLERS = /\b(?:u+m+|u+h+|e+r+m*|a+h+m*|h+m+|you know|i mean|kind of like|sort of like)\b[,]?\s*/gi;
const CORRECTION = /([\w'-]+)[,.]?\s+(?:actually|no wait|wait no|sorry|i mean|or rather|make that|no no)[,]?\s+/gi;

/** Rule-based cleaner (works offline): drops fillers, keeps only the corrected word, collapses stutters. */
export function cleanLocal(raw: string): string {
  let t = ` ${raw} `.replace(/\s+/g, ' ');
  t = t.replace(/,\s*like,\s*/gi, ', ').replace(FILLERS, '');
  t = t.replace(CORRECTION, ''); // "orangi, actually korangi" -> "korangi": the word before the marker is dropped
  t = t.replace(/\b(\w+)(\s+\1\b)+/gi, '$1'); // "the the trees" -> "the trees"
  t = t.replace(/\s+([,.!?])/g, '$1').replace(/^[\s,.]+|[\s,]+$/g, '').replace(/\s+/g, ' ');
  return t || raw.trim();
}

// The LLM cleaning endpoint only exists on the dev server, or where VITE_CLEAN_ENDPOINT points at one. On a static site
// there is nothing to call, so skip the request (no 404 in the network log) and use the built-in cleaner.
const ENDPOINT = (import.meta.env.VITE_CLEAN_ENDPOINT as string | undefined) || (import.meta.env.DEV ? '/api/clean-speech' : '');

/** Clean a raw transcript: LLM if available within ~1.5 s, otherwise the local rules. Never throws. */
export async function cleanTranscript(raw: string): Promise<string> {
  const text = raw.trim();
  if (!text) return '';
  const local = cleanLocal(text);
  if (!ENDPOINT) return local;
  try {
    const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 1500);
    const r = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }), signal: ctl.signal });
    clearTimeout(timer);
    if (!r.ok) return local;
    const j = (await r.json()) as { text?: string };
    const out = (j.text ?? '').trim();
    // guard against a chatty or runaway reply: the cleaned text must stay close to the original length
    return out && out.length <= text.length * 1.3 + 10 ? out : local;
  } catch { return local; }
}
