import { useTerra } from '../lib/data';
import { DEFAULT_WEIGHTS } from '../lib/risk';
import { fmtDate } from '../lib/format';
import { External } from '../components/icons';
import { InfoNote } from '../components/ui';

export function Methodology() {
  const { data, weights, setWeights } = useTerra();
  const m = data.meta, reg = m.lst?.regression;
  const w = weights;
  const set = (patch: Partial<typeof w>) => setWeights({ ...w, ...patch });
  return (
    <div className="container method">
      <span className="eyebrow">Methodology &amp; limits</span>
      <h1 className="section-title">How TerraWatch AI reaches its numbers.</h1>
      <p className="lead muted" style={{ maxWidth: '70ch' }}>Everything on this site is computed from open datasets fetched by a reproducible pipeline (<code>npm run data</code>). Data build: {fmtDate(m.generatedAt)}. Below: what we use, how we combine it, and — just as important — what it cannot tell you.</p>

      <h2>What this is — and is not</h2>
      <div className="callout"><span><b>The Heat Risk Index is an explainable analytical index, not a trained machine-learning model.</b> It is a transparent weighted combination of measured indicators. The insights are rule-generated from the data (no free-text generation), and every card cites its evidence. No AI model specification was provided for this build, so none is claimed.</span></div>

      <h2>The index</h2>
      <p>Following the standard disaster-risk framing (IPCC): <b>Risk = Hazard + Exposure + Vulnerability</b>. Each component is min–max scaled across the {m.unitCount} units (0 = best unit, 100 = worst), so the index ranks places <i>relative to each other</i>.</p>
      <ul>
        <li><b>Hazard</b> — afternoon land-surface temperature (NASA MODIS/Aqua, ~13:30) blended with night-time LST (~01:30), which blocks overnight recovery.</li>
        <li><b>Exposure</b> — population density (WorldPop 2020), log-scaled.</li>
        <li><b>Vulnerability</b> — vegetation deficit (MODIS NDVI) and the gap in mapped health-facility access (OpenStreetMap, per 100k residents, log-scaled).</li>
      </ul>
      <div className="card card-pad lab-weights">
        <h3>Adjust the weights <span className="muted" style={{ fontWeight: 400 }}>— applies across the whole site</span></h3>
        {([['hazard', 'Hazard weight'], ['exposure', 'Exposure weight'], ['vulnerability', 'Vulnerability weight'], ['night', 'Night-time share of hazard'], ['green', 'Vegetation share of vulnerability']] as const).map(([k, l]) => (
          <label key={k} className="wrow"><span>{l}</span><input className="slider" type="range" min={0} max={1} step={0.05} value={w[k]} onChange={(e) => set({ [k]: Number(e.target.value) })} style={{ ['--pct' as string]: `${w[k] * 100}%` }} /><b className="mono">{w[k].toFixed(2)}</b></label>
        ))}
        <button className="btn btn-sm btn-ghost" onClick={() => setWeights(DEFAULT_WEIGHTS)}>Reset to defaults</button>
      </div>

      <h2>Data sources</h2>
      <div className="src-grid">
        {m.sources.map((s) => (
          <article key={s.id} className="card card-pad">
            <h3>{s.name}</h3>
            <p className="muted" style={{ fontSize: 13 }}>{s.provider} · {s.license}</p>
            {s.detail && <p style={{ fontSize: 13, marginTop: 8 }}>{s.detail}</p>}
            {s.limits && <p style={{ fontSize: 13, marginTop: 8 }}><b>Limits:</b> <span className="muted">{s.limits}</span></p>}
            <a className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} href={s.url} target="_blank" rel="noreferrer">Source <External /></a>
          </article>
        ))}
      </div>

      {reg && (
        <>
          <h2>The greening–heat relationship</h2>
          <p>Across {reg.n.toLocaleString()} inhabited 1 km pixels (≥ {reg.popDensityMin} residents/km²), afternoon LST falls by about <b>{Math.abs(reg.slopePer0p1Ndvi).toFixed(2)}°C per +0.1 NDVI</b> (95% CI ±{reg.ci95Per0p1.toFixed(2)}; R² {reg.r2.toFixed(2)}). The Scenario Lab uses this slope. It is an association from one region and one period — coastal breeze, surface materials and moisture are not controlled for.</p>
        </>
      )}

      <h2>Known limitations</h2>
      <ul>
        <li><b>Surface vs air temperature.</b> Satellite LST is the skin temperature of the ground and rooftops, typically hotter than the air people breathe. ERA5-Land air temperature is a ~9 km model, not a station record.</li>
        <li><b>Resolution.</b> MODIS LST is 1 km, so small units contain few pixels; each unit shows a confidence level. Pixels clouded out are excluded.</li>
        <li><b>Overpass time.</b> Aqua passes at ~13:30 — near, but not exactly at, the daily peak.</li>
        <li><b>Population</b> is a modelled 2020 estimate, not a census. Pakistan&rsquo;s 2023 census counts are higher.</li>
        <li><b>OpenStreetMap</b> health and green-space coverage is uneven and volunteer-mapped. Drinking-water points are so sparsely mapped in Karachi (13 city-wide) that we do not score them.</li>
        <li><b>Boundaries</b> are the 18 towns + 6 cantonments from the 2017 census; Karachi was later reorganised into more districts.</li>
        <li><b>Not included:</b> income, age, housing quality, indoor cooling and electricity reliability — no open town-level data was available. The vulnerability pillar is therefore only a partial picture.</li>
        <li><b>Scenario lab</b> shows what-ifs under stated assumptions; it is not a forecast. The cool-surface effect size is a user assumption, not a Karachi measurement.</li>
      </ul>
      <InfoNote>Found something wrong or have better data? Everything is reproducible — the pipeline lives in <code>scripts/pipeline</code>.</InfoNote>
    </div>
  );
}
