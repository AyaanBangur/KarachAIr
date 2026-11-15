import { useState } from 'react';
import { useTerra } from '../../lib/data';
import { confidenceFor, dominantDriver } from '../../lib/risk';
import { opportunitiesFor } from '../../lib/insights';
import { downloadText, unitBrief } from '../../lib/export';
import { fmtCompact, fmtDelta, fmtInt, fmtTemp, ordinal } from '../../lib/format';
import { thermal } from '../../lib/colors';
import { Expand, ConfidenceBadge, Gauge, InfoNote, KindTag, StatTile, TierBadge } from '../ui';
import { Sparkline } from '../charts/UnitCharts';
import { Check, Close, Compare, Cross, Download, Droplet, Flame, Leaf, Moon, Sliders, Thermometer, Users } from '../icons';
import type { LiveWeather } from '../../lib/hooks';
import { LiveStrip } from './LiveStrip';

const PILLARS = [
  { key: 'hazard', label: 'Hazard', hint: 'How hot the surface gets', color: 'var(--c-heat)' },
  { key: 'exposure', label: 'Exposure', hint: 'How many people are there', color: 'var(--c-pop)' },
  { key: 'vulnerability', label: 'Vulnerability', hint: 'How little buffering they have', color: 'var(--c-veg)' },
] as const;

