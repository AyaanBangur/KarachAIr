import { useState } from 'react';
import { useTerra } from '../../lib/data';
import { METRIC_ORDER, METRICS, type MetricKey } from '../../lib/metrics';
import { RadarCompare, RankingChart, SeasonLines, VegHeatScatter, slotColor } from '../charts/UnitCharts';
import { Seg, TierBadge } from '../ui';
import { Close } from '../icons';
import { fmtCompact, fmtDec, fmtInt, fmtTemp } from '../../lib/format';

export function CompareTab({ picks, setPicks, onOpenUnit }: { picks: string[]; setPicks: (p: string[]) => void; onOpenUnit: (id: string) => void }) {
  const { data, scores, medians } = useTerra();
  const [metric, setMetric] = useState<MetricKey>('hri');
  const toggle = (id: string) => setPicks(picks.includes(id) ? picks.filter((x) => x !== id) : picks.length >= 3 ? [...picks.slice(1), id] : [...picks, id]);
  const ranked = [...data.units].sort((a, b) => scores.get(a.properties.id)!.rank - scores.get(b.properties.id)!.rank);
  const sel = picks.map((id) => data.units.find((u) => u.properties.id === id)!).filter(Boolean);
  const free = ranked.filter((u) => !picks.includes(u.properties.id));

  const rows: { label: string; get: (u: (typeof sel)[number]) => string; med?: string }[] = [
    { label: 'Heat risk index', get: (u) => scores.get(u.properties.id)!.index.toFixed(0) },
    { label: 'Afternoon surface temp', get: (u) => fmtTemp(u.properties.lst?.day), med: fmtTemp(medians.lstDay) },
    { label: 'Night surface temp', get: (u) => fmtTemp(u.properties.lst?.night), med: fmtTemp(medians.lstNight) },
    { label: 'Vegetation (NDVI)', get: (u) => fmtDec(u.properties.ndvi, 2), med: medians.ndvi.toFixed(2) },
    { label: 'Population', get: (u) => fmtCompact(u.properties.population) },
    { label: 'Density (per km²)', get: (u) => fmtInt(u.properties.popDensity), med: fmtInt(medians.density) },
    { label: 'Health facilities per 100k', get: (u) => fmtDec(u.properties.infra?.healthPer100k, 1), med: medians.health.toFixed(1) },
    { label: 'Mapped green space', get: (u) => (u.properties.infra ? `${(u.properties.infra.greenShare * 100).toFixed(1)}%` : '—') },
  ];

  return (
    <div className="tab-body container-wide">
      <div className="compare-bar card card-pad">
        <div className="compare-picks">
          <span className="layer-label" style={{ margin: 0 }}>Comparing</span>
          {sel.length === 0 && <span className="muted" style={{ fontSize: 13 }}>Click bars or bubbles below, or add a unit →</span>}
          {sel.map((u, i) => (
            <span key={u.properties.id} className="chip pick" style={{ borderColor: `${slotColor(i)}88`, background: `${slotColor(i)}1f` }}>
              <i className="dot" style={{ color: slotColor(i) }} />
              <button className="pick-name" onClick={() => onOpenUnit(u.properties.id)} title="Open on map">{u.properties.short}</button>
              <TierBadge index={scores.get(u.properties.id)!.index} compact />
              <button className="pick-x" aria-label={`Remove ${u.properties.name}`} onClick={() => toggle(u.properties.id)}><Close /></button>
            </span>
          ))}
        </div>
        <div className="compare-add">
          <select className="select" aria-label="Add unit to comparison" value="" onChange={(e) => e.target.value && toggle(e.target.value)}>
            <option value="">Add a unit…</option>
            {free.map((u) => <option key={u.properties.id} value={u.properties.id}>#{scores.get(u.properties.id)!.rank} · {u.properties.name}</option>)}
          </select>
          <button className="btn btn-ghost btn-sm" onClick={() => setPicks([ranked[0].properties.id, ranked[1].properties.id, ranked[ranked.length - 1].properties.id])}>Top 2 vs lowest</button>
          {picks.length > 0 && <button className="btn btn-ghost btn-sm" onClick={() => setPicks([])}>Clear</button>}
        </div>
      </div>

      <div className="metric-bar"><Seg<MetricKey> label="Ranking metric" value={metric} onChange={setMetric} options={METRIC_ORDER.map((k) => ({ value: k, label: METRICS[k].short }))} /></div>

      <div className="compare-grid">
        <RankingChart units={data.units} scores={scores} metric={metric} selected={picks} onPick={toggle} order={METRICS[metric].worseWhenHigher ? 'desc' : 'asc'} />
        <div className="compare-col">
          <VegHeatScatter units={data.units} scores={scores} meta={data.meta} selected={picks} onPick={toggle} />
          {sel.length > 0 && <RadarCompare units={data.units} scores={scores} picks={picks} />}
        </div>
      </div>

      {sel.length > 0 && (
        <div className="compare-grid two">
          <SeasonLines units={data.units} picks={picks} />
          <section className="card card-pad" aria-label="Side-by-side values">
            <div className="card-title"><div><h3>Side by side</h3><p>Raw values, with the Karachi median for reference.</p></div></div>
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Indicator</th>{sel.map((u, i) => <th key={u.properties.id}><i className="dot-sq" style={{ background: slotColor(i) }} />{u.properties.short}</th>)}<th>Median</th></tr></thead>
                <tbody>{rows.map((r) => <tr key={r.label}><td>{r.label}</td>{sel.map((u) => <td key={u.properties.id} className="num">{r.get(u)}</td>)}<td className="num muted">{r.med ?? '—'}</td></tr>)}</tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
