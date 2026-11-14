import { useMemo } from 'react';
import { Bar, CartesianGrid, Cell, ComposedChart, Legend as RLegend, Line, LineChart, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ReferenceLine, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis, ZAxis } from 'recharts';
import type { MetaFile, UnitFeature } from '../../lib/types';
import { TIERS, tierFor } from '../../lib/colors';
import { METRICS, type MetricKey } from '../../lib/metrics';
import type { RiskScore } from '../../lib/risk';
import { fmtCompact, fmtDelta, fmtInt, fmtTemp } from '../../lib/format';
import { AX, ChartFrame, GRID, Legend, SERIES_HEX, TooltipBox } from './common';

export const slotColor = (i: number) => SERIES_HEX[i] ?? SERIES_HEX[0];
const NEUTRAL = 'rgba(31,163,189,0.5)';

/** Ranked horizontal bars for any metric; picked units wear their comparison colour (emphasis, not rainbow). */
export function RankingChart({ units, scores, metric, selected, onPick, order = 'desc' }: {
  units: UnitFeature[]; scores: Map<string, RiskScore>; metric: MetricKey; selected: string[]; onPick: (id: string) => void; order?: 'asc' | 'desc';
}) {
  const m = METRICS[metric];
  const rows = useMemo(() => units
    .map((u) => ({ id: u.properties.id, name: u.properties.short, full: u.properties.name, v: m.value(u, scores.get(u.properties.id)), tier: scores.get(u.properties.id)?.tier }))
    .filter((r): r is typeof r & { v: number } => r.v != null)
    .sort((a, b) => (order === 'desc' ? b.v - a.v : a.v - b.v)), [units, scores, m, order]);
  const h = rows.length * 27 + 36;
  const lo = Math.min(0, ...rows.map((r) => r.v));
  return (
    <ChartFrame title={`Ranking — ${m.label.toLowerCase()}`} height={h} subtitle={`${m.blurb} Click a bar to pick units for comparison.`}
      table={{ head: ['Rank', 'Unit', `${m.short} (${m.unit || 'index'})`], rows: rows.map((r, i) => [i + 1, r.full, m.fmt(r.v)]) }}
      source="TerraWatch dataset (see Methodology)">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} layout="vertical" margin={{ top: 0, right: 56, left: 4, bottom: 0 }} barCategoryGap={5}>
          <CartesianGrid stroke="rgba(236,240,226,0.07)" horizontal={false} />
          <XAxis type="number" tick={AX.tick} axisLine={false} tickLine={false} domain={[lo, 'auto']} tickFormatter={(v: number) => (m.key === 'density' ? fmtCompact(v) : String(v))} />
          <YAxis type="category" dataKey="name" tick={{ fill: '#c9c8ba', fontSize: 12 }} axisLine={AX.line} tickLine={false} width={96} interval={0} />
          <Tooltip cursor={{ fill: 'rgba(255,255,255,0.05)' }} content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const d = payload[0].payload as (typeof rows)[number];
            return <TooltipBox title={d.full} rows={[{ color: slotColor(Math.max(0, selected.indexOf(d.id))), label: m.label, value: `${m.fmt(d.v)}${m.unit && m.key !== 'lstDay' && m.key !== 'lstNight' ? ' ' + m.unit : ''}` }, ...(d.tier ? [{ label: 'Risk tier', value: d.tier.label, dim: true }] : [])]} foot="Click to add to comparison" />;
          }} />
          <Bar dataKey="v" maxBarSize={16} radius={[0, 4, 4, 0]} isAnimationActive={false} cursor="pointer"
            label={{ position: 'right', fill: '#c9c8ba', fontSize: 11, formatter: (v: unknown) => m.fmt(v as number) }}
            onClick={(d: unknown) => onPick((d as { id: string }).id)}>
            {rows.map((r) => { const i = selected.indexOf(r.id); return <Cell key={r.id} fill={i >= 0 ? slotColor(i) : NEUTRAL} />; })}
          </Bar>
        </ComposedChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

