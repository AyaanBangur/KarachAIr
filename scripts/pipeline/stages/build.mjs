// Stage 6 — merge every stage into the static files the web app loads from /data/.
// Only measured/derived indicators are written here. Risk scores are computed in the browser from these
// indicators (src/lib/risk.ts) so the weighting is transparent and user-adjustable.
import { round, quantile } from '../lib.mjs';

const seasonLabel = (s) => { const a = [...s].sort(); return a.length > 1 ? `${a[0]}–${a.at(-1)} (${a.length} seasons)` : String(a[0]); };

export function build({ boundaries, pop, osm, climate, modis }) {
  const features = boundaries.geojson.features.map((f) => {
    const p = f.properties, id = p.id;
    const population = pop?.byUnit[id] ?? null;
    const o = osm?.byUnit[id];
    const m = modis?.unitStats[id];
    const a = climate?.perUnit[id];
    const health = o ? o.hospitals + o.clinics : null;
    return {
      type: 'Feature',
      geometry: f.geometry,
      properties: {
        id, name: p.name, short: p.short, type: p.type, areaKm2: p.areaKm2, centroid: p.centroid,
        population,
        popDensity: population != null ? Math.round(population / p.areaKm2) : null,
        lst: m ? {
          day: m.lstDay, night: m.lstNight, dayP90: m.lstDayP90, dayHottestPixel: m.lstDayMaxPx,
          dayPopWeighted: m.lstDayPopWeighted, peak8Day: m.peak8DayDay, byYear: m.byYear,
          coverage: m.coverage, meanComposites: m.meanComposites, nPixels: m.nPixels,
        } : null,
        ndvi: m ? m.ndvi : null,
        air: a ? { hotSeasonTmax: a.hotSeasonTmax, hotSeasonTmin: a.hotSeasonTmin, days40PerYear: a.days40PerYear, maxTmax: a.maxTmax, gridLat: a.gridLat, gridLon: a.gridLon } : null,
        infra: o ? {
          hospitals: o.hospitals, clinics: o.clinics, healthFacilities: health,
          healthPer100k: population ? round((health / population) * 1e5, 2) : null,
          drinkingWater: o.drinkingWater,
          greenKm2: o.greenKm2, greenShare: round(Math.min(1, o.greenKm2 / p.areaKm2), 4),
          greenM2PerPerson: population ? round((o.greenKm2 * 1e6) / population, 1) : null,
        } : null,
      },
    };
  });

  const pops = features.map((f) => f.properties.population).filter((v) => v != null);
  const rasters = {};
  if (modis) Object.assign(rasters, modis.rasters);
  if (pop) rasters.pop = { ...pop.grid, west: pop.grid.west, north: pop.grid.north, dx: pop.grid.dx, dy: pop.grid.dy };

  const exposure = modis ? Object.entries(modis.exposure).map(([t, people]) => ({ lst: +t, people })).sort((a, b) => a.lst - b.lst) : [];

  const sources = [
    ...(boundaries ? [{ id: 'boundaries', name: 'Administrative boundaries', provider: 'geoBoundaries gbOpen (PBS 2017 census boundaries)', license: boundaries.meta.license, url: boundaries.meta.url, limits: 'Pre-2022 reorganisation: 18 towns + 6 cantonments. Boundaries are simplified.' }] : []),
    ...(modis ? modis.meta.map((s, i) => ({ id: i === 0 ? 'lst' : 'ndvi', name: s.source, provider: s.via, license: s.license, url: s.url, detail: s.detail.replace(/\d{4}\s*[–-]\s*\d{4}/, seasonLabel(modis.city.seasons)), limits: i === 0 ? '8-day clear-sky composites at 1 km; cloudy pixels excluded; surface (skin) temperature, not air temperature.' : '250 m vegetation greenness; arid-zone values are low everywhere, so compare units relatively.' })) : []),
    ...(pop ? [{ id: 'population', name: pop.meta.dataset, provider: pop.meta.source, license: pop.meta.license, url: pop.meta.url, limits: 'Modelled 2020 estimate on a ~1 km grid, not a census count.' }] : []),
    ...(osm ? [{ id: 'osm', name: 'OpenStreetMap features (health facilities and green space)', provider: osm.meta.source, license: osm.meta.license, url: osm.meta.url, limits: osm.meta.note }] : []),
    ...(climate ? [{ id: 'climate', name: 'ERA5-Land reanalysis — daily air temperature', provider: climate.meta.source, license: climate.meta.license, url: climate.meta.url, limits: climate.meta.resolution }] : []),
  ];

  const meta = {
    generatedAt: new Date().toISOString(),
    bbox: boundaries.bbox,
    unitCount: features.length,
    totalPopulation: pop?.total ?? null,
    medianPopulation: pops.length ? Math.round(quantile([...pops].sort((a, b) => a - b), 0.5)) : null,
    lst: modis ? { ...modis.city, regression: modis.regression } : null,
    exposure,
    climateCity: climate ? { ...climate.city, trend: climate.trend, distinctGridCells: climate.distinctGridCells } : null,
    sources,
  };

  return {
    'units.geojson': { type: 'FeatureCollection', features },
    'rasters.json': rasters,
    'facilities.json': osm ? osm.facilities : [],
    'climate.json': climate ? { city: meta.climateCity, years: climate.years, profile: climate.profile, pickYears: climate.pickYears } : null,
    'meta.json': meta,
  };
}
