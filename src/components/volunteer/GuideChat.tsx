import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cleanTranscript } from '../../lib/whisperFlow';
import { mapsDirections, mapsView } from '../../lib/maps';
import { isLive, loadChat, markLive, saveChat } from '../../lib/chatStore';
import { BOT_NAME, areaOf, onDecision, respond, startChat, typeOf, type AirInfo, type BotMsg, type GCtx, type GState, type Task, type TaskView } from '../../lib/guide';
import { LANGS, langOf, translate } from '../../lib/translate';
import { airBand, classifyCause } from '../../lib/air';
import type { AirState, LiveWeather } from '../../lib/hooks';
import { useLocalState } from '../../lib/hooks';
import { Alert, ArrowRight, Check, Reset } from '../icons';

// ------------------------------------------------------------------ browser speech (text-to-speech and recognition)
interface RecAlt { transcript: string }
interface RecEvent { results: ArrayLike<ArrayLike<RecAlt>> }
interface Recognizer { lang: string; continuous: boolean; interimResults: boolean; maxAlternatives: number; onresult: ((e: RecEvent) => void) | null; onerror: ((e: { error: string }) => void) | null; onend: (() => void) | null; start: () => void; stop: () => void; abort: () => void }
type RecCtor = new () => Recognizer;
const recCtor = (): RecCtor | null => { const w = window as unknown as { SpeechRecognition?: RecCtor; webkitSpeechRecognition?: RecCtor }; return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null; };
const hasTTS = () => typeof window !== 'undefined' && 'speechSynthesis' in window;
const PREFERRED = ['sonia', 'jenny', 'aria', 'neerja', 'ryan', 'guy'];
/** Hindi voices that are male (Microsoft Hemant / Madhur, etc.). "female" is excluded explicitly. */
const MALE_HI = /\b(hemant|madhur|prabhat|rishi|ravi)\b|(?<!fe)male/i; // male Hindi voices