/** Units as bubbles: vegetation vs afternoon heat, sized by population, coloured by risk tier, with the pixel-level fit. */
export function VegHeatScatter({ units, scores, meta, selected, onPick, height = 360 }: { units: UnitFeature[]; scores: Map<string, RiskScore>; meta: MetaFile; selected: string[]; onPick: (id: string) => void; height?: number }) {
  const reg = meta.lst?.regression;
  const pts = useMemo(() => units.filter((u) => u.properties.ndvi != null && u.properties.lst).map((u) => {
    const s = scores.get(u.properties.id)!;
    return { id: u.properties.id, name: u.properties.short, full: u.properties.name, x: u.properties.ndvi!, y: u.properties.lst!.day, z: u.properties.population ?? 1, tier: s.tier, rank: s.rank };
  }), [units, scores]);
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const x0 = Math.floor((Math.min(...xs) - 0.01) * 100) / 100, x1 = Math.ceil((Math.max(...xs) + 0.01) * 100) / 100;
  const seg = reg ? [{ x: x0, y: reg.intercept + reg.slopePerNdvi * x0 }, { x: x1, y: reg.intercept + reg.slopePerNdvi * x1 }] : null;
  return (
    <ChartFrame title="Greener is cooler" height={height}
      subtitle={reg ? `Each dot is a unit (size = population). The line is the fit across ${fmtInt(reg.n)} inhabited 1 km pixels: ${fmtDelta(reg.slopePer0p1Ndvi, 2)}°C per +0.1 NDVI (R² ${reg.r2.toFixed(2)}).` : 'Vegetation vs afternoon surface temperature per unit.'}
      legend={<div className="legend-stack"><Legend items={TIERS.map((t) => ({ color: t.color, label: t.label }))} />{reg && <Legend items={[{ color: '#f2f0e6', label: 'Pixel-level linear fit (association, not causation)', kind: 'line' }]} />}</div>}
      table={{ head: ['Unit', 'NDVI', 'Afternoon LST (°C)', 'Population', 'Tier'], rows: pts.map((p) => [p.full, p.x.toFixed(3), p.y.toFixed(1), fmtInt(p.z), p.tier.label]) }}
      source="NASA MODIS (LST, NDVI) · WorldPop 2020">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart margin={{ top: 12, right: 18, left: -4, bottom: 6 }}>
          <CartesianGrid stroke="rgba(236,240,226,0.07)" />
          <XAxis type="number" dataKey="x" name="NDVI" domain={[x0, x1]} tick={AX.tick} axisLine={AX.line} tickLine={false} tickFormatter={(v: number) => v.toFixed(2)} label={{ value: 'Vegetation (NDVI) →', position: 'insideBottom', offset: -2, fill: '#959c90', fontSize: 11.5 }} height={42} />
          <YAxis type="number" dataKey="y" name="LST" domain={[Math.floor(Math.min(...ys) - 0.5), Math.ceil(Math.max(...ys) + 0.5)]} tick={AX.tick} axisLine={false} tickLine={false} width={44} tickFormatter={(v: number) => `${v}°`} />
          <ZAxis type="number" dataKey="z" range={[110, 900]} />
          {seg && <ReferenceLine segment={[{ x: seg[0].x, y: seg[0].y }, { x: seg[1].x, y: seg[1].y }]} stroke="#f2f0e6" strokeWidth={2} strokeLinecap="round" ifOverflow="extendDomain" />}
          <Tooltip cursor={{ strokeDasharray: '3 3', stroke: 'rgba(236,240,226,0.25)' }} content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const d = payload[0].payload as (typeof pts)[number];
            return <TooltipBox title={d.full} rows={[{ color: d.tier.color, label: 'Risk tier', value: `${d.tier.label} (#${d.rank})` }, { label: 'Afternoon LST', value: fmtTemp(d.y) }, { label: 'NDVI', value: d.x.toFixed(3) }, { label: 'Population', value: fmtCompact(d.z) }]} foot="Click to compare" />;
          }} />
          <Scatter data={pts} isAnimationActive={false} cursor="pointer" onClick={(d: unknown) => onPick((d as { id: string }).id)}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            shape={(p: any) => {
              const sel = selected.indexOf(p.payload.id);
              const r = Math.sqrt((p.size ?? 200) / Math.PI);
              return (
                <g>
                  <circle cx={p.cx} cy={p.cy} r={r} fill={tierFor(scores.get(p.payload.id)!.index).color} fillOpacity={0.82} stroke="var(--surface-1)" strokeWidth={2} />
                  {sel >= 0 && <circle cx={p.cx} cy={p.cy} r={r + 4} fill="none" stroke={slotColor(sel)} strokeWidth={2.5} />}
                </g>
              );
            }} />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

