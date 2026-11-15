import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useTerra } from '../../lib/data';
import { NO_CHANGE, runPortfolio, runScenario, type ScenarioInput } from '../../lib/scenario';
import { TIERS, tierFor } from '../../lib/colors';
import { fmtCompact, fmtDelta, fmtTemp, ordinal } from '../../lib/format';
import { AX, ChartFrame, COOL, TooltipBox, WARM } from '../charts/common';
import { KindTag, Seg, Slider, InfoNote } from '../ui';
import { Reset, Sliders } from '../icons';
import { useScenario, type Target } from '../../lib/scenarioState';

const PRESETS: { id: string; label: string; s: ScenarioInput }[] = [
  { id: 'base', label: 'Today', s: NO_CHANGE },
  { id: 'warm', label: '+2°C warmer, no action', s: { ...NO_CHANGE, warming: 2 } },
  { id: 'trees', label: 'Tree canopy push', s: { ...NO_CHANGE, dNdvi: 0.1 } },
  { id: 'roofs', label: 'Cool-roof programme', s: { ...NO_CHANGE, coolShare: 0.3, coolEffect: 2 } },
  { id: 'both', label: 'Trees + cool roofs, +2°C world', s: { warming: 2, dNdvi: 0.1, coolShare: 0.3, coolEffect: 2 } },
];

