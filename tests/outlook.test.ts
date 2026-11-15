import { describe, expect, it } from 'vitest';
import { featuresFrom, fitRidge, outlookFor, predict, type Hours, type OutlookModel } from '../src/lib/outlook';

const hours = (pm: number): Hours => ({ pm: Array(48).fill(pm), temp: Array(48).fill(28), hum: Array(48).fill(60), wind: Array(48).fill(12), pres: Array(48).fill(1010) });

describe('tomorrow outlook', () => {
  it('builds 9 inputs from 48 hours and refuses incomplete data', () => {
    expect(featuresFrom(hours(40))).toHaveLength(9);
    const bad = hours(40); bad.pm[3] = NaN; expect(featuresFrom(bad)).toBeNull();
    expect(featuresFrom({ ...hours(40), wind: [1, 2] })).toBeNull();
  });
  it('ridge recovers a simple relationship', () => {
    const X = Array.from({ length: 60 }, (_, i) => [i, (i * 7) % 11, 1 + (i % 3)]), y = X.map((r) => 3 * r[0] + 5);
    const m = fitRidge(X, y, 1e-6); const p = X.map((r) => m.intercept + r.reduce((s, v, j) => s + ((v - m.mean[j]) / m.std[j]) * m.coef[j], 0));
    p.forEach((v, i) => expect(Math.abs(v - y[i])).toBeLessThan(0.5));
  });
  it('with no learned change it equals "tomorrow equals today", and labels the level from the range', () => {
    const m: OutlookModel = { features: [], mean: Array(9).fill(0), std: Array(9).fill(1), coef: Array(9).fill(0), intercept: 0, lambda: 1, trainedOn: '', trainDays: 1, residualSd: 4 };
    expect(predict(m, featuresFrom(hours(50))!)).toBeCloseTo(50);
    expect(outlookFor(m, hours(80))!.level).toBe('likely-unsafe');
    expect(outlookFor(m, hours(10))!.level).toBe('likely-ok');
    expect(outlookFor(m, hours(35))!.level).toBe('borderline');
    expect(outlookFor(m, { ...hours(10), pm: [] })).toBeNull();
  });
});
