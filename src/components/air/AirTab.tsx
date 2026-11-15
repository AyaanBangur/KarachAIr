import { useMemo, useState } from 'react';
import { useTerra } from '../../lib/data';
import type { AirState, LiveWeather } from '../../lib/hooks';
import { AIR_BANDS, AIR_LIMITS, airBand, auditNumbers, classifyCause, draftAlert } from '../../lib/air';
import { Alert, ArrowRight, Check, Reset } from '../icons';
import { StatTile } from '../ui';
import { SafetyGate } from '../service/SafetyGate';
import { useAirFocus } from './useAirFocus';

const fmt1 = (v: number | null | undefined) => (v == null ? '—' : v.toFixed(1));

export function AirTab({ air, weather }: { air: AirState; weather: LiveWeather | null }) {
  const { data } = useTerra();
  const focus = useAirFocus(data.units, air);
  const { unit, reading } = focus;
  const wind = focus.id ? weather?.byUnit[focus.id]?.current.wind ?? null : null;
  const hour = reading ? parseInt(reading.time.slice(11, 13), 10) : null;
  const band = reading ? airBand(reading.pm25) : null;
  const cause = useMemo(() => (reading && hour != null ? classifyCause({ pm25: reading.pm25, pm10: reading.pm10, no2: reading.no2, windKmh: wind, hour }) : null), [reading, hour, wind]);

  const ranked = useMemo(
    () => data.units.map((u) => ({ u, r: air.data?.byUnit[u.properties.id] })).filter((x): x is { u: typeof x.u; r: NonNullable<typeof x.r> } => !!x.r).sort((a, b) => b.r.pm25 - a.r.pm25),
    [data.units, air.data],
  );
  const maxPm = Math.max(200, ...ranked.map((x) => x.r.pm25));
  const counts = AIR_BANDS.map((b) => ({ b, n: ranked.filter((x) => airBand(x.r.pm25).level === b.level).length }));

  return (
    <div className="tab-body container-wide air-tab">
      <div className="air-head">
        <div><h2>Air quality today</h2><p className="muted">Live PM2.5 for each Karachi unit, a guess at what is behind it, and what students can safely do about it.</p></div>
        <label className="pill-field air-pick"><span>Neighbourhood</span>
          <select className="select" value={focus.isAuto ? '' : focus.id ?? ''} onChange={(e) => focus.setId(e.target.value || null)}>
            <option value="">Dirtiest right now{focus.isAuto && unit ? ` (${unit.properties.short})` : ''}</option>
            {data.units.map((u) => <option key={u.properties.id} value={u.properties.id}>{u.properties.name}</option>)}
          </select>
        </label>
      </div>

      {air.status === 'error' && (
        <div className="callout"><Alert /><span>Could not reach the live air-quality service. Outdoor missions stay locked until it loads. <button className="btn btn-sm" style={{ marginLeft: 8 }} onClick={air.reload}><Reset />Retry</button></span></div>
      )}
      {air.status === 'loading' && !reading && <p className="muted">Loading live air quality for 24 units…</p>}

      {reading && band && cause && unit && (
        <>
          <div className="air-top">
            <section className="card card-pad air-status" aria-label="Air status">
              <div className="air-light" role="img" aria-label={`Traffic light: ${band.label}`}>
                {AIR_BANDS.slice().reverse().map((b) => <i key={b.level} className={b.level === band.level ? 'on' : ''} style={{ '--air': b.color } as React.CSSProperties} />)}
              </div>
              <div className="air-status-main">
                <span className="muted" style={{ fontSize: 12.5 }}>{unit.properties.name} · {reading.time.replace('T', ' ')} local</span>
                <div className="air-big" style={{ color: band.color }}><span className="mono">{fmt1(reading.pm25)}</span><small>µg/m³ PM2.5</small></div>
                <b className="air-label" style={{ color: band.color }}>{band.label}</b>
                <p className={`air-outdoor ${band.outdoorsOk ? 'ok' : 'no'}`}>{band.outdoorsOk ? <Check /> : <Alert />}{band.outdoorsOk ? 'Safe for outdoor missions' : 'Outdoor missions locked'}</p>
                <p className="muted" style={{ fontSize: 13 }}>{band.advice}</p>
              </div>
            </section>

            <section className="card card-pad air-cause" aria-label="Why is the air dirty">
              <div className="card-title"><div><h3>Why is the air dirty?</h3><p>One-line guess from the hour, NO₂, wind and the fine-to-coarse particle ratio.</p></div><span className="chip">Rule of thumb</span></div>
              <p className="air-cause-line"><span className={`cause-dot ${cause.id}`} />{cause.sentence}</p>
              <ul className="air-evidence">{cause.evidence.map((e) => <li key={e}>{e}</li>)}</ul>
              <div className="up-grid">
                <StatTile label="PM10" value={fmt1(reading.pm10)} sub="µg/m³" tone="var(--c-heat)" />
                <StatTile label="NO₂" value={fmt1(reading.no2)} sub="µg/m³" tone="var(--c-pop)" />
                <StatTile label="Wind" value={fmt1(wind)} sub="km/h" tone="var(--c-cool)" />
                <StatTile label="PM2.5 / PM10" value={reading.pm10 > 0 ? (reading.pm25 / reading.pm10).toFixed(2) : '—'} sub="fine share" tone="var(--c-veg)" />
              </div>
            </section>
          </div>

          <AlertBuilder key={focus.id} place={unit.properties.name} reading={reading} wind={wind} cause={cause} band={band} />
        </>
      )}

      <div className="air-bottom">
        <SafetyGate place={unit?.properties.short ?? 'Karachi'} reading={reading ?? null} simulate={false} />

        <section className="card card-pad air-rank" aria-label="Units ranked by PM2.5">
          <div className="card-title"><div><h3>All units, dirtiest first</h3><p>Click a row to focus it. Model values; neighbours share ~11 km grid cells.</p></div></div>
          <div className="chip-row wrap" style={{ marginBottom: 10 }}>
            {counts.map(({ b, n }) => <span key={b.level} className="chip air-chip" style={{ '--air': b.color } as React.CSSProperties}><i className="dot" />{n} {b.label.toLowerCase()}</span>)}
          </div>
          <ol className="air-rank-list">
            {ranked.map(({ u, r }) => {
              const b = airBand(r.pm25);
              return (
                <li key={u.properties.id}>
                  <button className={focus.id === u.properties.id ? 'on' : ''} onClick={() => focus.setId(u.properties.id)}>
                    <span className="air-rank-name">{u.properties.short}</span>
                    <span className="air-rank-bar"><i style={{ width: `${Math.min(100, (r.pm25 / maxPm) * 100)}%`, background: b.color }} /></span>
                    <b className="mono">{r.pm25.toFixed(1)}</b>
                  </button>
                </li>
              );
            })}
          </ol>
        </section>
      </div>

      <section className="air-limits" aria-label="Evaluation and honest limits">
        <h4>Evaluation &amp; honest limits</h4>
        <p><b>Accuracy:</b> we have not benchmarked the source tag against labelled smoke or dust events, so we do not quote a hit rate. The numbers above are live model values; the tag is a transparent rule you can read in the evidence list.</p>
        <b>Four ways this view can mislead you</b>
        <ol>{AIR_LIMITS.map((l) => <li key={l}>{l}</li>)}</ol>
      </section>
    </div>
  );
}

