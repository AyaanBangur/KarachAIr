import { useId, type CSSProperties, type ReactNode } from 'react';
import { ChevronDown, Info } from './icons';
import { tierFor, TIERS } from '../lib/colors';
import type { Confidence } from '../lib/risk';

export function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="tablist" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="track" />
      <span>{children}</span>
    </label>
  );
}

export function Slider({ value, min, max, step, onChange, label, fill, format }: { value: number; min: number; max: number; step: number; onChange: (v: number) => void; label: string; fill?: string; format?: (v: number) => string }) {
  const id = useId();
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="slider-row">
      <div className="slider-head">
        <label htmlFor={id}>{label}</label>
        <output htmlFor={id} className="mono">{format ? format(value) : value}</output>
      </div>
      <input id={id} className="slider" type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))}
        style={{ '--pct': `${pct}%`, ...(fill ? { '--fill': fill } : {}) } as CSSProperties} />
    </div>
  );
}

export function Expand({ title, children, defaultOpen = false, aside }: { title: ReactNode; children: ReactNode; defaultOpen?: boolean; aside?: ReactNode }) {
  return (
    <details className="expand" open={defaultOpen}>
      <summary><span>{title}</span><span className="expand-aside">{aside}<ChevronDown className="chev" /></span></summary>
      <div className="expand-body">{children}</div>
    </details>
  );
}

export function TierBadge({ index, compact }: { index: number; compact?: boolean }) {
  const t = tierFor(index);
  return (
    <span className="chip tier-badge" style={{ color: t.color, borderColor: `${t.color}55`, background: `${t.color}14` }} title={`${t.label} relative heat risk`}>
      <span aria-hidden>{t.glyph}</span>{compact ? t.label : `${t.label} risk`}
    </span>
  );
}

export function ConfidenceBadge({ c }: { c: Confidence }) {
  const col = { high: 'var(--emerald-400)', medium: 'var(--c-warn)', low: 'var(--c-alert)' }[c.level];
  return (
    <span className="chip conf-badge" style={{ color: col, borderColor: `color-mix(in srgb, ${col} 35%, transparent)`, background: `color-mix(in srgb, ${col} 9%, transparent)` }} title={c.reason}>
      <span className="conf-bars" aria-hidden>
        {[0, 1, 2].map((i) => <i key={i} style={{ opacity: i <= ['low', 'medium', 'high'].indexOf(c.level) ? 1 : 0.22 }} />)}
      </span>
      {c.level[0].toUpperCase() + c.level.slice(1)} confidence
    </span>
  );
}

export function KindTag({ kind }: { kind: 'measured' | 'derived' | 'assumption' }) {
  const label = { measured: 'Measured', derived: 'Derived', assumption: 'Assumption' }[kind];
  return <span className={`chip tag-${kind}`} style={{ height: 20, fontSize: 10.5, padding: '0 8px', letterSpacing: '.04em', textTransform: 'uppercase' }}>{label}</span>;
}

export function InfoNote({ children }: { children: ReactNode }) {
  return <div className="callout info"><Info />{<span>{children}</span>}</div>;
}

/** Horizontal gradient legend with end labels — every colour scale in the app ships with one. */
export function ScaleLegend({ gradient, min, max, unit, label }: { gradient: string; min: string; max: string; unit?: string; label: string }) {
  return (
    <div className="scale-legend" role="img" aria-label={`${label}: from ${min} to ${max}${unit ? ' ' + unit : ''}`}>
      <div className="scale-label">{label}</div>
      <div className="legend-bar" style={{ background: gradient }} />
      <div className="scale-ends mono"><span>{min}</span><span>{max}{unit}</span></div>
    </div>
  );
}

export function TierLegend() {
  return (
    <div className="tier-legend" role="list" aria-label="Risk tiers">
      {TIERS.map((t) => <span key={t.key} role="listitem" className="tier-key"><i style={{ background: t.color }} />{t.label}</span>)}
    </div>
  );
}

/** Circular gauge for a 0–100 score, animates on mount. */
export function Gauge({ value, color, size = 112, label }: { value: number; color: string; size?: number; label?: string }) {
  const r = size / 2 - 9, c = 2 * Math.PI * r, v = Math.max(0, Math.min(100, value));
  return (
    <svg className="gauge" width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${label ?? 'Score'} ${v.toFixed(0)} out of 100`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-4)" strokeWidth="8" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
        strokeDasharray={`${(c * v) / 100} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: 'stroke-dasharray .9s var(--ease), stroke .4s', filter: `drop-shadow(0 0 8px ${color}88)` }} />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" fill="var(--ink-1)" fontSize={size * 0.3} fontWeight="600" style={{ fontFamily: 'var(--font-sans)' }}>{v.toFixed(0)}</text>
    </svg>
  );
}

export function StatTile({ label, value, sub, tone, icon }: { label: string; value: ReactNode; sub?: ReactNode; tone?: string; icon?: ReactNode }) {
  return (
    <div className="stat-tile" style={tone ? ({ '--tone': tone } as CSSProperties) : undefined}>
      <div className="stat-label">{icon}{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}
