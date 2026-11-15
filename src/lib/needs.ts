// Volunteer tasks are NOT preset. They are generated from the same data the report uses: each neighbourhood's heat
// risk, live air quality (PM2.5, with a source guess), live weather (feels-like temperature), green space and how many
// field logs it already has. The places with the worst conditions and the greatest need get the highest priority, and
// those are what volunteers hear about first.
import type { UnitFeature } from './types';
import type { RiskScore } from './risk';
import type { LiveAir, LiveWeather } from './hooks';
import type { Task } from './guide';
import type { Mission } from './service';
import { classifyCause } from './air';

export const HOURS_PER_TASK = 2;
export const HIGH_NEED = 55;
const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

export interface NeedInput { units: UnitFeature[]; scores: Map<string, RiskScore>; air: LiveAir | null; weather: LiveWeather | null; fieldCounts: Map<string, number> }
export interface UnitNeed { unitId: string; name: string; short: string; priority: number; badWeather: boolean; drivers: string[] }

/** How much help each neighbourhood needs right now (0–100), and why. */
export function unitNeeds(i: NeedInput): UnitNeed[] {
  const out: UnitNeed[] = [];
  for (const u of i.units) {
    const p = u.properties, s = i.scores.get(p.id); if (!s) continue;
    const pm = i.air?.byUnit[p.id]?.pm25 ?? null, w = i.weather?.byUnit[p.id] ?? null, feels = w?.current.feels ?? null, tmax = w?.daily[0]?.tmax ?? null;
    const parts: [number, number][] = [[s.index, 0.4], [s.parts.greenDeficit * 100, 0.15]];
    if (pm != null) parts.push([clamp((pm / 120) * 100), 0.25]);
    if (feels != null) parts.push([clamp(((feels - 30) / 16) * 100), 0.2]);
    const wsum = parts.reduce((a, [, k]) => a + k, 0);
    const priority = Math.round(parts.reduce((a, [v, k]) => a + v * k, 0) / wsum);
    const drivers = [`Heat risk #${s.rank} of ${i.units.length} (index ${Math.round(s.index)})`];
    if (pm != null) drivers.push(`PM2.5 ${pm.toFixed(0)} µg/m³ (live)`);
    if (feels != null) drivers.push(`feels like ${feels.toFixed(0)}°C (live)`);
    const g = p.infra?.greenM2PerPerson; if (g != null) drivers.push(`${g.toFixed(1)} m² green space per person`);
    out.push({ unitId: p.id, name: p.name, short: p.short, priority, badWeather: (pm != null && pm > 35) || (feels != null && feels >= 41) || (tmax != null && tmax >= 42), drivers });
  }
  return out.sort((a, b) => b.priority - a.priority);
}

/** Generate the tasks for every neighbourhood from the data. Highest need first. */
export function generateTasks(i: NeedInput): Task[] {
  const needs = unitNeeds(i), byId = new Map(i.units.map((u) => [u.properties.id, u]));
  const tasks: Task[] = [];
  for (const n of needs) {
    const u = byId.get(n.unitId)!, p = u.properties, s = i.scores.get(n.unitId)!;
    const r = i.air?.byUnit[n.unitId] ?? null, w = i.weather?.byUnit[n.unitId] ?? null;
    const [lon, lat] = p.centroid, reason = n.drivers.join(' · ');
    const push = (key: string, type: number, title: string, indoor: boolean, focus: 'air' | 'heat', bonus: number) =>
      tasks.push({ id: `${key}-${n.unitId}`, type, title, area: p.short, lat, lon, indoor, hours: HOURS_PER_TASK, unitId: n.unitId, focus, reason, need: clamp(n.priority + bonus) });

    if (r && r.pm25 > 35) {
      const cause = classifyCause({ pm25: r.pm25, pm10: r.pm10, no2: r.no2, windKmh: w?.current.wind ?? null, hour: parseInt(r.time?.slice(11, 13) ?? '12', 10) }).id;
      if (cause === 'traffic') push('idle', 2, `No-idling shift at a school gate in ${p.short}`, false, 'air', 8);
      else if (cause === 'burning') push('burn', 1, `Waste-burning watch walk in ${p.short}`, false, 'air', 8);
      else if (cause === 'dust') push('dust', 3, `Plant dust-barrier saplings in ${p.short}`, false, 'air', 8);
      push('mask', 4, `Prepare mask and air-alert cards for ${p.short}`, true, 'air', 4);
    }
    const hot = ['severe', 'extreme'].includes(s.tier.key) || (w?.current.feels ?? 0) >= 38;
    if (hot) {
      push('shade', 3, `Cooling-point and shade survey in ${p.short}`, false, 'heat', 6);
      push('hydr', 4, `Heat-safety and hydration cards for ${p.short}`, true, 'heat', 2);
    }
    if (s.parts.greenDeficit > 0.6) push('tree', 3, `Plant native shade trees in ${p.short}`, false, 'heat', 3);
    if ((i.fieldCounts.get(n.unitId) ?? 0) < 3 && s.index >= 40) {
      push('field', 5, `Log field temperature and shade readings in ${p.short}`, false, 'heat', 0);
      push('check', 5, `Compare field readings with satellite data for ${p.short}`, true, 'heat', -4);
    }
    if (!tasks.some((t) => t.unitId === n.unitId)) push('watch', 5, `Log local air and heat events in ${p.short}`, true, 'air', -10);
  }
  return tasks.sort((a, b) => b.need - a.need);
}

const DESC: Record<string, string> = {
  idle: 'Adult-supervised: politely ask waiting drivers to switch engines off at pick-up and drop-off, and count how many do.',
  burn: 'Adult-supervised: walk a set route, photograph and geotag any waste burning, and pass it to your organization.',
  dust: 'Adult-supervised: plant hardy native saplings along a dusty road or boundary wall, with a geotagged log.',
  mask: 'Assemble mask packets and bilingual health cards to hand out when the air is poor.',
  shade: 'Adult-supervised: walk a set route and record shade, trees and water points so cooling can go where it is needed.',
  hydr: 'Prepare heat-safety and hydration cards for outdoor workers and neighbours.',
  tree: 'Adult-supervised: plant native shade trees where green space is thinnest.',
  field: 'Adult-supervised: record air temperature and shade at set spots, so the satellite data can be checked on the ground.',
  check: 'Chart your organization’s field logs against the satellite surface temperature for this neighbourhood.',
  watch: 'Keep a simple log of pollution and heat events that analysts can use.',
};
export const needLabel = (n: number) => (n >= 70 ? 'Urgent need' : n >= HIGH_NEED ? 'High need' : 'Standing need');

export function taskToMission(t: Task): Mission {
  const key = t.id.split('-')[0];
  return { id: t.id, tier: '2', tierLabel: needLabel(t.need), hours: t.hours, min: t.hours, max: t.hours, where: t.indoor ? 'indoor' : 'outdoor', focus: t.focus, title: t.title, desc: DESC[key] ?? '', trigger: t.reason };
}

/** The most important update per neighbourhood, for the places that need help most. */
export function priorityTasks(tasks: Task[], limit = 4): Task[] {
  const seen = new Set<string>(), out: Task[] = [];
  for (const t of tasks) { if (seen.has(t.unitId)) continue; seen.add(t.unitId); out.push(t); if (out.length >= limit) break; }
  return out;
}
