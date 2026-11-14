// Stage 5 — satellite land-surface temperature and vegetation.
// Source: NASA MODIS via the ORNL DAAC "MODIS Global Subsets" web service (public, no key).
//   MYD11A2 v6.1 — Aqua 8-day LST & emissivity, 1 km. Aqua crosses at ~13:30 / ~01:30 local time, so the day
//                  layer captures the hot afternoon and the night layer captures heat the city fails to shed.
//   MOD13Q1 v6.1 — Terra 16-day NDVI, 250 m (vegetation greenness).
// We use the pre-monsoon hot season (composites between 1 May and 30 June) of 2020-2026.
import { cachedJson, fetchRetry, log, sleep, bboxOf, pointInGeom, lonLatToSin, sinToLonLat, mean, quantile, ols, round } from '../lib.mjs';

const ORNL = 'https://modis.ornl.gov/rst/api/v1';
// TW_YEARS="2024,2025,2026" gives a quick first run; re-running with the full list only fetches what is missing.
const YEARS = (process.env.TW_YEARS || '2020,2021,2022,2023,2024,2025,2026').split(',').map(Number);
const POOL = 1; // ORNL's gateway times out at ~60 s; concurrent requests slow each other down past that.

async function pool(items, n, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } }));
  return out;
}

async function getDates(product, lat, lon) {
  return cachedJson(`modis-dates-${product}.json`, async () => {
    const res = await fetchRetry(`${ORNL}/${product}/dates?latitude=${lat}&longitude=${lon}`, { headers: { Accept: 'application/json' } }, { label: `${product} dates`, timeoutMs: 180000 });
    return (await res.json()).dates;
  });
}

/** Hot-season composites (1 May – 30 Jun) for the study years. */
const selectDates = (dates) => dates.filter((d) => YEARS.some((y) => d.calendar_date >= `${y}-05-01` && d.calendar_date <= `${y}-06-30`));

// ORNL's gateway drops any request that takes longer than ~60 s and cost scales with the number of dates,
// so each composite is fetched (and cached) on its own. A failed date is skipped, not fatal.
let done = 0;
async function getSubset(product, d, total, lat, lon, kmAB, kmLR, band) {
  const key = `modis-${product}-${d.modis_date}-${band || 'all'}.json`;
  try {
    return await cachedJson(key, async () => {
      const q = `latitude=${lat}&longitude=${lon}&startDate=${d.modis_date}&endDate=${d.modis_date}&kmAboveBelow=${kmAB}&kmLeftRight=${kmLR}${band ? `&band=${band}` : ''}`;
      const res = await fetchRetry(`${ORNL}/${product}/subset?${q}`, { headers: { Accept: 'application/json' } }, { label: `${product} ${d.calendar_date}`, timeoutMs: 110000, retries: 5, baseDelayMs: 8000 });
      const j = await res.json();
      if (!j.subset?.length) throw new Error('empty subset');
      return j;
    });
  } catch (e) {
    log('modis', `${product} ${d.calendar_date} FAILED (${e.message}) — skipping this composite`);
    return null;
  } finally {
    done++; if (done % 5 === 0 || done === total) log('modis', `${done}/${total} composite requests finished`);
  }
}

function parse(json) {
  const grid = { xll: +json.xllcorner, yll: +json.yllcorner, cs: +json.cellsize, nrows: json.nrows, ncols: json.ncols };
  const byDate = {};
  for (const r of json.subset) (byDate[r.calendar_date] ||= {})[r.band] = r.data;
  return { grid, byDate };
}