export function UnitPanel({ id, onClose, onCompare, onScenario, inCompare, weather }: { id: string; onClose: () => void; onCompare?: (id: string) => void; onScenario?: (id: string) => void; inCompare: boolean; weather: LiveWeather | null }) {
  const { data, scores, medians, weights } = useTerra();
  const [done, setDone] = useState(false);
  const u = data.units.find((x) => x.properties.id === id);
  const s = scores.get(id);
  if (!u || !s) return null;
  const p = u.properties, l = p.lst;
  const conf = confidenceFor(u);
  const opps = opportunitiesFor(u, medians, data.meta);
  const driver = dominantDriver(s, weights);
  const years = l ? Object.keys(l.byYear).sort() : [];
  const series = years.map((y) => l!.byYear[y]);
  const dayDelta = l ? l.day - medians.lstDay : null;

  const download = () => {
    const md = unitBrief(u, s, data.meta, { medians, opportunities: opps.map((o) => ({ title: o.title, why: o.why })), confidence: `${conf.level}, ${conf.reason}` });
    downloadText(`karachair-${p.id}-brief.md`, md, 'text/markdown');
    setDone(true); setTimeout(() => setDone(false), 2200);
  };

  const parts = s.parts;
  const detail: Record<string, string> = {
    hazard: `Blend of afternoon (${fmtTemp(l?.day)}) and night (${fmtTemp(l?.night)}) surface temperature, each scaled across Karachi: ${(parts.lstDay * 100).toFixed(0)} and ${(parts.lstNight * 100).toFixed(0)} out of 100.`,
    exposure: `${fmtInt(p.popDensity)} residents per km² (log-scaled across units) scores ${(parts.density * 100).toFixed(0)} out of 100.`,
    vulnerability: `Vegetation deficit ${(parts.greenDeficit * 100).toFixed(0)}/100 (NDVI ${p.ndvi?.toFixed(2)}) and health-access gap ${(parts.healthGap * 100).toFixed(0)}/100 (${p.infra?.healthPer100k?.toFixed(1)} facilities per 100k).`,
  };

  return (
    <aside className="unit-panel" aria-label={`Details for ${p.name}`}>
      <header className="up-head">
        <div className="up-titles">
          <div className="up-type chip">{p.type === 'town' ? 'Town' : 'Cantonment'} · {p.areaKm2.toLocaleString()} km²</div>
          <h2>{p.name}</h2>
          <div className="up-badges"><TierBadge index={s.index} /><ConfidenceBadge c={conf} /></div>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Close details"><Close /></button>
      </header>

      <div className="up-score card card-glow">
        <Gauge value={s.index} color={s.tier.color} label="Heat risk index" />
        <div className="up-score-text">
          <div className="muted" style={{ fontSize: 12 }}>Heat Risk Index</div>
          <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: '-0.02em' }}>{ordinal(s.rank)} of {data.units.length} units</div>
          <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>Mainly driven by <b style={{ color: 'var(--ink-1)' }}>{driver}</b>. Relative to other Karachi units, not an absolute danger level.</div>
        </div>
      </div>

      <div className="up-pillars">
        {PILLARS.map((pl) => (
          <Expand key={pl.key} title={<span className="pillar-row"><span className="pillar-name">{pl.label}<small>{pl.hint}</small></span><span className="pillar-bar"><i style={{ width: `${s[pl.key]}%`, background: pl.color }} /></span><b className="mono">{s[pl.key].toFixed(0)}</b></span>}>
            <p>{detail[pl.key]}</p>
          </Expand>
        ))}
      </div>

      <div className="up-grid">
        <StatTile icon={<Thermometer />} tone="var(--c-heat)" label="Afternoon surface temp" value={fmtTemp(l?.day)} sub={dayDelta != null ? `${fmtDelta(dayDelta)}°C vs city median` : undefined} />
        <StatTile icon={<Moon />} tone="var(--c-heat)" label="Night surface temp" value={fmtTemp(l?.night)} sub={l ? `${fmtDelta(l.night - medians.lstNight)}°C vs median` : undefined} />
        <StatTile icon={<Flame />} tone="var(--c-alert)" label="Hottest 8-day composite" value={fmtTemp(l?.peak8Day?.value)} sub={l?.peak8Day?.date} />
        <StatTile icon={<Leaf />} tone="var(--c-veg)" label="Vegetation (NDVI)" value={p.ndvi?.toFixed(2) ?? 'n/a'} sub={p.ndvi != null ? `city median ${medians.ndvi.toFixed(2)}` : undefined} />
        <StatTile icon={<Users />} tone="var(--c-pop)" label="Population (2020 model)" value={fmtCompact(p.population)} sub={`${fmtInt(p.popDensity)} per km²`} />
        <StatTile icon={<Cross />} tone="var(--c-cool)" label="Health facilities" value={fmtInt(p.infra?.healthFacilities)} sub={p.infra?.healthPer100k != null ? `${p.infra.healthPer100k.toFixed(1)} per 100k · OSM-mapped` : undefined} />
        <StatTile icon={<Droplet />} tone="var(--c-veg)" label="Mapped green space" value={p.infra ? `${(p.infra.greenShare * 100).toFixed(1)}%` : 'n/a'} sub={p.infra?.greenM2PerPerson != null ? `${p.infra.greenM2PerPerson.toFixed(1)} m² per person · OSM` : undefined} />
        <StatTile icon={<Thermometer />} tone="var(--c-warn)" label="Hot-season max air temp" value={fmtTemp(p.air?.hotSeasonTmax)} sub={p.air ? `ERA5-Land ~9 km · ${p.air.days40PerYear ?? 'n/a'} days ≥40°C/yr` : undefined} />
      </div>

      {l && series.filter((v) => v != null).length > 1 && (
        <div className="up-season card card-pad">
          <div className="card-title" style={{ marginBottom: 6 }}><div><h3>Season by season</h3><p>Afternoon surface temp each May to June</p></div><Sparkline values={series} color={thermal(0.78)} width={150} height={40} /></div>
          <div className="season-chips">{years.map((y) => <span key={y} className="chip mono" title={`${y} season`}>{y}<b>{l.byYear[y] != null ? l.byYear[y]!.toFixed(1) : 'n/a'}</b></span>)}</div>
        </div>
      )}

      <LiveStrip weather={weather} unitId={id} label={p.short} />

      <section className="up-opps">
        <h3 className="up-h">Intervention opportunities</h3>
        <p className="muted" style={{ fontSize: 12.5, margin: '-4px 0 8px' }}>Rule-based: each idea is tied to a measured gap in this unit.</p>
        {opps.map((o) => (
          <Expand key={o.id} title={<span className="opp-title"><i style={{ background: { veg: 'var(--c-veg)', heat: 'var(--c-heat)', cool: 'var(--c-cool)', pop: 'var(--c-pop)', alert: 'var(--c-alert)', gap: 'var(--ink-3)' }[o.tone] }} />{o.title}</span>}>
            <p>{o.why}</p>{o.effect && <p className="muted" style={{ marginTop: 6 }}>{o.effect}</p>}
          </Expand>
        ))}
      </section>

      <InfoNote>
        <span><KindTag kind="measured" /> values come straight from satellite, population, OSM and reanalysis data; <KindTag kind="derived" /> values (risk index, ranks, opportunities) are computed from them. {conf.reason}</span>
      </InfoNote>

      <div className="up-actions">
        {onCompare && <button className={`btn ${inCompare ? 'is-success' : ''}`} onClick={() => onCompare(id)}>{inCompare ? <><Check />In comparison</> : <><Compare />Compare</>}</button>}
        {onScenario && <button className="btn" onClick={() => onScenario(id)}><Sliders />Run scenario</button>}
        <button className={`btn btn-primary ${done ? 'is-success' : ''}`} onClick={download}>{done ? <><Check />Saved</> : <><Download />Download brief</>}</button>
      </div>
    </aside>
  );
}
