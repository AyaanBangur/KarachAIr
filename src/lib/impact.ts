// Impact: who could benefit from volunteer work right now, and how much of that need the verified work has reached.
// Everything here is counted from the same data the missions use (population from WorldPop, need from live air, live heat
// and the satellite heat-risk ranking). These are REACH figures: how many residents live where help is needed. They are not
// a measured drop in pollution or temperature, and the app never claims that.
import type { UnitFeature } from './types';
import { HIGH_NEED, type UnitNeed } from './needs';

const pop = (u: UnitFeature | undefined) => u?.properties.population ?? 0;

export interface Reach {
  total: number;                 // residents modelled across all neighbourhoods
  highNeedUnits: number;         // neighbourhoods whose need is "High" or "Urgent" right now
  highNeedResidents: number;
  highNeedShare: number;         // 0..1
  hazardUnits: number;           // neighbourhoods with unsafe air or dangerous heat right now
  hazardResidents: number;
  hazardShare: number;
  top: { name: string; residents: number; priority: number }[]; // the three highest-need neighbourhoods
}

/** Residents living in the neighbourhoods that need help most right now. */
export function reachNow(units: UnitFeature[], needs: UnitNeed[]): Reach {
  const byId = new Map(units.map((u) => [u.properties.id, u]));
  const total = units.reduce((a, u) => a + pop(u), 0);
  const high = needs.filter((n) => n.priority >= HIGH_NEED), hazard = needs.filter((n) => n.badWeather);
  const sum = (xs: UnitNeed[]) => xs.reduce((a, n) => a + pop(byId.get(n.unitId)), 0);
  const highNeedResidents = sum(high), hazardResidents = sum(hazard);
  return {
    total, highNeedUnits: high.length, highNeedResidents, highNeedShare: total ? highNeedResidents / total : 0,
    hazardUnits: hazard.length, hazardResidents, hazardShare: total ? hazardResidents / total : 0,
    top: needs.slice(0, 3).map((n) => ({ name: n.short, residents: pop(byId.get(n.unitId)), priority: n.priority })),
  };
}

export interface Coverage {
  highNeed: number;              // neighbourhoods currently in high need
  covered: number;               // of those, how many have at least one verified mission
  neighbourhoodsReached: number; // all neighbourhoods with verified work
  residentsReached: number;      // residents living in the neighbourhoods with verified work
  residentsShare: number;        // of all modelled residents, 0..1
  uncovered: string[];           // high-need neighbourhoods with no verified work yet (names)
}

/** How much of the need the verified work has reached. `verifiedUnitIds` holds one id per verified mission. */
export function coverage(units: UnitFeature[], needs: UnitNeed[], verifiedUnitIds: (string | null)[]): Coverage {
  const reached = new Set(verifiedUnitIds.filter((x): x is string => !!x));
  const byId = new Map(units.map((u) => [u.properties.id, u]));
  const total = units.reduce((a, u) => a + pop(u), 0);
  const high = needs.filter((n) => n.priority >= HIGH_NEED);
  const residentsReached = [...reached].reduce((a, id) => a + pop(byId.get(id)), 0);
  return {
    highNeed: high.length, covered: high.filter((n) => reached.has(n.unitId)).length, neighbourhoodsReached: [...reached].filter((id) => byId.has(id)).length,
    residentsReached, residentsShare: total ? residentsReached / total : 0, uncovered: high.filter((n) => !reached.has(n.unitId)).map((n) => n.short),
  };
}
