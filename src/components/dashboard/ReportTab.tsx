import { useMemo, useRef, useState } from 'react';
import { useTerra } from '../../lib/data';
import { useLogs } from '../../lib/logs';
import { buildCityInsights } from '../../lib/insights';
import { buildReportHtml, scopeUnits, type ReportOptions, type Scope } from '../../lib/report';
import { downloadText, unitsToCsv } from '../../lib/export';
import { DEFAULT_WEIGHTS } from '../../lib/risk';
import { Seg, Slider, Toggle } from '../ui';
import { ArrowRight, Check, Doc, Download, Reset, Table } from '../icons';
import { hrefFor } from '../../lib/hooks';
import { useAuth } from '../../lib/auth';
import { useScenario } from '../../lib/scenarioState';

type SectionKey = keyof ReportOptions['sections'];
const SECTIONS: { key: SectionKey; label: string; hint: string }[] = [
  { key: 'summary', label: 'Executive summary', hint: 'Headline numbers and a plain-language overview' },
  { key: 'findings', label: 'Key findings', hint: 'Evidence-backed insights with confidence levels' },
  { key: 'ranking', label: 'Risk ranking', hint: 'Chart and table of the Heat Risk Index' },
  { key: 'profiles', label: 'Neighbourhood profiles', hint: 'Per-unit indicators and opportunities' },
  { key: 'scenario', label: 'Scenario analysis', hint: 'Follows whatever you set in the Scenario lab' },
  { key: 'volunteer', label: 'Field observations', hint: 'Your volunteers’ logs and their review status' },
  { key: 'method', label: 'Data, method & limits', hint: 'Sources, formula and honest caveats' },
];

