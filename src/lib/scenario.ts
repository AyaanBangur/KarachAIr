// What-if engine for the Scenario Lab.
// Every term is explicit so a reader can audit it:
//   ΔLST_day   = warming  +  (β · ΔNDVI)  −  (treated share × assumed surface cooling)
//   ΔLST_night = warming            (interventions are NOT assumed to change night-time temperature — conservative)
//   NDVI'      = NDVI + ΔNDVI
// β is estimated from Karachi's own satellite data (OLS of afternoon LST on NDVI across inhabited 1 km pixels).
// It is a statistical association, not a controlled experiment — the UI says so wherever it is used.
// The "assumed surface cooling" is a USER ASSUMPTION (not measured here) and is labelled as such.
import type { Regression, UnitFeature } from './types';
import { scoreUnit, type Baseline, type RiskScore, type RiskWeights } from './risk';
import { tierFor } from './colors';

export interface ScenarioInput {
  warming: number;       // °C of additional background warming (what-if, not a forecast)
  dNdvi: number;         // NDVI added by greening (0 – 0.25)
  coolShare: number;     // 0–1 share of the unit's surface treated with cool roofs / reflective pavement
  coolEffect: number;    // °C surface cooling achieved on treated surface (assumption)
}
export const NO_CHANGE: ScenarioInput = { warming: 0, dNdvi: 0, coolShare: 0, coolEffect: 2 };

export interface ScenarioResult {
  id: string;
  base: { lstDay: number; lstNight: number; ndvi: number; score: Omit<RiskScore, 'rank'> };
  next: { lstDay: number; lstNight: number; ndvi: number; score: Omit<RiskScore, 'rank'> };
  dLstDay: number; dIndex: number;
  parts: { warming: number; greening: number; coolSurfaces: number }; // °C contribution to ΔLST_day
}

export function runScenario(u: UnitFeature, b: Baseline, w: RiskWeights, s: ScenarioInput, reg: Regression | null): ScenarioResult | null {
  const p = u.properties;
  if (!p.lst || p.ndvi == null) return null;
  const beta = reg ? reg.slopePerNdvi : 0;
  const greening = beta * s.dNdvi;
  const cool = -s.coolShare * s.coolEffect;
  const dDay = s.warming + greening + cool;
  const lstDay = p.lst.day + dDay, lstNight = p.lst.night + s.warming, ndvi = Math.min(0.9, p.ndvi + s.dNdvi);
  const base = scoreUnit(u, b, w);
  const next = scoreUnit(u, b, w, { lstDay, lstNight, ndvi });
  return {
    id: p.id,
    base: { lstDay: p.lst.day, lstNight: p.lst.night, ndvi: p.ndvi, score: base },
    next: { lstDay, lstNight, ndvi, score: next },
    dLstDay: dDay, dIndex: next.index - base.index,
    parts: { warming: s.warming, greening, coolSurfaces: cool },
  };
}

export interface PortfolioResult {
  results: ScenarioResult[];
  popAffected: number;
  popWeightedDLst: number;
  tierCounts: { before: Record<string, number>; after: Record<string, number> };
  peopleSevere: { before: number; after: number };
  meanIndex: { before: number; after: number };
}

/** Apply a scenario to a set of units; everything else stays at today's values. */
export function runPortfolio(all: UnitFeature[], targetIds: Set<string>, b: Baseline, w: RiskWeights, s: ScenarioInput, reg: Regression | null): PortfolioResult {
  const results: ScenarioResult[] = [];
  const before: Record<string, number> = {}, after: Record<string, number> = {};
  let popAffected = 0, pw = 0, sevBefore = 0, sevAfter = 0, mb = 0, ma = 0, n = 0;
  for (const u of all) {
    const idn = u.properties.id;
    const treated = targetIds.has(idn);
    const r = runScenario(u, b, w, treated ? s : NO_CHANGE, reg);
    if (!r) continue;
    // Background warming applies everywhere, not only to treated units.
    const eff = treated ? r : runScenario(u, b, w, { ...NO_CHANGE, warming: s.warming }, reg)!;
    results.push(eff);
    const pop = u.properties.population ?? 0;
    before[r.base.score.tier.key] = (before[r.base.score.tier.key] || 0) + 1;
    after[eff.next.score.tier.key] = (after[eff.next.score.tier.key] || 0) + 1;
    if (treated) { popAffected += pop; pw += pop * eff.dLstDay; }
    if (['severe', 'extreme'].includes(r.base.score.tier.key)) sevBefore += pop;
    if (['severe', 'extreme'].includes(tierFor(eff.next.score.index).key)) sevAfter += pop;
    mb += r.base.score.index; ma += eff.next.score.index; n++;
  }
  return {
    results, popAffected, popWeightedDLst: popAffected ? pw / popAffected : 0,
    tierCounts: { before, after }, peopleSevere: { before: sevBefore, after: sevAfter },
    meanIndex: { before: n ? mb / n : 0, after: n ? ma / n : 0 },
  };
}
