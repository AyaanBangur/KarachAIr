// Colour ramps. Each environmental category has its own hue family so colour always carries meaning.
export type RGB = [number, number, number];

const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
export type Ramp = { stops: [number, RGB][] };
const ramp = (pairs: [number, string][]): Ramp => ({ stops: pairs.map(([t, h]) => [t, hex(h)]) });

/** Heat: cool indigo → teal → pale lemon → amber → orange → crimson. Always shown with a scale legend. */
export const THERMAL = ramp([
  [0, '#24407a'], [0.18, '#2d7fa6'], [0.36, '#4cb3a6'], [0.52, '#e6dc8a'], [0.68, '#f5a93b'], [0.84, '#e8602c'], [1, '#d62f4b'],
]);
/** Vegetation: dark forest → lime. */
export const GREEN = ramp([[0, '#14231c'], [0.28, '#1f5b3a'], [0.55, '#3a9a46'], [0.8, '#8bd43a'], [1, '#e1f77c']]);
/** Population: indigo → violet → lavender. */
export const VIOLET = ramp([[0, '#191633'], [0.3, '#3a2f7a'], [0.6, '#6b58c9'], [0.85, '#a894f5'], [1, '#e6deff']]);
/** Cooling / health access: deep teal → ice cyan. */
export const CYAN = ramp([[0, '#0f2a30'], [0.3, '#146a78'], [0.6, '#2aa7b8'], [0.85, '#7fe0ea'], [1, '#d9fbff']]);

export function rampRGB(r: Ramp, t: number): RGB {
  const x = Math.min(1, Math.max(0, t));
  const s = r.stops;
  for (let i = 1; i < s.length; i++) {
    if (x <= s[i][0]) {
      const [t0, c0] = s[i - 1], [t1, c1] = s[i];
      const k = (x - t0) / (t1 - t0 || 1);
      return [Math.round(c0[0] + (c1[0] - c0[0]) * k), Math.round(c0[1] + (c1[1] - c0[1]) * k), Math.round(c0[2] + (c1[2] - c0[2]) * k)];
    }
  }
  return s[s.length - 1][1];
}
export const rampCss = (r: Ramp, t: number, a = 1) => { const [R, G, B] = rampRGB(r, t); return a === 1 ? `rgb(${R},${G},${B})` : `rgba(${R},${G},${B},${a})`; };
export const rampGradient = (r: Ramp) => `linear-gradient(90deg, ${r.stops.map(([t, c]) => `rgb(${c.join(',')}) ${Math.round(t * 100)}%`).join(', ')})`;

export const thermal = (t: number, a = 1) => rampCss(THERMAL, t, a);

export interface Tier { key: 'low' | 'moderate' | 'high' | 'severe' | 'extreme'; label: string; color: string; min: number; glyph: string }
/** Risk tiers. Cutoffs (40/52/60/68) are calibrated to Karachi's observed index range (≈22–75), so tiers describe standing
 *  *within Karachi*, not an absolute danger level. Each tier is paired with a label + glyph so colour is never the only signal. */
export const TIERS: Tier[] = [
  { key: 'low', label: 'Low', color: '#2d8fb0', min: 0, glyph: '○' },
  { key: 'moderate', label: 'Moderate', color: '#d6d27c', min: 40, glyph: '◔' },
  { key: 'high', label: 'High', color: '#f5a93b', min: 52, glyph: '◑' },
  { key: 'severe', label: 'Severe', color: '#e8602c', min: 60, glyph: '◕' },
  { key: 'extreme', label: 'Extreme', color: '#d62f4b', min: 68, glyph: '●' },
];
export const tierFor = (index: number): Tier => { let t = TIERS[0]; for (const x of TIERS) if (index >= x.min) t = x; return t; };