export function ScenarioLab({ initialUnit }: { initialUnit: string | null }) {
  const { data, baseline, weights, scores } = useTerra();
  const reg = data.meta.lst?.regression ?? null;
  const ranked = useMemo(() => [...data.units].sort((a, b) => (scores.get(a.properties.id)!.rank) - (scores.get(b.properties.id)!.rank)), [data.units, scores]);
  const sc = useScenario();
  const unitId = initialUnit ?? sc.unitId ?? ranked[0].properties.id;
  const setUnitId = (id: string) => sc.setUnitId(id);
  const { target, setTarget, s, setS } = sc;
  const set = (patch: Partial<ScenarioInput>) => setS({ ...s, ...patch });

  const unit = data.units.find((u) => u.properties.id === unitId)!;
  const targetIds = useMemo(() => new Set(target === 'unit' ? [unitId] : target === 'top5' ? ranked.slice(0, 5).map((u) => u.properties.id) : data.units.map((u) => u.properties.id)), [target, unitId, ranked, data.units]);

  const single = useMemo(() => runScenario(unit, baseline, weights, s, reg), [unit, baseline, weights, s, reg]);
  const port = useMemo(() => runPortfolio(data.units, targetIds, baseline, weights, s, reg), [data.units, targetIds, baseline, weights, s, reg]);

  // Compare canned interventions for the current target.
  const compare = useMemo(() => {
    const rows = PRESETS.slice(1).map((p) => ({ ...p, s: { ...p.s, coolEffect: s.coolEffect ?? p.s.coolEffect } }));
    rows.push({ id: 'custom', label: 'Your scenario', s });
    return rows.map((p) => {
      const pr = runPortfolio(data.units, targetIds, baseline, weights, p.s, reg);
      return { id: p.id, label: p.label, d: pr.popWeightedDLst, idx: pr.meanIndex.after - pr.meanIndex.before };
    });
  }, [data.units, targetIds, baseline, weights, s, reg]);

  const rankAfter = single ? 1 + data.units.filter((u) => u.properties.id !== unitId && scores.get(u.properties.id)!.index > single.next.score.index).length : null;
  const tierBefore = single?.base.score.tier, tierAfter = single ? tierFor(single.next.score.index) : null;
  const isBase = s.warming === 0 && s.dNdvi === 0 && s.coolShare === 0;
  const noReg = !reg;

  return (
    <div className="lab">
      <div className="lab-controls card card-pad">
        <div className="card-title"><div><h3>Scenario lab</h3><p>Change the world, see what moves. Every slider feeds a transparent formula (see below).</p></div>
          <button className="btn btn-ghost btn-sm" onClick={() => { setS(NO_CHANGE); }}><Reset />Reset</button></div>

        <div className="lab-block">
          <div className="layer-label">Apply to</div>
          <Seg<Target> label="Scenario target" value={target} onChange={setTarget} options={[{ value: 'unit', label: 'One unit' }, { value: 'top5', label: 'Top 5 risk' }, { value: 'all', label: 'All units' }]} />
          {target === 'unit' && (
            <select className="select" value={unitId} onChange={(e) => setUnitId(e.target.value)} aria-label="Unit" style={{ width: '100%', marginTop: 8 }}>
              {ranked.map((u) => <option key={u.properties.id} value={u.properties.id}>#{scores.get(u.properties.id)!.rank} · {u.properties.name}</option>)}
            </select>
          )}
        </div>

        <div className="lab-block">
          <div className="layer-label">Presets</div>
          <div className="chip-row wrap">{PRESETS.map((p) => <button key={p.id} className="chip chip-btn" onClick={() => setS(p.s)}>{p.label}</button>)}</div>
        </div>

        <div className="lab-sliders">
          <Slider label="Background warming (what-if, not a forecast)" value={s.warming} min={0} max={4} step={0.5} onChange={(v) => set({ warming: v })} format={(v) => `+${v.toFixed(1)}°C`} fill="var(--c-alert)" />
          <Slider label="Greening, added vegetation (NDVI)" value={s.dNdvi} min={0} max={0.25} step={0.01} onChange={(v) => set({ dNdvi: v })} format={(v) => `+${v.toFixed(2)}`} fill="var(--c-veg)" />
          <Slider label="Cool roofs / reflective pavement, surface treated" value={s.coolShare} min={0} max={1} step={0.05} onChange={(v) => set({ coolShare: v })} format={(v) => `${Math.round(v * 100)}%`} fill="var(--c-cool)" />
          <div>
            <Slider label="…assumed cooling of treated surface" value={s.coolEffect} min={0} max={6} step={0.5} onChange={(v) => set({ coolEffect: v })} format={(v) => `${v.toFixed(1)}°C`} fill="var(--c-warn)" />
            <div style={{ marginTop: 6 }}><KindTag kind="assumption" /> <span className="muted" style={{ fontSize: 12 }}>Not measured in Karachi, replace with a local pilot result.</span></div>
          </div>
        </div>
      </div>

      <div className="lab-results">
        {noReg && <InfoNote>Satellite data is not loaded, so the greening effect cannot be estimated.</InfoNote>}
        {target === 'unit' && single ? (
          <div className="card card-pad card-glow">
            <div className="card-title"><div><h3>{unit.properties.name}</h3><p>{isBase ? 'Move a slider to see the effect.' : 'Outcome under your scenario'}</p></div></div>
            <div className="outcome-grid">
              <Outcome label="Afternoon surface temp" from={fmtTemp(single.base.lstDay)} to={fmtTemp(single.next.lstDay)} delta={`${fmtDelta(single.dLstDay)}°C`} good={single.dLstDay <= 0} />
              <Outcome label="Heat risk index" from={single.base.score.index.toFixed(0)} to={single.next.score.index.toFixed(0)} delta={fmtDelta(single.dIndex, 1)} good={single.dIndex <= 0} />
              <Outcome label="Risk tier" from={tierBefore!.label} to={tierAfter!.label} delta={tierBefore!.key === tierAfter!.key ? 'no change' : TIERS.findIndex((t) => t.key === tierAfter!.key) < TIERS.findIndex((t) => t.key === tierBefore!.key) ? 'improves' : 'worsens'} good={TIERS.findIndex((t) => t.key === tierAfter!.key) <= TIERS.findIndex((t) => t.key === tierBefore!.key)} color={tierAfter!.color} />
              <Outcome label="Rank among 24 units" from={ordinal(scores.get(unitId)!.rank)} to={ordinal(rankAfter!)} delta={rankAfter === scores.get(unitId)!.rank ? 'no change' : rankAfter! > scores.get(unitId)!.rank ? 'less risky' : 'riskier'} good={rankAfter! >= scores.get(unitId)!.rank} />
            </div>
            <div className="lab-contrib">
              <div className="layer-label">What moves the afternoon temperature</div>
              {[{ k: 'Background warming', v: single.parts.warming }, { k: `Greening (${fmtDelta(s.dNdvi, 2)} NDVI)`, v: single.parts.greening }, { k: `Cool surfaces (${Math.round(s.coolShare * 100)}%)`, v: single.parts.coolSurfaces }].map((r) => (
                <div key={r.k} className="contrib-row"><span>{r.k}</span><span className="contrib-track"><i style={{ width: `${Math.min(100, Math.abs(r.v) * 24)}%`, background: r.v > 0 ? WARM : COOL, marginLeft: r.v < 0 ? 'auto' : 0 }} /></span><b className="mono">{fmtDelta(r.v, 2)}°C</b></div>
              ))}
            </div>
          </div>
        ) : (
          <div className="card card-pad card-glow">
            <div className="card-title"><div><h3>{target === 'top5' ? 'Five highest-risk units' : 'All 24 units'}</h3><p>{isBase ? 'Move a slider to see the effect.' : 'Combined outcome under your scenario'}</p></div></div>
            <div className="outcome-grid">
              <Outcome label="Residents in treated units" from="" to={fmtCompact(port.popAffected)} delta="people" good />
              <Outcome label="Population-weighted LST change" from="" to={`${fmtDelta(port.popWeightedDLst)}°C`} delta="afternoon" good={port.popWeightedDLst <= 0} />
              <Outcome label="Mean risk index (all units)" from={port.meanIndex.before.toFixed(1)} to={port.meanIndex.after.toFixed(1)} delta={fmtDelta(port.meanIndex.after - port.meanIndex.before, 1)} good={port.meanIndex.after <= port.meanIndex.before} />
              <Outcome label="People in Severe/Extreme units" from={fmtCompact(port.peopleSevere.before)} to={fmtCompact(port.peopleSevere.after)} delta={fmtDelta((port.peopleSevere.after - port.peopleSevere.before) / 1e6, 2, 'M')} good={port.peopleSevere.after <= port.peopleSevere.before} />
            </div>
          </div>
        )}

        <ChartFrame title="Which lever does most?" height={250} subtitle={`Population-weighted change in afternoon surface temperature across ${target === 'unit' ? unit.properties.short : target === 'top5' ? 'the top-5 units' : 'all units'}, per intervention (°C; negative is cooler).`}
          table={{ head: ['Scenario', 'ΔLST (°C)', 'Δ mean risk index'], rows: compare.map((c) => [c.label, fmtDelta(c.d, 2), fmtDelta(c.idx, 2)]) }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={compare} layout="vertical" margin={{ top: 4, right: 56, left: 4, bottom: 0 }} barCategoryGap={8}>
              <CartesianGrid stroke="rgba(236,240,226,0.07)" horizontal={false} />
              <XAxis type="number" tick={AX.tick} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${v > 0 ? '+' : ''}${v}°`} domain={['auto', 'auto']} />
              <YAxis type="category" dataKey="label" width={170} tick={{ fill: '#c9c8ba', fontSize: 12 }} axisLine={AX.line} tickLine={false} interval={0} />
              <ReferenceLine x={0} stroke="rgba(236,240,226,0.28)" />
              <Tooltip cursor={{ fill: 'rgba(255,255,255,0.05)' }} content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload as (typeof compare)[number];
                return <TooltipBox title={d.label} rows={[{ color: d.d > 0 ? WARM : COOL, label: 'Afternoon surface temp', value: `${fmtDelta(d.d, 2)}°C` }, { label: 'Mean risk index', value: fmtDelta(d.idx, 2), dim: true }]} />;
              }} />
              <Bar dataKey="d" maxBarSize={16} isAnimationActive={false} radius={[3, 3, 3, 3]} label={{ position: 'right', fill: '#c9c8ba', fontSize: 11, formatter: (v: unknown) => `${fmtDelta(v as number, 2)}°` }}>
                {compare.map((c) => <Cell key={c.id} fill={c.d > 0 ? WARM : c.d < 0 ? COOL : 'rgba(150,156,144,0.6)'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartFrame>

        <div className="callout">
          <Sliders />
          <span><b>How to read this.</b> ΔLST = warming + β·ΔNDVI − treated share × assumed cooling. {reg ? <>β = {reg.slopePerNdvi.toFixed(1)}°C per 1.0 NDVI (±{(reg.ci95Per0p1 * 10).toFixed(1)} at 95%), measured across {reg.n.toLocaleString()} inhabited Karachi pixels (R² {reg.r2.toFixed(2)}), an <i>association</i>, so real-world greening may cool more or less. </> : null}Night-time temperature responds only to background warming (we do not assume interventions help at night). The risk index is re-scored on today's scale, so numbers above 100 mean "hotter than anywhere in Karachi today".</span>
        </div>
      </div>
    </div>
  );
}

function Outcome({ label, from, to, delta, good, color }: { label: string; from: string; to: string; delta: string; good: boolean; color?: string }) {
  return (
    <div className="outcome">
      <div className="outcome-label">{label}</div>
      <div className="outcome-vals">{from && <span className="outcome-from mono">{from}</span>}{from && <span className="outcome-arrow">→</span>}<span className="outcome-to" style={color ? { color } : undefined}>{to}</span></div>
      <span className={`chip outcome-delta ${good ? 'good' : 'bad'}`}>{delta}</span>
    </div>
  );
}