const spoken = (t: string) => t.replace(/µg\/m³/g, ' micrograms per cubic metre').replace(/PM2\.5/g, 'P M 2.5').replace(/[\u{1F300}-\u{1FAFF}☀-➿️]/gu, '').replace(/["“”]/g, '').trim();
/** Speak sentence by sentence with a little natural variation; always resolves (safety timeout). */
function speak(text: string, voice: SpeechSynthesisVoice | null, rate: number, lang: string): Promise<void> {
  return new Promise((resolve) => {
    if (!hasTTS()) return resolve();
    const t = spoken(text);
    if (!t) return resolve();
    const parts = t.match(/[^.!?۔؟]+[.!?۔؟]*\s*/g) ?? [t];
    let done = false;
    const timer = window.setTimeout(() => fin(), Math.max(4000, t.length * 95 + 3000));
    const fin = () => { if (!done) { done = true; window.clearTimeout(timer); resolve(); } };
    parts.forEach((p, i) => {
      const u = new SpeechSynthesisUtterance(p.trim());
      if (voice) { u.voice = voice; u.lang = voice.lang; } else u.lang = lang;
      if (lang.startsWith('hi')) {
        // Hindi: slower, steady and a little lower, with no random variation, so every word is easy to follow
        u.rate = rate * 0.85; u.pitch = voice && MALE_HI.test(voice.name) ? 0.95 : 0.8; u.volume = 1;
      } else { u.rate = rate * (0.97 + Math.random() * 0.06); u.pitch = 1 + (Math.random() * 0.06 - 0.02); }
      if (i === parts.length - 1) u.onend = fin;
      u.onerror = fin;
      window.speechSynthesis.speak(u);
    });
  });
}

type Item = { id: number; role: 'bot' | 'me'; text: string; chips?: { label: string; value: string }[]; tasks?: TaskView[] };
const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

/** The volunteer guide chat: rule-based, scripted, optional voice, microphone and translation. */
export function GuideChat({ air, weather, name, tasks, userKey, active = true, onAccept }: { /** false while another section of the hub is showing (the chat stays alive but quiet) */ active?: boolean; /** identifies the volunteer, so their chat is kept while they visit other tabs */ userKey: string; air: AirState; weather: LiveWeather | null; /** first name of the account holder */ name: string; /** tasks generated from live data and the report */ tasks: Task[]; onAccept: (task: Task, nick: string) => string | null }) {
  // a chat the volunteer already started (before they went to another tab) is restored instead of starting over
  const savedChat = useRef(isLive(userKey) ? loadChat<Item, GState>(userKey) : null);
  const [items, setItems] = useState<Item[]>(() => savedChat.current?.items ?? []);
  const [typing, setTyping] = useState(false);
  const [view, setView] = useState<GState | null>(() => savedChat.current?.state ?? null);
  const [input, setInput] = useState('');
  const [langCode, setLangCode] = useLocalState<string>('tw-guide-lang', 'en');
  const [voiceOn, setVoiceOn] = useLocalState<boolean>('tw-guide-voice', true);
  const [rate, setRate] = useLocalState<number>('tw-guide-rate', 1);
  const [voiceName, setVoiceName] = useLocalState<string>('tw-guide-voicename', '');
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [handsFree, setHandsFree] = useState(false);
  const [listening, setListening] = useState(false);
  const [toast, setToast] = useState('');
  const lang = langOf(langCode);
  const supported = typeof window !== 'undefined' && !!recCtor();

  const stateRef = useRef<GState | null>(savedChat.current?.state ?? null), idRef = useRef(Math.max(0, ...(savedChat.current?.items ?? []).map((i) => i.id))), queue = useRef<BotMsg[]>([]), running = useRef(false);
  const rec = useRef<Recognizer | null>(null), silent = useRef(0), hf = useRef(false), langRef = useRef(lang), voiceRef = useRef<SpeechSynthesisVoice | null>(null), rateRef = useRef(rate), voiceOnRef = useRef(voiceOn), gen = useRef(0);
  const logRef = useRef<HTMLDivElement>(null);
  hf.current = handsFree; langRef.current = lang; rateRef.current = rate; voiceOnRef.current = voiceOn;

  const note = useCallback((t: string) => { setToast(t); window.setTimeout(() => setToast((x) => (x === t ? '' : x)), 5000); }, []);

  // ---- live air context for the guide (uses the app's own air bands and source rules)
  const readings = air.data?.byUnit;
  const ctx = useMemo<GCtx>(() => ({
    name, tasks,
    today: new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' }),
    airFor: (area): AirInfo => {
      const unitId = areaOf(area)?.unitId;
      const r = unitId ? readings?.[unitId] : readings ? { ...Object.values(readings)[0], pm25: Object.values(readings).reduce((s, x) => s + x.pm25, 0) / Object.values(readings).length } : undefined;
      if (!r) return { pm25: null, label: 'unknown', outdoorOk: false, triggered: [] };
      const band = airBand(r.pm25);
      const hour = parseInt(r.time?.slice(11, 13) ?? '12', 10);
      const wind = unitId ? weather?.byUnit[unitId]?.current.wind ?? null : null;
      const c = classifyCause({ pm25: r.pm25, pm10: r.pm10, no2: r.no2, windKmh: wind, hour });
      const trig = new Set<number>({ traffic: [2], burning: [1], dust: [3], smog: [4], clear: [] as number[] }[c.id]);
      if (band.level !== 'good') trig.add(4);
      return { pm25: r.pm25, label: band.label, outdoorOk: band.outdoorsOk, triggered: [...trig] };
    },
  }), [readings, weather, name, tasks]);
  const ctxRef = useRef(ctx); ctxRef.current = ctx;

  // ---- voices
  useEffect(() => {
    if (!hasTTS()) return;
    const load = () => setVoices(window.speechSynthesis.getVoices());
    load(); window.speechSynthesis.onvoiceschanged = load;
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, []);
  const langVoices = useMemo(() => voices.filter((v) => v.lang.toLowerCase().startsWith(lang.code)).sort((a, b) => {
    const s = (v: SpeechSynthesisVoice) => lang.code === 'hi' ? (MALE_HI.test(v.name) ? 0 : 4) + (/natural|online/i.test(v.name) ? 0 : 2) : (/natural|online/i.test(v.name) ? 0 : 2) + (PREFERRED.some((p) => v.name.toLowerCase().includes(p)) ? 0 : 1);
    return s(a) - s(b) || a.name.localeCompare(b.name);
  }), [voices, lang.code]);
  const voice = langVoices.find((v) => v.name === voiceName) ?? langVoices[0] ?? null;
  voiceRef.current = voice;
  const noVoice = hasTTS() && lang.code !== 'en' && voices.length > 0 && langVoices.length === 0;

  const stopSpeech = useCallback(() => { if (hasTTS()) window.speechSynthesis.cancel(); }, []);

  // ---- translation of bot output
  const outText = useCallback(async (t: string) => {
    if (langRef.current.code === 'en') return t;
    try { return await translate(t, 'en', langRef.current.code); } catch { note('Translation is unavailable right now, so I am using English.'); setLangCode('en'); langRef.current = LANGS[0]; return t; }
  }, [note, setLangCode]);

  // ---- microphone
  const stopMic = useCallback(() => { try { rec.current?.abort(); } catch { /* not running */ } rec.current = null; setListening(false); }, []);
  const sendRef = useRef<(text: string, english?: string) => void>(() => undefined);
  const listen = useCallback(() => {
    const C = recCtor();
    if (!C) return;
    stopSpeech(); stopMic();
    const r = new C();
    r.lang = langRef.current.mic; r.continuous = false; r.interimResults = false; r.maxAlternatives = 1;
    let got = false;
    r.onresult = (e) => { got = true; silent.current = 0; const t = e.results[0]?.[0]?.transcript ?? ''; if (t.trim()) void cleanTranscript(t).then((c) => sendRef.current(c)); };
    r.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      setHandsFree(false); setListening(false);
      note(e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'Microphone access is blocked. Allow it from the padlock icon in the address bar, then try again. You can type instead.' : e.error === 'network' ? 'Speech recognition needs an internet connection. You can type instead.' : `Could not use the microphone (${e.error}). You can type instead.`);
    };
    r.onend = () => {
      setListening(false);
      if (hf.current && !got && stateRef.current?.stage !== 'ended') { silent.current++; if (silent.current >= 3) { setHandsFree(false); note('Hands-free paused: I did not hear anything. Tap Hands-free or the microphone to continue.'); } else window.setTimeout(() => { if (hf.current && !running.current) listen(); }, 400); }
    };
    rec.current = r;
    try { r.start(); setListening(true); } catch { setListening(false); }
  }, [note, stopMic, stopSpeech]);

  // ---- message queue: typing dots, then the bubble, then (optionally) speech
  const flush = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    const g = gen.current;
    while (queue.current.length) {
      const m = queue.current.shift()!;
      setTyping(true);
      const delay = Math.min(1400, Math.max(400, 400 + m.text.length * 9));
      const [text, chips] = await Promise.all([outText(m.text), Promise.all((m.chips ?? []).map(async (c) => ({ value: c, label: await outText(c).catch(() => c) }))), sleep(delay)]).then((r) => [r[0], r[1]] as const);
      if (g !== gen.current) { running.current = false; return; }
      setTyping(false);
      setItems((x) => [...x, { id: ++idRef.current, role: 'bot', text, chips: chips.length ? chips : undefined, tasks: m.tasks }]);
      if (voiceOnRef.current && hasTTS() && m.text && (langRef.current.code === 'en' || voiceRef.current)) { await speak(text, voiceRef.current, rateRef.current, langRef.current.mic); if (g !== gen.current) { running.current = false; return; } }
    }
    running.current = false;
    if (hf.current && supported && stateRef.current?.stage !== 'ended') listen();
  }, [listen, outText, supported]);
  const enqueue = useCallback((msgs: BotMsg[]) => { queue.current.push(...msgs); void flush(); }, [flush]);

  const begin = useCallback(() => {
    gen.current++; queue.current = []; running.current = false; stopSpeech(); stopMic(); setTyping(false); setItems([]);
    const out = startChat(ctxRef.current);
    stateRef.current = out.state; setView(out.state); enqueue(out.msgs);
  }, [enqueue, stopMic, stopSpeech]);
  // begin() fully resets the chat, so a development-mode double mount simply starts it again cleanly.
  // The opening mentions today's air, so wait until the live air data has loaded (or failed) before starting.
  const airReady = air.status !== 'loading';
  useEffect(() => { if (!airReady) return; if (!savedChat.current) { markLive(userKey); if (supported) { setHandsFree(true); hf.current = true; } begin(); } return () => { gen.current++; stopSpeech(); stopMic(); }; }, [airReady]); // eslint-disable-line react-hooks/exhaustive-deps
  // save the chat after every change, and when leaving the tab also keep any replies that were still being typed out
  const itemsRef = useRef(items); itemsRef.current = items;
  useEffect(() => { if (stateRef.current) saveChat(userKey, { items, state: stateRef.current }); }, [items, view, userKey]);
  useEffect(() => () => {
    if (!stateRef.current) return;
    const pending: Item[] = queue.current.map((m) => ({ id: ++idRef.current, role: 'bot', text: m.text, chips: m.chips?.map((c) => ({ label: c, value: c })), tasks: m.tasks }));
    saveChat(userKey, { items: [...itemsRef.current, ...pending], state: stateRef.current });
  }, [userKey]);
  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: active ? 'smooth' : 'auto' }); }, [items, typing, active]);
  // while another section is showing, stop talking and listening (the conversation itself is kept)
  useEffect(() => { if (!active) { stopSpeech(); stopMic(); setHandsFree(false); hf.current = false; } }, [active, stopSpeech, stopMic]);

  // ---- sending
  const send = useCallback(async (text: string, english?: string) => {
    const t = text.trim();
    if (!t || !stateRef.current) return;
    stopSpeech(); stopMic(); queue.current = []; gen.current++; running.current = false; setTyping(false);
    setItems((x) => [...x, { id: ++idRef.current, role: 'me', text: t }]);
    let eng = english ?? t;
    if (!english && langRef.current.code !== 'en') {
      try { eng = await translate(t, langRef.current.code, 'en'); } catch { note('Translation is unavailable right now, so I am switching to English.'); setLangCode('en'); langRef.current = LANGS[0]; eng = t; }
    }
    const out = respond(stateRef.current, eng, ctxRef.current);
    stateRef.current = out.state; setView(out.state);
    if (out.reset) setItems([]); // "start a new conversation": the old messages leave the screen
    if (out.state.stage === 'ended') { setHandsFree(false); hf.current = false; }
    enqueue(out.msgs);
  }, [enqueue, note, setLangCode, stopMic, stopSpeech]);
  sendRef.current = (t, e) => void send(t, e);

  const decide = (task: Task, d: 'accept' | 'decline') => {
    const st = stateRef.current;
    if (!st || st.decisions[task.id]) return;
    stopSpeech(); stopMic(); queue.current = []; gen.current++; running.current = false;
    // an accept that is not allowed (missing school, hazardous air, no adult) is refused before it is recorded
    if (d === 'accept') { const refused = onAccept(task, st.profile.nick ?? 'Volunteer'); if (refused) { note(refused); return; } }
    const out = onDecision(st, task.id, d, ctxRef.current);
    stateRef.current = out.state; setView(out.state);
    if (d === 'accept') note(`Accepted: ${task.title}. It is pending until an adult confirms.`);
    enqueue(out.msgs);
  };

  const testVoice = () => { stopSpeech(); if (noVoice) { note(`No ${lang.name} voice is installed in this browser, so I can only show text.`); return; } void speak(lang.code === 'en' ? 'Hi, this is how I sound. Pick whichever voice you like best.' : 'Hello. ' + lang.name, voice, rate, lang.mic); };
  const toggleHands = () => {
    if (!supported) return;
    const on = !handsFree; setHandsFree(on); hf.current = on; silent.current = 0;
    if (on) { if (!running.current && stateRef.current?.stage !== 'ended') listen(); } else stopMic();
  };
  const micTap = () => { if (listening) stopMic(); else listen(); };

  const p = view?.profile;
  const accepted = view ? Object.values(view.decisions).filter((d) => d === 'accept').length : 0;
  const typesLabel = p?.types.length ? (p.types.length === 5 ? 'Everything' : p.types.map((id) => typeOf(id).name).join(', ')) : 'n/a';
  const row = (k: string, v: string) => <tr key={k}><th scope="row">{k}</th><td>{v}</td></tr>;

  return (
    <div className="guide">
      <section className="guide-chat card" aria-label={`${BOT_NAME} volunteer guide chat`}>
        <header className="guide-head">
          <span className="guide-av" aria-hidden>{BOT_NAME[0]}</span>
          <div className="guide-title"><b>{BOT_NAME} · volunteer guide</b><span>Automated assistant (not a real person)</span></div>
          <div className="guide-head-actions">
            {supported && <button className={`btn btn-sm ${handsFree ? 'btn-primary' : ''}`} onClick={toggleHands} aria-pressed={handsFree}>{handsFree ? '🎙 Hands-free on' : '🎙 Hands-free'}</button>}
            <button className="btn btn-sm btn-ghost" onClick={begin}><Reset />Start over</button>
          </div>
        </header>

        <div className="guide-log" ref={logRef} role="log" aria-live="polite" dir="auto">
          {items.map((it) => (
            <div key={it.id} className={`g-row ${it.role}`}>
              <div className="g-bubble" dir="auto">
                <span>{it.text}</span>
                {it.tasks && <div className="g-cards">{it.tasks.map((v) => <TaskCard key={v.task.id} v={v} decision={view?.decisions[v.task.id]} onDecide={decide} />)}</div>}
              </div>
              {it.chips && it.id === items[items.length - 1]?.id && view?.stage !== 'ended' && (
                <div className="g-chips">{it.chips.map((c) => <button key={c.value} className="chip chip-btn" onClick={() => void send(c.label, c.value)}>{c.label}</button>)}</div>
              )}
            </div>
          ))}
          {typing && <div className="g-row bot"><div className="g-bubble g-typing" aria-label={`${BOT_NAME} is typing`}><i /><i /><i /></div></div>}
          {view?.stage === 'ended' && <div className="g-ended">Conversation ended. Say hi or tap Start over to chat again.</div>}
        </div>

        {toast && <div className="callout guide-toast" role="status"><Alert /><span>{toast}</span></div>}
        <form className="guide-input" onSubmit={(e) => { e.preventDefault(); const t = input; setInput(''); void send(t); }}>
          {supported && <button type="button" className={`g-mic ${listening ? 'on' : ''}`} onClick={micTap} aria-pressed={listening} aria-label={listening ? 'Stop listening' : 'Speak your answer'} title="Speak your answer">🎤</button>}
          <input className="field" dir="auto" value={input} onChange={(e) => setInput(e.target.value)} placeholder={listening ? 'Listening…' : 'Type your answer…'} aria-label="Type your message" />
          <button className="btn btn-primary" type="submit" disabled={!input.trim()}>Send<ArrowRight /></button>
        </form>
        <p className="muted tiny guide-foot">Prototype. Task sites are examples. Accepted tasks go to your organization’s verification queue and always need adult confirmation and supervision. Air advice is general guidance, not medical advice.</p>
      </section>

      <aside className="guide-side">
        <section className="card card-pad">
          <div className="card-title"><div><h3>What I know about you</h3></div></div>
          <table className="g-table"><tbody>
            {row('Name', p?.nick ?? 'n/a')}{row('Area', p?.area ?? 'n/a')}{row('Activity', typesLabel)}{row('Setting', p?.setting ?? 'n/a')}
            {row('Time per task', p?.hours == null ? 'n/a' : p.hours === 99 ? 'Flexible' : `${p.hours} h`)}{row('Distance', p ? `${p.radius} km` : 'n/a')}{row('Tasks accepted', String(accepted))}
          </tbody></table>
        </section>

        <section className="card card-pad">
          <div className="card-title"><div><h3>Language</h3></div></div>
          <select className="select" value={lang.code} onChange={(e) => { setLangCode(e.target.value); langRef.current = langOf(e.target.value); stopSpeech(); setVoiceName(''); }} aria-label="Language">
            {LANGS.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
          </select>
          <div className="callout" style={{ marginTop: 10 }}><Alert /><span>Hindi uses a free translation service: your messages are sent to it. Don’t type personal details. Translation may be imperfect, and Hindi should be typed in Devanagari (हिन्दी), not Roman letters.</span></div>
          {noVoice && <p className="muted tiny" style={{ marginTop: 8 }}>No {lang.name} voice is installed in this browser, so replies are text only.</p>}
        </section>

        <section className="card card-pad">
          <div className="card-title"><div><h3>Voice</h3></div></div>
          {!hasTTS() ? <p className="muted tiny">This browser has no speech output, so replies are text only.</p> : (
            <div className="g-voice">
              <select className="select" value={voice?.name ?? ''} onChange={(e) => setVoiceName(e.target.value)} aria-label="Voice" disabled={!langVoices.length}>
                {langVoices.length === 0 ? <option value="">Default voice</option> : langVoices.map((v) => <option key={v.name} value={v.name}>{v.name}</option>)}
              </select>
              <label className="g-rate"><span>Speed <b className="mono">{rate.toFixed(2)}</b></span><input type="range" className="slider" min={0.8} max={1.2} step={0.05} value={rate} onChange={(e) => setRate(parseFloat(e.target.value))} /></label>
              <div className="chip-row wrap">
                <button className="btn btn-sm" onClick={() => { setVoiceOn(!voiceOn); stopSpeech(); }} aria-pressed={voiceOn}>{voiceOn ? '🔊 Voice on' : '🔇 Voice off'}</button>
                <button className="btn btn-sm btn-ghost" onClick={testVoice}>Test voice</button>
              </div>
            </div>
          )}
        </section>
      </aside>
    </div>
  );
}

