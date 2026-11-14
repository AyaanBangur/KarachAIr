import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { ClimateFile, Facility, MetaFile, Rasters, TerraData, UnitCollection } from './types';
import { computeBaseline, DEFAULT_WEIGHTS, scoreAll, type Baseline, type RiskScore, type RiskWeights } from './risk';

const base = import.meta.env.BASE_URL;
async function getJson<T>(file: string): Promise<T> {
  const res = await fetch(`${base}data/${file}`);
  if (!res.ok) throw new Error(`Could not load ${file} (HTTP ${res.status}). Run "npm run data" to generate the datasets.`);
  return res.json() as Promise<T>;
}

export async function loadTerraData(): Promise<TerraData> {
  const [collection, rasters, facilities, climate, meta] = await Promise.all([
    getJson<UnitCollection>('units.geojson'),
    getJson<Rasters>('rasters.json'),
    getJson<Facility[]>('facilities.json'),
    getJson<ClimateFile | null>('climate.json'),
    getJson<MetaFile>('meta.json'),
  ]);
  return { units: collection.features, collection, rasters, facilities, climate, meta };
}

interface Ctx {
  data: TerraData;
  baseline: Baseline;
  weights: RiskWeights;
  setWeights: (w: RiskWeights) => void;
  scores: Map<string, RiskScore>;
  medians: { lstDay: number; lstNight: number; ndvi: number; density: number; health: number };
}
const DataCtx = createContext<Ctx | null>(null);

export function useTerra(): Ctx {
  const c = useContext(DataCtx);
  if (!c) throw new Error('useTerra must be used inside <DataProvider>');
  return c;
}

const med = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN; };

export function DataProvider({ children, fallback, onError }: { children: ReactNode; fallback: ReactNode; onError: (e: Error) => ReactNode }) {
  const [data, setData] = useState<TerraData | null>(null);
  const [err, setErr] = useState<Error | null>(null);
  const [weights, setWeights] = useState<RiskWeights>(DEFAULT_WEIGHTS);

  useEffect(() => { loadTerraData().then(setData).catch((e: Error) => setErr(e)); }, []);

  const value = useMemo<Ctx | null>(() => {
    if (!data) return null;
    const baseline = computeBaseline(data.units);
    const P = data.units.map((u) => u.properties);
    const num = (f: (p: (typeof P)[number]) => number | null | undefined) => P.map(f).filter((v): v is number => v != null);
    return {
      data, baseline, weights, setWeights,
      scores: scoreAll(data.units, baseline, weights),
      medians: {
        lstDay: med(num((p) => p.lst?.day)), lstNight: med(num((p) => p.lst?.night)), ndvi: med(num((p) => p.ndvi)),
        density: med(num((p) => p.popDensity)), health: med(num((p) => p.infra?.healthPer100k)),
      },
    };
  }, [data, weights]);

  if (err) return <>{onError(err)}</>;
  if (!value) return <>{fallback}</>;
  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>;
}
