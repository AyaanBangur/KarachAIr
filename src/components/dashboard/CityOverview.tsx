import { useMemo } from 'react';
import { useTerra } from '../../lib/data';
import { buildCityInsights } from '../../lib/insights';
import { fmtCompact, fmtTemp } from '../../lib/format';
import { StatTile } from '../ui';
import { Download, Flame, Thermometer, Users } from '../icons';
import { InsightCard } from './InsightCard';
import { LiveStrip } from './LiveStrip';
import { downloadText, unitsToCsv } from '../../lib/export';
import type { LiveAir, LiveWeather } from '../../lib/hooks';
import { unitNeeds } from '../../lib/needs';
import { reachNow } from '../../lib/impact';

export function CityOverview({ onOpenUnit, weather, air }: { onOpenUnit: (id: string) => void; weather: LiveWeather | null; air?: LiveAir | null }) {
  const { data, scores, weights } = useTerra();
  const reach = useMemo(() => reachNow(data.units, unitNeeds({ units: data.units, scores, air: air ?? null, weather, fieldCounts: new Map() })), [data.units, scores, air, weather]);
  const insights = useMemo(() => buildCityInsights(data.units, scores, weights, data.meta), [data, scores, weights]);
  const hottest = [...data.units].filter((u) => u.properties.lst).sort((a, b) => b.properties.lst!.day - a.properties.lst!.day)[0];
  const top = [...scores.values()].sort((a, b) => a.rank - b.rank)[0];
  const topUnit = data.units.find((u) => u.properties.id === top.id)!;

  return (
    <div className="city-overview">
      <div className="co-head">
        <div><h2>Karachi at a glance</h2><p className="muted">Select a unit on the map for its full profile, or start with the findings below.</p></div>
      </div>
      <div className="up-grid">
        <StatTile icon={<Users />} tone="var(--c-pop)" label="Residents modelled" value={fmtCompact(data.meta.totalPopulation)} sub={`${data.units.length} administrative units`} />
        <StatTile icon={<Thermometer />} tone="var(--c-heat)" label="Hottest afternoon" value={fmtTemp(hottest?.properties.lst?.day)} sub={hottest?.properties.short} />
        <StatTile icon={<Flame />} tone="var(--c-alert)" label="Highest risk index" value={top.index.toFixed(0)} sub={topUnit.properties.short} />
        <StatTile icon={<Thermometer />} tone="var(--c-warn)" label="Warming / decade" value={data.meta.climateCity ? `+${data.meta.climateCity.trend.annualMeanTmaxPerDecade.toFixed(2)}°C` : 'n/a'} sub="Daily max temp, ERA5-Land" />
      </div>

      <section className="card card-pad" aria-label="Who volunteer work can reach today">
        <h3 className="up-h" style={{ marginTop: 0 }}>Who volunteer work can reach today <span className="chip" style={{ marginLeft: 8 }}>{air ? 'live' : 'satellite ranking only'}</span></h3>
        <p style={{ margin: '6px 0' }}><b>{fmtCompact(reach.highNeedResidents)} residents ({(reach.highNeedShare * 100).toFixed(0)}%)</b> live in the {reach.highNeedUnits} neighbourhoods with high or urgent need right now{reach.hazardUnits > 0 && <>, and <b>{fmtCompact(reach.hazardResidents)}</b> of them where the air or heat is unsafe today</>}. Highest need: {reach.top.map((t) => `${t.name} (${fmtCompact(t.residents)})`).join(', ')}.</p>
        <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>This counts who lives where help is needed (WorldPop estimate plus live air and heat). It is reach, not a measured drop in pollution or temperature.</p>
      </section>

      <LiveStrip weather={weather} label="Karachi average" />

      <section>
        <h3 className="up-h">Key findings <span className="chip" style={{ marginLeft: 8 }}>computed from data</span></h3>
        <p className="muted" style={{ fontSize: 12.5, margin: '-4px 0 10px' }}>Open a card for the evidence, confidence and exact method. Nothing here is free-written, every statement is generated from the measured values.</p>
        <div className="insight-list">
          {insights.map((i, k) => <InsightCard key={i.id} insight={i} onOpenUnit={onOpenUnit} defaultOpen={k === 0} />)}
        </div>
      </section>

      <button className="btn" onClick={() => downloadText('karachair-karachi-units.csv', unitsToCsv(data.units, scores), 'text/csv')}><Download />Download all units (CSV)</button>
    </div>
  );
}
