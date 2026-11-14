import { useState } from 'react';
import type { Insight } from '../../lib/insights';
import { ConfidenceBadge, KindTag } from '../ui';
import { Alert, ArrowRight, ChevronDown, Cross, Flame, Info, Leaf, Moon, Trend, Users } from '../icons';

const ICONS = { flame: Flame, moon: Moon, users: Users, cross: Cross, leaf: Leaf, trend: Trend, alert: Alert, info: Info };
const TONES: Record<Insight['tone'], string> = { heat: 'var(--c-heat)', veg: 'var(--c-veg)', pop: 'var(--c-pop)', cool: 'var(--c-cool)', alert: 'var(--c-alert)', gap: 'var(--ink-3)' };

/** Gemini-style structured insight: headline first, evidence and method on demand. */
export function InsightCard({ insight, onOpenUnit, defaultOpen = false }: { insight: Insight; onOpenUnit?: (id: string) => void; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const Icon = ICONS[insight.icon];
  const tone = TONES[insight.tone];
  return (
    <article className={`insight ${open ? 'open' : ''}`} style={{ '--tone': tone } as React.CSSProperties}>
      <button className="insight-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="insight-icon"><Icon /></span>
        <span className="insight-text">
          <span className="insight-kicker">{insight.title}</span>
          <span className="insight-headline">{insight.headline}</span>
        </span>
        <ChevronDown className="chev" />
      </button>
      {open && (
        <div className="insight-body">
          <p>{insight.body}</p>
          <div className="evidence">
            {insight.evidence.map((e) => (
              <div key={e.label} className="ev"><span className="ev-label">{e.label}</span><span className="ev-value mono">{e.value}</span><KindTag kind={e.kind} /></div>
            ))}
          </div>
          <div className="insight-foot">
            <ConfidenceBadge c={insight.confidence} />
            {insight.unitId && onOpenUnit && <button className="btn btn-ghost btn-sm" onClick={() => onOpenUnit(insight.unitId!)}>Show on map <ArrowRight /></button>}
          </div>
          <p className="insight-conf muted">{insight.confidence.reason}</p>
          <details className="insight-how"><summary>How this was computed</summary><p>{insight.how}</p></details>
        </div>
      )}
    </article>
  );
}
