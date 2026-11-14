// Stage 4 — air-temperature climate record.
// Source: ECMWF ERA5-Land reanalysis (~9 km grid) served by the Open-Meteo Historical Weather API (CC BY 4.0).
// Used for (a) the 1950-today Karachi trend and (b) per-unit hot-season air temperature.
// NOTE: ERA5-Land is a model reanalysis on a ~9 km grid — NOT a station record. The app says so wherever it is shown.
import { cachedJson, fetchRetry, log, sleep, mean, quantile, ols, round } from '../lib.mjs';

const API = 'https://archive-api.open-meteo.com/v1/archive';
const CITY = { lat: 24.86, lon: 67.01 }; // central Karachi (Saddar area)
const BASELINE = [1991, 2020];
const iso = (d) => d.toISOString().slice(0, 10);

async function archive(key, lats, lons, start, end, daily) {
  return cachedJson(`climate-${key}.json`, async () => {
    const url = `${API}?latitude=${lats.join(',')}&longitude=${lons.join(',')}&start_date=${start}&end_date=${end}&daily=${daily}&models=era5_land&timezone=Asia%2FKarachi`;
    log('climate', `${key}: ${lats.length} location(s), ${start} → ${end}`);
    const json = await (await fetchRetry(url, {}, { label: `open-meteo ${key}`, retries: 4 })).json();
    await sleep(2500);
    return Array.isArray(json) ? json : [json];
  });
}