/** Area weights of one polygon over a MODIS sinusoidal grid (S×S sub-sampling per pixel). */
function weightsFor(geom, g, S) {
  const [w, s, e, n] = bboxOf(geom);
  const cs4 = [lonLatToSin(w, s), lonLatToSin(w, n), lonLatToSin(e, s), lonLatToSin(e, n)];
  const minX = Math.min(...cs4.map((p) => p[0])), maxX = Math.max(...cs4.map((p) => p[0]));
  const minY = Math.min(...cs4.map((p) => p[1])), maxY = Math.max(...cs4.map((p) => p[1]));
  const c0 = Math.max(0, Math.floor((minX - g.xll) / g.cs) - 1), c1 = Math.min(g.ncols - 1, Math.floor((maxX - g.xll) / g.cs) + 1);
  const rTop = Math.max(0, g.nrows - 1 - Math.floor((maxY - g.yll) / g.cs) - 1), rBot = Math.min(g.nrows - 1, g.nrows - 1 - Math.floor((minY - g.yll) / g.cs) + 1);
  const idx = [], wt = [];
  for (let r = rTop; r <= rBot; r++) for (let c = c0; c <= c1; c++) {
    let hit = 0;
    const x0 = g.xll + c * g.cs, yTop = g.yll + (g.nrows - r) * g.cs;
    for (let i = 0; i < S; i++) for (let j = 0; j < S; j++) {
      const [lon, lat] = sinToLonLat(x0 + ((i + 0.5) / S) * g.cs, yTop - ((j + 0.5) / S) * g.cs);
      if (pointInGeom(lon, lat, geom)) hit++;
    }
    if (hit) { idx.push(r * g.ncols + c); wt.push(hit / (S * S)); }
  }
  return { idx, wt };
}

const wmean = (arr, { idx, wt }) => {
  let s = 0, ws = 0;
  for (let k = 0; k < idx.length; k++) { const v = arr[idx[k]]; if (Number.isFinite(v)) { s += v * wt[k]; ws += wt[k]; } }
  return ws ? { mean: s / ws, share: ws / wt.reduce((a, b) => a + b, 0) } : { mean: null, share: 0 };
};

function resample(arr, g, bbox, step, scale) {
  const [w, s, e, n] = bbox;
  const cols = Math.ceil((e - w) / step), rows = Math.ceil((n - s) / step);
  const values = new Array(cols * rows);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const [x, y] = lonLatToSin(w + (c + 0.5) * step, n - (r + 0.5) * step);
    const col = Math.floor((x - g.xll) / g.cs), row = g.nrows - 1 - Math.floor((y - g.yll) / g.cs);
    const v = col >= 0 && col < g.ncols && row >= 0 && row < g.nrows ? arr[row * g.ncols + col] : NaN;
    values[r * cols + c] = Number.isFinite(v) ? Math.round(v * scale) : -9999;
  }
  return { west: round(w, 4), north: round(n, 4), step, cols, rows, scale, nodata: -9999, values };
}

