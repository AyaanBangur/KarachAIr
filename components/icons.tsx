import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement>;
const base = (p: P): P => ({ viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, ...p });

export const ArrowRight = (p: P) => <svg {...base(p)} className={`arrow ${p.className || ''}`}><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
export const ChevronDown = (p: P) => <svg {...base(p)}><path d="m6 9 6 6 6-6" /></svg>;
export const Close = (p: P) => <svg {...base(p)}><path d="M6 6l12 12M18 6 6 18" /></svg>;
export const Check = (p: P) => <svg {...base(p)}><path d="m5 12 5 5 9-10" /></svg>;
export const Menu = (p: P) => <svg {...base(p)}><path d="M4 7h16M4 12h16M4 17h16" /></svg>;
export const Download = (p: P) => <svg {...base(p)}><path d="M12 4v11m0 0-4-4m4 4 4-4M5 19h14" /></svg>;
export const Info = (p: P) => <svg {...base(p)}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>;
export const Alert = (p: P) => <svg {...base(p)}><path d="M12 4 3 20h18L12 4Z" /><path d="M12 10v4M12 17h.01" /></svg>;
export const Thermometer = (p: P) => <svg {...base(p)}><path d="M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0Z" /><path d="M12 9v7" /></svg>;
export const Flame = (p: P) => <svg {...base(p)}><path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 .3 1.4 1 2 2 2 0-3-.5-5 1-8Z" /></svg>;
export const Leaf = (p: P) => <svg {...base(p)}><path d="M5 19c0-8 5-14 15-14 0 9-5 15-13 15" /><path d="M5 19c3-5 6-8 10-10" /></svg>;
export const Users = (p: P) => <svg {...base(p)}><circle cx="9" cy="8" r="3.2" /><path d="M3 19c.5-3.4 3-5 6-5s5.5 1.6 6 5" /><path d="M16 5.2a3 3 0 0 1 0 5.6M18 14.2c1.8.6 2.7 2 3 4.8" /></svg>;
export const Cross = (p: P) => <svg {...base(p)}><rect x="4" y="4" width="16" height="16" rx="4" /><path d="M12 8v8M8 12h8" /></svg>;
export const MapIcon = (p: P) => <svg {...base(p)}><path d="m3 6 6-2 6 2 6-2v14l-6 2-6-2-6 2V6Z" /><path d="M9 4v14M15 6v14" /></svg>;
export const Layers = (p: P) => <svg {...base(p)}><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 13 9 5 9-5" /></svg>;
export const Sliders = (p: P) => <svg {...base(p)}><path d="M5 4v6M5 14v6M12 4v2M12 10v10M19 4v10M19 18v2" /><circle cx="5" cy="12" r="2" /><circle cx="12" cy="8" r="2" /><circle cx="19" cy="16" r="2" /></svg>;
export const Trend = (p: P) => <svg {...base(p)}><path d="m3 17 6-6 4 4 8-9" /><path d="M15 6h6v6" /></svg>;
export const Compare = (p: P) => <svg {...base(p)}><path d="M8 4v16M16 4v16" /><path d="M4 8h4M16 14h4" /></svg>;
export const Doc = (p: P) => <svg {...base(p)}><path d="M7 3h7l5 5v13H7V3Z" /><path d="M14 3v5h5M10 13h6M10 17h6" /></svg>;
export const Satellite = (p: P) => <svg {...base(p)}><path d="m9 9 6 6M4 20l4-4M14 4l6 6-3 3-6-6 3-3Z" /><path d="M4 10l6 6-3 3-6-6 3-3Z" /><path d="M17 20a4 4 0 0 0 3-3" /></svg>;
export const External = (p: P) => <svg {...base(p)}><path d="M14 4h6v6M20 4l-9 9M18 14v5H5V6h5" /></svg>;
export const Sparkle = (p: P) => <svg {...base(p)}><path d="M12 3c.6 4.6 2.4 6.4 7 7-4.6.6-6.4 2.4-7 7-.6-4.6-2.4-6.4-7-7 4.6-.6 6.4-2.4 7-7Z" /><path d="M19 17v4M17 19h4" /></svg>;
export const Table = (p: P) => <svg {...base(p)}><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M3 10h18M9 10v10" /></svg>;
export const Pin = (p: P) => <svg {...base(p)}><path d="M12 21s7-6 7-11a7 7 0 1 0-14 0c0 5 7 11 7 11Z" /><circle cx="12" cy="10" r="2.5" /></svg>;
export const Droplet = (p: P) => <svg {...base(p)}><path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z" /></svg>;
export const Reset = (p: P) => <svg {...base(p)}><path d="M4 12a8 8 0 1 0 3-6.2M4 4v5h5" /></svg>;
export const Play = (p: P) => <svg {...base(p)}><path d="M7 5v14l12-7L7 5Z" /></svg>;
export const Moon = (p: P) => <svg {...base(p)}><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z" /></svg>;

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <defs>
        <linearGradient id="lg" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stopColor="#1fa3bd" /><stop offset=".55" stopColor="#b8f04a" /><stop offset="1" stopColor="#f4a93d" /></linearGradient>
      </defs>
      <circle cx="32" cy="32" r="21" fill="none" stroke="url(#lg)" strokeWidth="5" />
      <path d="M13 37c7-7 12 5 19-2s11 3 19-4" fill="none" stroke="url(#lg)" strokeWidth="4.5" strokeLinecap="round" />
      <circle cx="32" cy="32" r="4.4" fill="#f4a93d" />
    </svg>
  );
}
