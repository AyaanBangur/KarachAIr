// Helpers for the gridded satellite / population layers shipped in public/data/rasters.json.
import type { GridRaster, UnitFeature } from './types';
import { rampRGB, type Ramp } from './colors';

export const cellSize = (r: GridRaster): [number, number] => [r.dx ?? r.step ?? 0.01, r.dy ?? r.step ?? 0.01];
export const rasterBounds = (r: GridRaster) => {
  const [dx, dy] = cellSize(r);
  return { west: r.west, east: r.west + r.cols * dx, north: r.north, south: r.north - r.rows * dy };
};
/** Value at grid index in real units, or null for no-data. */
export function valueAt(r: GridRaster, col: number, row: number): number | null {
  if (col < 0 || row < 0 || col >= r.cols || row >= r.rows) return null;
  const v = r.values[row * r.cols + col];
  if (v === (r.nodata ?? -9999)) return null;
  return v / (r.scale ?? 1);
}
export function sampleRaster(r: GridRaster, lon: number, lat: number): number | null {
  const [dx, dy] = cellSize(r);
  return valueAt(r, Math.floor((lon - r.west) / dx), Math.floor((r.north - lat) / dy));
}
export function rasterRange(r: GridRaster, lo = 0.02, hi = 0.98, ignoreZero = false): [number, number] {
  const vs: number[] = [];
  for (let i = 0; i < r.values.length; i++) { const v = r.values[i]; if (v === (r.nodata ?? -9999) || (ignoreZero && v <= 0)) continue; vs.push(v / (r.scale ?? 1)); }
  vs.sort((a, b) => a - b);
  return [vs[Math.floor(vs.length * lo)] ?? 0, vs[Math.min(vs.length - 1, Math.floor(vs.length * hi))] ?? 1];
}

export interface RenderOpts {
  ramp: Ramp; range: [number, number]; scale?: number;      // output canvas pixels per grid cell
  mask?: UnitFeature[];                                       // clip to these polygons
  log?: boolean; hideZero?: boolean; alpha?: number;
}

/** Paint a raster to a canvas (bilinear-smoothed for display; mask keeps it inside Karachi's units). */
export function renderRaster(r: GridRaster, o: RenderOpts): HTMLCanvasElement {
  const k = o.scale ?? 4;
  const small = document.createElement('canvas');
  small.width = r.cols; small.height = r.rows;
  const sctx = small.getContext('2d')!;
  const img = sctx.createImageData(r.cols, r.rows);
  const [lo, hi] = o.range;
  const f = (v: number) => (o.log ? Math.log10(1 + Math.max(0, v)) : v);
  const flo = f(lo), fhi = f(hi);
  for (let i = 0; i < r.values.length; i++) {
    const raw = r.values[i];
    const nodata = raw === (r.nodata ?? -9999) || (o.hideZero && raw <= 0);
    if (nodata) { img.data[i * 4 + 3] = 0; continue; }
    const v = raw / (r.scale ?? 1);
    const t = (f(v) - flo) / (fhi - flo || 1);
    const [R, G, B] = rampRGB(o.ramp, t);
    img.data[i * 4] = R; img.data[i * 4 + 1] = G; img.data[i * 4 + 2] = B; img.data[i * 4 + 3] = Math.round(255 * (o.alpha ?? 1));
  }
  sctx.putImageData(img, 0, 0);

  const out = document.createElement('canvas');
  out.width = r.cols * k; out.height = r.rows * k;
  const ctx = out.getContext('2d')!;
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(small, 0, 0, out.width, out.height);

  if (o.mask?.length) {
    const [dx, dy] = cellSize(r);
    const m = document.createElement('canvas'); m.width = out.width; m.height = out.height;
    const mctx = m.getContext('2d')!;
    mctx.fillStyle = '#fff';
    for (const u of o.mask) {
      const polys = u.geometry.type === 'Polygon' ? [u.geometry.coordinates] : u.geometry.coordinates;
      for (const poly of polys) {
        mctx.beginPath();
        for (const ring of poly) ring.forEach(([lon, lat], i) => { const x = ((lon - r.west) / dx) * k, y = ((r.north - lat) / dy) * k; i ? mctx.lineTo(x, y) : mctx.moveTo(x, y); });
        mctx.fill('evenodd');
      }
    }
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(m, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
  }
  return out;
}
