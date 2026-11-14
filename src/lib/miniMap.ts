// Tiny SVG map of Karachi's units, used by the Org console (React) and the Report (HTML string).
import type { UnitFeature } from './types';
import { makeProjection } from './geo';

const VIEW = { west: 66.82, east: 67.48, south: 24.76, north: 25.14 };
export interface MiniPath { id: string; d: string; cx: number; cy: number }

export function miniMapPaths(units: UnitFeature[], w = 600, h = 400): MiniPath[] {
  const pr = makeProjection(VIEW, w, h, 6);
  return units.map((u) => {
    const polys = u.geometry.type === 'Polygon' ? [u.geometry.coordinates] : u.geometry.coordinates;
    const d = polys.map((poly) => poly.map((ring) => ring.map(([lon, lat], i) => { const [x, y] = pr.toXY(lon, lat); return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`; }).join('') + 'Z').join('')).join('');
    const [cx, cy] = pr.toXY(u.properties.centroid[0], u.properties.centroid[1]);
    return { id: u.properties.id, d, cx, cy };
  });
}