const AXES: { key: keyof RiskScore['parts']; label: string }[] = [
  { key: 'lstDay', label: 'Afternoon heat' }, { key: 'lstNight', label: 'Night heat' }, { key: 'density', label: 'Density' }, { key: 'greenDeficit', label: 'Green deficit' }, { key: 'healthGap', label: 'Health-access gap' },
];
/** Radar of the five normalised risk drivers for the picked units (0 = best in city, 100 = worst). */
export function RadarCompare({ units, scores, picks, height = 340 }: { units: UnitFeature[]; scores: Map<string, RiskScore>; picks: string[]; height?: number }) {
  const sel = picks.map((id) => units.find((u) => u.properties.id === id)).filter(Boolean) as UnitFeature[];
  const med = (k: keyof RiskScore['parts']) => { const a = [...scores.values()].map((s) => s.parts[k]).sort((x, y) => x - y); return a[Math.floor(a.length / 2)] * 100; };
  const data = AXES.map((a) => {
    const row: Record<string, number | string> = { axis: a.label, 'City median': +med(a.key).toFixed(0) };
    sel.forEach((u) => { row[u.properties.short] = +(scores.get(u.properties.id)!.parts[a.key] * 100).toFixed(0); });
    return row;
  });
  return (
    <ChartFrame title="Risk drivers compared" height={height} subtitle="Each driver scaled 0 (best unit in Karachi) to 100 (worst). A bigger shape means a bigger problem."
      table={{ head: ['Driver', 'City median', ...sel.map((u) => u.properties.short)], rows: data.map((d) => [d.axis as string, d['City median'] as number, ...sel.map((u) => d[u.properties.short] as number)]) }}
      legend={<Legend items={[{ color: '#959c90', label: 'City median', kind: 'line' }, ...sel.map((u, i) => ({ color: slotColor(i), label: u.properties.short }))]} />}
      source="TerraWatch Heat Risk Index components">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data} outerRadius="72%">
          <PolarGrid stroke="rgba(236,240,226,0.12)" />
          <PolarAngleAxis dataKey="axis" tick={{ fill: '#c9c8ba', fontSize: 11.5 }} />
          <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
          <Radar dataKey="City median" stroke="#959c90" fill="#959c90" fillOpacity={0.08} strokeWidth={2} isAnimationActive={false} />
          {sel.map((u, i) => <Radar key={u.properties.id} dataKey={u.properties.short} stroke={slotColor(i)} fill={slotColor(i)} fillOpacity={0.14} strokeWidth={2} dot={{ r: 3, fill: slotColor(i), stroke: 'var(--surface-1)', strokeWidth: 2 }} isAnimationActive={false} />)}
          <Tooltip content={({ active, payload, label }) => active && payload?.length ? <TooltipBox title={label} rows={payload.map((p) => ({ color: p.stroke as string, label: String(p.name), value: String(p.value) }))} /> : null} />
          <RLegend content={() => null} />
        </RadarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

/** Hot-season afternoon LST per year (satellite), picked units vs the city mean. */
export function SeasonLines({ units, picks, height = 300 }: { units: UnitFeature[]; picks: string[]; height?: number }) {
  const years = useMemo(() => [...new Set(units.flatMap((u) => Object.keys(u.properties.lst?.byYear ?? {})))].sort(), [units]);
  const sel = picks.map((id) => units.find((u) => u.properties.id === id)).filter(Boolean) as UnitFeature[];
  const data = years.map((y) => {
    const vs = units.map((u) => u.properties.lst?.byYear?.[y]).filter((v): v is number => v != null);
    const row: Record<string, number | string | null> = { year: y, 'All units': vs.length ? +(vs.reduce((a, b) => a + b, 0) / vs.length).toFixed(2) : null };
    sel.forEach((u) => { row[u.properties.short] = u.properties.lst?.byYear?.[y] ?? null; });
    return row;
  });
  const vals = data.flatMap((d) => Object.entries(d).filter(([k]) => k !== 'year').map(([, v]) => v as number | null)).filter((v): v is number => v != null);
  return (
    <ChartFrame title="Hot-season heat, season by season" height={height}
      subtitle="Mean afternoon land-surface temperature of each May–June season (satellite). A few seasons show variability, not a climate trend."
      legend={<Legend items={[{ color: '#959c90', label: 'All units (mean)', kind: 'line' }, ...sel.map((u, i) => ({ color: slotColor(i), label: u.properties.short, kind: 'line' as const }))]} />}
      table={{ head: ['Season', 'All units', ...sel.map((u) => u.properties.short)], rows: data.map((d) => [d.year as string, d['All units'] != null ? (d['All units'] as number).toFixed(1) : '—', ...sel.map((u) => (d[u.properties.short] != null ? (d[u.properties.short] as number).toFixed(1) : '—'))]) }}
      source="NASA MODIS/Aqua MYD11A2, 1 km, quality-filtered">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 16, left: -4, bottom: 0 }}>
          <CartesianGrid {...GRID} />
          <XAxis dataKey="year" tick={AX.tick} axisLine={AX.line} tickLine={false} />
          <YAxis tick={AX.tick} axisLine={false} tickLine={false} width={44} domain={[Math.floor(Math.min(...vals) - 0.5), Math.ceil(Math.max(...vals) + 0.5)]} tickFormatter={(v: number) => `${v}°`} />
          <Tooltip cursor={{ stroke: 'rgba(236,240,226,0.3)' }} content={({ active, payload, label }) => active && payload?.length ? <TooltipBox title={`${label} season`} rows={payload.map((p) => ({ color: p.stroke as string, label: String(p.name), value: p.value != null ? fmtTemp(p.value as number) : '—' }))} /> : null} />
          <Line dataKey="All units" stroke="#959c90" strokeWidth={2} dot={{ r: 4, fill: '#959c90', stroke: 'var(--surface-1)', strokeWidth: 2 }} isAnimationActive={false} />
          {sel.map((u, i) => <Line key={u.properties.id} dataKey={u.properties.short} stroke={slotColor(i)} strokeWidth={2} dot={{ r: 4, fill: slotColor(i), stroke: 'var(--surface-1)', strokeWidth: 2 }} activeDot={{ r: 6 }} connectNulls isAnimationActive={false} />)}
        </LineChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

/** Tiny inline sparkline (SVG) for a unit's season series. */
export function Sparkline({ values, color = 'var(--c-heat)', width = 120, height = 34 }: { values: (number | null)[]; color?: string; width?: number; height?: number }) {
  const v = values.filter((x): x is number => x != null);
  if (v.length < 2) return null;
  const lo = Math.min(...v), hi = Math.max(...v), span = hi - lo || 1;
  const pts = values.map((x, i) => (x == null ? null : [(i / (values.length - 1)) * (width - 8) + 4, height - 5 - ((x - lo) / span) * (height - 10)] as [number, number])).filter((p): p is [number, number] => p != null);
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Season values from ${v[0].toFixed(1)} to ${v[v.length - 1].toFixed(1)}`}>
      <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={i === pts.length - 1 ? 3.5 : 2.5} fill={color} stroke="var(--surface-1)" strokeWidth="1.5" />)}
    </svg>
  );
}
