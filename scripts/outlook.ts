// Trains and tests the "tomorrow's air outlook" model on a year of real Karachi data and writes docs/OUTLOOK.md and public/data/outlook-model.json.
// Data: Open-Meteo air quality (CAMS) and Open-Meteo historical weather (ERA5) at the city centre, hourly. Run: `npm run outlook` (needs internet).
// Days are split IN ORDER (first 60% train, next 20% validation, last 20% test), because a forecast must never see the future.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { UNSAFE_PM25, FEATURES, featuresFrom, fitRidge, predict, type Hours, type OutlookModel } from '../src/lib/outlook';

const LAT = 24.86, LON = 67.01;
const end = new Date(Date.now() - 8 * 864e5), start = new Date(end.getTime() - 400 * 864e5);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const get = async (url: string) => { const r = await fetch(url); if (!r.ok) throw new Error(url + ' ' + r.status); return r.json(); };
const [aq, wx] = await Promise.all([
  get(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${LAT}&longitude=${LON}&hourly=pm2_5&start_date=${iso(start)}&end_date=${iso(end)}&timezone=Asia%2FKarachi`),
  get(`https://archive-api.open-meteo.com/v1/archive?latitude=${LAT}&longitude=${LON}&hourly=temperature_2m,relative_humidity_2m,wind_speed_10m,surface_pressure&start_date=${iso(start)}&end_date=${iso(end)}&timezone=Asia%2FKarachi`),
]);
const byTime = new Map<string, Hours extends infer H ? { pm: number; temp: number; hum: number; wind: number; pres: number } : never>();
aq.hourly.time.forEach((t: string, i: number) => byTime.set(t, { pm: aq.hourly.pm2_5[i], temp: wx.hourly.temperature_2m[i], hum: wx.hourly.relative_humidity_2m[i], wind: wx.hourly.wind_speed_10m[i], pres: wx.hourly.surface_pressure[i] }));
const times: string[] = aq.hourly.time;

// one sample per day: features from the 48 hours ending at 23:00, target = mean PM2.5 of the next 24 hours
const days = [...new Set(times.map((t) => t.slice(0, 10)))];
const rows: { day: string; x: number[]; y: number; today: number }[] = [];
for (let k = 1; k < days.length - 1; k++) {
  const hrs = (d: string) => Array.from({ length: 24 }, (_, h) => byTime.get(`${d}T${String(h).padStart(2, '0')}:00`));
  const w = [...hrs(days[k - 1]), ...hrs(days[k])], nxt = hrs(days[k + 1]);
  if (w.some((v) => !v) || nxt.some((v) => !v)) continue;
  const f = (key: 'pm' | 'temp' | 'hum' | 'wind' | 'pres') => w.map((v) => v![key] as number);
  const x = featuresFrom({ pm: f('pm'), temp: f('temp'), hum: f('hum'), wind: f('wind'), pres: f('pres') });
  if (!x) continue;
  rows.push({ day: days[k], x, y: nxt.reduce((s, v) => s + v!.pm, 0) / 24, today: x[0] });
}
const nTr = Math.floor(rows.length * 0.6), nVa = Math.floor(rows.length * 0.2);
const tr = rows.slice(0, nTr), va = rows.slice(nTr, nTr + nVa), te = rows.slice(nTr + nVa);
const mae = (p: number[], rs: typeof rows) => p.reduce((s, v, i) => s + Math.abs(v - rs[i].y), 0) / rs.length;
const acc = (p: number[], rs: typeof rows) => p.filter((v, i) => (v >= UNSAFE_PM25) === (rs[i].y >= UNSAFE_PM25)).length / rs.length;
const trMean = tr.reduce((s, r) => s + r.y, 0) / tr.length;
const sdOf = (a: number[]) => { const m = a.reduce((s, v) => s + v, 0) / a.length; return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length); };

// choose the ridge strength on validation only
let best = { lambda: 0.1, e: Infinity };
for (const lambda of [0.01, 0.1, 0.3, 1, 3, 10, 30, 100]) { const m = fitRidge(tr.map((r) => r.x), tr.map((r) => r.y - r.today), lambda); const e = mae(va.map((r) => predict(m, r.x)), va); if (e < best.e) best = { lambda, e }; }
// final model: train + validation, test untouched
const fit = [...tr, ...va], m = fitRidge(fit.map((r) => r.x), fit.map((r) => r.y - r.today), best.lambda);
const resid = fit.map((r) => r.y - predict(m, r.x));
const model: OutlookModel = { features: [...FEATURES], ...m, trainedOn: `${fit[0].day} to ${fit[fit.length - 1].day}`, trainDays: fit.length, residualSd: sdOf(resid) };

