import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTerra } from '../../lib/data';
import { useAuth } from '../../lib/auth';
import { rpc } from '../../lib/api';
import { SHARED_ENABLED, useLogs } from '../../lib/logs';
import { miniMapPaths } from '../../lib/miniMap';
import { fmtDelta, fmtTemp } from '../../lib/format';
import { downloadText } from '../../lib/export';
import { logsToCsv } from '../../lib/logs';
import { SignOff } from './SignOff';
import { Impact } from './Impact';
import { parseProof } from '../../lib/service';
import { Seg, StatTile, TierBadge, InfoNote } from '../ui';
import { encodeDetails, decodeDetails, POST_HOURS, type Where } from '../../lib/orgMissions';
import { OrgLogo } from '../OrgLogo';
import { Alert, Check, Close, Doc, Download, Pin, Users } from '../icons';

type Sub = 'overview' | 'post' | 'signoff' | 'impact' | 'coverage';
interface Member { id: string; name: string; email: string | null; joined: string; last_seen: string; logs: number; verified: number; last_log: string | null }
const ago = (iso: string | null) => { if (!iso) return 'n/a'; const m = Math.round((Date.now() - +new Date(iso)) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };

export function OrgConsole() {
  const { session } = useAuth();
  const { proofs, shared, sync, refresh } = useLogs();
  const [sub, setSub] = useState<Sub>('overview');
  if (!shared) return <div className="tab-body container-wide"><InfoNote>The organization console needs the shared database (accounts, volunteers, missions and review all live there). {SHARED_ENABLED ? 'You are in local demo mode, sign out and register an organization to use it.' : 'Set VITE_SUPABASE_URL and VITE_SUPABASE_KEY to enable it.'}</InfoNote></div>;
  return (
    <div className="tab-body container-wide">
      <div className="org-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}><OrgLogo name={session?.org?.name ?? ''} size={52} /><div><span className="eyebrow">Organization portal</span><h2 className="org-title">{session?.org?.name}</h2></div></div>
        <div className="org-head-right">
          <button className={`chip sync-chip ${sync}`} onClick={refresh}><i className="dot" />{sync === 'online' ? 'Live' : sync === 'connecting' ? 'Connecting…' : 'Offline'}</button>
          <Seg<Sub> label="Console section" value={sub} onChange={setSub} options={[{ value: 'overview', label: 'Team' }, { value: 'post', label: 'Post a mission' }, { value: 'signoff', label: `Verification queue${proofs.filter((p) => p.status === 'pending').length ? ` (${proofs.filter((p) => p.status === 'pending').length} new)` : ''}` }, { value: 'impact', label: 'Impact summary' }, { value: 'coverage', label: 'Coverage' }]} />
        </div>
      </div>
      {sub === 'overview' && <Overview />}
      {sub === 'post' && <PostMission />}
      {sub === 'signoff' && <SignOff />}
      {sub === 'impact' && <Impact />}
      {sub === 'coverage' && <Coverage />}
    </div>
  );
}

// ---------------------------------------------------------------- team: join code + roster
function Overview() {
  const { session } = useAuth();
  const { allLogs: logs, proofs } = useLogs();
  const { data } = useTerra();
  const [members, setMembers] = useState<Member[] | null>(null);
  const [copied, setCopied] = useState(false);
  const load = useCallback(() => { rpc<Member[]>('tw_list_members', { p_token: session!.token }).then(setMembers).catch(() => setMembers([])); }, [session]);
  useEffect(load, [load, logs.length]);
  // The tiles count volunteer missions (accept -> verify), which is what the app tracks now.
  const missions = useMemo(() => proofs.map(parseProof), [proofs]);
  const verified = missions.filter((m) => m.status === 'verified').length;
  const covered = new Set(missions.map((m) => m.unitId).filter(Boolean)).size;

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
        <p className="muted" style={{ fontSize: 12.5 }}>Send volunteers the link. They create an account (name, email, password), choose <b>{session?.org?.name}</b> from the organization list. Anyone with an account can join any listed organization, so remove people who shouldn&rsquo;t be on your roster.</p>
      </section>

      <div className="org-kpis">
        <StatTile icon={<Users />} tone="var(--lime-400)" label="Volunteers" value={members?.length ?? '…'} sub="have joined your team" />
        <StatTile icon={<Doc />} tone="var(--c-heat)" label="Missions accepted" value={missions.length} sub={`${missions.filter((m) => m.status === 'pending').length} awaiting verification`} />
        <StatTile icon={<Check />} tone="var(--emerald-400)" label="Verified" value={`${missions.length ? Math.round((verified / missions.length) * 100) : 0}%`} sub={`${verified} of ${missions.length} missions`} />
        <StatTile icon={<Pin />} tone="var(--c-cool)" label="Neighbourhoods reached" value={`${covered} / ${data.units.length}`} sub="with volunteer missions" />
      </div>

      <section className="card card-pad roster">
        <div className="card-title"><div><h3>Volunteer roster</h3><p>Who is active, and how much of their work has been verified.</p></div>
          <button className="btn btn-sm" disabled={!logs.length} onClick={() => downloadText(`${session?.org?.name ?? 'team'}-logs.csv`.replace(/\s+/g, '-'), logsToCsv(logs, data.units), 'text/csv')}><Download />Export all logs</button></div>
        {members == null ? <div className="skeleton" style={{ height: 120 }} /> : members.length === 0 ? <p className="muted">No volunteers yet, share the sign-in link above.</p> : (
          <div className="table-wrap"><table className="data-table">
            <thead><tr><th>Volunteer</th><th>Email</th><th>Joined</th><th className="n">Logs</th><th className="n">Verified</th><th>Last log</th><th /></tr></thead>
            <tbody>{members.map((m) => <tr key={m.id}><td><b>{m.name}</b></td><td className="muted">{m.email ?? 'n/a'}</td><td>{ago(m.joined)}</td><td className="num">{m.logs}</td><td className="num">{m.verified}</td><td>{ago(m.last_log)}</td><td><button className="icon-btn" aria-label={`Remove ${m.name}`} onClick={() => void removeMember(m)}><Close /></button></td></tr>)}</tbody>
          </table></div>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------- missions the organization creates itself
function PostMission() {
  const { missions, createMission, setMissionActive, proofs } = useLogs();
  const { data } = useTerra();
  const [title, setTitle] = useState(''), [details, setDetails] = useState(''), [where, setWhere] = useState<Where>('indoor'), [unitId, setUnitId] = useState(''), [needed, setNeeded] = useState(10);
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState('');
  const accepted = (id: string) => proofs.map(parseProof).filter((p) => p.missionKey === `org-${id}`).length;
  const post = async (e: React.FormEvent) => {
    e.preventDefault(); setMsg('');
    if (title.trim().length < 3) return setMsg('Give the mission a short title.');
    setBusy(true);
    const err = await createMission({ title: title.trim().slice(0, 80), details: encodeDetails(where, details.slice(0, 280)), unitId: unitId || null, kind: null, target: Math.max(1, needed) });
    setBusy(false);
    if (err) return setMsg(err);
    setTitle(''); setDetails(''); setMsg('Posted. Your volunteers now see it under Notifications in the volunteer hub.');
  };
  return (
    <div className="org-grid">
      <section className="card card-pad">
        <div className="card-title"><div><h3>Post a new mission</h3><p>Create a mission beyond the built-in ones. Everyone on your team is notified and can accept or decline. Each mission counts as {POST_HOURS} hours once you verify it.</p></div></div>
        <form onSubmit={(e) => void post(e)} className="filter-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <label className="pill-field" style={{ gridColumn: '1 / -1' }}><span>Mission title</span><input className="field" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Plant saplings behind the main hall" /></label>
          <label className="pill-field" style={{ gridColumn: '1 / -1' }}><span>What volunteers should do</span><textarea className="field" rows={3} value={details} maxLength={280} onChange={(e) => setDetails(e.target.value)} placeholder="Where to meet, what to bring, who supervises…" /></label>
          <label className="pill-field"><span>Setting</span><select className="select" value={where} onChange={(e) => setWhere(e.target.value as Where)}><option value="indoor">Indoor</option><option value="outdoor">Outdoor (adult-supervised)</option></select></label>
          <label className="pill-field"><span>Neighbourhood (optional)</span><select className="select" value={unitId} onChange={(e) => setUnitId(e.target.value)}><option value="">Anywhere</option>{data.units.map((u) => <option key={u.properties.id} value={u.properties.id}>{u.properties.name}</option>)}</select></label>
          <label className="pill-field"><span>Volunteers needed</span><input className="field" type="number" min={1} max={500} value={needed} onChange={(e) => setNeeded(parseInt(e.target.value, 10) || 1)} /></label>
          <div style={{ display: 'flex', alignItems: 'end' }}><button className="btn btn-primary" disabled={busy}>{busy ? 'Posting…' : 'Post to volunteers'}</button></div>
        </form>
        {msg && <p className="muted" role="status" style={{ marginTop: 10 }}>{msg}</p>}
      </section>
      <section className="card card-pad">
        <div className="card-title"><div><h3>Missions you posted</h3><p>Turn one off to stop showing it to volunteers.</p></div></div>
        {missions.length === 0 ? <p className="muted">Nothing posted yet.</p> : (
          <div className="table-wrap"><table className="data-table"><thead><tr><th>Mission</th><th>Setting</th><th className="n">Accepted</th><th /></tr></thead>
            <tbody>{missions.map((m) => <tr key={m.id}><td><b>{m.title}</b><div className="muted tiny">{ago(m.createdAt)}</div></td><td>{decodeDetails(m.details).where}</td><td className="num">{accepted(m.id)} / {m.target}</td><td><button className="btn btn-sm btn-ghost" onClick={() => void setMissionActive(m.id, !m.active)}>{m.active ? 'Turn off' : 'Turn on'}</button></td></tr>)}</tbody></table></div>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------- coverage gaps
function Coverage() {
  const { data, scores } = useTerra();
  const { allLogs: logs } = useLogs();
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

  return (
    <div className="org-cov">
      <section className="card card-pad">
        <div className="card-title"><div><h3>Coverage map</h3><p>Where your volunteers have (and haven’t) collected data. Red outline = Severe/Extreme heat risk with fewer than 3 logs.</p></div></div>
        <svg viewBox="0 0 600 400" className="mini-map" role="img" aria-label="Map of Karachi units coloured by number of field logs">
          {paths.map((p) => { const r = rows.find((x) => x.u.properties.id === p.id)!; return <path key={p.id} d={p.d} fill={fill(r)} stroke={r.priority ? '#ef5b4c' : 'rgba(7,12,10,.9)'} strokeWidth={r.priority ? 2.4 : 1} fillRule="evenodd"><title>{r.u.properties.name}: {r.n} logs · {r.s.tier.label}</title></path>; })}
          {paths.filter((p) => rows.find((x) => x.u.properties.id === p.id)!.priority).map((p) => <circle key={p.id} cx={p.cx} cy={p.cy} r="4" fill="#ef5b4c" stroke="#0a110f" strokeWidth="1.5" />)}
        </svg>
        <div className="legend" style={{ marginTop: 10 }}><span className="legend-item"><i className="mark dot" style={{ background: '#27312d' }} />No logs</span><span className="legend-item"><i className="mark dot" style={{ background: '#c98f2f' }} />1 to 2 logs</span><span className="legend-item"><i className="mark dot" style={{ background: '#1ec28b' }} />3+ logs</span><span className="legend-item"><i className="mark dot" style={{ background: '#ef5b4c' }} />Priority gap</span></div>
        <div className="callout" style={{ marginTop: 12 }}><Alert /><span><b>{priority.length} priority gap{priority.length === 1 ? '' : 's'}.</b> {priority.length ? `Start with ${priority.slice(0, 3).map((r) => r.u.properties.short).join(', ')}.` : 'Every high-risk unit has at least 3 logs.'}</span></div>
      </section>

      <section className="card card-pad">
        <div className="card-title"><div><h3>Priorities & field-vs-satellite check</h3><p>Units ranked by heat risk. “Field surface” compares your volunteers’ surface readings with the satellite’s afternoon surface mean.</p></div></div>
        <div className="table-wrap" style={{ maxHeight: 560 }}><table className="data-table">
          <thead><tr><th>#</th><th>Unit</th><th>Risk</th><th className="n">Logs</th><th className="n">Field surface</th><th className="n">vs satellite</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.u.properties.id} className={r.priority ? 'row-priority' : ''}>
              <td className="num">{r.s.rank}</td><td><b>{r.u.properties.short}</b></td><td><TierBadge index={r.s.index} compact /></td>
              <td className="num">{r.n}{r.verified ? <small className="muted"> ({r.verified}✓)</small> : null}</td>
              <td className="num">{r.field != null ? `${fmtTemp(r.field)} (n=${r.nSurf})` : 'n/a'}</td>
              <td className="num">{r.delta != null ? `${fmtDelta(r.delta)}°C` : 'n/a'}</td>
            </tr>))}</tbody>
        </table></div>
      </section>
    </div>
  );
}
