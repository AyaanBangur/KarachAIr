// One registry of the map/ranking metrics, so colour, unit, direction and wording stay consistent everywhere.
import { CYAN, GREEN, THERMAL, VIOLET, rampCss, rampGradient, type Ramp } from './colors';
import type { UnitFeature } from './types';
import type { RiskScore } from './risk';
import { fmtDec, fmtInt, fmtTemp } from './format';

export type MetricKey = 'hri' | 'lstDay' | 'lstNight' | 'ndvi' | 'density' | 'health';
export interface MetricDef {
  key: MetricKey; label: string; short: string; unit: string; ramp: Ramp; tone: string;
  log?: boolean; worseWhenHigher: boolean; blurb: string;
  value: (u: UnitFeature, s?: RiskScore) => number | null;
  fmt: (v: number | null) => string;
}

export const METRICS: Record<MetricKey, MetricDef> = {
  hri: { key: 'hri', label: 'Heat risk index', short: 'Risk index', unit: '/100', ramp: THERMAL, tone: 'var(--c-heat)', worseWhenHigher: true, blurb: 'Hazard + exposure + vulnerability, relative to Karachi\'s other units.', value: (_u, s) => s?.index ?? null, fmt: (v) => (v == null ? 'n/a' : v.toFixed(0)) },
  lstDay: { key: 'lstDay', label: 'Afternoon surface temp', short: 'Afternoon LST', unit: '°C', ramp: THERMAL, tone: 'var(--c-heat)', worseWhenHigher: true, blurb: 'Hot-season mean land-surface temperature at ~13:30 (NASA MODIS/Aqua, 1 km).', value: (u) => u.properties.lst?.day ?? null, fmt: (v) => fmtTemp(v) },
  lstNight: { key: 'lstNight', label: 'Night surface temp', short: 'Night LST', unit: '°C', ramp: THERMAL, tone: 'var(--c-heat)', worseWhenHigher: true, blurb: 'Hot-season mean land-surface temperature at ~01:30, how little the city cools overnight.', value: (u) => u.properties.lst?.night ?? null, fmt: (v) => fmtTemp(v) },
  ndvi: { key: 'ndvi', label: 'Vegetation (NDVI)', short: 'Vegetation', unit: '', ramp: GREEN, tone: 'var(--c-veg)', worseWhenHigher: false, blurb: 'Mean NDVI greenness, 250 m (NASA MODIS/Terra). Higher = more vegetation = cooler.', value: (u) => u.properties.ndvi, fmt: (v) => fmtDec(v, 2) },
  density: { key: 'density', label: 'Population density', short: 'Density', unit: '/km²', ramp: VIOLET, tone: 'var(--c-pop)', log: true, worseWhenHigher: true, blurb: 'Modelled 2020 residents per km² (WorldPop). Log-scaled colour.', value: (u) => u.properties.popDensity, fmt: (v) => fmtInt(v) },
  health: { key: 'health', label: 'Health facility access', short: 'Health access', unit: '/100k', ramp: CYAN, tone: 'var(--c-cool)', worseWhenHigher: false, blurb: 'Mapped hospitals + clinics per 100k residents (OpenStreetMap). Higher = better access.', value: (u) => u.properties.infra?.healthPer100k ?? null, fmt: (v) => fmtDec(v, 1) },
};
export const METRIC_ORDER: MetricKey[] = ['hri', 'lstDay', 'lstNight', 'ndvi', 'density', 'health'];

export function metricDomain(m: MetricDef, units: UnitFeature[], scores: Map<string, RiskScore>): [number, number] {
  const vs = units.map((u) => m.value(u, scores.get(u.properties.id))).filter((v): v is number => v != null);
  const t = (v: number) => (m.log ? Math.log10(1 + v) : v);
  const lo = Math.min(...vs.map(t)), hi = Math.max(...vs.map(t));
  return [lo, hi];
}
export function metricT(m: MetricDef, v: number | null, dom: [number, number]) {
  if (v == null) return null;
  const x = m.log ? Math.log10(1 + v) : v;
  return (x - dom[0]) / (dom[1] - dom[0] || 1);
}
export const metricColor = (m: MetricDef, v: number | null, dom: [number, number], a = 1) => { const t = metricT(m, v, dom); return t == null ? 'rgba(120,128,120,0.25)' : rampCss(m.ramp, t, a); };
export const metricGradient = (m: MetricDef) => rampGradient(m.ramp);
export const metricDomainLabels = (m: MetricDef, dom: [number, number]): [string, string] => {
  const f = (x: number) => m.fmt(m.log ? 10 ** x - 1 : x);
  return [f(dom[0]), f(dom[1])];
};
