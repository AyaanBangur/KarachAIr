import { useState, type ReactNode } from 'react';
import { Seg } from '../ui';

/** Shared chart tokens (CSS vars so the palette stays in one place). */
export const AX = { stroke: 'var(--line)', tick: { fill: '#959c90', fontSize: 11 } as const, line: { stroke: 'rgba(236,240,226,0.16)' } };
export const GRID = { stroke: 'rgba(236,240,226,0.07)', vertical: false as const };
export const SERIES = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)'];
export const SERIES_HEX = ['#1fa3bd', '#d9772a', '#8f80e8', '#639f26'];
export const COOL = '#2d7fa6', WARM = '#e8602c';

interface TableSpec { head: string[]; rows: (string | number)[][] }

/** Card with title, subtitle and a Chart ⇄ Table switch — every chart ships its table twin (accessibility + trust). */
export function ChartFrame({ title, subtitle, table, children, aside, height = 300, source, legend }: { title: string; subtitle?: string; table?: TableSpec; children: ReactNode; aside?: ReactNode; height?: number; source?: string; legend?: ReactNode }) {
  const [view, setView] = useState<'chart' | 'table'>('chart');
  return (
    <section className="card card-pad chart-frame" aria-label={title}>
      <div className="card-title">
        <div><h3>{title}</h3>{subtitle && <p>{subtitle}</p>}</div>
        <div className="chart-actions">
          {aside}
          {table && <Seg<'chart' | 'table'> label={`${title} view`} value={view} onChange={setView} options={[{ value: 'chart', label: 'Chart' }, { value: 'table', label: 'Table' }]} />}
        </div>
      </div>
      {view === 'chart' || !table ? (
        <>
          <div className="chart-body" style={{ height }}>{children}</div>
          {legend && <div className="chart-legend">{legend}</div>}
        </>
      ) : (
        <div className="table-wrap" style={{ maxHeight: height + 40 }}>
          <table className="data-table">
            <thead><tr>{table.head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>{table.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={j ? 'num' : ''}>{c}</td>)}</tr>)}</tbody>
          </table>
        </div>
      )}
      {source && <div className="chart-source">Source: {source}</div>}
    </section>
  );
}

export interface TTRow { color?: string; label: string; value: string; dim?: boolean }
export function TooltipBox({ title, rows, foot }: { title?: ReactNode; rows: TTRow[]; foot?: ReactNode }) {
  return (
    <div className="tt glass">
      {title && <div className="tt-title">{title}</div>}
      {rows.map((r, i) => (
        <div key={i} className={`tt-row ${r.dim ? 'dim' : ''}`}>
          {r.color ? <i style={{ background: r.color }} /> : <i className="none" />}
          <span>{r.label}</span><b className="mono">{r.value}</b>
        </div>
      ))}
      {foot && <div className="tt-foot">{foot}</div>}
    </div>
  );
}

/** Small legend row: colored mark beside text (text never wears the data colour). */
export function Legend({ items }: { items: { color: string; label: string; kind?: 'dot' | 'line' | 'bar' }[] }) {
  return (
    <div className="legend" role="list">
      {items.map((it) => (
        <span key={it.label} role="listitem" className="legend-item"><i className={`mark ${it.kind ?? 'dot'}`} style={{ background: it.color }} />{it.label}</span>
      ))}
    </div>
  );
}
