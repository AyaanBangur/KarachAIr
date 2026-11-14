// Rule-based "intelligence" layer. Every finding is computed from the measured indicators, carries its evidence,
// and states how it was derived. Nothing here is generated free-form, so nothing can be invented.
import type { MetaFile, UnitFeature } from './types';
import { confidenceFor, dominantDriver, type Confidence, type RiskScore, type RiskWeights } from './risk';
import { fmtCompact, fmtDelta, fmtInt, fmtTemp, median } from './format';

export type Tone = 'heat' | 'veg' | 'pop' | 'cool' | 'alert' | 'gap';
export interface Evidence { label: string; value: string; kind: 'measured' | 'derived' }
export interface Insight {
  id: string; tone: Tone; icon: 'flame' | 'moon' | 'users' | 'cross' | 'leaf' | 'trend' | 'alert' | 'info';
  title: string; headline: string; body: string; evidence: Evidence[]; confidence: Confidence; how: string; unitId?: string;
}

const hi = (xs: UnitFeature[], f: (u: UnitFeature) => number | null | undefined) =>
  xs.filter((u) => f(u) != null).sort((a, b) => (f(b) as number) - (f(a) as number));

export function buildCityInsights(units: UnitFeature[], scores: Map<string, RiskScore>, w: RiskWeights, meta: MetaFile): Insight[] {
  const out: Insight[] = [];
  const day = units.map((u) => u.properties.lst?.day).filter((v): v is number => v != null);
  const night = units.map((u) => u.properties.lst?.night).filter((v): v is number => v != null);
  const mDay = median(day), mNight = median(night);
  const mHealth = median(units.map((u) => u.properties.infra?.healthPer100k).filter((v): v is number => v != null));
  const reg = meta.lst?.regression ?? null;
  const ss = [...(meta.lst?.seasons ?? [])].sort();
  const seasons = ss.length > 1 ? `${ss[0]}–${ss[ss.length - 1]}` : String(ss[0] ?? '');

  // 1 — hottest surface
  const hottest = hi(units, (u) => u.properties.lst?.day)[0];
  if (hottest) {
    const l = hottest.properties.lst!;
    out.push({
      id: 'hottest', tone: 'heat', icon: 'flame', unitId: hottest.properties.id,
      title: 'Hottest afternoon surface',
      headline: `${hottest.properties.short} reaches ${fmtTemp(l.day)}`,
      body: `Across the ${seasons} hot seasons, the average afternoon land-surface temperature in ${hottest.properties.name} is ${fmtDelta(l.day - mDay)}°C above the Karachi median (${fmtTemp(mDay)}). ${l.peak8Day ? `Its hottest 8-day satellite composite averaged ${fmtTemp(l.peak8Day.value)} (${l.peak8Day.date}).` : ''}`,
      evidence: [
        { label: 'Afternoon LST (mean)', value: fmtTemp(l.day), kind: 'measured' },
        { label: 'City median', value: fmtTemp(mDay), kind: 'derived' },
        { label: 'Hottest 1 km pixel (mean)', value: fmtTemp(l.dayHottestPixel), kind: 'measured' },
      ],
      confidence: confidenceFor(hottest),
      how: `Mean of NASA MODIS/Aqua afternoon (~13:30 local) land-surface temperature, area-weighted over the unit, across all clear-sky 8-day composites from 1 May–30 Jun, ${seasons}.`,
    });
  }

  // 2 — highest combined risk
  const top = [...scores.values()].sort((a, b) => b.index - a.index)[0];
  const topUnit = top && units.find((u) => u.properties.id === top.id);
  if (top && topUnit) {
    const drv = dominantDriver(top, w);
    const label = { hazard: 'surface heat (hazard)', exposure: 'population density (exposure)', vulnerability: 'low greenery and health access (vulnerability)' }[drv];
    out.push({
      id: 'highest-risk', tone: 'alert', icon: 'alert', unitId: top.id,
      title: 'Highest combined heat risk',
      headline: `${topUnit.properties.short} ranks #1 (index ${top.index.toFixed(0)}/100)`,
      body: `${topUnit.properties.name} combines the strongest mix of hazard, exposure and vulnerability. The biggest contributor is ${label}. The index is relative: it ranks Karachi's 24 units against each other and is not an absolute danger level.`,
      evidence: [
        { label: 'Hazard', value: top.hazard.toFixed(0), kind: 'derived' },
        { label: 'Exposure', value: top.exposure.toFixed(0), kind: 'derived' },
        { label: 'Vulnerability', value: top.vulnerability.toFixed(0), kind: 'derived' },
      ],
      confidence: confidenceFor(topUnit),
      how: 'Heat Risk Index = weighted sum of three 0–100 components, each min–max scaled across the 24 units. Weights are adjustable in the Method lab.',
    });
  }

  // 3 — night-time heat retention
  const warmNight = hi(units, (u) => u.properties.lst?.night)[0];
  if (warmNight) {
    const l = warmNight.properties.lst!;
    out.push({
      id: 'night', tone: 'heat', icon: 'moon', unitId: warmNight.properties.id,
      title: 'Least overnight relief',
      headline: `${warmNight.properties.short} stays at ${fmtTemp(l.night)} at ~01:30`,
      body: `Warm nights stop the body recovering from daytime heat. ${warmNight.properties.name} has the highest night-time surface temperature, ${fmtDelta(l.night - mNight)}°C versus the city median of ${fmtTemp(mNight)}.`,
      evidence: [
        { label: 'Night LST (mean)', value: fmtTemp(l.night), kind: 'measured' },
        { label: 'City median', value: fmtTemp(mNight), kind: 'derived' },
      ],
      confidence: confidenceFor(warmNight),
      how: 'Same method as the afternoon layer, using the Aqua night-time (~01:30 local) land-surface temperature band.',
    });
  }

  // 4 — people in the hottest tail
  if (meta.exposure.length) {
    const total = meta.exposure.reduce((s, b) => s + b.people, 0);
    let acc = 0, thr = meta.exposure[meta.exposure.length - 1].lst;
    for (let i = meta.exposure.length - 1; i >= 0; i--) { acc += meta.exposure[i].people; if (acc >= total * 0.25) { thr = meta.exposure[i].lst; break; } }
    const people = meta.exposure.filter((b) => b.lst >= thr).reduce((s, b) => s + b.people, 0);
    out.push({
      id: 'people', tone: 'pop', icon: 'users',
      title: 'Residents in the hottest tail',
      headline: `${fmtCompact(people)} people live where afternoon surface temp ≥ ${thr}°C`,
      body: `Overlaying WorldPop's 2020 population grid on the satellite heat map, about a quarter of the modelled population lives in 1 km pixels that average at least ${thr}°C on hot-season afternoons.`,
      evidence: [
        { label: 'Residents at ≥ threshold', value: fmtInt(people), kind: 'derived' },
        { label: 'Share of modelled population', value: `${((people / total) * 100).toFixed(0)}%`, kind: 'derived' },
      ],
      confidence: { level: 'medium', reason: 'Population is a modelled 2020 estimate on a 1 km grid; it is combined with a different 1 km satellite grid, so individual pixels are approximate.' },
      how: 'For every populated WorldPop cell inside a unit, the satellite LST at the cell centre is looked up; people are then summed by LST bin.',
    });
  }

  // 5 — care gap: hot but thin on mapped health facilities
  const hotSet = new Set(hi(units, (u) => u.properties.lst?.day).slice(0, 8).map((u) => u.properties.id));
  const gap = units.filter((u) => hotSet.has(u.properties.id) && u.properties.infra?.healthPer100k != null && (u.properties.population ?? 0) > 400000)
    .sort((a, b) => (a.properties.infra!.healthPer100k ?? 0) - (b.properties.infra!.healthPer100k ?? 0))[0];
  if (gap) {
    const i = gap.properties.infra!;
    out.push({
      id: 'care-gap', tone: 'cool', icon: 'cross', unitId: gap.properties.id,
      title: 'Hot, populous, thin on mapped care',
      headline: `${gap.properties.short}: ${i.healthPer100k?.toFixed(1)} health facilities per 100k`,
      body: `${gap.properties.name} is among the 8 hottest units and home to ${fmtCompact(gap.properties.population)} people, but has ${i.healthFacilities} mapped hospitals/clinics (${i.healthPer100k?.toFixed(1)} per 100k vs a city median of ${mHealth.toFixed(1)}). OpenStreetMap coverage is uneven, so verify locally before acting.`,
      evidence: [
        { label: 'Mapped hospitals + clinics', value: fmtInt(i.healthFacilities), kind: 'measured' },
        { label: 'Per 100k residents', value: i.healthPer100k?.toFixed(1) ?? '—', kind: 'derived' },
        { label: 'City median per 100k', value: mHealth.toFixed(1), kind: 'derived' },
      ],
      confidence: { level: 'low', reason: 'Counts come from OpenStreetMap volunteers and under-count informal clinics.' },
      how: 'Count of OSM features tagged amenity/healthcare = hospital or clinic whose centre falls inside the unit, divided by WorldPop population.',
    });
  }

  // 6 — greening lever, from Karachi's own data
  if (reg) {
    const cand = units.filter((u) => hotSet.has(u.properties.id) && u.properties.ndvi != null && u.properties.population != null)
      .sort((a, b) => (b.properties.population! * (1 - b.properties.ndvi!)) - (a.properties.population! * (1 - a.properties.ndvi!)))[0];
    out.push({
      id: 'greening', tone: 'veg', icon: 'leaf', unitId: cand?.properties.id,
      title: 'What the data says about greenery',
      headline: `+0.1 NDVI ↔ ${fmtDelta(reg.slopePer0p1Ndvi, 2)}°C afternoon surface temperature`,
      body: `Across ${fmtInt(reg.n)} inhabited 1 km pixels in Karachi, greener pixels are cooler: each +0.1 of NDVI is associated with ${fmtDelta(reg.slopePer0p1Ndvi, 2)}°C (±${reg.ci95Per0p1.toFixed(2)} at 95%; R² ${reg.r2.toFixed(2)}). This is a correlation, not a controlled experiment.${cand ? ` Among hot units, ${cand.properties.short} has the largest greening headroom × population.` : ''}`,
      evidence: [
        { label: 'Slope per +0.1 NDVI', value: `${fmtDelta(reg.slopePer0p1Ndvi, 2)}°C`, kind: 'derived' },
        { label: 'Pixels used', value: fmtInt(reg.n), kind: 'derived' },
        { label: 'R²', value: reg.r2.toFixed(2), kind: 'derived' },
      ],
      confidence: { level: reg.r2 > 0.3 ? 'medium' : 'low', reason: reg.r2 > 0.3 ? 'Moderate explanatory power; other factors (coast, surface materials, moisture) also matter.' : 'Weak fit — treat as indicative only.' },
      how: 'Ordinary least squares of mean afternoon LST on mean NDVI across 1 km pixels with ≥500 residents/km² (WorldPop). Confounders such as sea breeze and building materials are not controlled.',
    });
  }

  // 7 — long-run climate signal
  const tr = meta.climateCity?.trend;
  if (tr) {
    out.push({
      id: 'trend', tone: 'heat', icon: 'trend',
      title: 'Long-run warming signal',
      headline: `+${tr.annualMeanTmaxPerDecade.toFixed(2)}°C per decade in daily maximum temperature`,
      body: `ERA5-Land reanalysis for central Karachi shows annual mean daily maximum temperature rising ${tr.annualMeanTmaxPerDecade.toFixed(2)} ± ${tr.annualCi95.toFixed(2)}°C per decade over ${tr.from}–${tr.to}. For the May–June hot season the trend is ${tr.hotSeasonTmaxPerDecade.toFixed(2)} ± ${tr.hotSeasonCi95.toFixed(2)}°C per decade. This is a ~9 km model reanalysis, not a station record.`,
      evidence: [
        { label: 'Annual Tmax trend / decade', value: `${fmtDelta(tr.annualMeanTmaxPerDecade, 2)}°C`, kind: 'derived' },
        { label: 'Hot-season Tmax trend / decade', value: `${fmtDelta(tr.hotSeasonTmaxPerDecade, 2)}°C`, kind: 'derived' },
        { label: 'Period', value: `${tr.from}–${tr.to}`, kind: 'measured' },
      ],
      confidence: { level: tr.annualR2 > 0.4 ? 'high' : 'medium', reason: `Linear fit R² = ${tr.annualR2.toFixed(2)} over ${tr.to - tr.from + 1} years of reanalysis data.` },
      how: 'Ordinary least squares on annual means of daily maximum 2 m temperature from ERA5-Land (Open-Meteo archive), complete years only.',
    });
  }

  // 8 — honest data gap
  out.push({
    id: 'gap', tone: 'gap', icon: 'info',
    title: 'What this analysis cannot see yet',
    headline: 'No unit-level income, age or housing data',
    body: 'Heat vulnerability also depends on poverty, age, informal housing, indoor cooling and electricity reliability. No open dataset at town level was available, so these are not scored. Adding household survey or census data would make the vulnerability pillar considerably stronger.',
    evidence: [{ label: 'Vulnerability inputs used', value: 'NDVI deficit + mapped health access', kind: 'derived' }],
    confidence: { level: 'high', reason: 'This is a statement about what is missing, not a measurement.' },
    how: 'See the Methodology page for every source and limitation.',
  });
  return out;
}