const pModel = te.map((r) => predict(model, r.x)), pPersist = te.map((r) => r.today), pMean = te.map(() => trMean);
// does the 80% range actually hold on unseen days?
const w80 = 1.28 * model.residualSd, inside = te.filter((r, i) => Math.abs(r.y - pModel[i]) <= w80).length / te.length;
const unsafeShare = te.filter((r) => r.y >= UNSAFE_PM25).length / te.length;
// rough significance: paired bootstrap of the MAE gap versus persistence
let wins = 0; const B = 2000; let seed = 7; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
for (let b = 0; b < B; b++) { let d = 0; for (let k = 0; k < te.length; k++) { const i = Math.floor(rnd() * te.length); d += Math.abs(pPersist[i] - te[i].y) - Math.abs(pModel[i] - te[i].y); } if (d > 0) wins++; }
const f1 = (p: number[]) => { let tp = 0, fp = 0, fn = 0; p.forEach((v, i) => { const a = te[i].y >= UNSAFE_PM25, q = v >= UNSAFE_PM25; if (a && q) tp++; else if (!a && q) fp++; else if (a && !q) fn++; }); return tp ? (2 * tp) / (2 * tp + fp + fn) : 0; };
const pct = (v: number) => (v * 100).toFixed(0) + '%', n1 = (v: number) => v.toFixed(1);

const md = `# Tomorrow's air outlook: how well does it work?

*Generated by \`npm run outlook\` on ${iso(new Date())}. Real hourly data for the city centre of Karachi: PM2.5 from Open-Meteo air quality (CAMS model) and weather from Open-Meteo historical weather (ERA5). ${rows.length} usable days, ${rows[0].day} to ${rows[rows.length - 1].day}.*

**Question.** Given the last 48 hours of PM2.5 and weather, can we predict the average PM2.5 of the next 24 hours well enough to warn volunteers that tomorrow may be unsafe outdoors (PM2.5 of ${UNSAFE_PM25} µg/m³ or more)?

**Model.** Ridge regression (our own implementation, \`src/lib/outlook.ts\`) on ${FEATURES.length} inputs: ${FEATURES.join(', ')}. Not pretrained.

**Split (in time order, so the model never sees the future).** ${tr.length} days train, ${va.length} validation (used only to choose the ridge strength, ${best.lambda}), ${te.length} test (the newest days, untouched until the end). The deployed model is then refit on train + validation.

## Result on the ${te.length} unseen test days

| Method | Average error (µg/m³) | Right about "unsafe or not" | F1 for catching unsafe days |
|---|---|---|---|
| Always predict the training average (baseline 1) | ${n1(mae(pMean, te))} | ${pct(acc(pMean, te))} | ${pct(f1(pMean))} |
| "Tomorrow equals today" (baseline 2, persistence) | ${n1(mae(pPersist, te))} | ${pct(acc(pPersist, te))} | ${pct(f1(pPersist))} |
| **Our trained model** | **${n1(mae(pModel, te))}** | **${pct(acc(pModel, te))}** | **${pct(f1(pModel))}** |

- In a bootstrap over the test days, the model had the smaller error than persistence in ${pct(wins / B)} of resamples (a rough check, not a formal test; ${te.length} days is a small test set).
- The ±range shown in the app (about 80% of days) held on ${pct(inside)} of unseen days.
- ${pct(unsafeShare)} of the test days were actually unsafe, so a model that always says "unsafe" would score ${pct(unsafeShare)}.

## Honest limits
- One location (the city centre) and one air-quality model (about 11 km). It is **not** a street-level or school-level forecast.
- The test days are one stretch of the year (the newest ${te.length}), so we do not know how it does in other seasons.
- PM2.5 here is itself a model output, so we are predicting a model with a model. Real monitors in Karachi are few.
- The outlook only helps volunteers plan. **Today's safety lock always uses the live reading**, never this forecast.
- If the model does not beat "tomorrow equals today" on the numbers above, the table says so; we report what we measured.
`;
writeFileSync(join(process.cwd(), 'docs', 'OUTLOOK.md'), md);
writeFileSync(join(process.cwd(), 'public', 'data', 'outlook-model.json'), JSON.stringify(model));
console.log(`days=${rows.length} train=${tr.length} val=${va.length} test=${te.length} lambda=${best.lambda}`);
console.log(`MAE mean=${n1(mae(pMean, te))} persist=${n1(mae(pPersist, te))} model=${n1(mae(pModel, te))} | acc mean=${pct(acc(pMean, te))} persist=${pct(acc(pPersist, te))} model=${pct(acc(pModel, te))} | F1 model=${pct(f1(pModel))} persist=${pct(f1(pPersist))} | bootstrap=${pct(wins / B)} inside80=${pct(inside)} unsafeShare=${pct(unsafeShare)}`);
