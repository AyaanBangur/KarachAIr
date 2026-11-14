import type { MetaFile, UnitFeature } from './types';
import type { RiskScore } from './risk';
import { fmtDate, fmtInt } from './format';

export function downloadText(filename: string, text: string, mime = 'text/plain') {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const q = (v: unknown) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

export function unitsToCsv(units: UnitFeature[], scores: Map<string, RiskScore>): string {
  const head = ['rank', 'unit', 'type', 'heat_risk_index', 'tier', 'hazard', 'exposure', 'vulnerability', 'afternoon_lst_c', 'night_lst_c', 'hottest_8day_lst_c', 'ndvi', 'population_2020', 'pop_density_km2', 'area_km2', 'health_facilities', 'health_per_100k', 'green_m2_per_person', 'hot_season_tmax_c_era5land', 'satellite_pixels', 'satellite_coverage'];
  const rows = [...units].sort((a, b) => (scores.get(a.properties.id)?.rank ?? 99) - (scores.get(b.properties.id)?.rank ?? 99)).map((u) => {
    const p = u.properties, s = scores.get(p.id);
    return [s?.rank, p.name, p.type, s?.index.toFixed(1), s?.tier.label, s?.hazard.toFixed(1), s?.exposure.toFixed(1), s?.vulnerability.toFixed(1), p.lst?.day, p.lst?.night, p.lst?.peak8Day?.value, p.ndvi, p.population, p.popDensity, p.areaKm2, p.infra?.healthFacilities, p.infra?.healthPer100k, p.infra?.greenM2PerPerson, p.air?.hotSeasonTmax, p.lst?.nPixels, p.lst?.coverage].map(q).join(',');
  });
  return [head.join(','), ...rows].join('\n');
}

export function unitBrief(u: UnitFeature, s: RiskScore, meta: MetaFile, extras: { medians: { lstDay: number; lstNight: number; ndvi: number }; opportunities: { title: string; why: string }[]; confidence: string }): string {
  const p = u.properties, l = p.lst;
  const L: string[] = [];
  L.push(`# TerraWatch AI — heat brief: ${p.name}`, '', `_Generated ${fmtDate(new Date().toISOString())} · data build ${fmtDate(meta.generatedAt)}_`, '');
  L.push(`**Heat Risk Index: ${s.index.toFixed(0)} / 100 (${s.tier.label}), rank ${s.rank} of ${meta.unitCount}** — a *relative* ranking across Karachi's administrative units, not an absolute danger level.`, '');
  L.push('## Measured indicators', '', '| Indicator | Value | Source |', '|---|---|---|');
  if (l) {
    L.push(`| Afternoon land-surface temperature (hot season mean) | ${l.day.toFixed(1)} °C (city median ${extras.medians.lstDay.toFixed(1)}) | NASA MODIS/Aqua MYD11A2 |`);
    L.push(`| Night-time land-surface temperature | ${l.night.toFixed(1)} °C (city median ${extras.medians.lstNight.toFixed(1)}) | NASA MODIS/Aqua MYD11A2 |`);
    if (l.peak8Day) L.push(`| Hottest 8-day composite | ${l.peak8Day.value.toFixed(1)} °C (${l.peak8Day.date}) | NASA MODIS/Aqua MYD11A2 |`);
  }
  if (p.ndvi != null) L.push(`| Vegetation (NDVI) | ${p.ndvi.toFixed(2)} (city median ${extras.medians.ndvi.toFixed(2)}) | NASA MODIS/Terra MOD13Q1 |`);
  L.push(`| Population (2020 model) | ${fmtInt(p.population)} (${fmtInt(p.popDensity)} per km²) | WorldPop |`);
  if (p.infra) L.push(`| Mapped hospitals + clinics | ${p.infra.healthFacilities} (${p.infra.healthPer100k?.toFixed(1)} per 100k) | OpenStreetMap |`);
  if (p.air) L.push(`| Hot-season mean max air temperature | ${p.air.hotSeasonTmax.toFixed(1)} °C (~9 km grid) | ERA5-Land via Open-Meteo |`);
  L.push('', '## Risk components (0–100, relative)', '', `- Hazard: ${s.hazard.toFixed(0)}`, `- Exposure: ${s.exposure.toFixed(0)}`, `- Vulnerability: ${s.vulnerability.toFixed(0)}`, '');
  L.push('## Intervention opportunities (rule-based, tied to the gaps above)', '', ...extras.opportunities.map((o) => `- **${o.title}** — ${o.why}`), '');
  L.push('## Confidence & limits', '', `- Data confidence: ${extras.confidence}`, '- Satellite values are *surface* temperatures at ~1 km, not air temperature, and exclude cloudy observations.', '- Population is a modelled 2020 estimate. Health facilities are volunteer-mapped and under-count informal care.', '- Income, age, housing quality and indoor-cooling access are **not** included (no open data at this level).', '');
  L.push('## Sources', '', ...meta.sources.map((x) => `- ${x.name} — ${x.provider} (${x.license}) ${x.url}`));
  return L.join('\n');
}
