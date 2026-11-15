import { useMemo, useState } from 'react';
import { useTerra } from '../../lib/data';
import { useAuth } from '../../lib/auth';
import { useLogs } from '../../lib/logs';
import { TIER_NAME, fmtH, parseProof, summarize } from '../../lib/service';
import { downloadText } from '../../lib/export';
import { StatTile } from '../ui';
import { Check, Doc, Download, Pin, Users } from '../icons';
import { unitNeeds } from '../../lib/needs';
import { coverage } from '../../lib/impact';
import { fmtCompact } from '../../lib/format';
import type { LiveAir, LiveWeather } from '../../lib/hooks';

/** Everything the organization's volunteers have done, summarised and exportable for reports and grants. */
export function Impact({ air = null, weather = null }: { air?: LiveAir | null; weather?: LiveWeather | null } = {}) {
  const { data, scores } = useTerra();
  const { session } = useAuth();
  const { proofs } = useLogs();
  const [scope, setScope] = useState('');
  const org = session?.org?.name ?? 'organization';
  const list = useMemo(() => proofs.map(parseProof), [proofs]);
  const s = summarize(list, scope || null);
  const unitName = (id: string | null) => data.units.find((u) => u.properties.id === id)?.properties.name ?? 'Karachi';
  const signed = list.filter((p) => p.status === 'verified' && (!scope || p.unitId === scope));
  const maxTier = Math.max(1, ...Object.values(s.byTier));
  const cov = useMemo(() => coverage(data.units, unitNeeds({ units: data.units, scores, air, weather, fieldCounts: new Map() }), list.filter((p) => p.status === 'verified').map((p) => p.unitId)), [data.units, scores, air, weather, list]);
  const slug = org.toLowerCase().replace(/[^a-z0-9]+/g, '-');

  const csv = () => downloadText(`${slug}-verified-hours.csv`, ['student,school,neighbourhood,mission,tier,hours,signed_by,signed_on', ...signed.map((p) => [p.student, p.school, unitName(p.unitId), p.title, TIER_NAME[p.tier], p.verifiedHours, p.signer?.name ?? '', p.signer?.date ?? ''].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n'), 'text/csv');
  const json = () => downloadText(`${slug}-verified-hours.json`, JSON.stringify({ organization: org, scope: scope ? unitName(scope) : 'All Karachi', generated: new Date().toISOString(), summary: s, records: signed.map((p) => ({ student: p.student, school: p.school, neighbourhood: unitName(p.unitId), mission: p.title, tier: p.tier, hours: p.verifiedHours, signedBy: p.signer?.name, signedOn: p.signer?.date })) }, null, 2), 'application/json');

  return (
    <div className="impact">
      <section className="card card-pad">
        <div className="card-title"><div><h3>Impact summary</h3><p>Verified volunteer work for {org}. Accepted-but-unverified and unverified missions are not counted as hours.</p></div></div>
        <label className="pill-field" style={{ maxWidth: 360 }}><span>Neighbourhood scope</span>
          <select className="select" value={scope} onChange={(e) => setScope(e.target.value)}><option value="">All Karachi units</option>{data.units.map((u) => <option key={u.properties.id} value={u.properties.id}>{u.properties.name}</option>)}</select></label>
        <div className="org-kpis" style={{ marginTop: 14 }}>
          <StatTile icon={<Check />} tone="var(--emerald-400)" label="Verified student hours" value={fmtH(s.verifiedHours)} sub={`${s.signed} verified mission${s.signed === 1 ? '' : 's'}`} />
          <StatTile icon={<Users />} tone="var(--lime-400)" label="Volunteers contributing" value={s.volunteers} sub="with verified hours" />
          <StatTile icon={<Pin />} tone="var(--c-cool)" label="Neighbourhoods reached" value={s.units} sub={`of ${data.units.length} units`} />
          <StatTile icon={<Doc />} tone="var(--c-warn)" label="Awaiting verification" value={fmtH(s.pendingHours)} sub={`${s.pending} mission${s.pending === 1 ? '' : 's'} · ${s.declined} not verified`} />
        </div>
        <div className="org-kpis" style={{ marginTop: 10 }}>
          <StatTile icon={<Users />} tone="var(--c-pop)" label="Residents where we worked" value={fmtCompact(cov.residentsReached)} sub={`${(cov.residentsShare * 100).toFixed(0)}% of modelled residents (people who live there, not measured benefit)`} />
          <StatTile icon={<Pin />} tone="var(--c-alert)" label="High-need areas covered" value={`${cov.covered} of ${cov.highNeed}`} sub={cov.uncovered.length ? `Still without verified work: ${cov.uncovered.slice(0, 4).join(', ')}${cov.uncovered.length > 4 ? '…' : ''}` : 'every high-need area has verified work'} />
        </div>
      </section>

      <div className="impact-cols">
        <section className="card card-pad">
          <div className="card-title"><div><h3>Hours by mission type</h3></div></div>
          {Object.keys(s.byTier).length === 0 ? <p className="muted">No verified hours yet.</p> : Object.entries(s.byTier).map(([t, h]) => (
            <div key={t} className="bar-row"><span>{TIER_NAME[t]}</span><span className="bar-track"><i style={{ width: `${(h / maxTier) * 100}%` }} /></span><b className="mono">{fmtH(h)} h</b></div>
          ))}
        </section>
        <section className="card card-pad">
          <div className="card-title"><div><h3>Hours by neighbourhood</h3></div></div>
          {s.byUnit.length === 0 ? <p className="muted">No verified hours yet.</p> : <div className="table-wrap"><table className="data-table"><thead><tr><th>Neighbourhood</th><th className="n">Missions</th><th className="n">Hours</th></tr></thead><tbody>{s.byUnit.map((r) => <tr key={r.unitId ?? 'none'}><td><b>{unitName(r.unitId)}</b></td><td className="num">{r.missions}</td><td className="num">{fmtH(r.hours)}</td></tr>)}</tbody></table></div>}
        </section>
      </div>

      <section className="card card-pad">
        <div className="card-title"><div><h3>Export</h3><p>Verified records for the selected scope, ready for reports and funders.</p></div></div>
        <div className="chip-row wrap"><button className="btn btn-primary" disabled={!signed.length} onClick={csv}><Download />Download CSV</button><button className="btn" disabled={!signed.length} onClick={json}><Download />Download JSON</button></div>
      </section>
    </div>
  );
}