// ------------------------------------------------------------------ one-click alert with number audit
function AlertBuilder({ place, reading, wind, cause, band }: { place: string; reading: { pm25: number; pm10: number; no2: number | null }; wind: number | null; cause: ReturnType<typeof classifyCause>; band: ReturnType<typeof airBand> }) {
  const gen = useMemo(() => draftAlert({ place, pm25: reading.pm25, pm10: reading.pm10, no2: reading.no2, windKmh: wind, band, cause }), [place, reading, wind, band, cause]);
  const [edit, setEdit] = useState<{ en?: string; ur?: string; base: string } | null>(null);
  const [copied, setCopied] = useState<'en' | 'ur' | null>(null);
  const base = gen.en + '|' + gen.ur;
  const live = edit && edit.base === base ? edit : null;
  const en = live?.en ?? gen.en, ur = live?.ur ?? gen.ur;

  // Source values as displayed on screen (one decimal), so a number "matches" only if the reader could see it in the status panel.
  const facts = useMemo(() => [
    { name: 'PM2.5', value: +reading.pm25.toFixed(1) }, { name: 'PM10', value: +reading.pm10.toFixed(1) },
    ...(reading.no2 != null ? [{ name: 'NO₂', value: +reading.no2.toFixed(1) }] : []), ...(wind != null ? [{ name: 'wind', value: +wind.toFixed(1) }] : []),
  ], [reading, wind]);
  const audits = { en: auditNumbers(en, facts), ur: auditNumbers(ur, facts) };
  const allOk = audits.en.ok && audits.ur.ok;

  const copy = async (k: 'en' | 'ur') => {
    try { await navigator.clipboard.writeText(k === 'en' ? en : ur); setCopied(k); setTimeout(() => setCopied(null), 1800); } catch { /* clipboard blocked */ }
  };
  const wa = `https://wa.me/?text=${encodeURIComponent(`${en}\n\n${ur}`)}`;

  const rows = Math.max(5, Math.ceil(en.length / 46) + 1, Math.ceil(ur.length / 36) + 1);
  const problems = [
    !audits.en.mentionsPm25 && 'The English text does not state the PM2.5 value',
    !audits.ur.mentionsPm25 && 'The Urdu text does not state the PM2.5 value',
    ...[...audits.en.rows, ...audits.ur.rows].filter((r) => !r.matches).map((r) => `“${r.token}” does not match any source value`),
  ].filter(Boolean) as string[];

  return (
    <section className="card air-alert" aria-label="Alert generator">
      <header className="air-alert-head">
        <div>
          <h3>One-click school / NGO alert</h3>
          <p>Ready-to-send messages in English and Urdu. Edit any word and the checker re-audits every number against the readings above.</p>
        </div>
        <div className="air-alert-head-actions">
          {live && <button className="btn btn-sm btn-ghost" onClick={() => setEdit(null)}><Reset />Reset draft</button>}
          <span className="chip">Template, no live AI call</span>
        </div>
      </header>

      <div className="air-alert-grid">
        <MsgCard rows={rows} id="alert-en" code="EN" title="English" value={en} ok={audits.en.ok} copied={copied === 'en'} onCopy={() => copy('en')} onChange={(v) => setEdit({ ...(live ?? { base }), base, en: v })} />
        <MsgCard rows={rows} id="alert-ur" code="اردو" title="Urdu" rtl value={ur} ok={audits.ur.ok} copied={copied === 'ur'} onCopy={() => copy('ur')} onChange={(v) => setEdit({ ...(live ?? { base }), base, ur: v })} />
      </div>

      <div className={`air-audit ${allOk ? 'ok' : 'bad'}`} role="status" aria-live="polite">
        {allOk ? <Check /> : <Alert />}
        <div>
          <b>{allOk ? 'Number check passed' : 'Number check failed'}</b>
          <span>{allOk ? `All ${audits.en.rows.length + audits.ur.rows.length} numbers in both messages match the readings above.` : problems.join(' · ')}</span>
          <small>Source values: {facts.map((f) => `${f.name} ${f.value}`).join(' · ')}</small>
        </div>
        <a className={`btn btn-primary air-share ${allOk ? '' : 'disabled'}`} href={allOk ? wa : undefined} target="_blank" rel="noreferrer" aria-disabled={!allOk}>Share via WhatsApp<ArrowRight /></a>
      </div>
    </section>
  );
}

function MsgCard({ id, code, title, value, rows, rtl, ok, copied, onCopy, onChange }: { rows: number; id: string; code: string; title: string; value: string; rtl?: boolean; ok: boolean; copied: boolean; onCopy: () => void; onChange: (v: string) => void }) {
  return (
    <div className={`msg-card ${rtl ? 'is-ur' : ''}`}>
      <div className="msg-card-top">
        <label htmlFor={id}><span className="msg-code" lang={rtl ? 'ur' : 'en'}>{code}</span>{title}</label>
        <button className="btn btn-sm btn-ghost msg-copy" disabled={!ok} onClick={onCopy}>{copied ? <><Check />Copied</> : 'Copy'}</button>
      </div>
      <textarea id={id} className="msg-text" dir={rtl ? 'rtl' : 'ltr'} lang={rtl ? 'ur' : 'en'} rows={rows} value={value} spellCheck={false} onChange={(e) => onChange(e.target.value)} />
      <div className={`msg-card-foot ${ok ? 'ok' : 'bad'}`}>{ok ? <><Check />Numbers verified</> : <><Alert />Needs a fix</>}<span className="muted">{value.length} characters</span></div>
    </div>
  );
}
