// Stage 1 — administrative boundaries for Karachi.
// Source: geoBoundaries gbOpen PAK ADM3 (Tehsil/Town, 2017; derived from Pakistan Bureau of Statistics census boundaries).
// License: ODbL 1.0. We keep the 18 towns + 6 cantonments that make up Karachi's urban area.
import { cachedJson, fetchRetry, log, geomAreaKm2, geomCentroid, bboxOf, roundGeom, polygonsOf } from '../lib.mjs';

const META_URL = 'https://www.geoboundaries.org/api/current/gbOpen/PAK/ADM3/';

// shapeName in the source -> display names. Anything not listed here is not part of Karachi's urban core
// (e.g. Hub, Gaddani, Sonmiani are in Balochistan or Karachi's rural fringe).
const UNITS = {
  'BALDIA TOWN': ['Baldia Town', 'Baldia', 'town'],
  'BIN QASIM TOWN': ['Bin Qasim Town', 'Bin Qasim', 'town'],
  'GADAP TOWN': ['Gadap Town', 'Gadap', 'town'],
  'GULBERG TOWN': ['Gulberg Town', 'Gulberg', 'town'],
  'GULSHAN E IQBAL TOWN': ['Gulshan-e-Iqbal Town', 'Gulshan-e-Iqbal', 'town'],
  'JAMSHED TOWN': ['Jamshed Town', 'Jamshed', 'town'],
  'KIAMARI TOWN': ['Kiamari Town', 'Kiamari', 'town'],
  'KORANGI TOWN': ['Korangi Town', 'Korangi', 'town'],
  'LANDHI TOWN': ['Landhi Town', 'Landhi', 'town'],
  'LIAQATABAD TOWN': ['Liaquatabad Town', 'Liaquatabad', 'town'],
  'LYARI TOWN': ['Lyari Town', 'Lyari', 'town'],
  'MALIR': ['Malir Town', 'Malir', 'town'],
  'N.NAZIMABAD TOWN': ['North Nazimabad Town', 'N. Nazimabad', 'town'],
  'NEW KARACHI TOWN': ['New Karachi Town', 'New Karachi', 'town'],
  'ORANGI TOWN': ['Orangi Town', 'Orangi', 'town'],
  'SADDAR TOWN': ['Saddar Town', 'Saddar', 'town'],
  'SHAH FAISAL TOWN': ['Shah Faisal Town', 'Shah Faisal', 'town'],
  'SITE TOWN': ['SITE Town', 'SITE', 'town'],
  'CLIFTON CANTONMENT': ['Clifton Cantonment', 'Clifton Cantt.', 'cantonment'],
  'FAISAL CANTONMENT': ['Faisal Cantonment', 'Faisal Cantt.', 'cantonment'],
  'KARACHI CANTONMENT': ['Karachi Cantonment', 'Karachi Cantt.', 'cantonment'],
  'KORANGI CREEK CANTONMENT': ['Korangi Creek Cantonment', 'Korangi Creek', 'cantonment'],
  'MALIR CANTONMENT': ['Malir Cantonment', 'Malir Cantt.', 'cantonment'],
  'MANORA CANTONMENT': ['Manora Cantonment', 'Manora', 'cantonment'],
};

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export async function runBoundaries() {
  const raw = await cachedJson('boundaries-raw.json', async () => {
    log('boundaries', 'fetching geoBoundaries metadata + simplified ADM3 geometry');
    const meta = await (await fetchRetry(META_URL, {}, { label: 'geoBoundaries meta' })).json();
    const gj = await (await fetchRetry(meta.simplifiedGeometryGeoJSON, {}, { label: 'geoBoundaries geojson' })).json();
    const keep = gj.features.filter((f) => UNITS[f.properties.shapeName]);
    return {
      meta: { source: meta.boundarySource, year: meta.boundaryYearRepresented, license: meta.boundaryLicense, url: meta.simplifiedGeometryGeoJSON },
      features: keep,
    };
  });

  const missing = Object.keys(UNITS).filter((n) => !raw.features.find((f) => f.properties.shapeName === n));
  if (missing.length) throw new Error('Missing units in source: ' + missing.join(', '));

  const features = raw.features.map((f) => {
    const [name, short, type] = UNITS[f.properties.shapeName];
    const geometry = roundGeom(f.geometry, 4);
    return {
      type: 'Feature',
      properties: {
        id: slug(name), name, short, type,
        areaKm2: Math.round(geomAreaKm2(geometry) * 10) / 10,
        centroid: geomCentroid(geometry).map((v) => Math.round(v * 1e4) / 1e4),
      },
      geometry,
    };
  }).sort((a, b) => a.properties.name.localeCompare(b.properties.name));

  let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const f of features) { const b = bboxOf(f.geometry); w = Math.min(w, b[0]); s = Math.min(s, b[1]); e = Math.max(e, b[2]); n = Math.max(n, b[3]); }
  const parts = features.reduce((c, f) => c + [...polygonsOf(f.geometry)].length, 0);
  log('boundaries', `${features.length} units, ${parts} polygons, bbox [${w.toFixed(3)}, ${s.toFixed(3)}, ${e.toFixed(3)}, ${n.toFixed(3)}]`);
  return { meta: raw.meta, bbox: [w, s, e, n], geojson: { type: 'FeatureCollection', features } };
}
