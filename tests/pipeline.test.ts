import { describe, expect, it } from 'vitest';
import { generateTasks, priorityTasks, taskToMission, unitNeeds } from '../src/lib/needs';
import { coverage, reachNow } from '../src/lib/impact';
import { missionLocked, gateFor } from '../src/lib/service';
import { fakeLive, scores, units } from './helpers';

// The whole impact pathway in one test: data -> need -> mission -> safety -> verified work -> coverage and reach.
describe('end to end: how the data turns into community impact', () => {
  const smoky = Object.fromEntries(units.slice(0, 5).map((u) => [u.properties.id, 130]));
  const input = { units, scores, fieldCounts: new Map<string, number>(), ...fakeLive({ pm25: smoky }) };

  it('data says where help is needed, and every offered mission carries its reason', () => {
    const needs = unitNeeds(input), tasks = generateTasks(input);
    expect(needs[0].priority).toBeGreaterThanOrEqual(needs[needs.length - 1].priority);
    const top = priorityTasks(tasks, 4);
    expect(top.length).toBeGreaterThan(0);
    top.forEach((t) => { expect(taskToMission(t).trigger.length).toBeGreaterThan(10); expect(taskToMission(t).hours).toBe(2); });
  });
  it('outdoor missions lock in hazardous air, indoor ones stay open', () => {
    const tasks = generateTasks(input).filter((t) => t.unitId === units[0].properties.id);
    const hazardous = gateFor({ pm25: 400, pm10: 500, no2: 20, aqi: 450, time: '' }, false, 'x');
    expect(tasks.filter((t) => !t.indoor).every((t) => missionLocked(taskToMission(t), hazardous))).toBe(true);
    expect(tasks.filter((t) => t.indoor).every((t) => !missionLocked(taskToMission(t), hazardous))).toBe(true);
  });
  it('verified work raises coverage and reach, and the uncovered list shrinks', () => {
    const needs = unitNeeds(input), reach = reachNow(units, needs);
    const before = coverage(units, needs, []), after = coverage(units, needs, [needs[0].unitId]);
    expect(reach.highNeedUnits).toBeGreaterThan(0);
    expect(after.covered).toBe(before.covered + 1);
    expect(after.residentsReached).toBeGreaterThan(before.residentsReached);
    expect(after.uncovered.length).toBe(before.uncovered.length - 1);
  });
});
