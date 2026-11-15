import { useMemo, useState } from 'react';
import { useTerra } from '../../lib/data';
import { useAuth } from '../../lib/auth';
import { SHARED_ENABLED, useLogs } from '../../lib/logs';
import { useLocalState, type AirState, type LiveWeather } from '../../lib/hooks';
import { GuideChat } from './GuideChat';
import { AREAS, areaOf, typeOf, type Task } from '../../lib/guide';
import { STATUS_TEXT, TIER_NAME, TIME_LABEL, acceptNote, acceptTags, ago, buildMissions, fmtH, gateFor, hourOptions, matchesFilters, missionLocked, parseProof, summarize, type Filters, type Mission } from '../../lib/service';
import { useAirFocus } from '../air/useAirFocus';
import { SafetyGate } from '../service/SafetyGate';
import { Certificate } from '../service/Certificate';
import { Seg, StatTile } from '../ui';
import { Alert, Check, Close, Doc, Pin, Sparkle } from '../icons';

/** Volunteer hub: filter for a mission, accept or skip the offers, and keep a record. The organization verifies the work. */
export function VolunteerTab({ air, weather }: { air: AirState; weather: LiveWeather | null }) {
  const { data, scores } = useTerra();
  const { session } = useAuth();
  const { proofs, mine, add, remove, sync, refresh } = useLogs();
  const focus = useAirFocus(data.units, air);
  const [view, setView] = useState<'chat' | 'find' | 'record'>('chat');
  const [simulate, setSimulate] = useState(false);
  const [filters, setFilters] = useState<Filters>({ where: 'any', time: 'any', focus: 'any' });
  const [skipped, setSkipped] = useState<string[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [hours, setHours] = useState<number>(1);
  const [adult, setAdult] = useState(false);
  const [name, setName] = useState(session?.member?.name ?? session?.volunteer?.name ?? '');
  const [school, setSchool] = useLocalState<string>('tw-school', '');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [cert, setCert] = useState<string | null>(null);

  const unit = focus.unit;
  const place = unit?.properties.short ?? 'Karachi';
  const org = session?.org?.name ?? 'your organization';
  const gate = gateFor(focus.reading, simulate, place);
  const sc = focus.id ? scores.get(focus.id) : undefined;
  const bank = useMemo(() => buildMissions(unit, focus.reading, sc ? { label: sc.tier.label, rank: sc.rank, of: data.units.length } : null), [unit, focus.reading, sc, data.units.length]);
  const offers = bank.filter((m) => matchesFilters(m, filters) && !skipped.includes(m.id));
  const mineProofs = useMemo(() => proofs.filter((p) => mine.has(p.id)).map(parseProof), [proofs, mine]);
  const totals = summarize(mineProofs, null);
  const unitName = (id: string | null) => data.units.find((u) => u.properties.id === id)?.properties.name ?? 'Karachi';
  const setF = <K extends keyof Filters>(k: K, v: Filters[K]) => { setFilters({ ...filters, [k]: v }); setOpen(null); };

  const startAccept = (m: Mission) => { setOpen(open === m.id ? null : m.id); setHours(m.hours); setAdult(false); setError(''); };
  const accept = (m: Mission) => {
    setError('');
    if (!name.trim()) return setError('Enter your full name above first.');
    if (!school.trim()) return setError('Enter your school or group above first.');
    if (missionLocked(m, gate)) return setError('Outdoor missions are locked while the air is hazardous.');
    if (m.where === 'outdoor' && !adult) return setError('Tick the box to confirm an adult will be present.');
    if (!unit) return setError('Choose a neighbourhood.');
    add({
      observedAt: new Date().toISOString(), volunteer: name.trim().slice(0, 60), unitId: unit.properties.id, place: '', lat: null, lon: null, kind: 'other', tempC: null, measure: null, shade: null,
      tags: acceptTags({ mission: m, hours, student: name, school, gate }), notes: acceptNote({ mission: m, hours, student: name, school, gate }), missionId: null,
    });
    setOpen(null); setNotice(`Accepted: ${m.title} (${fmtH(hours)} h). It is in your record, and ${org} will verify it when you have done the work.`); setView('record');
  };

  /** A task accepted in the chat is saved exactly like one accepted from the mission list, so the organization verifies it. */
  const acceptFromChat = (task: Task) => {
    const area = areaOf(task.area) ?? AREAS[0];
    const m: Mission = { id: task.id, tier: typeOf(task.type).key, tierLabel: typeOf(task.type).name, hours: task.hours, min: task.hours, max: task.hours, where: task.indoor ? 'indoor' : 'outdoor', focus: 'air', title: task.title, desc: '', trigger: 'Suggested by the volunteer guide' };
    const who = name.trim() || 'Volunteer';
    add({ observedAt: new Date().toISOString(), volunteer: who.slice(0, 60), unitId: area.unitId, place: '', lat: null, lon: null, kind: 'other', tempC: null, measure: null, shade: null,
      tags: acceptTags({ mission: m, hours: task.hours, student: who, school: school || 'Not given', gate }), notes: acceptNote({ mission: m, hours: task.hours, student: who, school: school || 'Not given', gate }), missionId: null });
  };

  const certProof = cert ? mineProofs.find((p) => p.id === cert) : null;

  return (
    <div className="tab-body container-wide svc">
      <div className="svc-head">
        <div><span className="eyebrow">Volunteer hub</span><h2>Hello, {name.split(' ')[0] || 'volunteer'}.</h2><p className="muted">Filter for a mission, accept the ones you want, and {org} will verify your hours and issue your certificate.</p></div>
        <Seg<'chat' | 'find' | 'record'> label="Volunteer hub section" value={view} onChange={(v) => { setView(v); setNotice(''); }} options={[{ value: 'chat', label: 'Chat guide' }, { value: 'find', label: 'Find a mission' }, { value: 'record', label: `My record (${mineProofs.length})` }]} />
      </div>

      {view === 'chat' ? (
        <GuideChat air={air} weather={weather} onAccept={acceptFromChat} />
      ) : view === 'find' ? (
        <>
          <SafetyGate place={place} reading={focus.reading} simulate={simulate} onSimulate={setSimulate} />

          <section className="card card-pad" aria-label="Mission filters">
            <div className="card-title"><div><h3>What kind of mission do you want?</h3><p>Pick your filters and the missions that fit appear below. Nothing is added to your record until you accept.</p></div></div>
            <div className="filter-grid">
              <label className="pill-field"><span>Neighbourhood</span>
                <select className="select" value={focus.isAuto ? '' : focus.id ?? ''} onChange={(e) => focus.setId(e.target.value || null)}>
                  <option value="">Dirtiest air now{focus.isAuto && unit ? ` (${unit.properties.short})` : ''}</option>
                  {data.units.map((u) => <option key={u.properties.id} value={u.properties.id}>{u.properties.name}</option>)}
                </select></label>
              <label className="pill-field"><span>Where</span>
                <select className="select" value={filters.where} onChange={(e) => setF('where', e.target.value as Filters['where'])}><option value="any">Indoor or outdoor</option><option value="indoor">Indoor only</option><option value="outdoor">Outdoor (adult-supervised)</option></select></label>
              <label className="pill-field"><span>Time you have</span>
                <select className="select" value={filters.time} onChange={(e) => setF('time', e.target.value as Filters['time'])}>{(Object.keys(TIME_LABEL) as Filters['time'][]).map((k) => <option key={k} value={k}>{TIME_LABEL[k]}</option>)}</select></label>
              <label className="pill-field"><span>Focus</span>
                <select className="select" value={filters.focus} onChange={(e) => setF('focus', e.target.value as Filters['focus'])}><option value="any">Clean air or heat</option><option value="air">Clean air</option><option value="heat">Heat &amp; shade</option></select></label>
            </div>
            <div className="filter-grid">
              <label className="pill-field"><span>Your full name</span><input className="field" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="e.g. Amina Baloch" /></label>
              <label className="pill-field"><span>School or group</span><input className="field" value={school} maxLength={80} onChange={(e) => setSchool(e.target.value)} placeholder="e.g. Lyari Community School" /></label>
            </div>
          </section>

          <section aria-label="Mission offers">
            <div className="svc-sec-head"><h3>Missions for you in <span className="accent">{place}</span> <span className="chip">{offers.length}</span></h3>
              {skipped.length > 0 && <button className="btn btn-sm btn-ghost" onClick={() => setSkipped([])}>Show {skipped.length} skipped</button>}</div>
            {error && <div className="callout" role="alert" style={{ marginBottom: 12 }}><Alert /><span>{error}</span></div>}
            {offers.length === 0 && <div className="card card-pad muted">No missions match these filters. Try “Any” for one of the filters.</div>}
            <div className="mission-bank">
              {offers.map((m) => {
                const lk = missionLocked(m, gate);
                return (
                  <article key={m.id} className={`mcard tier-${m.tier} ${open === m.id ? 'on' : ''} ${lk ? 'locked' : ''}`}>
                    <div className="mcard-chips"><span className="chip mtier">{m.tierLabel} · {fmtH(m.hours)} hrs</span><span className={`chip mwhere ${m.where}`}>{m.where === 'indoor' ? 'Indoor safe' : 'Adult-supervised'}</span></div>
                    <span className="mtrigger">Trigger: {m.trigger}</span>
                    <h4>{m.title}</h4>
                    <p>{m.desc}</p>
                    {open === m.id ? (
                      <div className="accept-box">
                        <label className="pill-field"><span>How many hours will you commit?</span>
                          <select className="select" value={hours} onChange={(e) => setHours(parseFloat(e.target.value))}>{hourOptions(m).map((h) => <option key={h} value={h}>{fmtH(h)} hour{h === 1 ? '' : 's'}</option>)}</select></label>
                        {m.where === 'outdoor' && <label className="check-row"><input type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} /><span>An adult will be with me for this outdoor mission.</span></label>}
                        <div className="chip-row wrap"><button className="btn btn-primary btn-sm" onClick={() => accept(m)}><Check />Accept mission</button><button className="btn btn-sm btn-ghost" onClick={() => setOpen(null)}>Cancel</button></div>
                      </div>
                    ) : (
                      <div className="mcard-actions">
                        <button className="btn btn-primary btn-sm" disabled={lk} onClick={() => startAccept(m)}>{lk ? '🔒 Locked — hazardous air' : 'Accept this mission'}</button>
                        <button className="btn btn-sm btn-ghost" onClick={() => setSkipped([...skipped, m.id])}>Not for me</button>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        </>
      ) : (
        <>
          {notice && <div className="callout info"><Check /><span>{notice}</span></div>}
          <div className="up-grid">
            <StatTile icon={<Check />} tone="var(--emerald-400)" label="Verified hours" value={fmtH(totals.verifiedHours)} sub={`${totals.signed} mission${totals.signed === 1 ? '' : 's'} verified`} />
            <StatTile icon={<Doc />} tone="var(--c-warn)" label="Accepted, awaiting verification" value={fmtH(totals.pendingHours)} sub={`${totals.pending} mission${totals.pending === 1 ? '' : 's'}`} />
            <StatTile icon={<Pin />} tone="var(--c-cool)" label="Neighbourhoods" value={totals.units} sub="with verified work" />
          </div>
          <section aria-label="Volunteering record">
            <div className="svc-sec-head"><h3>My volunteering record</h3>
              {SHARED_ENABLED && <button className={`chip sync-chip ${sync}`} onClick={refresh}><i className="dot" />{sync === 'online' ? 'Synced' : sync === 'connecting' ? 'Connecting…' : 'Offline'}</button>}</div>
            {mineProofs.length === 0 && <div className="card card-pad muted">Nothing here yet. Accept a mission in “Find a mission”.</div>}
            <div className="hist-list">
              {mineProofs.map((p) => (
                <article key={p.id} className="hist card">
                  <div className="hist-main">
                    <div className="hist-top"><b>{p.title}</b><span className={`chip status-chip ${STATUS_TEXT[p.status].cls}`}>{p.status === 'verified' ? <Check /> : p.status === 'flagged' ? <Alert /> : <Sparkle />}{STATUS_TEXT[p.status].label}</span></div>
                    <div className="chip-row wrap"><span className="chip hrs">{p.status === 'verified' ? `+${fmtH(p.verifiedHours)} hrs verified` : `${fmtH(p.hours)} hrs committed`}</span><span className="chip"><Pin />{unitName(p.unitId)}</span><span className="chip">{TIER_NAME[p.tier]}</span><span className="muted tiny">accepted {ago(p.log.createdAt)}</span></div>
                    {p.status === 'pending' && <p className="muted tiny">Do the mission, then {org} records the proof and verifies your hours. Your certificate appears here when that is done.</p>}
                    {p.status === 'verified' && p.signer && <p className="muted tiny">Verified by <b>{p.signer.name}</b>{p.signer.role ? ` (${p.signer.role})` : ''} on {p.signer.date}. Your certificate is ready.</p>}
                    {p.status === 'flagged' && <p className="hist-declined">{org} could not verify this mission{p.declineNote ? `: “${p.declineNote}”` : '.'}</p>}
                  </div>
                  <div className="hist-actions">
                    {p.status === 'verified' && <button className="btn btn-primary btn-sm" onClick={() => setCert(p.id)}><Doc />View certificate</button>}
                    {p.status === 'pending' && <button className="icon-btn" aria-label="Cancel this mission" title="Cancel this mission" onClick={() => { if (window.confirm('Cancel this accepted mission?')) remove(p.id); }}><Close /></button>}
                  </div>
                </article>
              ))}
            </div>
          </section>
        </>
      )}

      {certProof && <Certificate proof={certProof} unitName={unitName(certProof.unitId)} orgName={org} onClose={() => setCert(null)} />}
    </div>
  );
}