export function ReportTab({ picks }: { picks: string[] }) {
  const { data, scores, weights, setWeights, medians, baseline } = useTerra();
  const { logs } = useLogs();
  const { session } = useAuth();
  const sc = useScenario();
  const frame = useRef<HTMLIFrameElement>(null);
  const [opts, setOpts] = useState<ReportOptions>({
    title: 'Extreme heat in Karachi: where risk is highest', author: '', organisation: session?.org?.name ?? '', scope: 'all', picks, verifiedOnly: false,
    sections: { summary: true, findings: true, ranking: true, profiles: true, scenario: true, volunteer: true, method: true },
  });
  const [saved, setSaved] = useState(false);
  const [showWeights, setShowWeights] = useState(false);
  const set = (p: Partial<ReportOptions>) => setOpts((o) => ({ ...o, ...p }));
  const effective: ReportOptions = { ...opts, picks: opts.scope === 'picks' ? picks : opts.picks };

  const insights = useMemo(() => buildCityInsights(data.units, scores, weights, data.meta), [data, scores, weights]);
  const html = useMemo(() => buildReportHtml(effective, { units: data.units, scores, weights, meta: data.meta, insights, logs, medians, baseline, scenario: { s: sc.s, target: sc.target, unitId: sc.unitId } }), // eslint-disable-line react-hooks/exhaustive-deps
    [opts, picks, data, scores, weights, insights, logs, medians, baseline, sc.s, sc.target, sc.unitId]);
  const nScoped = scopeUnits(effective, { units: data.units, scores }).length;
  const fname = (opts.title || 'terrawatch-report').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'terrawatch-report';

  const download = () => { downloadText(`${fname}.html`, html, 'text/html'); setSaved(true); setTimeout(() => setSaved(false), 2200); };
  const print = () => { frame.current?.contentWindow?.focus(); frame.current?.contentWindow?.print(); };

  return (
    <div className="tab-body container-wide report-tab">
      <div className="report-layout">
        <div className="report-controls card card-pad">
          <div className="card-title"><div><h3>Build your report</h3><p>Everything is generated from the dashboard data. Change an option and the preview updates instantly.</p></div></div>

          <div className="lab-block">
            <label className="layer-label" htmlFor="rt">Title</label>
            <input id="rt" className="field" value={opts.title} onChange={(e) => set({ title: e.target.value })} style={{ width: '100%' }} />
            <div className="two-fields">
              <div><label className="layer-label" htmlFor="ra">Prepared by</label><input id="ra" className="field" placeholder="Your name" value={opts.author} onChange={(e) => set({ author: e.target.value })} style={{ width: '100%' }} /></div>
              <div><label className="layer-label" htmlFor="ro">School / team</label><input id="ro" className="field" placeholder="Optional" value={opts.organisation} onChange={(e) => set({ organisation: e.target.value })} style={{ width: '100%' }} /></div>
            </div>
          </div>

          <div className="lab-block">
            <div className="layer-label">Scope</div>
            <Seg<Scope> label="Report scope" value={opts.scope} onChange={(v) => set({ scope: v })} options={[{ value: 'all', label: 'All units' }, { value: 'top10', label: 'Top 10 risk' }, { value: 'picks', label: `My comparison (${picks.length})` }]} />
            <span className="muted" style={{ fontSize: 12 }}>{nScoped} unit{nScoped === 1 ? '' : 's'} in tables and profiles{opts.scope === 'picks' && !picks.length ? ' — pick units in “Compare & rank” first' : ''}.</span>
          </div>

          <div className="lab-block">
            <div className="layer-label">Sections</div>
            <div className="section-toggles">
              {SECTIONS.map((s) => (
                <div key={s.key} className="section-toggle">
                  <Toggle checked={opts.sections[s.key]} onChange={(v) => set({ sections: { ...opts.sections, [s.key]: v } })}>{s.label}{s.key === 'volunteer' && <span className="chip" style={{ marginLeft: 8, height: 20, fontSize: 11 }}>{logs.length} logs</span>}{s.key === 'scenario' && <span className="chip" style={{ marginLeft: 8, height: 20, fontSize: 11 }}>{sc.touched ? 'scenario set' : 'none set'}</span>}</Toggle>
                  <span className="muted section-hint">{s.hint}</span>
                </div>
              ))}
            </div>
          </div>

          {opts.sections.volunteer && <div className="lab-block"><Toggle checked={opts.verifiedOnly} onChange={(v) => set({ verifiedOnly: v })}>Verified field logs only</Toggle></div>}

          <div className="lab-block">
            <button className="btn btn-ghost btn-sm" onClick={() => setShowWeights((x) => !x)} aria-expanded={showWeights} style={{ justifySelf: 'start' }}>{showWeights ? 'Hide' : 'Adjust'} index weights</button>
            {showWeights && (
              <div className="weights">
                <Slider label="Hazard weight" value={weights.hazard} min={0} max={1} step={0.05} onChange={(v) => setWeights({ ...weights, hazard: v })} format={(v) => v.toFixed(2)} fill="var(--c-heat)" />
                <Slider label="Exposure weight" value={weights.exposure} min={0} max={1} step={0.05} onChange={(v) => setWeights({ ...weights, exposure: v })} format={(v) => v.toFixed(2)} fill="var(--c-pop)" />
                <Slider label="Vulnerability weight" value={weights.vulnerability} min={0} max={1} step={0.05} onChange={(v) => setWeights({ ...weights, vulnerability: v })} format={(v) => v.toFixed(2)} fill="var(--c-veg)" />
                <Slider label="Night-time share of hazard" value={weights.night} min={0} max={1} step={0.05} onChange={(v) => setWeights({ ...weights, night: v })} format={(v) => v.toFixed(2)} />
                <Slider label="Vegetation share of vulnerability" value={weights.green} min={0} max={1} step={0.05} onChange={(v) => setWeights({ ...weights, green: v })} format={(v) => v.toFixed(2)} />
                <button className="btn btn-ghost btn-sm" onClick={() => setWeights(DEFAULT_WEIGHTS)} style={{ justifySelf: 'start' }}><Reset />Reset weights</button>
              </div>
            )}
          </div>

          <div className="report-actions">
            <button className={`btn btn-primary ${saved ? 'is-success' : ''}`} onClick={download}>{saved ? <><Check />Saved</> : <><Download />Download report (HTML)</>}</button>
            <button className="btn" onClick={print}><Doc />Print / Save as PDF</button>
            <button className="btn btn-ghost" onClick={() => downloadText('terrawatch-karachi-units.csv', unitsToCsv(data.units, scores), 'text/csv')}><Table />Data (CSV)</button>
          </div>

          <a className="next-step card-glow" href={hrefFor({ tab: 'org' })}>
            <span><b>Next: review volunteer logs</b><small>Verify field observations in the Org console — verified logs strengthen this report.</small></span><ArrowRight />
          </a>
        </div>

        <div className="report-preview">
          <div className="preview-bar muted"><span className="chip"><i className="dot" style={{ color: 'var(--emerald-400)' }} />Live preview</span><span>Downloaded file = this exact document. Use “Print / Save as PDF” for a paper copy.</span></div>
          <iframe ref={frame} title="Report preview" srcDoc={html} className="report-frame" />
        </div>
      </div>
    </div>
  );
}
