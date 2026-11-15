import { describe, expect, it } from 'vitest';
import { unitNeeds } from '../src/lib/needs';
import { coverage, reachNow } from '../src/lib/impact';
import { fakeLive, scores, units } from './helpers';

const base = { units, scores, fieldCounts: new Map<string, number>() };
const total = units.reduce((a, u) => a + (u.properties.population ?? 0), 0);

describe('impact: who could benefit and how much has been reached', () => {
  it('counts residents in the high-need neighbourhoods, never more than the city total', () => {
    const needs = unitNeeds({ ...base, ...fakeLive() }), r = reachNow(units, needs);
    expect(r.total).toBe(total);
    expect(r.highNeedResidents).toBeLessThanOrEqual(r.total);
    expect(r.highNeedShare).toBeGreaterThanOrEqual(0); expect(r.highNeedShare).toBeLessThanOrEqual(1);
    expect(r.top).toHaveLength(3);
    expect(r.top[0].priority).toBeGreaterThanOrEqual(r.top[2].priority);
  });
  it('dangerous air in a place adds its residents to the hazard count', () => {
    const calm = reachNow(units, unitNeeds({ ...base, ...fakeLive() }));
    const target = units.find((u) => (u.properties.population ?? 0) > 0)!;
    const smoky = reachNow(units, unitNeeds({ ...base, ...fakeLive({ pm25: { [target.properties.id]: 150 } }) }));
    expect(smoky.hazardUnits).toBe(calm.hazardUnits + 1);
    expect(smoky.hazardResidents).toBeGreaterThanOrEqual(calm.hazardResidents + (target.properties.population ?? 0));
  });
  it('coverage counts only neighbourhoods with verified work, and lists the high-need ones still missing', () => {
    const needs = unitNeeds({ ...base, ...fakeLive({ pm25: Object.fromEntries(units.slice(0, 6).map((u) => [u.properties.id, 120])) }) });
    const none = coverage(units, needs, []);
    expect(none.covered).toBe(0); expect(none.residentsReached).toBe(0); expect(none.uncovered.length).toBe(none.highNeed);
    const top = needs[0].unitId, one = coverage(units, needs, [top, top, null]);
    expect(one.covered).toBe(1); expect(one.neighbourhoodsReached).toBe(1);
    expect(one.residentsReached).toBe(units.find((u) => u.properties.id === top)!.properties.population ?? 0);
    expect(one.uncovered.length).toBe(none.highNeed - 1);
  });
  it('ignores unknown neighbourhood ids', () => {
    const needs = unitNeeds({ ...base, ...fakeLive() });
    expect(coverage(units, needs, ['not-a-place']).neighbourhoodsReached).toBe(0);
  });
});
