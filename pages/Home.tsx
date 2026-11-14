import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { useTerra } from '../lib/data';
import { hrefFor, useCountUp, useInView, useLiveWeather, type Route } from '../lib/hooks';
import { HeatField } from '../components/HeatField';
import { AnomalyChart } from '../components/charts/ClimateCharts';
import { InsightCard } from '../components/dashboard/InsightCard';
import { ArrowRight, Download, Droplet, Layers, Leaf, Satellite, Sliders, Sparkle, Table, Thermometer } from '../components/icons';
import { Slider } from '../components/ui';
import { DEFAULT_WEIGHTS, scoreAll, type RiskWeights } from '../lib/risk';
import { runScenario, NO_CHANGE } from '../lib/scenario';
import { buildCityInsights } from '../lib/insights';
import { downloadText, unitsToCsv } from '../lib/export';
import { fmtDelta, fmtTemp } from '../lib/format';

type Go = (r: Partial<Route> & { page: Route['page'] }) => void;

function Reveal({ children, delay = 0, className = '' }: { children: ReactNode; delay?: number; className?: string }) {
  const [ref, inView] = useInView<HTMLDivElement>();
  return <div ref={ref} className={`reveal ${inView ? 'in' : ''} ${className}`} style={{ '--d': `${delay}ms` } as CSSProperties}>{children}</div>;
}

function AnimatedStat({ value, decimals = 0, prefix = '', suffix = '', label, sub, tone }: { value: number; decimals?: number; prefix?: string; suffix?: string; label: string; sub: string; tone: string }) {
  const [ref, inView] = useInView<HTMLDivElement>();
  const v = useCountUp(value, inView, 1500, decimals);
  return (
    <div ref={ref} className="hero-stat" style={{ '--tone': tone } as CSSProperties}>
      <div className="hero-stat-value">{prefix}{decimals ? v.toFixed(decimals) : v.toLocaleString()}{suffix}</div>
      <div className="hero-stat-label">{label}</div>
      <div className="hero-stat-sub">{sub}</div>
    </div>
  );
}