export interface Opportunity { id: string; title: string; why: string; effect: string | null; tone: Tone }
/** Intervention ideas for one unit, each tied to the measured gap that motivates it. */
export function opportunitiesFor(u: UnitFeature, medians: { ndvi: number; health: number; lstDay: number }, meta: MetaFile): Opportunity[] {
  const p = u.properties, out: Opportunity[] = [];
  const reg = meta.lst?.regression;
  if (p.ndvi != null && p.ndvi < medians.ndvi) {
    out.push({
      id: 'trees', tone: 'veg', title: 'Street trees and shade corridors',
      why: `Vegetation (NDVI ${p.ndvi.toFixed(2)}) is below the city median (${medians.ndvi.toFixed(2)}).`,
      effect: reg ? `Karachi pixels show ${fmtDelta(reg.slopePer0p1Ndvi * 0.5, 2)}°C per +0.05 NDVI (association, not a guarantee).` : null,
    });
  }
  if (p.lst && p.lst.day > medians.lstDay + 0.5) {
    out.push({
      id: 'cool-surfaces', tone: 'heat', title: 'Cool roofs and reflective pavements',
      why: `Afternoon surface temperature is ${fmtDelta(p.lst.day - medians.lstDay)}°C above the city median.`,
      effect: 'Effect size depends on local materials — test it in the Scenario Lab with your own assumption.',
    });
  }
  if (p.infra?.healthPer100k != null && p.infra.healthPer100k < medians.health && (p.population ?? 0) > 300000) {
    out.push({
      id: 'cooling-care', tone: 'cool', title: 'Heat-health response points',
      why: `${p.infra.healthPer100k.toFixed(1)} mapped health facilities per 100k, below the city median of ${medians.health.toFixed(1)}.`,
      effect: 'Cooling shelters and heatstroke triage at existing clinics, mosques or schools could add reach quickly.',
    });
  }
  if (p.popDensity != null && p.popDensity > 20000) {
    out.push({
      id: 'dense', tone: 'pop', title: 'Targeted outreach in dense blocks',
      why: `${fmtInt(p.popDensity)} residents/km² means many people are affected per street treated.`,
      effect: null,
    });
  }
  if (!out.length) out.push({ id: 'monitor', tone: 'gap', title: 'Monitor and protect', why: 'No indicator is markedly worse than the city median; keep monitoring and protect existing green space.', effect: null });
  return out;
}
