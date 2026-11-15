// Tomorrow's air outlook: a small ridge-regression model we train ourselves on a year of Karachi air and weather data
// (see scripts/outlook.ts and docs/OUTLOOK.md for how it was trained and how well it works on days it never saw).
// Input: the last 48 hours of PM2.5 and weather at the city centre. Output: expected average PM2.5 for the next 24 hours.
// It informs the volunteer's planning ("is tomorrow likely to be unsafe outdoors?"); today's safety lock still uses live readings.

export interface Hours { pm: number[]; temp: number[]; hum: number[]; wind: number[]; pres: number[] } // 48 hourly values each, oldest first
export const FEATURES = ['PM2.5 24h mean', 'PM2.5 24h max', 'PM2.5 last 6h', 'PM2.5 previous day mean', 'Wind speed', 'Temperature', 'Humidity', 'Pressure', 'Pressure change'] as const;
export const UNSAFE_PM25 = 35; // µg/m³, the same line the app uses to call air unsafe for outdoor missions

export interface OutlookModel {
  features: string[]; mean: number[]; std: number[]; coef: number[]; intercept: number; lambda: number;
  trainedOn: string; trainDays: number; residualSd: number;
}

const avg = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
/** Turn 48 hours of readings into the model's inputs, or null when any series is incomplete. */
export function featuresFrom(h: Hours): number[] | null {
  for (const k of ['pm', 'temp', 'hum', 'wind', 'pres'] as const) if (h[k].length !== 48 || h[k].some((v) => !Number.isFinite(v))) return null;
  const pm = h.pm.slice(24), prev = h.pm.slice(0, 24);
  return [avg(pm), Math.max(...pm), avg(pm.slice(18)), avg(prev), avg(h.wind.slice(24)), avg(h.temp.slice(24)), avg(h.hum.slice(24)), avg(h.pres.slice(24)), avg(h.pres.slice(24)) - avg(h.pres.slice(0, 24))];
}

/** Solve A x = b by Gaussian elimination (A is small and positive definite here). */
function solve(A: number[][], b: number[]): number[] {
  const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r++) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) { let s = M[i][n]; for (let k = i + 1; k < n; k++) s -= M[i][k] * x[k]; x[i] = s / M[i][i]; }
  return x;
}

/** Ridge regression on standardised inputs (the intercept is not penalised). */
export function fitRidge(X: number[][], y: number[], lambda: number): Pick<OutlookModel, 'mean' | 'std' | 'coef' | 'intercept' | 'lambda'> {
  const n = X.length, d = X[0].length;
  const mean = Array.from({ length: d }, (_, j) => avg(X.map((r) => r[j])));
  const std = Array.from({ length: d }, (_, j) => Math.sqrt(avg(X.map((r) => (r[j] - mean[j]) ** 2))) || 1);
  const Z = X.map((r) => r.map((v, j) => (v - mean[j]) / std[j])), ym = avg(y);
  const A = Array.from({ length: d }, (_, i) => Array.from({ length: d }, (_, j) => Z.reduce((s, r) => s + r[i] * r[j], 0) + (i === j ? lambda * n : 0)));
  const b = Array.from({ length: d }, (_, i) => Z.reduce((s, r, k) => s + r[i] * (y[k] - ym), 0));
  return { mean, std, coef: solve(A, b), intercept: ym, lambda };
}

/** The model predicts the CHANGE from today's 24h mean (so it starts from "tomorrow equals today" and only moves when the data say so). */
export const predict = (m: Pick<OutlookModel, 'mean' | 'std' | 'coef' | 'intercept'>, x: number[]) => Math.max(0, x[0] + m.intercept + x.reduce((s, v, j) => s + ((v - m.mean[j]) / m.std[j]) * m.coef[j], 0));

export type Outlook = { expected: number; low: number; high: number; level: 'likely-unsafe' | 'borderline' | 'likely-ok' };
/** Expected PM2.5 for the next 24 hours with a plain range (about 80% of unseen days fall inside it). */
export function outlookFor(m: OutlookModel, h: Hours): Outlook | null {
  const x = featuresFrom(h); if (!x) return null;
  const expected = predict(m, x), w = 1.28 * m.residualSd;
  const low = Math.max(0, expected - w), high = expected + w;
  return { expected, low, high, level: low >= UNSAFE_PM25 ? 'likely-unsafe' : high < UNSAFE_PM25 ? 'likely-ok' : 'borderline' };
}
