import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// Dev/preview-only endpoint for "Whisper Flow": cleans a raw transcript with Groq (Llama 3). The key is read from
// GROQ_API_KEY in .env.local (no VITE_ prefix, so it never reaches the browser). Without a key it answers 501 and the
// app falls back to its built-in cleaner. For a deployed site, host the same route as a serverless function.
function cleanSpeech(key: string): Plugin {
  const SYSTEM = `You are an advanced transcription cleaner. Your ONLY job is to take raw, messy speech-to-text transcriptions and output the user's clean, finalized intent.\nRULES:\n1. Remove all filler words (um, uh, like, you know).\n2. Resolve mid-sentence self-corrections (e.g., "Schedule it for 3, actually 4 pm" -> "Schedule it for 4 pm").\n3. Fix grammatical inconsistencies caused by changing thought paths mid-sentence.\n4. DO NOT add conversational responses (e.g., do not say "Sure, I fixed it").\n5. DO NOT summarize. Keep the user's original tone, vocabulary, and length as much as possible.\n6. Only output the final cleaned text, nothing else.`;
  const handler = async (req: any, res: any, next: () => void) => {
    if (req.url?.split('?')[0] !== '/api/clean-speech' || req.method !== 'POST') return next();
    const send = (code: number, body: unknown) => { res.statusCode = code; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(body)); };
    if (!key) return send(501, { error: 'GROQ_API_KEY is not set' });
    let raw = ''; for await (const c of req) { raw += c; if (raw.length > 4000) return send(413, { error: 'too long' }); }
    try {
      const { text } = JSON.parse(raw) as { text?: string };
      if (!text) return send(400, { error: 'no text' });
      const r = await fetch('https://api.groq.com/openai/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body: JSON.stringify({ model: 'llama-3.1-8b-instant', temperature: 0, max_tokens: 300, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: text }] }) });
      const j = (await r.json()) as { choices?: { message?: { content?: string } }[] };
      return send(r.ok ? 200 : 502, { text: j.choices?.[0]?.message?.content?.trim() ?? '' });
    } catch { return send(502, { error: 'cleaner unavailable' }); }
  };
  return { name: 'clean-speech', configureServer: (s) => { s.middlewares.use(handler); }, configurePreviewServer: (s) => { s.middlewares.use(handler); } };
}

// Static single-page app: relative base so it can be hosted anywhere (Netlify, GitHub Pages, S3…).
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [react(), cleanSpeech(loadEnv(mode, '.', '').GROQ_API_KEY ?? '')],
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          charts: ['recharts'],
          map: ['leaflet'],
        },
      },
    },
  },
}));
