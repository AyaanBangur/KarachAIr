import { useEffect, useMemo, useRef, useState } from 'react';
import { useTerra } from '../../lib/data';
import { useAuth } from '../../lib/auth';
import { LOG_KINDS, SHARED_ENABLED, kindOf, logsToCsv, parseNote, useLogs, type LogKind, type Measure, type Mission, type Shade, type Status, type VolunteerLog } from '../../lib/logs';
import { unitAt } from '../../lib/geo';
import { downloadText } from '../../lib/export';
import { fmtDelta, fmtTemp } from '../../lib/format';
import { hrefFor } from '../../lib/hooks';
import { Alert, ArrowRight, Check, Close, Doc, Download, MapIcon, Menu, Pin, Sparkle, Thermometer } from '../icons';
import { Seg, TierBadge } from '../ui';

const nowLocal = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
const STATUS: Record<Status, { label: string; cls: string }> = { pending: { label: 'Awaiting review', cls: '' }, verified: { label: 'Verified', cls: 'ok' }, flagged: { label: 'Needs a second look', cls: 'bad' } };
export const StatusChip = ({ s }: { s: Status }) => <span className={`chip status-chip ${STATUS[s].cls}`}>{s === 'verified' ? <Check /> : s === 'flagged' ? <Alert /> : null}{STATUS[s].label}</span>;

