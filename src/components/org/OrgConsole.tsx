import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTerra } from '../../lib/data';
import { useAuth } from '../../lib/auth';
import { rpc } from '../../lib/api';
import { LOG_KINDS, SHARED_ENABLED, kindOf, useLogs, type LogKind, type Status, type VolunteerLog } from '../../lib/logs';
import { miniMapPaths } from '../../lib/miniMap';
import { fmtDelta, fmtTemp } from '../../lib/format';
import { downloadText } from '../../lib/export';
import { logsToCsv } from '../../lib/logs';
import { hrefFor } from '../../lib/hooks';
import { Seg, StatTile, TierBadge, InfoNote } from '../ui';
import { Alert, Check, Close, Doc, Download, Pin, Sparkle, Users } from '../icons';

type Sub = 'overview' | 'coverage' | 'missions' | 'review';
interface Member { id: string; name: string; email: string | null; joined: string; last_seen: string; logs: number; verified: number; last_log: string | null }
const ago = (iso: string | null) => { if (!iso) return '—'; const m = Math.round((Date.now() - +new Date(iso)) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };

export function OrgConsole() {
  const { session } = useAuth();
  const { logs, missions, shared, sync, refresh } = useLogs();
  const [sub, setSub] = useState<Sub>('overview');
  const pending = logs.filter((l) => l.status === 'pending').length;
  if (!shared) return <div className="tab-body container-wide"><InfoNote>The organization console needs the shared database (accounts, volunteers, missions and review all live there). {SHARED_ENABLED ? 'You are in local demo mode — sign out and register an organization to use it.' : 'Set VITE_SUPABASE_URL and VITE_SUPABASE_KEY to enable it.'}</InfoNote></div>;
  return (
    <div className="tab-body container-wide">
      <div className="org-head">
        <div><span className="eyebrow">Organization console</span><h2 className="org-title">{session?.org?.name}</h2></div>
        <div className="org-head-right">
          <button className={`chip sync-chip ${sync}`} onClick={refresh}><i className="dot" />{sync === 'online' ? 'Live' : sync === 'connecting' ? 'Connecting…' : 'Offline'}</button>
          <Seg<Sub> label="Console section" value={sub} onChange={setSub} options={[{ value: 'overview', label: 'Team' }, { value: 'coverage', label: 'Coverage' }, { value: 'missions', label: `Missions (${missions.filter((m) => m.active).length})` }, { value: 'review', label: `Review${pending ? ` (${pending})` : ''}` }]} />
        </div>
      </div>
      {sub === 'overview' && <Overview />}
      {sub === 'coverage' && <Coverage />}
      {sub === 'missions' && <Missions />}
      {sub === 'review' && <Review />}
    </div>
  );
}

// ---------------------------------------------------------------- team: join code + roster
function Overview() {
  const { session } = useAuth();
  const { logs } = useLogs();
  const { data } = useTerra();
  const [members, setMembers] = useState<Member[] | null>(null);
  const [copied, setCopied] = useState(false);
  const load = useCallback(() => { rpc<Member[]>('tw_list_members', { p_token: session!.token }).then(setMembers).catch(() => setMembers([])); }, [session]);
  useEffect(load, [load, logs.length]);
  const verified = logs.filter((l) => l.status === 'verified').length;
  const covered = new Set(logs.map((l) => l.unitId).filter(Boolean)).size;

  const copy = () => { void navigator.clipboard?.writeText(`${window.location.origin}${window.location.pathname}#/login/volunteer`); setCopied(true); setTimeout(() => setCopied(false), 1800); };
  const removeMember = async (m: Member) => { if (!window.confirm(`Remove ${m.name}? Their logs are kept but they can no longer sign in with this session.`)) return; await rpc('tw_remove_member', { p_token: session!.token, p_id: m.id }); load(); };

  return (
    <div className="org-grid">
      <section className="card card-pad card-glow code-card">
        <div className="layer-label">How volunteers join</div>
        <div className="code-big mono" style={{ letterSpacing: '-0.02em', fontSize: 'clamp(22px,3vw,32px)' }}>{session?.org?.name}</div>
        <div className="chip-row wrap">
          <button className="btn btn-primary btn-sm" onClick={copy}>{copied ? <><Check />Copied</> : 'Copy sign-in link'}</button>
        </div>
        <p className="muted" style={{ fontSize: 12.5 }}>Send volunteers the link. They create an account (name, email, password), and when prompted choose <b>{session?.org?.name}</b> from the organization list. Anyone with an account can join any listed organization, so remove people who shouldn&rsquo;t be on your roster.</p>
      </section>

      <div className="org-kpis">
        <StatTile icon={<Users />} tone="var(--lime-400)" label="Volunteers" value={members?.length ?? '…'} sub="have joined your team" />
        <StatTile icon={<Doc />} tone="var(--c-heat)" label="Field logs" value={logs.length} sub={`${logs.filter((l) => l.status === 'pending').length} awaiting review`} />
        <StatTile icon={<Check />} tone="var(--emerald-400)" label="Verified" value={logs.length ? `${Math.round((verified / logs.length) * 100)}%` : '—'} sub={`${verified} of ${logs.length} logs`} />
        <StatTile icon={<Pin />} tone="var(--c-cool)" label="Units with data" value={`${covered} / ${data.units.length}`} sub="neighbourhoods covered" />
      </div>

      <section className="card card-pad roster">
        <div className="card-title"><div><h3>Volunteer roster</h3><p>Who is active, and how much of their work has been verified.</p></div>
          <button className="btn btn-sm" disabled={!logs.length} onClick={() => downloadText(`${session?.org?.name ?? 'team'}-logs.csv`.replace(/\s+/g, '-'), logsToCsv(logs, data.units), 'text/csv')}><Download />Export all logs</button></div>
        {members == null ? <div className="skeleton" style={{ height: 120 }} /> : members.length === 0 ? <p className="muted">No volunteers yet — share the sign-in link above.</p> : (
          <div className="table-wrap"><table className="data-table">
            <thead><tr><th>Volunteer</th><th>Email</th><th>Joined</th><th className="n">Logs</th><th className="n">Verified</th><th>Last log</th><th /></tr></thead>
            <tbody>{members.map((m) => <tr key={m.id}><td><b>{m.name}</b></td><td className="muted">{m.email ?? '—'}</td><td>{ago(m.joined)}</td><td className="num">{m.logs}</td><td className="num">{m.verified}</td><td>{ago(m.last_log)}</td><td><button className="icon-btn" aria-label={`Remove ${m.name}`} onClick={() => void removeMember(m)}><Close /></button></td></tr>)}</tbody>
          </table></div>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------- coverage gaps
function Coverage() {
  const { data, scores } = useTerra();
  const { logs, createMission } = useLogs();
  const [msg, setMsg] = useState('');
  const paths = useMemo(() => miniMapPaths(data.units), [data.units]);
  const rows = useMemo(() => [...data.units].sort((a, b) => scores.get(a.properties.id)!.rank - scores.get(b.properties.id)!.rank).map((u) => {
    const p = u.properties, s = scores.get(p.id)!, ls = logs.filter((l) => l.unitId === p.id && l.status !== 'flagged');
    const surf = ls.filter((l) => l.measure === 'surface' && l.tempC != null).map((l) => l.tempC as number);
    const field = surf.length ? surf.reduce((a, b) => a + b, 0) / surf.length : null;
    const high = ['severe', 'extreme'].includes(s.tier.key);
    return { u, s, n: ls.length, verified: ls.filter((l) => l.status === 'verified').length, last: ls[0]?.observedAt ?? null, field, nSurf: surf.length, delta: field != null && p.lst ? field - p.lst.day : null, gap: ls.length < 3, priority: high && ls.length < 3 };
  }), [data.units, scores, logs]);
  const priority = rows.filter((r) => r.priority);
  const fill = (r: (typeof rows)[number]) => (r.n === 0 ? '#27312d' : r.n < 3 ? '#c98f2f' : '#1ec28b');

  const assign = async (r: (typeof rows)[number]) => {
    const err = await createMission({ title: `Surface & air readings in ${r.u.properties.short}`, details: `${r.u.properties.name} is rated ${r.s.tier.label} for heat risk and has ${r.n} field log${r.n === 1 ? '' : 's'}. Take afternoon readings (1–3 pm) in the open and in shade.`, unitId: r.u.properties.id, kind: 'temperature', target: 3 });
    setMsg(err ?? `Mission created for ${r.u.properties.short} — volunteers will see it in their hub.`); setTimeout(() => setMsg(''), 4000);
  };

  return (
    <div className="org-cov">
      <section className="card card-pad">
        <div className="card-title"><div><h3>Coverage map</h3><p>Where your volunteers have (and haven’t) collected data. Red outline = Severe/Extreme heat risk with fewer than 3 logs.</p></div></div>
        <svg viewBox="0 0 600 400" className="mini-map" role="img" aria-label="Map of Karachi units coloured by number of field logs">
          {paths.map((p) => { const r = rows.find((x) => x.u.properties.id === p.id)!; return <path key={p.id} d={p.d} fill={fill(r)} stroke={r.priority ? '#ef5b4c' : 'rgba(7,12,10,.9)'} strokeWidth={r.priority ? 2.4 : 1} fillRule="evenodd"><title>{r.u.properties.name}: {r.n} logs · {r.s.tier.label}</title></path>; })}
          {paths.filter((p) => rows.find((x) => x.u.properties.id === p.id)!.priority).map((p) => <circle key={p.id} cx={p.cx} cy={p.cy} r="4" fill="#ef5b4c" stroke="#0a110f" strokeWidth="1.5" />)}
        </svg>
        <div className="legend" style={{ marginTop: 10 }}><span className="legend-item"><i className="mark dot" style={{ background: '#27312d' }} />No logs</span><span className="legend-item"><i className="mark dot" style={{ background: '#c98f2f' }} />1–2 logs</span><span className="legend-item"><i className="mark dot" style={{ background: '#1ec28b' }} />3+ logs</span><span className="legend-item"><i className="mark dot" style={{ background: '#ef5b4c' }} />Priority gap</span></div>
        <div className="callout" style={{ marginTop: 12 }}><Alert /><span><b>{priority.length} priority gap{priority.length === 1 ? '' : 's'}.</b> {priority.length ? `Start with ${priority.slice(0, 3).map((r) => r.u.properties.short).join(', ')}.` : 'Every high-risk unit has at least 3 logs.'}</span></div>
        {msg && <div className="callout info" style={{ marginTop: 8 }}><Check /><span>{msg}</span></div>}
      </section>

      <section className="card card-pad">
        <div className="card-title"><div><h3>Priorities & field-vs-satellite check</h3><p>Units ranked by heat risk. “Field surface” compares your volunteers’ surface readings with the satellite’s afternoon surface mean.</p></div></div>
        <div className="table-wrap" style={{ maxHeight: 560 }}><table className="data-table">
          <thead><tr><th>#</th><th>Unit</th><th>Risk</th><th className="n">Logs</th><th className="n">Field surface</th><th className="n">vs satellite</th><th /></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.u.properties.id} className={r.priority ? 'row-priority' : ''}>
              <td className="num">{r.s.rank}</td><td><b>{r.u.properties.short}</b></td><td><TierBadge index={r.s.index} compact /></td>
              <td className="num">{r.n}{r.verified ? <small className="muted"> ({r.verified}✓)</small> : null}</td>
              <td className="num">{r.field != null ? `${fmtTemp(r.field)} (n=${r.nSurf})` : '—'}</td>
              <td className="num">{r.delta != null ? `${fmtDelta(r.delta)}°C` : '—'}</td>
              <td>{r.gap && <button className={`btn btn-sm ${r.priority ? 'btn-primary' : 'btn-ghost'}`} onClick={() => void assign(r)}>Assign mission</button>}</td>
            </tr>))}</tbody>
        </table></div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------- missions
function Missions() {
  const { data } = useTerra();
  const { missions, createMission, setMissionActive } = useLogs();
  const [title, setTitle] = useState(''); const [details, setDetails] = useState(''); const [unitId, setUnitId] = useState(''); const [kind, setKind] = useState<LogKind | ''>('temperature'); const [target, setTarget] = useState(3);
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const unitName = (id: string | null) => data.units.find((u) => u.properties.id === id)?.properties.name;
  const submit = async () => {
    setBusy(true); setErr('');
    const e = await createMission({ title: title.trim(), details: details.trim(), unitId: unitId || null, kind: kind || null, target });
    setBusy(false); if (e) setErr(e); else { setTitle(''); setDetails(''); }
  };
  return (
    <div className="org-cov">
      <section className="card card-pad">
        <div className="card-title"><div><h3>New mission</h3><p>Give volunteers a clear, targeted job. They’ll see it in their hub and can tag logs to it.</p></div></div>
        <div className="auth-form" style={{ marginTop: 0 }}>
          <label className="auth-field"><span>Title</span><input className="field" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Afternoon readings at bus stops in Lyari" /></label>
          <label className="auth-field"><span>Instructions (optional)</span><textarea className="field" style={{ height: 84, padding: 10, resize: 'vertical' }} maxLength={600} value={details} onChange={(e) => setDetails(e.target.value)} placeholder="When, where and how to measure…" /></label>
          <div className="two-fields">
            <label className="auth-field"><span>Neighbourhood</span><select className="select" value={unitId} onChange={(e) => setUnitId(e.target.value)}><option value="">Anywhere</option>{data.units.map((u) => <option key={u.properties.id} value={u.properties.id}>{u.properties.name}</option>)}</select></label>
            <label className="auth-field"><span>Observation type</span><select className="select" value={kind} onChange={(e) => setKind(e.target.value as LogKind | '')}><option value="">Any</option>{LOG_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}</select></label>
          </div>
          <label className="auth-field"><span>Target number of logs: <b>{target}</b></span><input className="slider" type="range" min={1} max={30} value={target} onChange={(e) => setTarget(+e.target.value)} style={{ ['--pct' as string]: `${((target - 1) / 29) * 100}%` }} /></label>
          {err && <div className="auth-err">{err}</div>}
          <button className="btn btn-primary" disabled={busy || title.trim().length < 3} onClick={() => void submit()}><Sparkle />Create mission</button>
        </div>
      </section>
      <section className="card card-pad">
        <div className="card-title"><div><h3>Your missions</h3><p>Progress counts logs tagged to each mission (flagged logs excluded).</p></div></div>
        {missions.length === 0 ? <p className="muted">No missions yet. Create one, or assign one straight from the Coverage tab.</p> : (
          <div className="mission-list">{missions.map((m) => { const pct = Math.min(100, Math.round((m.done / m.target) * 100)); return (
            <div key={m.id} className={`mission-row ${m.active ? '' : 'closed'}`}>
              <div style={{ flex: 1, minWidth: 0 }}><b>{m.title}</b><div className="muted" style={{ fontSize: 12.5 }}>{[unitName(m.unitId), m.kind && kindOf(m.kind).label].filter(Boolean).join(' · ') || 'Anywhere · any type'}</div>
                <div className="mission-bar" style={{ marginTop: 8 }}><i style={{ width: `${pct}%` }} /></div><div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{m.done} / {m.target} logs{pct >= 100 ? ' · complete' : ''}</div></div>
              <button className="btn btn-sm btn-ghost" onClick={() => void setMissionActive(m.id, !m.active)}>{m.active ? 'Close' : 'Reopen'}</button>
            </div>); })}</div>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------- review queue
function Review() {
  const { data } = useTerra();
  const { logs, review, remove, missions } = useLogs();
  const [filter, setFilter] = useState<Status | 'all'>('pending');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const list = logs.filter((l) => filter === 'all' || l.status === filter);
  const unit = (id: string | null) => data.units.find((u) => u.properties.id === id);
  const count = (s: Status) => logs.filter((l) => l.status === s).length;
  const compare = (l: VolunteerLog) => { const u = unit(l.unitId); if (!u || l.tempC == null) return null; if (l.measure === 'surface' && u.properties.lst) return { d: l.tempC - u.properties.lst.day, ref: 'satellite afternoon surface', val: u.properties.lst.day }; if (l.measure === 'air' && u.properties.air) return { d: l.tempC - u.properties.air.hotSeasonTmax, ref: 'ERA5 May–Jun mean max air', val: u.properties.air.hotSeasonTmax }; return null; };
  return (
    <div className="review">
      <div className="review-bar">
        <Seg<Status | 'all'> label="Review filter" value={filter} onChange={setFilter} options={[{ value: 'pending', label: `Awaiting (${count('pending')})` }, { value: 'verified', label: `Verified (${count('verified')})` }, { value: 'flagged', label: `Flagged (${count('flagged')})` }, { value: 'all', label: 'All' }]} />
        {count('pending') > 0 && filter === 'pending' && <button className="btn btn-sm" onClick={() => { if (window.confirm(`Mark all ${count('pending')} awaiting logs as verified?`)) logs.filter((l) => l.status === 'pending').forEach((l) => void review(l.id, 'verified')); }}><Check />Verify all awaiting</button>}
      </div>
      {list.length === 0 && <div className="card card-pad muted">{filter === 'pending' ? 'Nothing waiting — you’re all caught up.' : 'No logs in this view.'}</div>}
      <div className="review-list">
        {list.map((l) => { const c = compare(l); const u = unit(l.unitId); const m = missions.find((x) => x.id === l.missionId); return (
          <article key={l.id} className="review-card card">
            <div className="review-main">
              <div className="bubble-top"><span className="kind-dot" style={{ background: kindOf(l.kind).color }} /><b>{kindOf(l.kind).label}</b><span className="muted">{l.volunteer || 'volunteer'} · {new Date(l.observedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</span></div>
              <p>{l.notes || <span className="muted">No notes</span>}</p>
              <div className="chip-row wrap">
                {l.tempC != null && <span className="chip">{l.tempC.toFixed(1)}°C {l.measure}</span>}
                {l.shade && <span className="chip">{l.shade === 'none' ? 'No shade' : l.shade === 'partial' ? 'Partial shade' : 'Shaded'}</span>}
                {u && <span className="chip"><Pin />{u.properties.name}</span>}
                {m && <span className="chip tag-derived">Mission: {m.title}</span>}
                {l.place && <span className="chip">{l.place}</span>}
              </div>
              {c && <div className={`callout ${Math.abs(c.d) > 6 ? '' : 'info'}`}>{Math.abs(c.d) > 6 ? <Alert /> : <Sparkle />}<span>Reading is <b>{fmtDelta(c.d)}°C</b> vs the {c.ref} for this unit ({fmtTemp(c.val)}). {Math.abs(c.d) > 6 ? 'Unusually large gap — check the measurement method, time and location.' : 'Within a plausible range for a single reading.'}</span></div>}
            </div>
            <div className="review-actions">
              <StatusBadge s={l.status} />
              <input className="field" placeholder="Note to volunteer (optional)" value={notes[l.id] ?? l.reviewNote} maxLength={300} onChange={(e) => setNotes((x) => ({ ...x, [l.id]: e.target.value }))} />
              <div className="chip-row wrap">
                <button className="btn btn-sm btn-primary" onClick={() => void review(l.id, 'verified', notes[l.id] ?? '')}><Check />Verify</button>
                <button className="btn btn-sm" onClick={() => void review(l.id, 'flagged', notes[l.id] ?? '')}><Alert />Flag</button>
                {l.status !== 'pending' && <button className="btn btn-sm btn-ghost" onClick={() => void review(l.id, 'pending', '')}>Reset</button>}
                <a className="btn btn-sm btn-ghost" href={hrefFor({ tab: 'explore', unit: l.unitId ?? undefined })}>Map</a>
                <button className="icon-btn" aria-label="Delete log" onClick={() => { if (window.confirm('Delete this log permanently?')) remove(l.id); }}><Close /></button>
              </div>
            </div>
          </article>); })}
      </div>
    </div>
  );
}
const StatusBadge = ({ s }: { s: Status }) => <span className={`chip status-chip ${s === 'verified' ? 'ok' : s === 'flagged' ? 'bad' : ''}`}>{s === 'verified' ? 'Verified' : s === 'flagged' ? 'Flagged' : 'Awaiting review'}</span>;