export function Home({ go }: { go: Go }) {
  const { data, scores, baseline, medians } = useTerra();
  const live = useLiveWeather(data.units);
  const openUnit = (id: string) => go({ page: 'dashboard', tab: 'explore', unit: id });

  const hottest = useMemo(() => [...data.units].filter((u) => u.properties.lst).sort((a, b) => b.properties.lst!.day - a.properties.lst!.day)[0], [data.units]);
  const tr = data.meta.climateCity?.trend;
  const liveAvg = useMemo(() => {
    const v = live.data ? Object.values(live.data.byUnit).map((u) => u.current) : [];
    return v.length ? { t: v.reduce((s, c) => s + c.temp, 0) / v.length, f: v.reduce((s, c) => s + c.feels, 0) / v.length } : null;
  }, [live.data]);

  // ---- mini Risk Lab
  const [w, setW] = useState<RiskWeights>(DEFAULT_WEIGHTS);
  const labScores = useMemo(() => [...scoreAll(data.units, baseline, w).values()].sort((a, b) => a.rank - b.rank).slice(0, 6), [data.units, baseline, w]);
  const maxIdx = Math.max(...labScores.map((s) => s.index), 1);

  // ---- mini Scenario
  const [dn, setDn] = useState(0.1);
  const topUnit = data.units.find((u) => u.properties.id === [...scores.values()].sort((a, b) => a.rank - b.rank)[0].id)!;
  const sc = useMemo(() => runScenario(topUnit, baseline, w, { ...NO_CHANGE, dNdvi: dn }, data.meta.lst?.regression ?? null), [topUnit, baseline, w, dn, data.meta]);

  const insights = useMemo(() => buildCityInsights(data.units, scores, DEFAULT_WEIGHTS, data.meta).slice(0, 3), [data, scores]);

  return (
    <div className="home">
      {/* ------------------------------------------------------------ hero */}
      <section className="hero">
        <div className="container-wide hero-grid">
          <div className="hero-copy">
            <span className="eyebrow">Climate intelligence · Karachi, Pakistan</span>
            <h1>Know which neighbourhoods <span className="serif heat-text">burn first.</span></h1>
            <p className="lead">TerraWatch AI fuses NASA satellite surface temperature, population, vegetation and health-access data into a transparent heat-risk index for all {data.units.length} of Karachi&rsquo;s administrative units — so planners can act where it matters most.</p>
            <div className="hero-cta">
              <a className="btn btn-primary btn-lg" href={hrefFor({ page: 'dashboard' })}>Explore the dashboard <ArrowRight /></a>
              <a className="btn btn-lg btn-glass" href="#how">How it works</a>
            </div>
            <div className="hero-live">
              {liveAvg
                ? <span className="chip chip-live"><i className="dot" />Karachi right now: <b>{fmtTemp(liveAvg.t, 0)}</b>, feels like <b>{fmtTemp(liveAvg.f, 0)}</b></span>
                : <span className="chip">Live weather unavailable offline</span>}
              <span className="chip">NASA MODIS</span><span className="chip">WorldPop</span><span className="chip">OpenStreetMap</span><span className="chip">ERA5-Land</span>
            </div>
          </div>
          <div className="hero-visual"><HeatField onOpenUnit={openUnit} /><div className="hero-caption mono">REAL DATA · hover or tap a unit</div></div>
        </div>
        <div className="container-wide hero-stats">
          <AnimatedStat value={data.units.length} label="Neighbourhoods analysed" sub="18 towns + 6 cantonments" tone="var(--lime-400)" />
          <AnimatedStat value={data.meta.totalPopulation ? data.meta.totalPopulation / 1e6 : 0} decimals={1} suffix="M" label="Residents modelled" sub="WorldPop 2020 estimate" tone="var(--c-pop)" />
          <AnimatedStat value={hottest?.properties.lst?.day ?? 0} decimals={1} suffix="°C" label="Hottest afternoon surface" sub={`${hottest?.properties.short} · hot-season mean`} tone="var(--c-heat)" />
          <AnimatedStat value={tr?.annualMeanTmaxPerDecade ?? 0} decimals={2} prefix="+" suffix="°C" label="Warming per decade" sub="Daily max temp, ERA5-Land" tone="var(--c-alert)" />
        </div>
      </section>

      {/* ------------------------------------------------------------ capabilities */}
      <section className="section container" id="capabilities">
        <Reveal><span className="eyebrow">Intelligence, not just a map</span><h2 className="section-title">Play with the data. <span className="muted">Nothing here is decoration.</span></h2></Reveal>
        <div className="bento">
          <Reveal className="bento-a" delay={0}>
            <div className="card card-pad card-glow bento-card">
              <div className="bento-head"><Layers /><h3>Tune the Heat Risk Index</h3></div>
              <p className="muted">Re-weight hazard, exposure and vulnerability and watch Karachi&rsquo;s top-six ranking change live.</p>
              <div className="mini-sliders">
                <Slider label="Hazard (surface heat)" value={w.hazard} min={0} max={1} step={0.05} onChange={(v) => setW({ ...w, hazard: v })} format={(v) => v.toFixed(2)} fill="var(--c-heat)" />
                <Slider label="Exposure (people)" value={w.exposure} min={0} max={1} step={0.05} onChange={(v) => setW({ ...w, exposure: v })} format={(v) => v.toFixed(2)} fill="var(--c-pop)" />
                <Slider label="Vulnerability (greenery, care)" value={w.vulnerability} min={0} max={1} step={0.05} onChange={(v) => setW({ ...w, vulnerability: v })} format={(v) => v.toFixed(2)} fill="var(--c-veg)" />
              </div>
              <ol className="mini-rank">
                {labScores.map((s) => { const u = data.units.find((x) => x.properties.id === s.id)!; return (
                  <li key={s.id}><button onClick={() => openUnit(s.id)}><span className="mono rk">{s.rank}</span><span className="nm">{u.properties.short}</span><span className="bar"><i style={{ width: `${(s.index / maxIdx) * 100}%`, background: s.tier.color }} /></span><b className="mono">{s.index.toFixed(0)}</b></button></li>
                ); })}
              </ol>
            </div>
          </Reveal>
          <Reveal className="bento-b" delay={80}>
            <div className="card card-pad card-glow bento-card">
              <div className="bento-head"><Leaf /><h3>What would greening do?</h3></div>
              <p className="muted">In Karachi&rsquo;s own satellite data, greener pixels run cooler. Add vegetation to <b>{topUnit.properties.short}</b>:</p>
              <Slider label="Added vegetation (NDVI)" value={dn} min={0} max={0.25} step={0.01} onChange={setDn} format={(v) => `+${v.toFixed(2)}`} fill="var(--c-veg)" />
              {sc && (
                <div className="mini-out">
                  <div><div className="mono mo-big" style={{ color: sc.dLstDay <= 0 ? 'var(--c-cool)' : 'var(--c-alert)' }}>{fmtDelta(sc.dLstDay, 2)}°C</div><div className="muted" style={{ fontSize: 12 }}>afternoon surface temp</div></div>
                  <div><div className="mono mo-big">{sc.base.score.index.toFixed(0)} → {sc.next.score.index.toFixed(0)}</div><div className="muted" style={{ fontSize: 12 }}>risk index</div></div>
                </div>
              )}
              <a className="btn btn-sm" href={hrefFor({ page: 'dashboard', tab: 'scenarios', unit: topUnit.properties.id })}>Open the scenario lab <ArrowRight /></a>
            </div>
          </Reveal>
          <Reveal className="bento-c" delay={120}>
            <div className="card card-pad card-glow bento-card">
              <div className="bento-head"><Sparkle /><h3>Findings you can audit</h3></div>
              <p className="muted">Every insight shows its evidence, a confidence level and the exact method. Open one:</p>
              <div className="insight-list">{insights.map((i) => <InsightCard key={i.id} insight={i} onOpenUnit={openUnit} />)}</div>
            </div>
          </Reveal>
          <Reveal className="bento-d" delay={160}>
            <div className="card card-pad card-glow bento-card">
              <div className="bento-head"><Table /><h3>Reports &amp; data</h3></div>
              <p className="muted">Take it with you: every unit&rsquo;s indicators as CSV, or a one-page neighbourhood brief from the dashboard.</p>
              <button className="btn" onClick={() => downloadText('terrawatch-karachi-units.csv', unitsToCsv(data.units, scores), 'text/csv')}><Download />Download all units (CSV)</button>
              <div className="chip-row wrap" style={{ marginTop: 14 }}><span className="chip">24 units</span><span className="chip">{data.meta.sources.length} open sources</span><span className="chip">Median Tmax {medians.lstDay.toFixed(0)}°C LST</span></div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ------------------------------------------------------------ how it works */}
      <section className="section container" id="how">
        <Reveal><span className="eyebrow">How it works</span><h2 className="section-title">From satellite pixel to policy decision.</h2></Reveal>
        <div className="steps">
          {[
            { i: <Satellite />, t: 'Sense', d: 'NASA MODIS/Aqua measures ground temperature at ~13:30 and ~01:30 every few days; MODIS NDVI measures vegetation at 250 m.', c: 'var(--c-heat)' },
            { i: <Layers />, t: 'Fuse', d: 'WorldPop population, OpenStreetMap health facilities and green space, ERA5-Land air temperature, and official unit boundaries.', c: 'var(--c-pop)' },
            { i: <Thermometer />, t: 'Score', d: 'A transparent hazard + exposure + vulnerability index ranks all 24 units. Weights are yours to change.', c: 'var(--lime-400)' },
            { i: <Sliders />, t: 'Simulate', d: 'Test warming, tree canopy and cool-roof scenarios using the greenery–heat relationship measured in Karachi itself.', c: 'var(--c-cool)' },
            { i: <Droplet />, t: 'Act', d: 'Neighbourhood briefs and intervention opportunities tied to measured gaps — with limits stated plainly.', c: 'var(--c-veg)' },
          ].map((s, k) => (
            <Reveal key={s.t} delay={k * 70}><div className="step card card-pad" style={{ '--tone': s.c } as CSSProperties}><div className="step-icon">{s.i}</div><div className="step-n mono">0{k + 1}</div><h3>{s.t}</h3><p className="muted">{s.d}</p></div></Reveal>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------ climate */}
      {data.climate && (
        <section className="section container">
          <Reveal><span className="eyebrow">Why now</span><h2 className="section-title">The baseline is moving.</h2></Reveal>
          <Reveal><AnomalyChart climate={data.climate} height={290} compact /></Reveal>
        </section>
      )}

      {/* ------------------------------------------------------------ CTA */}
      <section className="container">
        <Reveal>
          <div className="cta card card-glow">
            <div><h2>Open the full dashboard.</h2><p className="muted">Interactive map, neighbourhood profiles, comparisons, climate trends and a scenario lab — all on open data.</p></div>
            <div className="hero-cta"><a className="btn btn-primary btn-lg" href={hrefFor({ page: 'dashboard' })}>Launch dashboard <ArrowRight /></a><a className="btn btn-lg" href={hrefFor({ page: 'methodology' })}>Read the methodology</a></div>
          </div>
        </Reveal>
      </section>
    </div>
  );
}
