// Shared helpers for the KarachAir data pipeline.
// Everything here is dependency-free (Node 20+ built-ins only).
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const CACHE = path.join(ROOT, 'data-cache');
export const OUT = path.join(ROOT, 'public', 'data');
export const UA = 'KarachAir-hackathon/0.1 (open-data climate research)';

export const log = (stage, ...a) => console.log(`[${new Date().toISOString().slice(11, 19)}] [${stage}]`, ...a);
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function ensureDirs() {
  await mkdir(CACHE, { recursive: true });
  await mkdir(OUT, { recursive: true });
}

export async function exists(p) {
  try { await access(p); return true; } catch { return false; }
}

export async function readJson(p) { return JSON.parse(await readFile(p, 'utf8')); }
export async function writeJson(p, data, pretty = false) {
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, JSON.stringify(data, null, pretty ? 2 : 0));
}

/** Run `producer` once and cache its JSON result on disk under data-cache/. */
export async function cachedJson(name, producer) {
  const file = path.join(CACHE, name);
  if (await exists(file)) return readJson(file);
  const data = await producer();
  await writeJson(file, data);
  return data;
}

/** fetch() with timeout + exponential back-off. Returns the Response (ok) or throws. */
export async function fetchRetry(url, init = {}, { retries = 5, timeoutMs = 240000, label = url, baseDelayMs = 4000 } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: ctrl.signal, headers: { 'User-Agent': UA, ...(init.headers || {}) } });
      clearTimeout(t);
      if (res.ok) return res;
      lastErr = new Error(`HTTP ${res.status} ${res.statusText}`);
      if (res.status === 429 || res.status >= 500) {
        // Open-Meteo asks for a minute after a rate limit; others get simple back-off.
        const wait = res.status === 429 ? 65000 : baseDelayMs * 2 ** (attempt - 1);
        log('http', `${label} -> ${res.status}; retry ${attempt}/${retries} in ${Math.round(wait / 1000)}s`);
        await sleep(wait);
        continue;
      }
      throw lastErr;
    } catch (e) {
      clearTimeout(t);
      lastErr = e;
      if (attempt === retries) break;
      const wait = baseDelayMs * 2 ** (attempt - 1);
      log('http', `${label} failed (${e.cause?.code || e.name}: ${e.message}); retry ${attempt}/${retries} in ${Math.round(wait / 1000)}s`);
      await sleep(wait);
    }
  }
  throw new Error(`${label}: ${lastErr?.message || 'failed'}`);
}

// ---------------------------------------------------------------- geometry
export function* polygonsOf(geom) {
  if (geom.type === 'Polygon') yield geom.coordinates;
  else if (geom.type === 'MultiPolygon') for (const p of geom.coordinates) yield p;
}

export function pointInRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function pointInGeom(x, y, geom) {
  for (const poly of polygonsOf(geom)) {
    if (!pointInRing(x, y, poly[0])) continue;
    let inHole = false;
    for (let h = 1; h < poly.length; h++) if (pointInRing(x, y, poly[h])) { inHole = true; break; }
    if (!inHole) return true;
  }
  return false;
}

export function bboxOf(geom) {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const poly of polygonsOf(geom)) for (const [x, y] of poly[0]) {
    if (x < w) w = x; if (x > e) e = x; if (y < s) s = y; if (y > n) n = y;
  }
  return [w, s, e, n];
}

/** Planar area (km²) of a lon/lat ring using a local equirectangular projection. */
export function ringAreaKm2(ring, lat0 = ring[0][1]) {
  const kx = 111.320 * Math.cos((lat0 * Math.PI) / 180), ky = 110.574;
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += (ring[j][0] * kx) * (ring[i][1] * ky) - (ring[i][0] * kx) * (ring[j][1] * ky);
  }
  return Math.abs(a) / 2;
}

export function geomAreaKm2(geom) {
  let total = 0;
  for (const poly of polygonsOf(geom)) {
    total += ringAreaKm2(poly[0]);
    for (let h = 1; h < poly.length; h++) total -= ringAreaKm2(poly[h]);
  }
  return total;
}

/** Area-weighted centroid of the outer rings (good enough for labels & point queries). */
export function geomCentroid(geom) {
  let cx = 0, cy = 0, A = 0;
  for (const poly of polygonsOf(geom)) {
    const r = poly[0];
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const f = r[j][0] * r[i][1] - r[i][0] * r[j][1];
      cx += (r[j][0] + r[i][0]) * f; cy += (r[j][1] + r[i][1]) * f; A += f;
    }
  }
  A /= 2;
  return [cx / (6 * A), cy / (6 * A)];
}

/** Round every coordinate to `d` decimals (shrinks GeoJSON for the browser). */
export function roundGeom(geom, d = 4) {
  const f = 10 ** d;
  const rr = (c) => (typeof c[0] === 'number' ? [Math.round(c[0] * f) / f, Math.round(c[1] * f) / f] : c.map(rr));
  return { type: geom.type, coordinates: rr(geom.coordinates) };
}

// -------------------------------------------------- MODIS sinusoidal projection
export const R_SIN = 6371007.181;
export const sinToLonLat = (x, y) => {
  const phi = y / R_SIN;
  return [(x / (R_SIN * Math.cos(phi))) * (180 / Math.PI), phi * (180 / Math.PI)];
};
export const lonLatToSin = (lon, lat) => {
  const phi = (lat * Math.PI) / 180;
  return [R_SIN * ((lon * Math.PI) / 180) * Math.cos(phi), R_SIN * phi];
};

// ------------------------------------------------------------------ statistics
export const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
export function quantile(sorted, q) {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}
/** Ordinary least squares y = a + b·x with R² and slope standard error. */
export function ols(xs, ys) {
  const n = xs.length;
  const mx = mean(xs), my = mean(ys);
  let sxx = 0, sxy = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxx += (xs[i] - mx) ** 2; sxy += (xs[i] - mx) * (ys[i] - my); syy += (ys[i] - my) ** 2; }
  const slope = sxy / sxx, intercept = my - slope * mx;
  const r2 = (sxy * sxy) / (sxx * syy);
  let sse = 0;
  for (let i = 0; i < n; i++) sse += (ys[i] - (intercept + slope * xs[i])) ** 2;
  const se = Math.sqrt(sse / (n - 2) / sxx);
  return { n, slope, intercept, r2, se };
}
export const round = (v, d = 2) => (v == null || Number.isNaN(v) ? null : Math.round(v * 10 ** d) / 10 ** d);
