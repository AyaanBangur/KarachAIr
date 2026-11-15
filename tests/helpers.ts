import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { UnitFeature, MetaFile, ClimateFile } from '../src/lib/types';
import { computeBaseline, DEFAULT_WEIGHTS, scoreAll } from '../src/lib/risk';
import type { LiveAir, LiveWeather } from '../src/lib/hooks';

const read = (f: string) => JSON.parse(readFileSync(join(__dirname, '..', 'public', 'data', f), 'utf8'));
export const units: UnitFeature[] = read('units.geojson').features;
export const meta: MetaFile = read('meta.json');
export const climate: ClimateFile = read('climate.json');
export const baseline = computeBaseline(units);
export const scores = scoreAll(units, baseline, DEFAULT_WEIGHTS);

/** Pretend live feeds: every unit gets the same calm reading unless overridden. */
export function fakeLive(over: { pm25?: Record<string, number>; feels?: Record<string, number> } = {}): { air: LiveAir; weather: LiveWeather } {
  const air: LiveAir = { fetchedAt: 0, byUnit: {} }, weather: LiveWeather = { fetchedAt: 0, byUnit: {} };
  for (const u of units) {
    const id = u.properties.id;
    air.byUnit[id] = { pm25: over.pm25?.[id] ?? 15, pm10: 40, no2: 20, aqi: 50, time: '2026-11-15T14:00' };
    weather.byUnit[id] = { current: { temp: 30, feels: over.feels?.[id] ?? 31, humidity: 40, wind: 10, time: '' }, daily: [{ date: '2026-11-15', tmax: 34, feelsMax: 36 }] };
  }
  return { air, weather };
}
