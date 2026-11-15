export const fmtInt = (v: number | null | undefined) => (v == null || Number.isNaN(v) ? 'n/a' : Math.round(v).toLocaleString('en-US'));
export const fmtDec = (v: number | null | undefined, d = 1) => (v == null || Number.isNaN(v) ? 'n/a' : v.toFixed(d));
export const fmtTemp = (v: number | null | undefined, d = 1) => (v == null || Number.isNaN(v) ? 'n/a' : `${v.toFixed(d)}°C`);
export const fmtDelta = (v: number | null | undefined, d = 1, unit = '') => {
  if (v == null || Number.isNaN(v)) return 'n/a';
  const s = v > 0 ? '+' : v < 0 ? '−' : '±';
  return `${s}${Math.abs(v).toFixed(d)}${unit}`;
};
export const fmtPct = (v: number | null | undefined, d = 0) => (v == null || Number.isNaN(v) ? 'n/a' : `${(v * 100).toFixed(d)}%`);
export function fmtCompact(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return 'n/a';
  const a = Math.abs(v);
  if (a >= 1e6) return `${(v / 1e6).toFixed(a >= 1e7 ? 1 : 2)}M`;
  if (a >= 1e3) return `${(v / 1e3).toFixed(a >= 1e4 ? 0 : 1)}K`;
  return `${Math.round(v)}`;
}
export const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN; };
export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const ordinal = (n: number) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
export function fmtDate(iso: string) { const d = new Date(iso); return Number.isNaN(+d) ? iso : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); }
