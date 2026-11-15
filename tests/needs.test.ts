import { describe, expect, it } from 'vitest';
import { HOURS_PER_TASK, fieldCountsFrom, generateTasks, priorityTasks, taskToMission, unitNeeds } from '../src/lib/needs';
import { fakeLive, scores, units } from './helpers';

const base = { units, scores, fieldCounts: new Map<string, number>() };

describe('missions are generated from data, never preset', () => {
  it('every neighbourhood gets at least one mission, and every mission is 2 hours', () => {
    const { air, weather } = fakeLive(); const tasks = generateTasks({ ...base, air, weather });
    expect(new Set(tasks.map((t) => t.unitId)).size).toBe(units.length);
    tasks.forEach((t) => { expect(t.hours).toBe(HOURS_PER_TASK); expect(t.need).toBeGreaterThanOrEqual(0); expect(t.need).toBeLessThanOrEqual(100); expect(t.reason.length).toBeGreaterThan(10); });
  });
  it('still works with no live data (falls back to the heat-risk ranking)', () => {
    const tasks = generateTasks({ ...base, air: null, weather: null }); expect(tasks.length).toBeGreaterThan(units.length - 1);
    const top = unitNeeds({ ...base, air: null, weather: null })[0]; expect(scores.get(top.unitId)!.rank).toBeLessThanOrEqual(5);
  });
  it('bad air in a place pushes it up the list and creates an air mission there', () => {
    const calm = fakeLive(); const target = units.find((u) => scores.get(u.properties.id)!.rank > 15)!.properties.id;
    const before = unitNeeds({ ...base, ...calm }).findIndex((n) => n.unitId === target);
    const smoky = fakeLive({ pm25: { [target]: 160 } }); const after = unitNeeds({ ...base, ...smoky }).findIndex((n) => n.unitId === target);
    expect(after).toBeLessThan(before);
    expect(generateTasks({ ...base, ...smoky }).some((t) => t.unitId === target && t.focus === 'air')).toBe(true);
    expect(unitNeeds({ ...base, ...smoky }).find((n) => n.unitId === target)!.badWeather).toBe(true);
  });
  it('dangerous heat in a place pushes it up the list and creates a heat mission', () => {
    const target = units.find((u) => scores.get(u.properties.id)!.rank > 15)!.properties.id;
    const hot = fakeLive({ feels: { [target]: 46 } }); const needs = unitNeeds({ ...base, ...hot });
    expect(needs.findIndex((n) => n.unitId === target)).toBeLessThan(6);
    expect(generateTasks({ ...base, ...hot }).some((t) => t.unitId === target && t.focus === 'heat')).toBe(true);
  });
  it('priority updates are one mission per place, neediest first', () => {
    const tasks = generateTasks({ ...base, ...fakeLive() }); const top = priorityTasks(tasks, 4);
    expect(new Set(top.map((t) => t.unitId)).size).toBe(4); expect(top[0].need).toBeGreaterThanOrEqual(top[3].need);
  });
  it('a place with plenty of field records is asked for fewer field-data missions', () => {
    const rich = new Map(units.map((u) => [u.properties.id, 10])); const tasks = generateTasks({ ...base, ...fakeLive(), fieldCounts: rich });
    expect(tasks.filter((t) => t.id.startsWith('field-')).length).toBe(0);
  });
  it('turns into a hub mission with an indoor / outdoor setting and a reason', () => {
    const m = taskToMission(generateTasks({ ...base, ...fakeLive() })[0]); expect(['indoor', 'outdoor']).toContain(m.where); expect(m.trigger.length).toBeGreaterThan(10); expect(m.hours).toBe(2);
  });
  it('counts field records the same way everywhere and ignores flagged ones', () => {
    const c = fieldCountsFrom([{ unitId: 'a', status: 'pending' }, { unitId: 'a', status: 'verified' }, { unitId: 'a', status: 'flagged' }, { unitId: null, status: 'pending' }]); expect(c.get('a')).toBe(2); expect(c.size).toBe(1);
  });
});
