// Stage 3 — OpenStreetMap: health facilities, drinking-water points and mapped green space.
// Source: OpenStreetMap contributors via the Overpass API (ODbL). OSM completeness varies, so these are
// treated as *mapped* infrastructure, never as a census — the app labels them that way.
import { cachedJson, fetchRetry, log, sleep, pointInGeom, bboxOf, ringAreaKm2, round } from '../lib.mjs';

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

async function overpass(name, query) {
  return cachedJson(`osm-${name}.json`, async () => {
    for (let round_ = 0; round_ < 4; round_++) {
      for (const ep of ENDPOINTS) {
        try {
          log('osm', `${name}: querying ${new URL(ep).host}`);
          const res = await fetchRetry(ep, { method: 'POST', body: new URLSearchParams({ data: query }) }, { retries: 2, timeoutMs: 240000, label: `overpass ${name}`, baseDelayMs: 8000 });
          const json = await res.json();
          if (json.elements) return json;
        } catch (e) { log('osm', `${name}: ${e.message}`); }
      }
      await sleep(15000 * (round_ + 1));
    }
    throw new Error(`Overpass query "${name}" failed on every endpoint`);
  });
}

const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const km = (a, b) => Math.hypot((a.lon - b.lon) * 111.32 * Math.cos((a.lat * Math.PI) / 180), (a.lat - b.lat) * 110.57);

function ringsArea(el) {
  // Closed ways: shoelace. Multipolygon relations: sum of closed outer members (open rings are skipped -> small under-count).
  if (el.type === 'way' && el.geometry?.length > 3) {
    const r = el.geometry.map((p) => [p.lon, p.lat]);
    const closed = r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1];
    return closed ? ringAreaKm2(r) : 0;
  }
  if (el.type === 'relation') {
    let a = 0;
    for (const m of el.members || []) {
      if (m.type !== 'way' || m.role !== 'outer' || !m.geometry || m.geometry.length < 4) continue;
      const r = m.geometry.map((p) => [p.lon, p.lat]);
      if (r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1]) a += ringAreaKm2(r);
    }
    return a;
  }
  return 0;
}
function repPoint(el) {
  if (el.center) return { lat: el.center.lat, lon: el.center.lon };
  if (el.lat != null) return { lat: el.lat, lon: el.lon };
  const g = el.geometry || el.members?.find((m) => m.geometry)?.geometry;
  if (g?.length) return { lat: g.reduce((s, p) => s + p.lat, 0) / g.length, lon: g.reduce((s, p) => s + p.lon, 0) / g.length };
  return null;
}

export async function runOsm(boundaries) {
  const [w, s, e, n] = boundaries.bbox.map((v, i) => (i < 2 ? v - 0.02 : v + 0.02));
  const bb = `${s.toFixed(4)},${w.toFixed(4)},${n.toFixed(4)},${e.toFixed(4)}`;

  const health = await overpass('health', `[out:json][timeout:200];(nwr["amenity"~"^(hospital|clinic)$"](${bb});nwr["healthcare"~"^(hospital|clinic)$"](${bb}););out center tags;`);
  const water = await overpass('water', `[out:json][timeout:200];nwr["amenity"="drinking_water"](${bb});out center tags;`);
  const green = await overpass('green', `[out:json][timeout:280];(
    way["leisure"~"^(park|garden|recreation_ground|nature_reserve)$"](${bb});
    way["landuse"~"^(grass|forest|village_green|recreation_ground)$"](${bb});
    way["natural"="wood"](${bb});
    way["wetland"="mangrove"](${bb});
    relation["leisure"~"^(park|garden|nature_reserve)$"](${bb});
    relation["natural"="wood"](${bb});
    relation["landuse"="forest"](${bb});
    relation["wetland"="mangrove"](${bb});
  );out geom tags;`);

  const units = boundaries.geojson.features;
  const boxes = units.map((f) => bboxOf(f.geometry));
  const locate = (p) => {
    for (let i = 0; i < units.length; i++) {
      const b = boxes[i];
      if (p.lon < b[0] || p.lon > b[2] || p.lat < b[1] || p.lat > b[3]) continue;
      if (pointInGeom(p.lon, p.lat, units[i].geometry)) return units[i].properties.id;
    }
    return null;
  };

  // Health facilities (deduplicate a hospital mapped as both node and building: same normalised name within 250 m).
  const facilities = [];
  for (const el of health.elements) {
    const p = repPoint(el); if (!p) continue;
    const name = el.tags?.name || el.tags?.['name:en'] || '';
    const kind = el.tags?.amenity === 'hospital' || el.tags?.healthcare === 'hospital' ? 'hospital' : 'clinic';
    if (name && facilities.some((f) => norm(f.name) === norm(name) && km(f, p) < 0.25)) continue;
    const unit = locate(p); if (!unit) continue;
    facilities.push({ lat: round(p.lat, 5), lon: round(p.lon, 5), name, kind, unit });
  }
  const waterPts = [];
  for (const el of water.elements) {
    const p = repPoint(el); if (!p) continue;
    const unit = locate(p); if (unit) waterPts.push({ lat: p.lat, lon: p.lon, unit });
  }

  const greenKm2 = {};
  let greenFeatures = 0;
  for (const el of green.elements) {
    const a = ringsArea(el); if (a <= 0) continue;
    const p = repPoint(el); if (!p) continue;
    const unit = locate(p); if (!unit) continue;
    greenKm2[unit] = (greenKm2[unit] || 0) + a; greenFeatures++;
  }

  const byUnit = {};
  for (const f of units) {
    const id = f.properties.id;
    const fs = facilities.filter((x) => x.unit === id);
    byUnit[id] = {
      hospitals: fs.filter((x) => x.kind === 'hospital').length,
      clinics: fs.filter((x) => x.kind === 'clinic').length,
      drinkingWater: waterPts.filter((x) => x.unit === id).length,
      greenKm2: round(greenKm2[id] || 0, 3),
    };
  }
  log('osm', `${facilities.length} health facilities, ${waterPts.length} drinking-water points, ${greenFeatures} green polygons (${round(Object.values(greenKm2).reduce((a, b) => a + b, 0), 1)} km²)`);
  return {
    byUnit,
    facilities: facilities.map(({ lat, lon, name, kind }) => ({ lat, lon, name, kind })),
    meta: { source: 'OpenStreetMap contributors via Overpass API', license: 'ODbL 1.0', url: 'https://www.openstreetmap.org/copyright', note: 'Mapped features only; OSM coverage is uneven. Green area counts closed OSM polygons assigned to the unit containing their centre point; open multipolygon rings are skipped (a mild under-count).' },
  };
}