function TaskCard({ v, decision, onDecide }: { v: TaskView; decision?: 'accept' | 'decline'; onDecide: (t: Task, d: 'accept' | 'decline') => void }) {
  const t = v.task, ty = typeOf(t.type);
  return (
    <article className={`g-card ${decision ?? ''}`}>
      <div className="g-card-top"><span aria-hidden>{ty.emoji}</span><b>{t.title}</b></div>
      <div className="chip-row wrap"><span className="chip">{t.area}</span><span className="chip">{v.distKm.toFixed(1)} km</span><span className="chip">{t.hours} h</span><span className="chip">{t.indoor ? 'Indoor' : 'Outdoor'}</span><span className={`chip ${v.needed ? 'needed' : ''}`}>{v.needed ? `High need · ${t.need}/100` : `Need ${t.need}/100`}</span></div>
      <p className="muted tiny" style={{ margin: '6px 0 0' }}>Why here: {t.reason}</p>
      {decision === 'accept' && (
        <div className="g-where">
          <span className="muted tiny">Where: {t.area} (the middle of the neighbourhood; your organization confirms the exact meeting spot)</span>
          <span className="chip-row wrap"><a className="btn btn-sm btn-primary" href={mapsView(t.lat, t.lon)} target="_blank" rel="noopener noreferrer">📍 Open in Google Maps</a><a className="btn btn-sm" href={mapsDirections(t.lat, t.lon)} target="_blank" rel="noopener noreferrer">Get directions</a></span>
        </div>
      )}
      {decision ? <div className={`g-status ${decision}`}>{decision === 'accept' ? <><Check />Accepted · pending adult confirmation</> : 'Declined'}</div>
        : <div className="chip-row"><button className="btn btn-primary btn-sm" onClick={() => onDecide(t, 'accept')}>Accept</button><button className="btn btn-sm" onClick={() => onDecide(t, 'decline')}>Decline</button></div>}
    </article>
  );
}
