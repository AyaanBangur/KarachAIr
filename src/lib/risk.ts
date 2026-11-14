// TerraWatch Heat Risk Index (HRI) — a transparent, explainable composite.
// It follows the standard disaster-risk framing (IPCC AR5/AR6): RISK = HAZARD + EXPOSURE + VULNERABILITY.
// This is an analytical index built from measured indicators, NOT a trained machine-learning model.
//
//   Hazard         how hot the surface gets        afternoon LST (and night-time LST, which blocks overnight recovery)
//   Exposure       how many people are there       population density (log-scaled)
//   Vulnerability  how little buffering they have  vegetation deficit (NDVI) and health-facility access gap
//
// Every component is min–max scaled across Karachi's 24 units (0 = best unit, 100 = worst unit), so the index
// is RELATIVE: it ranks places against each other. It is not an absolute "danger" scale.
import type { UnitFeature } from './types';
import { tierFor, type Tier } from './colors';
import { clamp } from './format';

export interface RiskWeights {
  hazard: number; exposure: number; vulnerability: number;  // top-level weights (normalised to sum 1)
  night: number;  // share of hazard taken from night-time LST (0..1)
  green: number;  // share of vulnerability taken from vegetation deficit (0..1); remainder = health-access gap
}
export const DEFAULT_WEIGHTS: RiskWeights = { hazard: 0.4, exposure: 0.3, vulnerability: 0.3, night: 0.35, green: 0.65 };

export type Range = [number, number];
export interface Baseline { lstDay: Range; lstNight: Range; logDensity: Range; ndvi: Range; logHealth: Range }

export interface RiskScore {
  id: string;
  hazard: number; exposure: number; vulnerability: number; // 0–100 each
  index: number;                                            // 0–100 (can exceed 100 only in what-if scenarios)
  tier: Tier; rank: number; partial: boolean;
  parts: { lstDay: number; lstNight: number; density: number; greenDeficit: number; healthGap: number }; // normalised 0–1
}

const rng = (xs: number[]): Range => [Math.min(...xs), Math.max(...xs)];
const norm = (v: number, [lo, hi]: Range) => (hi === lo ? 0 : Math.max(0, (v - lo) / (hi - lo)));

/** Scaling ranges are fixed from today's observations, so what-if scenarios are measured on the same ruler. */
export function computeBaseline(units: UnitFeature[]): Baseline {
  const P = units.map((u) => u.properties);
  const pick = (f: (p: (typeof P)[number]) => number | null | undefined) => P.map(f).filter((v): v is number => v != null && Number.isFinite(v));
  return {
    // Units with thin satellite coverage (e.g. Manora, mostly water) are excluded from the scaling range so they cannot distort it.
    lstDay: rng(pick((p) => (p.lst && p.lst.coverage >= 0.7 ? p.lst.day : null))),
    lstNight: rng(pick((p) => (p.lst && p.lst.coverage >= 0.7 ? p.lst.night : null))),
    logDensity: rng(pick((p) => (p.popDensity ? Math.log10(p.popDensity) : null))),
    ndvi: rng(pick((p) => p.ndvi)),
    logHealth: rng(pick((p) => (p.infra?.healthPer100k != null ? Math.log1p(p.infra.healthPer100k) : null))),
  };
}

export interface Overrides { lstDay?: number; lstNight?: number; ndvi?: number }

export function scoreUnit(u: UnitFeature, b: Baseline, w: RiskWeights, o: Overrides = {}): Omit<RiskScore, 'rank'> {
  const p = u.properties;
  const day = o.lstDay ?? p.lst?.day, night = o.lstNight ?? p.lst?.night, ndvi = o.ndvi ?? p.ndvi;
  const dens = p.popDensity ? Math.log10(p.popDensity) : null;
  const health = p.infra?.healthPer100k != null ? Math.log1p(p.infra.healthPer100k) : null;
  const partial = [day, night, dens, ndvi, health].some((v) => v == null);

  const nDay = day != null ? norm(day, b.lstDay) : 0, nNight = night != null ? norm(night, b.lstNight) : nDay;
  const nDens = dens != null ? norm(dens, b.logDensity) : 0;
  const greenDef = ndvi != null ? 1 - clamp(norm(ndvi, b.ndvi), 0, 1) : 0.5;
  const healthGap = health != null ? 1 - clamp(norm(health, b.logHealth), 0, 1) : 0.5;

  const hazard = 100 * ((1 - w.night) * nDay + w.night * nNight);
  const exposure = 100 * nDens;
  const vulnerability = 100 * (w.green * greenDef + (1 - w.green) * healthGap);
  const sum = w.hazard + w.exposure + w.vulnerability || 1;
  const index = (w.hazard * hazard + w.exposure * exposure + w.vulnerability * vulnerability) / sum;
  return { id: p.id, hazard, exposure, vulnerability, index, tier: tierFor(index), partial, parts: { lstDay: nDay, lstNight: nNight, density: nDens, greenDeficit: greenDef, healthGap } };
}

export function scoreAll(units: UnitFeature[], b: Baseline, w: RiskWeights): Map<string, RiskScore> {
  const raw = units.map((u) => scoreUnit(u, b, w));
  const order = [...raw].sort((a, c) => c.index - a.index);
  const out = new Map<string, RiskScore>();
  for (const r of raw) out.set(r.id, { ...r, rank: order.findIndex((x) => x.id === r.id) + 1 });
  return out;
}

/** Which of the three pillars contributes most to a unit's index (after weighting). */
export function dominantDriver(s: Pick<RiskScore, 'hazard' | 'exposure' | 'vulnerability'>, w: RiskWeights): 'hazard' | 'exposure' | 'vulnerability' {
  const c = { hazard: s.hazard * w.hazard, exposure: s.exposure * w.exposure, vulnerability: s.vulnerability * w.vulnerability };
  return (Object.entries(c).sort((a, b) => b[1] - a[1])[0][0]) as 'hazard' | 'exposure' | 'vulnerability';
}

/** How trustworthy a unit's satellite statistics are, from pixel count and observation coverage. */
export interface Confidence { level: 'high' | 'medium' | 'low'; reason: string }
export function confidenceFor(u: UnitFeature): Confidence {
  const l = u.properties.lst;
  if (!l) return { level: 'low', reason: 'No satellite statistics available for this unit.' };
  if (l.coverage >= 0.9 && l.nPixels >= 12 && l.meanComposites >= 20) return { level: 'high', reason: `${l.nPixels} satellite pixels, ${Math.round(l.coverage * 100)}% of area observed, ~${Math.round(l.meanComposites)} clear composites per pixel.` };
  if (l.coverage >= 0.7 && l.nPixels >= 5) return { level: 'medium', reason: `${l.nPixels} satellite pixels and ${Math.round(l.coverage * 100)}% area coverage — a small footprint for 1 km imagery, so edge pixels add noise.` };
  return { level: 'low', reason: `Only ${l.nPixels} satellite pixels / ${Math.round(l.coverage * 100)}% coverage — treat the numbers as indicative.` };
}