export async function runClimate(boundaries) {
  const end = new Date(Date.now() - 8 * 86400000); // ERA5-Land archive lags real time by several days
  const endIso = iso(end);
  const lastYear = end.getUTCFullYear();

  // ---------------------------------------------------------------- long-term city series
  let longStart = '1950-01-01';
  let res;
  try { res = await archive('city-long', [CITY.lat], [CITY.lon], longStart, endIso, 'temperature_2m_max,temperature_2m_min'); }
  catch (e) { log('climate', `1950 start failed (${e.message}); falling back to 1981`); longStart = '1981-01-01'; res = await archive('city-long-1981', [CITY.lat], [CITY.lon], longStart, endIso, 'temperature_2m_max,temperature_2m_min'); }
  const d = res[0].daily;
  const days = d.time.map((t, i) => ({ t, y: +t.slice(0, 4), md: t.slice(5), tmax: d.temperature_2m_max[i], tmin: d.temperature_2m_min[i] })).filter((x) => x.tmax != null);
  log('climate', `city series: ${days.length} days, grid cell ${res[0].latitude.toFixed(2)}N ${res[0].longitude.toFixed(2)}E, ${days[0].t} → ${days.at(-1).t}`);

  const baseDays = days.filter((x) => x.y >= BASELINE[0] && x.y <= BASELINE[1]);
  const p95 = quantile(baseDays.map((x) => x.tmax).sort((a, b) => a - b), 0.95);
  const baseAnnualMax = mean(Object.values(groupBy(baseDays, (x) => x.y)).map((g) => mean(g.map((x) => x.tmax))));

  const years = [];
  const byYear = groupBy(days, (x) => x.y);
  for (const [y, g] of Object.entries(byYear)) {
    const complete = g.length >= 360;
    const hs = g.filter((x) => x.md >= '05-01' && x.md <= '06-30');
    years.push({
      year: +y, complete,
      meanTmax: round(mean(g.map((x) => x.tmax)), 2),
      meanTmin: round(mean(g.map((x) => x.tmin).filter((v) => v != null)), 2),
      hotSeasonTmax: hs.length >= 55 ? round(mean(hs.map((x) => x.tmax)), 2) : null,
      days40: g.filter((x) => x.tmax >= 40).length,
      daysAboveP95: g.filter((x) => x.tmax > p95).length,
      maxTmax: round(Math.max(...g.map((x) => x.tmax)), 1),
    });
  }
  years.sort((a, b) => a.year - b.year);
  const complete = years.filter((y) => y.complete);
  for (const y of years) y.anomaly = y.complete ? round(y.meanTmax - baseAnnualMax, 2) : null;

  const trendFrom = Math.max(1980, complete[0].year);
  const tr = complete.filter((y) => y.year >= trendFrom);
  const t1 = ols(tr.map((y) => y.year), tr.map((y) => y.meanTmax));
  const hsTr = tr.filter((y) => y.hotSeasonTmax != null);
  const t2 = ols(hsTr.map((y) => y.year), hsTr.map((y) => y.hotSeasonTmax));
  const trend = {
    from: trendFrom, to: tr.at(-1).year,
    annualMeanTmaxPerDecade: round(t1.slope * 10, 3), annualCi95: round(1.96 * t1.se * 10, 3), annualR2: round(t1.r2, 3),
    hotSeasonTmaxPerDecade: round(t2.slope * 10, 3), hotSeasonCi95: round(1.96 * t2.se * 10, 3), hotSeasonR2: round(t2.r2, 3),
  };

  // Hot-season daily profile: Apr 1 – Jul 31 normal (mean + p10/p90 over the baseline) vs selected years.
  const mdList = [...new Set(days.filter((x) => x.md >= '04-01' && x.md <= '07-31' && x.md !== '02-29').map((x) => x.md))].sort();
  const pickYears = [...new Set([2015, 2024, lastYear].filter((y) => byYear[y]))];
  const profile = mdList.map((md) => {
    const vals = baseDays.filter((x) => x.md === md).map((x) => x.tmax).sort((a, b) => a - b);
    const row = { md, normal: round(mean(vals), 2), p10: round(quantile(vals, 0.1), 2), p90: round(quantile(vals, 0.9), 2) };
    for (const y of pickYears) { const v = days.find((x) => x.y === y && x.md === md); row[`y${y}`] = v ? round(v.tmax, 1) : null; }
    return row;
  });

  // ---------------------------------------------------------------- per-unit air temperature (2020 → today)
  const units = boundaries.geojson.features.map((f) => f.properties);
  const perUnit = {};
  const chunks = [];
  for (let i = 0; i < units.length; i += 6) chunks.push(units.slice(i, i + 6));
  for (const [ci, ch] of chunks.entries()) {
    const out = await archive(`units-${ci}`, ch.map((u) => u.centroid[1].toFixed(4)), ch.map((u) => u.centroid[0].toFixed(4)), '2020-01-01', endIso, 'temperature_2m_max,temperature_2m_min');
    out.forEach((loc, i) => {
      const dd = loc.daily;
      const rows = dd.time.map((t, k) => ({ t, y: +t.slice(0, 4), md: t.slice(5), tmax: dd.temperature_2m_max[k], tmin: dd.temperature_2m_min[k] })).filter((x) => x.tmax != null);
      const hs = rows.filter((x) => x.md >= '05-01' && x.md <= '06-30');
      const fullYears = [...new Set(rows.map((x) => x.y))].filter((y) => rows.filter((x) => x.y === y).length >= 360);
      perUnit[ch[i].id] = {
        gridLat: round(loc.latitude, 2), gridLon: round(loc.longitude, 2),
        hotSeasonTmax: round(mean(hs.map((x) => x.tmax)), 2),
        hotSeasonTmin: round(mean(hs.map((x) => x.tmin).filter((v) => v != null)), 2),
        days40PerYear: round(fullYears.length ? rows.filter((x) => x.tmax >= 40 && fullYears.includes(x.y)).length / fullYears.length : null, 1),
        maxTmax: round(Math.max(...rows.map((x) => x.tmax)), 1),
        period: `${rows[0].t} → ${rows.at(-1).t}`,
      };
    });
  }
  const cells = new Set(Object.values(perUnit).map((u) => `${u.gridLat},${u.gridLon}`));
  log('climate', `per-unit air temperature done; ${cells.size} distinct ERA5-Land grid cells for ${units.length} units`);

  return {
    city: { lat: CITY.lat, lon: CITY.lon, gridLat: round(res[0].latitude, 2), gridLon: round(res[0].longitude, 2), start: days[0].t, end: days.at(-1).t, baseline: BASELINE, baselineMeanTmax: round(baseAnnualMax, 2), p95Tmax: round(p95, 2) },
    years, trend, profile, pickYears, perUnit, distinctGridCells: cells.size,
    meta: { source: 'ECMWF ERA5-Land reanalysis via Open-Meteo Historical Weather API', license: 'CC BY 4.0', url: 'https://open-meteo.com/en/docs/historical-weather-api', resolution: '~9 km grid (model reanalysis, not station data)' },
  };
}

function groupBy(arr, fn) {
  const m = {};
  for (const x of arr) (m[fn(x)] ||= []).push(x);
  return m;
}