export async function runModis(boundaries, pop) {
  const [bw, bs, be, bn] = boundaries.bbox;
  const lat = round((bs + bn) / 2, 4), lon = round((bw + be) / 2, 4);
  const kmAB = Math.ceil(((bn - bs) / 2) * 110.57 + 4), kmLR = Math.ceil(((be - bw) / 2) * 111.32 * Math.cos((lat * Math.PI) / 180) + 4);
  log('modis', `centre ${lat}N ${lon}E, ±${kmAB} km N-S, ±${kmLR} km E-W`);

  const datesLst = await getDates('MYD11A2', lat, lon);
  const datesNdvi = await getDates('MOD13Q1', lat, lon);

  const selL = selectDates(datesLst), selN = selectDates(datesNdvi);
  const total = selL.length + selN.length;
  log('modis', `${selL.length} LST composites + ${selN.length} NDVI composites to fetch (cached after first run)`);
  const lstRaw = (await pool(selL, POOL, (d) => getSubset('MYD11A2', d, total, lat, lon, kmAB, kmLR))).filter(Boolean);
  const ndviRaw = (await pool(selN, POOL, (d) => getSubset('MOD13Q1', d, total, lat, lon, kmAB, kmLR, '250m_16_days_NDVI'))).filter(Boolean);
  if (lstRaw.length < selL.length * 0.7 || ndviRaw.length < selN.length * 0.7) throw new Error(`too many failed satellite requests (LST ${lstRaw.length}/${selL.length}, NDVI ${ndviRaw.length}/${selN.length}) — re-run to resume from cache`);

  // ---------------------------------------------------------------- LST
  const lstParsed = lstRaw.map(parse);
  const G = lstParsed[0].grid;
  const N = G.nrows * G.ncols;
  const composites = []; // {date, year, day:Float32Array(°C|NaN), night:...}
  const toC = (v, qc) => (v > 0 && (qc & 3) < 2 ? v * 0.02 - 273.15 : NaN);
  for (const p of lstParsed) for (const [date, bands] of Object.entries(p.byDate)) {
    if (!bands.LST_Day_1km) continue;
    const day = new Float32Array(N), night = new Float32Array(N);
    for (let i = 0; i < N; i++) { day[i] = toC(bands.LST_Day_1km[i], bands.QC_Day[i]); night[i] = toC(bands.LST_Night_1km[i], bands.QC_Night[i]); }
    composites.push({ date, year: +date.slice(0, 4), day, night, viewTime: bands.Day_view_time ? median(bands.Day_view_time.filter((v) => v > 0 && v < 240)) / 10 : null });
  }
  composites.sort((a, b) => a.date.localeCompare(b.date));
  const viewTimes = composites.map((c) => c.viewTime).filter((v) => v != null);
  log('modis', `${composites.length} LST composites parsed over ${new Set(composites.map((c) => c.year)).size} seasons; median daytime view time ${viewTimes.length ? round(median(viewTimes), 1) : '?'} h (local solar)`);

  const stack = (key, minCount) => {
    const mean_ = new Float32Array(N).fill(NaN), count = new Uint16Array(N);
    for (let i = 0; i < N; i++) {
      let s = 0, c = 0;
      for (const comp of composites) { const v = comp[key][i]; if (v === v) { s += v; c++; } }
      count[i] = c; if (c >= minCount) mean_[i] = s / c;
    }
    return { mean: mean_, count };
  };
  const dayAll = stack('day', 8), nightAll = stack('night', 8);
  const yearMean = (key, year) => {
    const out = new Float32Array(N).fill(NaN); const cs = composites.filter((c) => c.year === year);
    for (let i = 0; i < N; i++) { let s = 0, c = 0; for (const comp of cs) { const v = comp[key][i]; if (v === v) { s += v; c++; } } if (c >= 2) out[i] = s / c; }
    return out;
  };
  const dayYear = Object.fromEntries([...new Set(composites.map((c) => c.year))].map((y) => [y, yearMean('day', y)]));

  // ---------------------------------------------------------------- NDVI
  const ndviParsed = ndviRaw.map(parse);
  const GN = ndviParsed[0].grid, NN = GN.nrows * GN.ncols;
  const ndviSum = new Float64Array(NN), ndviCnt = new Uint16Array(NN);
  let ndviComposites = 0;
  for (const p of ndviParsed) for (const bands of Object.values(p.byDate)) {
    const a = bands['250m_16_days_NDVI']; if (!a) continue; ndviComposites++;
    for (let i = 0; i < NN; i++) { const v = a[i]; if (v >= 0 && v <= 10000) { ndviSum[i] += v / 10000; ndviCnt[i]++; } }
  }
  const ndviMean = new Float32Array(NN).fill(NaN);
  for (let i = 0; i < NN; i++) if (ndviCnt[i] >= 3) ndviMean[i] = ndviSum[i] / ndviCnt[i];
  log('modis', `${ndviComposites} NDVI composites; grid ${GN.ncols}x${GN.nrows} @ ${GN.cs.toFixed(0)} m`);

  // ---------------------------------------------------------------- zonal statistics
  const units = boundaries.geojson.features;
  const unitStats = {};
  for (const f of units) {
    const id = f.properties.id;
    const wL = weightsFor(f.geometry, G, 4), wN = weightsFor(f.geometry, GN, 2);
    const day = wmean(dayAll.mean, wL), night = wmean(nightAll.mean, wL), nd = wmean(ndviMean, wN);
    const byYear = {};
    for (const [y, arr] of Object.entries(dayYear)) { const m = wmean(arr, wL); byYear[y] = m.share >= 0.5 ? round(m.mean, 2) : null; }
    // hottest 8-day composite (unit mean) and p90 pixel
    let peak = { v: -Infinity, date: null };
    for (const c of composites) { const m = wmean(c.day, wL); if (m.share >= 0.6 && m.mean > peak.v) peak = { v: m.mean, date: c.date }; }
    const px = wL.idx.map((ix, k) => [dayAll.mean[ix], wL.wt[k]]).filter(([v, w]) => Number.isFinite(v) && w >= 0.5).map(([v]) => v).sort((a, b) => a - b);
    const cnt = wL.idx.filter((ix) => Number.isFinite(dayAll.mean[ix])).map((ix) => dayAll.count[ix]);
    unitStats[id] = {
      lstDay: round(day.mean, 2), lstNight: round(night.mean, 2), ndvi: round(nd.mean, 3),
      lstDayP90: round(quantile(px, 0.9), 2), lstDayMaxPx: round(px.at(-1), 2),
      peak8DayDay: peak.v > -Infinity ? { value: round(peak.v, 2), date: peak.date } : null,
      byYear, coverage: round(day.share, 3), nPixels: wL.idx.length, meanComposites: round(mean(cnt), 1),
    };
  }

  // ---------------------------------------------------------------- pop-weighted exposure + LST~NDVI relation
  const pg = pop.grid;
  const popAt = (lonv, latv) => {
    const c = Math.floor((lonv - pg.west) / pg.dx), r = Math.floor((pg.north - latv) / pg.dy);
    return c >= 0 && c < pg.cols && r >= 0 && r < pg.rows ? pg.values[r * pg.cols + c] : 0;
  };
  const sampleLst = (arr, lonv, latv) => {
    const [x, y] = lonLatToSin(lonv, latv);
    const col = Math.floor((x - G.xll) / G.cs), row = G.nrows - 1 - Math.floor((y - G.yll) / G.cs);
    return col >= 0 && col < G.ncols && row >= 0 && row < G.nrows ? arr[row * G.ncols + col] : NaN;
  };
  const sampleNdvi = (lonv, latv) => {
    const [x, y] = lonLatToSin(lonv, latv);
    const col = Math.floor((x - GN.xll) / GN.cs), row = GN.nrows - 1 - Math.floor((y - GN.yll) / GN.cs);
    return col >= 0 && col < GN.ncols && row >= 0 && row < GN.nrows ? ndviMean[row * GN.ncols + col] : NaN;
  };
  const boxes = units.map((f) => bboxOf(f.geometry));
  const unitOf = (lonv, latv) => {
    for (let i = 0; i < units.length; i++) { const b = boxes[i]; if (lonv < b[0] || lonv > b[2] || latv < b[1] || latv > b[3]) continue; if (pointInGeom(lonv, latv, units[i].geometry)) return units[i].properties.id; }
    return null;
  };
  const exposure = {}; // 1 °C bins of afternoon LST -> residents
  const pwSum = {}, pwPop = {};
  for (let r = 0; r < pg.rows; r++) for (let c = 0; c < pg.cols; c++) {
    const people = pg.values[r * pg.cols + c]; if (!people) continue;
    const lonv = pg.west + (c + 0.5) * pg.dx, latv = pg.north - (r + 0.5) * pg.dy;
    const uid = unitOf(lonv, latv); if (!uid) continue;
    const v = sampleLst(dayAll.mean, lonv, latv); if (!Number.isFinite(v)) continue;
    const bin = Math.floor(v); exposure[bin] = (exposure[bin] || 0) + people;
    pwSum[uid] = (pwSum[uid] || 0) + v * people; pwPop[uid] = (pwPop[uid] || 0) + people;
  }
  for (const id of Object.keys(unitStats)) unitStats[id].lstDayPopWeighted = pwPop[id] ? round(pwSum[id] / pwPop[id], 2) : null;

  // Regression over inhabited 1 km pixels (>= 500 people/km²): afternoon LST vs NDVI.
  const xs = [], ys = [];
  const kmCell = pg.dx * 111.32 * Math.cos((lat * Math.PI) / 180) * pg.dy * 110.57;
  for (let r = 0; r < G.nrows; r++) for (let c = 0; c < G.ncols; c++) {
    const v = dayAll.mean[r * G.ncols + c]; if (!Number.isFinite(v)) continue;
    const [lonv, latv] = sinToLonLat(G.xll + (c + 0.5) * G.cs, G.yll + (G.nrows - r - 0.5) * G.cs);
    if (!unitOf(lonv, latv)) continue;
    if (popAt(lonv, latv) / kmCell < 500) continue;
    const nds = [];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      const nv = sampleNdvi(...sinToLonLat(G.xll + (c + (i + 0.5) / 4) * G.cs, G.yll + (G.nrows - r - (j + 0.5) / 4) * G.cs));
      if (Number.isFinite(nv)) nds.push(nv);
    }
    if (nds.length >= 8) { xs.push(mean(nds)); ys.push(v); }
  }
  const fit = ols(xs, ys);
  const regression = { n: fit.n, slopePerNdvi: round(fit.slope, 2), slopePer0p1Ndvi: round(fit.slope * 0.1, 3), intercept: round(fit.intercept, 2), r2: round(fit.r2, 3), se: round(fit.se, 3), ci95Per0p1: round(1.96 * fit.se * 0.1, 3), popDensityMin: 500 };
  log('modis', `LST~NDVI over ${fit.n} inhabited pixels: ${regression.slopePer0p1Ndvi} °C per +0.1 NDVI (R²=${regression.r2})`);

  // ---------------------------------------------------------------- rasters for the map
  const margin = 0.03;
  const bboxPad = [bw - margin, bs - margin, be + margin, bn + margin];
  const rasters = {
    lstDay: resample(dayAll.mean, G, bboxPad, 0.0075, 10),
    lstNight: resample(nightAll.mean, G, bboxPad, 0.0075, 10),
    ndvi: resample(ndviMean, GN, bboxPad, 0.004, 1000),
  };
  const dayVals = Array.from(dayAll.mean).filter(Number.isFinite).sort((a, b) => a - b);
  const nightVals = Array.from(nightAll.mean).filter(Number.isFinite).sort((a, b) => a - b);
  const city = {
    lstDayRange: [round(quantile(dayVals, 0.02), 1), round(quantile(dayVals, 0.98), 1)],
    lstNightRange: [round(quantile(nightVals, 0.02), 1), round(quantile(nightVals, 0.98), 1)],
    medianViewTimeDay: viewTimes.length ? round(median(viewTimes), 1) : null,
    composites: composites.length, ndviComposites, seasons: YEARS.filter((y) => composites.some((c) => c.year === y)),
  };

  return {
    unitStats, regression, rasters, city, exposure,
    meta: [
      { source: 'NASA MODIS/Aqua MYD11A2 v6.1 — LST & Emissivity 8-Day 1 km', via: 'ORNL DAAC MODIS Global Subsets web service', license: 'NASA open data', url: 'https://modis.ornl.gov/', detail: 'Hot-season (1 May–30 Jun) composites 2020–2026; Aqua overpass ≈ 13:30 (day) and ≈ 01:30 (night) local time; quality-flagged pixels removed.' },
      { source: 'NASA MODIS/Terra MOD13Q1 v6.1 — NDVI 16-Day 250 m', via: 'ORNL DAAC MODIS Global Subsets web service', license: 'NASA open data', url: 'https://modis.ornl.gov/', detail: 'Same hot-season windows 2020–2026; water pixels (NDVI < 0) excluded from means.' },
    ],
  };
}

function median(a) { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; }
