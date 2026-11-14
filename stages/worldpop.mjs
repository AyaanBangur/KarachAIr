// Stage 2 — population.
// Source: WorldPop, "Global 2000-2020 1km (UN-adjusted)" Pakistan 2020 raster (people per ~1 km cell). License: CC BY 4.0.
// We do an area-weighted zonal sum (4x4 sub-sampling per cell) so small towns are not distorted by cell alignment.
import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { fromArrayBuffer } from 'geotiff';
import { CACHE, exists, fetchRetry, log, pointInGeom, bboxOf, round } from '../lib.mjs';
import { readFile } from 'node:fs/promises';

const URL_TIF = 'https://data.worldpop.org/GIS/Population/Global_2000_2020_1km_UNadj/2020/PAK/pak_ppp_2020_1km_Aggregated_UNadj.tif';

export async function runWorldPop(boundaries) {
  const file = path.join(CACHE, 'worldpop-pak-2020-1km-unadj.tif');
  if (!(await exists(file))) {
    log('worldpop', 'downloading ~5 MB WorldPop 1 km raster');
    const res = await fetchRetry(URL_TIF, {}, { label: 'WorldPop raster', timeoutMs: 300000 });
    await writeFile(file, Buffer.from(await res.arrayBuffer()));
  }
  const buf = await readFile(file);
  const tiff = await fromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const img = await tiff.getImage();
  const [west, south, east, north] = img.getBoundingBox();
  const W = img.getWidth(), H = img.getHeight();
  const dx = (east - west) / W, dy = (north - south) / H;
  const nodata = img.getGDALNoData();

  // Window around Karachi (with margin) so we do not decode all of Pakistan.
  const [bw, bs, be, bn] = boundaries.bbox;
  const pad = 0.1;
  const c0 = Math.max(0, Math.floor((bw - pad - west) / dx)), c1 = Math.min(W, Math.ceil((be + pad - west) / dx));
  const r0 = Math.max(0, Math.floor((north - (bn + pad)) / dy)), r1 = Math.min(H, Math.ceil((north - (bs - pad)) / dy));
  const [band] = await img.readRasters({ window: [c0, r0, c1, r1], samples: [0] });
  const cols = c1 - c0, rows = r1 - r0;
  const val = (r, c) => { const v = band[r * cols + c]; return v == null || v === nodata || v < 0 || Number.isNaN(v) ? 0 : v; };
  const gridWest = west + c0 * dx, gridNorth = north - r0 * dy;
  log('worldpop', `window ${cols}x${rows} cells, cell ≈ ${(dx * 111.32 * Math.cos(0.435)).toFixed(2)} km`);

  const S = 4;
  const byUnit = {};
  let total = 0;
  for (const f of boundaries.geojson.features) {
    const [uw, us, ue, un] = bboxOf(f.geometry);
    const ca = Math.max(0, Math.floor((uw - gridWest) / dx)), cb = Math.min(cols - 1, Math.floor((ue - gridWest) / dx));
    const ra = Math.max(0, Math.floor((gridNorth - un) / dy)), rb = Math.min(rows - 1, Math.floor((gridNorth - us) / dy));
    let pop = 0;
    for (let r = ra; r <= rb; r++) for (let c = ca; c <= cb; c++) {
      const v = val(r, c);
      if (!v) continue;
      let hit = 0;
      for (let i = 0; i < S; i++) for (let j = 0; j < S; j++) {
        const lon = gridWest + (c + (i + 0.5) / S) * dx, lat = gridNorth - (r + (j + 0.5) / S) * dy;
        if (pointInGeom(lon, lat, f.geometry)) hit++;
      }
      pop += (v * hit) / (S * S);
    }
    byUnit[f.properties.id] = Math.round(pop);
    total += pop;
  }
  log('worldpop', `total across ${Object.keys(byUnit).length} units: ${Math.round(total).toLocaleString()} people (WorldPop 2020 UN-adjusted)`);

  // Grid for the map layer (people per cell, rounded) — only the window.
  const values = new Array(rows * cols);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) values[r * cols + c] = Math.round(val(r, c));
  return {
    byUnit, total: Math.round(total),
    grid: { west: round(gridWest, 5), north: round(gridNorth, 5), dx: round(dx, 6), dy: round(dy, 6), cols, rows, values },
    meta: { source: 'WorldPop (University of Southampton)', dataset: 'Global 2000-2020 1km UN-adjusted — Pakistan 2020', license: 'CC BY 4.0', url: URL_TIF, year: 2020 },
  };
}
