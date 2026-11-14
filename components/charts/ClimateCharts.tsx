import { useMemo, useState } from 'react';
import { Area, Bar, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { ClimateFile, MetaFile } from '../../lib/types';
import { thermal } from '../../lib/colors';
import { fmtCompact, fmtDelta, fmtInt } from '../../lib/format';
import { AX, COOL, ChartFrame, GRID, Legend, SERIES, SERIES_HEX, TooltipBox, WARM } from './common';
import { Slider } from '../ui';

/** Bar with a rounded data-end and a square baseline end (positive: round top, negative: round bottom). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function PolarityBar(p: any) {
  const { x, y, width, height } = p;
  const top = Math.min(y, y + height), h = Math.abs(height);
  if (!h || !width) return null;
  const r = Math.min(3, width / 2, h / 2), pos = (p.payload?.anomaly ?? 0) >= 0;
  const fill = pos ? WARM : COOL;
  const d = pos
    ? `M${x},${top + h} V${top + r} Q${x},${top} ${x + r},${top} H${x + width - r} Q${x + width},${top} ${x + width},${top + r} V${top + h} Z`
    : `M${x},${top} V${top + h - r} Q${x},${top + h} ${x + r},${top + h} H${x + width - r} Q${x + width},${top + h} ${x + width},${top + h - r} V${top} Z`;
  return <path d={d} fill={fill} />;
}

function ols(xs: number[], ys: number[]) {
  const n = xs.length, mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let sxx = 0, sxy = 0; xs.forEach((x, i) => { sxx += (x - mx) ** 2; sxy += (x - mx) * (ys[i] - my); });
  const b = sxy / sxx; return { slope: b, intercept: my - b * mx };
}

/** Annual mean daily-maximum temperature versus the 1991–2020 mean (ERA5-Land, central Karachi). */
export function AnomalyChart({ climate, height = 300, compact = false }: { climate: ClimateFile; height?: number; compact?: boolean }) {
  const rows = useMemo(() => {
    const ys = climate.years.filter((y) => y.complete && y.anomaly != null && y.year >= 1950);
    const tr = ys.filter((y) => y.year >= climate.city.trend.from);
    const fit = ols(tr.map((y) => y.year), tr.map((y) => y.anomaly as number));
    return ys.map((y) => ({ year: y.year, anomaly: y.anomaly as number, meanTmax: y.meanTmax, trend: y.year >= climate.city.trend.from ? +(fit.intercept + fit.slope * y.year).toFixed(3) : null }));
  }, [climate]);
  const tr = climate.city.trend;
  return (
    <ChartFrame title="Karachi is warming" height={height}
      legend={<Legend items={[{ color: WARM, label: 'Warmer than 1991–2020 mean' }, { color: COOL, label: 'Cooler' }, { color: '#f2f0e6', label: `Linear trend ${tr.from}–${tr.to}`, kind: 'line' }]} />}
      subtitle={`Annual mean of daily maximum temperature vs the ${climate.city.baseline[0]}–${climate.city.baseline[1]} average (${climate.city.baselineMeanTmax.toFixed(1)}°C). Trend since ${tr.from}: ${fmtDelta(tr.annualMeanTmaxPerDecade, 2)} ± ${tr.annualCi95.toFixed(2)}°C per decade.`}
      table={{ head: ['Year', 'Mean Tmax (°C)', 'Anomaly (°C)'], rows: rows.map((r) => [r.year, r.meanTmax.toFixed(2), fmtDelta(r.anomaly, 2)]) }}
      source="ECMWF ERA5-Land reanalysis (~9 km grid) via Open-Meteo — model data, not a station record">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 10, right: 12, left: -8, bottom: 0 }}>
          <CartesianGrid {...GRID} />
          <XAxis dataKey="year" tick={AX.tick} axisLine={AX.line} tickLine={false} interval={compact ? 11 : 9} minTickGap={20} />
          <YAxis tick={AX.tick} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${v > 0 ? '+' : ''}${v}°`} width={42} />
          <ReferenceLine y={0} stroke="rgba(236,240,226,0.28)" />
          <Tooltip cursor={{ fill: 'rgba(255,255,255,0.05)' }} content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const d = payload[0].payload as (typeof rows)[number];
            return <TooltipBox title={d.year} rows={[{ color: d.anomaly >= 0 ? WARM : COOL, label: 'Vs 1991–2020 mean', value: `${fmtDelta(d.anomaly, 2)}°C` }, { label: 'Mean daily max', value: `${d.meanTmax.toFixed(2)}°C`, dim: true }]} />;
          }} />
          <Bar dataKey="anomaly" maxBarSize={9} shape={<PolarityBar />} isAnimationActive={false} />
          <Line dataKey="trend" stroke="#f2f0e6" strokeWidth={2} dot={false} strokeLinecap="round" isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

const MONTHS: Record<string, string> = { '04-01': 'Apr', '05-01': 'May', '06-01': 'Jun', '07-01': 'Jul' };
const mdLabel = (md: string) => { const [m, d] = md.split('-'); return `${['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'][+m]} ${+d}`; };

/** Daily maximum temperature through the pre-monsoon hot season: normal band vs notable years. */
export function ProfileChart({ climate, height = 320 }: { climate: ClimateFile; height?: number }) {
  const { profile, pickYears, city } = climate;
  const yearColor: Record<number, string> = {};
  const sorted = [...pickYears].sort((a, b) => a - b);
  sorted.forEach((y, i) => { yearColor[y] = SERIES_HEX[[2, 0, 1][i] ?? i] ?? SERIES_HEX[i]; });
  const latest = sorted[sorted.length - 1];
  const [on, setOn] = useState<Record<number, boolean>>(() => Object.fromEntries(sorted.map((y) => [y, true])));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any[] = profile.map((r) => ({ ...r, band: [r.p10, r.p90] as [number, number] }));
  return (
    <ChartFrame title="The hot season, day by day" height={height}
      legend={<Legend items={[{ color: '#959c90', label: `Normal ${city.baseline[0]}–${city.baseline[1]}`, kind: 'line' }, ...sorted.filter((y) => on[y]).map((y) => ({ color: yearColor[y], label: String(y), kind: 'line' as const }))]} />}
      subtitle={`Daily maximum temperature, 1 Apr – 31 Jul. The grey band is the ${city.baseline[0]}–${city.baseline[1]} 10th–90th percentile range; the line inside is the normal.`}
      table={{ head: ['Date', 'Normal', 'P10', 'P90', ...sorted.map(String)], rows: profile.filter((_, i) => i % 5 === 0).map((r) => [mdLabel(r.md), r.normal, r.p10, r.p90, ...sorted.map((y) => (r[`y${y}`] as number) ?? '—')]) }}
      aside={<div className="chip-row">{sorted.map((y) => <button key={y} className={`chip chip-btn ${on[y] ? 'on' : ''}`} aria-pressed={on[y]} onClick={() => setOn((s) => ({ ...s, [y]: !s[y] }))}><i className="dot" style={{ color: yearColor[y] }} />{y}</button>)}</div>}
      source="ECMWF ERA5-Land via Open-Meteo (~9 km grid, central Karachi)">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 10, right: 12, left: -8, bottom: 0 }}>
          <CartesianGrid {...GRID} />
          <XAxis dataKey="md" ticks={Object.keys(MONTHS)} tickFormatter={(v: string) => MONTHS[v] ?? v} tick={AX.tick} axisLine={AX.line} tickLine={false} />
          <YAxis tick={AX.tick} axisLine={false} tickLine={false} width={42} domain={['dataMin - 1', 'dataMax + 1']} tickFormatter={(v: number) => `${Math.round(v)}°`} />
          <Tooltip cursor={{ stroke: 'rgba(236,240,226,0.3)' }} content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const d = payload[0].payload as Record<string, number | string | null>;
            return <TooltipBox title={mdLabel(String(d.md))} rows={[
              { label: 'Normal', value: `${Number(d.normal).toFixed(1)}°C`, dim: true }, { label: 'P10–P90', value: `${Number(d.p10).toFixed(0)}–${Number(d.p90).toFixed(0)}°C`, dim: true },
              ...sorted.filter((y) => on[y] && d[`y${y}`] != null).map((y) => ({ color: yearColor[y], label: String(y), value: `${d[`y${y}`]}°C` })),
            ]} />;
          }} />
          <Area dataKey="band" stroke="none" fill="#959c90" fillOpacity={0.14} isAnimationActive={false} />
          <Line dataKey="normal" stroke="#959c90" strokeWidth={2} dot={false} isAnimationActive={false} />
          {sorted.map((y) => on[y] && <Line key={y} dataKey={`y${y}`} stroke={yearColor[y]} strokeWidth={y === latest ? 2 : 1.6} dot={false} connectNulls={false} isAnimationActive={false} />)}
        </ComposedChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

/** Residents by afternoon surface temperature, with an adjustable threshold. */
export function ExposureCard({ meta, height = 260 }: { meta: MetaFile; height?: number }) {
  const bins = meta.exposure;
  const total = bins.reduce((s, b) => s + b.people, 0);
  const lo = bins[0]?.lst ?? 35, hiT = bins[bins.length - 1]?.lst ?? 50;
  const [thr, setThr] = useState(() => { let acc = 0; for (let i = bins.length - 1; i >= 0; i--) { acc += bins[i].people; if (acc >= total * 0.25) return bins[i].lst; } return hiT; });
  const above = bins.filter((b) => b.lst >= thr).reduce((s, b) => s + b.people, 0);
  const rng = Math.max(1, hiT - lo);
  return (
    <ChartFrame title="Who lives in the heat?" height={height}
      subtitle="Modelled residents by the average afternoon surface temperature of the 1 km area they live in (hot-season mean)."
      table={{ head: ['Surface temp bin (°C)', 'Residents'], rows: bins.map((b) => [`${b.lst}–${b.lst + 1}`, fmtInt(b.people)]) }}
      source="WorldPop 2020 (UN-adjusted) × NASA MODIS/Aqua LST">
      <div className="exposure-head">
        <div><div className="big-num">{fmtCompact(above)}</div><div className="muted" style={{ fontSize: 12.5 }}>residents (<b>{((above / total) * 100).toFixed(0)}%</b>) live where afternoon surface temp ≥ <b>{thr}°C</b></div></div>
        <div style={{ minWidth: 200, flex: '0 1 260px' }}><Slider label="Threshold" value={thr} min={lo} max={hiT} step={1} onChange={setThr} format={(v) => `${v}°C`} fill="var(--c-heat)" /></div>
      </div>
      <div style={{ height: height - 62 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={bins.map((b) => ({ ...b, hot: b.lst >= thr }))} margin={{ top: 6, right: 8, left: -6, bottom: 0 }}>
            <CartesianGrid {...GRID} />
            <XAxis dataKey="lst" tick={AX.tick} axisLine={AX.line} tickLine={false} tickFormatter={(v: number) => `${v}°`} />
            <YAxis tick={AX.tick} axisLine={false} tickLine={false} tickFormatter={fmtCompact} width={44} />
            <Tooltip cursor={{ fill: 'rgba(255,255,255,0.05)' }} content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload as { lst: number; people: number };
              return <TooltipBox title={`${d.lst}–${d.lst + 1}°C`} rows={[{ color: thermal((d.lst - lo) / rng), label: 'Residents', value: fmtInt(d.people) }, { label: 'Share of modelled pop.', value: `${((d.people / total) * 100).toFixed(1)}%`, dim: true }]} />;
            }} />
            <Bar dataKey="people" maxBarSize={22} radius={[4, 4, 0, 0]} isAnimationActive={false}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              shape={(p: any) => {
                const { x, y, width, height: h, payload } = p;
                if (!h) return <g />;
                const r = Math.min(4, width / 2, h / 2);
                return <path d={`M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + width - r} Q${x + width},${y} ${x + width},${y + r} V${y + h} Z`} fill={thermal((payload.lst - lo) / rng)} opacity={payload.hot ? 1 : 0.28} />;
              }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </ChartFrame>
  );
}

export { SERIES };