export function VolunteerTab() {
  const { data } = useTerra();
  const { session } = useAuth();
  const { logs, mine, missions, add, remove, sync, unsynced, refresh, persisted } = useLogs();
  const [missionId, setMissionId] = useState<string | null>(null);
  const volunteer = session?.member?.name ?? session?.org?.name ?? '';
  const firstName = volunteer.split(' ')[0];
  const [scope, setScope] = useState<'mine' | 'all'>('mine');
  const taRef = useRef<HTMLTextAreaElement>(null);

  const [viewId, setViewId] = useState<string | null>(null); // null = composer
  const [drawer, setDrawer] = useState(false);
  const [q, setQ] = useState('');

  // ---- composer state
  const [notes, setNotes] = useState('');
  const [kind, setKind] = useState<LogKind | null>(null);
  const [unitId, setUnitId] = useState<string | null>(null);
  const [tempStr, setTempStr] = useState('');
  const [measure, setMeasure] = useState<Measure | null>(null);
  const [shade, setShade] = useState<Shade | null>(null);
  const [place, setPlace] = useState('');
  const [observedAt, setObservedAt] = useState(nowLocal);
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [geoMsg, setGeoMsg] = useState('');

  const parsed = useMemo(() => parseNote(notes, data.units), [notes, data.units]);
  const eff = {
    kind: kind ?? parsed.kind ?? 'other',
    unitId: unitId ?? parsed.unitId,
    temp: tempStr !== '' ? parseFloat(tempStr) : parsed.tempC,
    measure: measure ?? parsed.measure ?? 'air',
    shade: shade ?? parsed.shade,
  };
  const tempOk = eff.temp == null || (Number.isFinite(eff.temp) && eff.temp >= 0 && eff.temp <= 80);
  const canSave = (notes.trim().length > 0 || eff.temp != null) && tempOk;
  const unitName = (id: string | null) => data.units.find((u) => u.properties.id === id)?.properties.name ?? null;

  useEffect(() => { const t = taRef.current; if (t) { t.style.height = 'auto'; t.style.height = Math.min(240, t.scrollHeight) + 'px'; } }, [notes, viewId]);

  const useLocation = () => {
    if (!navigator.geolocation) { setGeoMsg('Location is not available in this browser.'); return; }
    setGeoMsg('Finding you…');
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const { latitude: lat, longitude: lon } = p.coords;
        setCoords({ lat, lon });
        const u = unitAt(data.units, lon, lat);
        if (u) { setUnitId(u.properties.id); setGeoMsg(`You're in ${u.properties.name}.`); } else setGeoMsg('Location saved, but it is outside Karachi\'s 24 units — pick a unit manually.');
      },
      () => setGeoMsg('Could not get your location. You can pick a unit instead.'),
      { enableHighAccuracy: true, timeout: 12000 },
    );
  };

  const reset = () => { setMissionId(null); setNotes(''); setKind(null); setUnitId(null); setTempStr(''); setMeasure(null); setShade(null); setPlace(''); setObservedAt(nowLocal()); setCoords(null); setGeoMsg(''); };
  const newLog = () => { reset(); setViewId(null); setDrawer(false); setTimeout(() => taRef.current?.focus(), 50); };

  const save = () => {
    if (!canSave) return;
    const log = add({
      observedAt: new Date(observedAt || Date.now()).toISOString(), volunteer: volunteer.trim(), unitId: eff.unitId, place: place.trim(),
      lat: coords?.lat ?? null, lon: coords?.lon ?? null, kind: eff.kind, tempC: eff.temp ?? null, measure: eff.temp != null ? eff.measure : null,
      shade: eff.shade, tags: parsed.tags, notes: notes.trim(), missionId,
    });
    reset(); setViewId(log.id);
  };

  const startMission = (m: Mission) => {
    setMissionId(m.id); if (m.kind) setKind(m.kind); if (m.unitId) setUnitId(m.unitId);
    setNotes((n) => n || (m.kind ? kindOf(m.kind).example : '')); setViewId(null); setTimeout(() => { taRef.current?.focus(); taRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, 60);
  };
  const activeMissions = missions.filter((m) => m.active);
  const myVerified = logs.filter((l) => mine.has(l.id) && l.status === 'verified').length;
  const prefill = (k: LogKind) => { const kd = kindOf(k); setKind(k); setNotes(kd.example); setTimeout(() => taRef.current?.focus(), 30); };

  const current = viewId ? logs.find((l) => l.id === viewId) ?? null : null;
  const scoped = scope === 'mine' ? logs.filter((l) => mine.has(l.id)) : logs;
  const filtered = scoped.filter((l) => !q || `${l.notes} ${l.place} ${unitName(l.unitId) ?? ''} ${kindOf(l.kind).label}`.toLowerCase().includes(q.toLowerCase()));
  const todayStr = new Date().toDateString();
  const groups = [{ label: 'Today', items: filtered.filter((l) => new Date(l.createdAt).toDateString() === todayStr) }, { label: 'Earlier', items: filtered.filter((l) => new Date(l.createdAt).toDateString() !== todayStr) }].filter((g) => g.items.length);
  const covered = new Set(scoped.map((l) => l.unitId).filter(Boolean)).size;

  return (
    <div className="tab-body container-wide">
      <div className="vol">
        <aside className={`vol-side card ${drawer ? 'open' : ''}`} aria-label="Your logs">
          <button className="btn btn-primary new-log" onClick={newLog}><Sparkle />New log</button>
          {SHARED_ENABLED && <Seg<'mine' | 'all'> label="Whose logs" value={scope} onChange={setScope} options={[{ value: 'mine', label: `My logs (${logs.filter((l) => mine.has(l.id)).length})` }, { value: 'all', label: `Team (${logs.length})` }]} />}
          <input className="field" type="search" placeholder="Search logs" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search logs" />
          <div className="vol-list">
            {groups.length === 0 && <p className="muted" style={{ fontSize: 13, padding: '8px 6px' }}>{scoped.length ? 'No logs match your search.' : scope === 'mine' ? 'Your saved logs will appear here.' : 'No team logs yet.'}</p>}
            {groups.map((g) => (
              <div key={g.label}>
                <div className="layer-label" style={{ padding: '8px 8px 4px' }}>{g.label}</div>
                {g.items.map((l) => (
                  <div key={l.id} className={`vol-item ${viewId === l.id ? 'on' : ''}`}>
                    <button className="vol-item-main" onClick={() => { setViewId(l.id); setDrawer(false); }}>
                      <i style={{ background: kindOf(l.kind).color }} />
                      <span><b>{l.notes.split('\n')[0].slice(0, 46) || kindOf(l.kind).label}</b><small>{unitName(l.unitId) ?? 'No unit'} · {new Date(l.observedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}{l.status !== 'pending' ? (l.status === 'verified' ? ' · ✓ verified' : ' · ⚑ flagged') : ''}{!mine.has(l.id) && l.volunteer ? ` · ${l.volunteer}` : ''}</small></span>
                    </button>
                    {mine.has(l.id) && <button className="icon-btn del" aria-label="Delete log" onClick={() => { if (window.confirm('Delete this log? This cannot be undone.')) { remove(l.id); if (viewId === l.id) setViewId(null); } }}><Close /></button>}
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className="vol-side-foot">
            <div className="vol-stats"><div><b>{scoped.length}</b><span>{scope === 'mine' ? 'your logs' : 'all logs'}</span></div><div><b>{covered}</b><span>of {data.units.length} units</span></div></div>
            <div className="chip-row wrap">
              <button className="btn btn-sm" disabled={!scoped.length} onClick={() => downloadText('terrawatch-volunteer-logs.csv', logsToCsv(scoped, data.units), 'text/csv')}><Download />CSV</button>
              <button className="btn btn-sm" disabled={!scoped.length} onClick={() => downloadText('terrawatch-volunteer-logs.json', JSON.stringify(scoped, null, 2), 'application/json')}><Download />JSON</button>
            </div>
            {SHARED_ENABLED ? (
              <button className={`chip sync-chip ${sync}`} onClick={refresh} title="Click to refresh now">
                <i className="dot" />{sync === 'online' ? 'Shared · synced' : sync === 'connecting' ? 'Connecting…' : `Offline${unsynced ? ` · ${unsynced} waiting to upload` : ''}`}
              </button>
            ) : <span className="chip">Saved on this device only</span>}
            <p className="muted" style={{ fontSize: 11.5 }}>{!persisted ? 'Browser storage is blocked — export your logs before closing this tab. ' : ''}{SHARED_ENABLED ? 'Logs are shared with your team and organization. You can delete only your own logs.' : 'Export to share or back up.'}</p>
          </div>
        </aside>

        <section className="vol-main">
          <button className="icon-btn vol-drawer-btn" onClick={() => setDrawer((d) => !d)} aria-label="Toggle log list"><Menu /></button>

          {current ? (
            <LogThread log={current} onNew={newLog} />
          ) : (
            <div className="composer-wrap">
              <div className="greet">
                <span className="greet-spark"><Sparkle /></span>
                <h2><span className="grad-text">Hello, {firstName || 'volunteer'}.</span></h2>
                <p>What did you observe in Karachi today?</p>
              </div>

              <div className="hub-strip">
                <div><b>{logs.filter((l) => mine.has(l.id)).length}</b><span>your logs</span></div>
                <div><b>{myVerified}</b><span>verified by {session?.org?.name ?? 'your team'}</span></div>
                <div><b>{new Set(logs.filter((l) => mine.has(l.id)).map((l) => l.unitId).filter(Boolean)).size}</b><span>neighbourhoods covered</span></div>
                <div><b>{activeMissions.length}</b><span>open missions</span></div>
              </div>

              {activeMissions.length > 0 && (
                <section className="missions" aria-label="Team missions">
                  <h3 className="up-h">Missions from {session?.org?.name} <span className="chip">{activeMissions.length}</span></h3>
                  <div className="mission-grid">
                    {activeMissions.map((m) => {
                      const pct = Math.min(100, Math.round((m.done / m.target) * 100));
                      return (
                        <button key={m.id} className={`mission ${missionId === m.id ? 'on' : ''}`} onClick={() => startMission(m)}>
                          <span className="mission-top"><b>{m.title}</b>{m.unitId && <span className="chip"><Pin />{unitName(m.unitId)}</span>}</span>
                          {m.details && <span className="muted mission-d">{m.details}</span>}
                          <span className="mission-bar"><i style={{ width: `${pct}%` }} /></span>
                          <span className="mission-foot"><span>{m.done} / {m.target} logs{pct >= 100 ? ' · complete' : ''}</span><span className="mission-go">{missionId === m.id ? 'Selected ✓' : 'Log for this mission →'}</span></span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}

              <div className="suggest">
                {LOG_KINDS.filter((k) => k.id !== 'other').slice(0, 4).map((k) => (
                  <button key={k.id} className="suggest-card" onClick={() => prefill(k.id)} style={{ '--tone': k.color } as React.CSSProperties}>
                    <span className="suggest-title"><i />{k.label}</span><span className="suggest-ex">{k.example}</span>
                  </button>
                ))}
              </div>

              <div className="composer card-glow">
                <textarea ref={taRef} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} aria-label="Describe your observation"
                  placeholder="Describe what you see — e.g. “41°C near Empress Market in Saddar, no shade, long queue at the water cart”"
                  onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save(); }} />

                {(parsed.tempC != null || parsed.shade || parsed.unitId || parsed.tags.length > 0) && (
                  <div className="detected" aria-live="polite">
                    <span className="detected-label"><Sparkle />Detected from your note</span>
                    {parsed.tempC != null && <span className="chip tag-derived">{parsed.tempC}°C {parsed.measure}</span>}
                    {parsed.shade && <span className="chip tag-derived">{parsed.shade === 'none' ? 'No shade' : parsed.shade === 'partial' ? 'Partial shade' : 'Shaded'}</span>}
                    {parsed.unitId && <span className="chip tag-derived"><Pin />{unitName(parsed.unitId)}</span>}
                    {parsed.tags.map((t) => <span key={t} className="chip">{t}</span>)}
                  </div>
                )}

                <div className="composer-fields">
                  <label className="pill-field"><span>Type</span>
                    <select className="select" value={eff.kind} onChange={(e) => setKind(e.target.value as LogKind)}>{LOG_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}</select></label>
                  <label className="pill-field"><span>Neighbourhood</span>
                    <select className="select" value={eff.unitId ?? ''} onChange={(e) => setUnitId(e.target.value || null)}><option value="">Choose…</option>{data.units.map((u) => <option key={u.properties.id} value={u.properties.id}>{u.properties.name}</option>)}</select></label>
                  <label className="pill-field"><span>When</span><input className="field" type="datetime-local" value={observedAt} max={nowLocal()} onChange={(e) => setObservedAt(e.target.value)} /></label>
                  <label className="pill-field"><span>Temperature °C</span>
                    <input className="field" type="number" inputMode="decimal" min={0} max={80} step={0.1} placeholder={parsed.tempC != null ? String(parsed.tempC) : 'optional'} value={tempStr} onChange={(e) => setTempStr(e.target.value)} aria-invalid={!tempOk} /></label>
                  {(eff.temp != null) && <div className="pill-field"><span>Reading is of</span><Seg<Measure> label="Measurement type" value={eff.measure} onChange={setMeasure} options={[{ value: 'air', label: 'Air' }, { value: 'surface', label: 'Surface' }]} /></div>}
                  <div className="pill-field"><span>Shade</span><Seg<Shade | 'unset'> label="Shade" value={eff.shade ?? 'unset'} onChange={(v) => setShade(v === 'unset' ? null : v)} options={[{ value: 'unset', label: '—' }, { value: 'none', label: 'None' }, { value: 'partial', label: 'Partial' }, { value: 'full', label: 'Full' }]} /></div>
                  <label className="pill-field grow"><span>Exact place (optional)</span><input className="field" placeholder="e.g. outside the main gate of the school" value={place} onChange={(e) => setPlace(e.target.value)} /></label>
                  {activeMissions.length > 0 && <label className="pill-field"><span>Mission (optional)</span>
                    <select className="select" value={missionId ?? ''} onChange={(e) => setMissionId(e.target.value || null)}><option value="">None</option>{activeMissions.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}</select></label>}
                </div>

                <div className="composer-foot">
                  <div className="composer-left">
                    <button className="btn btn-sm btn-ghost" onClick={useLocation}><Pin />Use my location</button>
                    {geoMsg && <span className="muted" style={{ fontSize: 12 }}>{geoMsg}</span>}
                    {!tempOk && <span style={{ color: 'var(--c-alert)', fontSize: 12 }}>Enter a temperature between 0 and 80 °C.</span>}
                  </div>
                  <button className="btn btn-primary send" disabled={!canSave} onClick={save} aria-label="Save log"><span>Save log</span><ArrowRight /></button>
                </div>
              </div>
              <p className="muted tiny">Tip: press Ctrl/⌘ + Enter to save. {SHARED_ENABLED ? 'Saved logs are shared with your team and organization and appear on the map (location is rounded to ~100 m). ' : 'Your logs are stored on this device and appear on the map and in your report. '}Never include names, phone numbers or home addresses of other people.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ saved log + TerraWatch context
function LogThread({ log, onNew }: { log: VolunteerLog; onNew: () => void }) {
  const { data, scores } = useTerra();
  const { logs, sync, missions } = useLogs();
  const missionTitle = missions.find((m) => m.id === log.missionId)?.title;
  const u = data.units.find((x) => x.properties.id === log.unitId) ?? null;
  const s = u ? scores.get(u.properties.id) : null;
  const k = kindOf(log.kind);
  const sameUnit = logs.filter((l) => l.unitId === log.unitId && log.unitId).length;
  const lst = u?.properties.lst, air = u?.properties.air;

  const notes: { tone: 'info' | 'warn'; text: string }[] = [];
  if (log.tempC != null && log.measure === 'surface' && lst) notes.push({ tone: 'info', text: `Your surface reading of ${log.tempC.toFixed(1)}°C is ${fmtDelta(log.tempC - lst.day)}°C versus the satellite hot-season afternoon surface mean for ${u!.properties.short} (${fmtTemp(lst.day)}). Single readings vary with time of day, material and exact spot — many logs give a fairer comparison.` });
  if (log.tempC != null && log.measure === 'air' && air) notes.push({ tone: 'info', text: `Your air reading of ${log.tempC.toFixed(1)}°C is ${fmtDelta(log.tempC - air.hotSeasonTmax)}°C versus the average May–June daily maximum air temperature for this area (${fmtTemp(air.hotSeasonTmax)}, ERA5-Land ~9 km model). Air and satellite surface temperatures measure different things, so they are not directly interchangeable.` });
  if (log.tempC != null && log.tempC >= 40 && log.measure === 'air') notes.push({ tone: 'warn', text: 'Air temperatures at or above 40°C are dangerous for prolonged exposure. Drink water regularly and rest in shade.' });
  if (log.kind === 'health' || log.tags.includes('heat-illness')) notes.push({ tone: 'warn', text: 'If anyone seems seriously unwell (confusion, fainting, no sweating, very hot dry skin), move them to shade, cool them, and call local emergency services immediately. This app is not medical advice.' });

  return (
    <div className="thread">
      <div className="msg user">
        <div className="bubble">
          <div className="bubble-top"><span className="kind-dot" style={{ background: k.color }} /><b>{k.label}</b><span className="muted">{new Date(log.observedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</span></div>
          {log.notes && <p>{log.notes}</p>}
          <div className="chip-row wrap">
            {log.tempC != null && <span className="chip"><Thermometer />{log.tempC.toFixed(1)}°C {log.measure}</span>}
            {log.shade && <span className="chip">{log.shade === 'none' ? 'No shade' : log.shade === 'partial' ? 'Partial shade' : 'Shaded'}</span>}
            {u && <span className="chip"><Pin />{u.properties.name}</span>}
            {log.place && <span className="chip">{log.place}</span>}
            {log.lat != null && <span className="chip mono">{log.lat.toFixed(4)}, {log.lon?.toFixed(4)}</span>}
            {log.tags.map((t) => <span key={t} className="chip">{t}</span>)}
          </div>
          <div className="chip-row wrap"><StatusChip s={log.status} />{log.missionId && missionTitle && <span className="chip tag-derived">Mission: {missionTitle}</span>}</div>
          {log.reviewNote && <p className="muted tiny">Reviewer note: {log.reviewNote}</p>}
          {log.volunteer && <span className="muted tiny">Logged by {log.volunteer}</span>}
        </div>
      </div>

      <div className="msg bot">
        <span className="bot-avatar"><Sparkle /></span>
        <div className="bubble bot-card">
          <div className="bubble-top"><b><Check style={{ color: 'var(--emerald-400)' }} /> Log saved</b><span className="muted">{SHARED_ENABLED ? (sync === 'online' ? 'shared with your team' : 'saved here · will upload when online') : 'stored on this device'}</span></div>
          {u && s && lst ? (
            <>
              <p>Here is how <b>{u.properties.name}</b> looks in the TerraWatch data:</p>
              <div className="ctx-grid">
                <div><span>Heat risk</span><b><TierBadge index={s.index} compact /> #{s.rank}</b></div>
                <div><span>Afternoon surface (satellite)</span><b className="mono">{fmtTemp(lst.day)}</b></div>
                <div><span>Night surface (satellite)</span><b className="mono">{fmtTemp(lst.night)}</b></div>
                <div><span>Your logs here</span><b className="mono">{sameUnit}</b></div>
              </div>
            </>
          ) : <p className="muted">No neighbourhood was selected, so there is no satellite context to compare against. Pick a unit next time (or use “Use my location”).</p>}
          {notes.map((n, i) => <div key={i} className={`callout ${n.tone === 'info' ? 'info' : ''}`}>{n.tone === 'warn' ? <Alert /> : <Sparkle />}<span>{n.text}</span></div>)}
          <div className="bot-actions">
            <button className="btn btn-primary btn-sm" onClick={onNew}><Sparkle />Add another log</button>
            {log.lat != null && <a className="btn btn-sm" href={hrefFor({ tab: 'explore', unit: log.unitId ?? undefined })}><MapIcon />See on map</a>}
            {!log.lat && u && <a className="btn btn-sm" href={hrefFor({ tab: 'explore', unit: u.properties.id })}><MapIcon />Open neighbourhood</a>}
            <a className="btn btn-sm" href={hrefFor({ tab: 'report' })}><Doc />Include in report</a>
          </div>
        </div>
      </div>
    </div>
  );
}
