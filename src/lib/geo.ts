import type { UnitFeature } from './types';

type Ring = number[][];
const inRing = (x: number, y: number, ring: Ring) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

const boxCache = new WeakMap<UnitFeature, [number, number, number, number]>();
function boxOf(u: UnitFeature) {
  let b = boxCache.get(u);
  if (b) return b;
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  const polys = u.geometry.type === 'Polygon' ? [u.geometry.coordinates] : u.geometry.coordinates;
  for (const p of polys) for (const [x, y] of p[0]) { if (x < w) w = x; if (x > e) e = x; if (y < s) s = y; if (y > n) n = y; }
  b = [w, s, e, n]; boxCache.set(u, b);
  return b;
}

export function unitAt(units: UnitFeature[], lon: number, lat: number): UnitFeature | null {
  for (const u of units) {
    const [w, s, e, n] = boxOf(u);
    if (lon < w || lon > e || lat < s || lat > n) continue;
    const polys = u.geometry.type === 'Polygon' ? [u.geometry.coordinates] : u.geometry.coordinates;
    for (const p of polys) {
      if (!inRing(lon, lat, p[0])) continue;
      if (p.slice(1).some((h) => inRing(lon, lat, h))) continue;
      return u;
    }
  }
  return null;
}

export interface View { west: number; south: number; east: number; north: number }
/** Equirectangular projection (cos-latitude corrected) that fits `view` inside w×h with padding. */
export function makeProjection(view: View, w: number, h: number, pad = 0) {
  const lat0 = ((view.south + view.north) / 2) * (Math.PI / 180);
  const kx = Math.cos(lat0);
  const spanX = (view.east - view.west) * kx, spanY = view.north - view.south;
  const s = Math.min((w - 2 * pad) / spanX, (h - 2 * pad) / spanY);
  const ox = (w - spanX * s) / 2, oy = (h - spanY * s) / 2;
  return {
    toXY: (lon: number, lat: number): [number, number] => [ox + (lon - view.west) * kx * s, oy + (view.north - lat) * s],
    toLonLat: (x: number, y: number): [number, number] => [view.west + (x - ox) / (kx * s), view.north - (y - oy) / s],
    scale: s, kx,
  };
}
export type Projection = ReturnType<typeof makeProjection>;
