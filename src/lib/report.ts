// Builds the printable report as ONE standalone HTML document (inline CSS + inline SVG) from the same data the
// dashboard uses. The Report tab previews it in an iframe; "Download" saves the exact same file; "Print / PDF"
// prints the iframe. The report reflects: index weights, scope, sections, the Scenario lab's current settings, and
// the organization's field logs (with their review status). All user-entered text is HTML-escaped.
import type { ClimateFile, MetaFile, UnitFeature } from './types';
import type { LiveAir, LiveWeather } from './hooks';
import { unitNeeds } from './needs';
import { confidenceFor, dominantDriver, type Baseline, type RiskScore, type RiskWeights } from './risk';
import { opportunitiesFor, type Insight } from './insights';
import { TIERS, tierFor } from './colors';
import { fmtCompact, fmtDate, fmtDelta, fmtInt, fmtTemp } from './format';
import { kindOf, type VolunteerLog } from './logs';
import { NO_CHANGE, runPortfolio, runScenario, type ScenarioInput } from './scenario';
import { miniMapPaths } from './miniMap';

export type Scope = 'all' | 'top10' | 'picks';
export interface ReportOptions {
  title: string; author: string; organisation: string; scope: Scope; picks: string[]; verifiedOnly: boolean;
  sections: { summary: boolean; findings: boolean; live: boolean; ranking: boolean; profiles: boolean; scenario: boolean; volunteer: boolean; method: boolean };
}
export interface ScenarioState { s: ScenarioInput; target: 'unit' | 'top5' | 'all'; unitId: string | null }
export interface ReportContext {
  units: UnitFeature[]; scores: Map<string, RiskScore>; weights: RiskWeights; meta: MetaFile; insights: Insight[]; logs: VolunteerLog[];
  medians: { lstDay: number; lstNight: number; ndvi: number; density: number; health: number };
  baseline: Baseline; scenario: ScenarioState;
  /** yearly climate record, and the live feeds. The report is rebuilt whenever these change. */
  climate?: ClimateFile | null; live?: { air: LiveAir | null; weather: LiveWeather | null };
}

export const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const LOGO = `<svg width="34" height="34" viewBox="0 0 64 64"><defs><linearGradient id="lg" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#1fa3bd"/><stop offset=".55" stop-color="#b8f04a"/><stop offset="1" stop-color="#f4a93d"/></linearGradient></defs><circle cx="32" cy="32" r="21" fill="none" stroke="url(#lg)" stroke-width="5"/><path d="M13 37c7-7 12 5 19-2s11 3 19-4" fill="none" stroke="url(#lg)" stroke-width="4.5" stroke-linecap="round"/><circle cx="32" cy="32" r="4.4" fill="#f4a93d"/></svg>`;

const CSS = `
:root{--ink:#10201a;--muted:#5d6b64;--line:#e1e8e4;--soft:#f4f8f5;--forest:#0b2a20;--accent:#14805a;--lime:#b8f04a;--heat:#e8602c}
*{box-sizing:border-box}html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;background:#e9eeeb;color:var(--ink);font:14px/1.6 -apple-system,'Segoe UI',system-ui,sans-serif}
.page{max-width:880px;margin:22px auto;background:#fff;box-shadow:0 10px 50px rgba(0,0,0,.14);border-radius:10px;overflow:hidden}
.cover{position:relative;padding:44px 56px 34px;color:#f2f0e6;background:radial-gradient(80% 120% at 0% 0%,rgba(184,240,74,.22),transparent 60%),radial-gradient(70% 120% at 100% 100%,rgba(232,96,44,.28),transparent 60%),linear-gradient(135deg,#071a14,#0b2a20 55%,#12392c)}
.brand{display:flex;align-items:center;gap:10px;font-weight:650;letter-spacing:-.02em;font-size:15px}.brand small{font:600 10.5px/1 ui-monospace,Consolas,monospace;letter-spacing:.14em;text-transform:uppercase;color:var(--lime);margin-left:auto}
.cover h1{font-size:36px;letter-spacing:-.04em;line-height:1.08;margin:34px 0 10px;max-width:22ch}
.cover .by{color:#c9d4cd;font-size:13.5px}.chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:18px}.chip{border:1px solid rgba(255,255,255,.22);border-radius:99px;padding:3px 12px;font-size:12px;color:#dfe8e2;background:rgba(255,255,255,.06)}
.thermal{height:8px;background:linear-gradient(90deg,#24407a,#2d7fa6,#4cb3a6,#e6dc8a,#f5a93b,#e8602c,#d62f4b)}
.body{padding:8px 56px 40px}
h2{display:flex;align-items:center;gap:12px;font-size:21px;letter-spacing:-.03em;margin:38px 0 12px}h2 .n{flex:none;width:30px;height:30px;border-radius:50%;display:grid;place-items:center;font:700 14px/1 ui-monospace,Consolas,monospace;color:#fff;background:var(--accent)}
h3{font-size:15px;margin:0 0 4px;letter-spacing:-.01em}p{margin:0 0 10px}.muted{color:var(--muted)}.small{font-size:12px}
.lede{font-size:15.5px;line-height:1.65}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:16px 0}.kpi{border:1px solid var(--line);border-top:4px solid var(--c,#14805a);border-radius:10px;padding:12px 14px;background:linear-gradient(180deg,var(--soft),#fff)}.kpi b{display:block;font-size:26px;letter-spacing:-.04em;line-height:1.1}.kpi span{font-size:11.5px;color:var(--muted)}
.two{display:grid;grid-template-columns:1fr 1fr;gap:20px;align-items:start}
table{width:100%;border-collapse:collapse;font-size:12.5px;margin:10px 0 14px}th{text-align:left;font:600 10.5px/1.2 ui-monospace,Consolas,monospace;text-transform:uppercase;letter-spacing:.08em;color:#fff;background:var(--forest);padding:8px 10px}th:first-child{border-radius:8px 0 0 0}th:last-child{border-radius:0 8px 0 0}td{padding:7px 10px;border-bottom:1px solid var(--line);vertical-align:top}tr:nth-child(even) td{background:#f8fbf9}td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}
.tier{display:inline-block;padding:1px 9px;border-radius:99px;font-size:11px;font-weight:650;color:#fff;white-space:nowrap}
.stack{display:flex;height:16px;border-radius:8px;overflow:hidden;margin:8px 0 6px}.stack i{display:block}.legend{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:11.5px;color:var(--muted)}.legend span::before{content:'';display:inline-block;width:9px;height:9px;border-radius:3px;margin-right:6px;background:var(--c)}
.find{border:1px solid var(--line);border-left:5px solid var(--c,#14805a);border-radius:10px;padding:12px 16px;margin:0 0 10px;break-inside:avoid;background:#fff}.find .k{font:600 10.5px/1 ui-monospace,Consolas,monospace;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}.find h3{margin:5px 0 4px;font-size:16px}
.ev{display:flex;flex-wrap:wrap;gap:4px 16px;font-size:12px;margin-top:8px;padding-top:8px;border-top:1px dashed var(--line)}.badge{font-size:11px;border:1px solid var(--line);border-radius:99px;padding:0 9px;color:var(--muted);background:var(--soft)}
.prof{border:1px solid var(--line);border-left:6px solid var(--c);border-radius:10px;padding:14px 18px;margin:0 0 14px;break-inside:avoid}.prof-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px 16px;margin:12px 0}.grid div{background:var(--soft);border-radius:8px;padding:8px 10px}.grid b{display:block;font-size:16px;letter-spacing:-.02em}.grid span{color:var(--muted);font-size:11.5px}
.pill{display:flex;align-items:center;gap:10px;font-size:12px;margin:4px 0}.pill .t{flex:1;background:#e7ede9;border-radius:5px;height:8px;overflow:hidden}.pill i{display:block;height:8px;border-radius:5px}
ul{margin:4px 0 10px;padding-left:20px}li{margin:3px 0}
.note{background:var(--soft);border-left:4px solid var(--accent);border-radius:0 8px 8px 0;padding:10px 14px;font-size:12.5px;color:#3d4a44;margin:10px 0}.warn{border-left-color:#e29a2a;background:#fff8ec}
.foot{margin:0;padding:16px 56px 24px;border-top:1px solid var(--line);font-size:11.5px;color:var(--muted);display:flex;gap:16px;justify-content:space-between;flex-wrap:wrap}
@media (max-width:700px){.cover,.body{padding-left:22px;padding-right:22px}.kpis{grid-template-columns:1fr 1fr}.two{grid-template-columns:1fr}.grid{grid-template-columns:1fr 1fr}}
@media print{body{background:#fff}.page{box-shadow:none;margin:0;max-width:none;border-radius:0}h2{break-after:avoid}.find,.prof,tr,.kpis,svg{break-inside:avoid}@page{margin:12mm}}
`;

const pill = (s: RiskScore) => `<span class="tier" style="background:${s.tier.color};${s.tier.key === 'moderate' ? 'color:#2a2a2a' : ''}">${esc(s.tier.label)}</span>`;
const h2 = (n: number, t: string) => `<h2><span class="n">${n}</span>${esc(t)}</h2>`;

function barSvg(rows: { name: string; v: number; color: string }[], max = 100) {
  const W = 520, L = 96, R = 34, H = 20, top = 2;
  return `<svg viewBox="0 0 ${W} ${top * 2 + rows.length * H}" width="100%" role="img" aria-label="Heat risk index by unit">${rows.map((r, i) => { const y = top + i * H, w = ((W - L - R) * Math.max(0, Math.min(r.v, max))) / max; return `<text x="${L - 8}" y="${y + 13}" text-anchor="end" font-size="11" fill="#10201a">${esc(r.name)}</text><rect x="${L}" y="${y + 3}" width="${(W - L - R).toFixed(0)}" height="12" rx="6" fill="#edf2ef"/><rect x="${L}" y="${y + 3}" width="${Math.max(2, w).toFixed(1)}" height="12" rx="6" fill="${r.color}"/><text x="${L + (W - L - R) + 6}" y="${y + 13}" font-size="11" font-weight="600" fill="#5d6b64">${r.v.toFixed(0)}</text>`; }).join('')}</svg>`;
}
function deltaSvg(rows: { name: string; v: number }[]) {
  const W = 560, L = 190, R = 50, H = 26, top = 4; const m = Math.max(0.5, ...rows.map((r) => Math.abs(r.v))); const mid = L + (W - L - R) / 2, half = (W - L - R) / 2;
  return `<svg viewBox="0 0 ${W} ${top * 2 + rows.length * H}" width="100%" role="img" aria-label="Change in afternoon surface temperature by intervention"><line x1="${mid}" x2="${mid}" y1="0" y2="${top * 2 + rows.length * H}" stroke="#aab7b0"/>${rows.map((r, i) => { const y = top + i * H, w = (Math.abs(r.v) / m) * half, x = r.v >= 0 ? mid : mid - w; return `<text x="${L - 10}" y="${y + 15}" text-anchor="end" font-size="11.5" fill="#10201a">${esc(r.name)}</text><rect x="${x.toFixed(1)}" y="${y + 3}" width="${Math.max(2, w).toFixed(1)}" height="14" rx="4" fill="${r.v > 0 ? '#e8602c' : r.v < 0 ? '#2d7fa6' : '#aab7b0'}"/><text x="${(r.v >= 0 ? mid + w + 6 : mid - w - 6).toFixed(1)}" y="${y + 14}" text-anchor="${r.v >= 0 ? 'start' : 'end'}" font-size="11" font-weight="600" fill="#5d6b64">${fmtDelta(r.v, 2)}°</text>`; }).join('')}</svg>`;
}
function mapSvg(units: UnitFeature[], scores: Map<string, RiskScore>) {
  const paths = miniMapPaths(units, 520, 360);
  return `<svg viewBox="0 0 520 360" width="100%" role="img" aria-label="Map of Karachi units coloured by heat-risk tier" style="background:#0b1a15;border-radius:10px">${paths.map((p) => { const s = scores.get(p.id)!; return `<path d="${p.d}" fill="${s.tier.color}" fill-opacity=".92" stroke="#0b1a15" stroke-width="1" fill-rule="evenodd"/>`; }).join('')}${paths.filter((p) => scores.get(p.id)!.rank <= 5).map((p) => `<g><circle cx="${p.cx.toFixed(1)}" cy="${p.cy.toFixed(1)}" r="9" fill="#0b1a15" stroke="#fff" stroke-width="1.5"/><text x="${p.cx.toFixed(1)}" y="${(p.cy + 3.5).toFixed(1)}" text-anchor="middle" font-size="10" font-weight="700" fill="#fff">${scores.get(p.id)!.rank}</text></g>`).join('')}</svg>`;
}

const PALETTE = ['#e8602c', '#d62f4b', '#6b58c9', '#1f9ab0', '#5fa82a', '#c98f2f'];
/** Simple line chart (inline SVG, so it prints and downloads with the report). */
function lineSvg(series: { name: string; pts: (number | null)[] }[], xs: string[], unit: string, label: string) {
  const W = 560, H = 230, L = 44, R = 12, T = 12, B = 34;
  const vals = series.flatMap((s) => s.pts).filter((v): v is number => v != null && Number.isFinite(v));
  if (vals.length < 2) return '<p class="muted small">Not enough data for this chart yet.</p>';
  let lo = Math.min(...vals), hi = Math.max(...vals); const pad = Math.max((hi - lo) * 0.12, 0.5); lo -= pad; hi += pad;
  const x = (i: number) => L + (xs.length === 1 ? 0 : (i / (xs.length - 1)) * (W - L - R)), y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const grid = [0, 1, 2, 3, 4].map((k) => { const v = lo + ((hi - lo) * k) / 4; return `<line x1="${L}" x2="${W - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="#e1e8e4"/><text x="${L - 6}" y="${(y(v) + 3.5).toFixed(1)}" text-anchor="end" font-size="10" fill="#5d6b64">${v.toFixed(1)}</text>`; }).join('');
  const step = Math.ceil(xs.length / 8);
  const ticks = xs.map((t, i) => (i % step === 0 || i === xs.length - 1 ? `<text x="${x(i).toFixed(1)}" y="${H - 14}" text-anchor="middle" font-size="10" fill="#5d6b64">${esc(t)}</text>` : '')).join('');
  const lines = series.map((s, k) => {
    const c = PALETTE[k % PALETTE.length]; let d = '', pen = false;
    s.pts.forEach((v, i) => { if (v == null) { pen = false; return; } d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`; pen = true; });
    return `<path d="${d}" fill="none" stroke="${c}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>${s.pts.map((v, i) => (v == null ? '' : `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="2.6" fill="${c}"/>`)).join('')}`;
  }).join('');
  const legend = series.map((s, k) => `<span style="--c:${PALETTE[k % PALETTE.length]}">${esc(s.name)}</span>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(label)}"><text x="${L}" y="9" font-size="10" fill="#5d6b64">${esc(unit)}</text>${grid}${ticks}${lines}</svg><div class="legend">${legend}</div>`;
}

export function scopeUnits(o: Pick<ReportOptions, 'scope' | 'picks'>, c: Pick<ReportContext, 'units' | 'scores'>): UnitFeature[] {
  const ranked = [...c.units].sort((a, b) => c.scores.get(a.properties.id)!.rank - c.scores.get(b.properties.id)!.rank);
  if (o.scope === 'top10') return ranked.slice(0, 10);
  if (o.scope === 'picks' && o.picks.length) return ranked.filter((u) => o.picks.includes(u.properties.id));
  return ranked;
}

export function buildReportHtml(o: ReportOptions, c: ReportContext): string {
  const { units, scores, weights, meta, insights, medians, baseline, scenario } = c;
  const logs = o.verifiedOnly ? c.logs.filter((l) => l.status === 'verified') : c.logs.filter((l) => l.status !== 'flagged');
  const scoped = scopeUnits(o, c);
  const all = [...units].sort((a, b) => scores.get(a.properties.id)!.rank - scores.get(b.properties.id)!.rank);
  const seasons = [...(meta.lst?.seasons ?? [])].sort();
  const seasonLabel = seasons.length > 1 ? `${seasons[0]} to ${seasons[seasons.length - 1]}` : String(seasons[0] ?? '');
  const hottest = [...units].filter((u) => u.properties.lst).sort((a, b) => b.properties.lst!.day - a.properties.lst!.day)[0];
  const top = all[0];
  const sev = all.filter((u) => ['severe', 'extreme'].includes(scores.get(u.properties.id)!.tier.key));
  const sevPop = sev.reduce((s, u) => s + (u.properties.population ?? 0), 0);
  const tr = meta.climateCity?.trend;
  const reg = meta.lst?.regression ?? null;
  const uname = (id: string | null) => units.find((u) => u.properties.id === id)?.properties.name ?? 'Unassigned';
  const who = [o.author && `Prepared by ${esc(o.author)}`, o.organisation && esc(o.organisation)].filter(Boolean).join(' · ');
  let n = 0; const out: string[] = [];

  out.push(`<div class="page"><div class="cover"><div class="brand">${LOGO}<span>KarachAir</span><small>Karachi heat report</small></div>
    <h1>${esc(o.title || 'Karachi extreme-heat report')}</h1>${who ? `<div class="by">${who}</div>` : ''}
    <div class="chips"><span class="chip">${esc(fmtDate(new Date().toISOString()))}</span><span class="chip">Data build ${esc(fmtDate(meta.generatedAt))}</span><span class="chip">${o.scope === 'all' ? `All ${units.length} units` : o.scope === 'top10' ? 'Ten highest-risk units' : `${scoped.length} selected unit${scoped.length === 1 ? '' : 's'}`}</span><span class="chip">NASA MODIS · WorldPop · OSM · ERA5-Land</span></div></div><div class="thermal"></div><div class="body">`);

  if (o.sections.summary) {
    const tiers = TIERS.map((t) => ({ t, k: all.filter((u) => scores.get(u.properties.id)!.tier.key === t.key).length }));
    out.push(`${h2(++n, 'Executive summary')}
    <div class="kpis"><div class="kpi" style="--c:#6b58c9"><b>${fmtCompact(meta.totalPopulation)}</b><span>residents modelled in ${units.length} units</span></div>
    <div class="kpi" style="--c:#e8602c"><b>${fmtTemp(hottest?.properties.lst?.day)}</b><span>hottest afternoon surface · ${esc(hottest?.properties.short)}</span></div>
    <div class="kpi" style="--c:#d62f4b"><b>${top ? scores.get(top.properties.id)!.index.toFixed(0) : 'n/a'}</b><span>highest risk index · ${esc(top?.properties.short)}</span></div>
    <div class="kpi" style="--c:#14805a"><b>${tr ? '+' + tr.annualMeanTmaxPerDecade.toFixed(2) + '°C' : 'n/a'}</b><span>warming per decade (daily max, ERA5-Land)</span></div></div>
    <p class="lede">Using NASA satellite surface temperature for the ${esc(seasonLabel)} hot seasons, WorldPop population, vegetation greenness and OpenStreetMap health facilities, KarachAir ranks Karachi's ${units.length} administrative units by <i>relative</i> heat risk (hazard + exposure + vulnerability).</p>
    <p><b>${esc(top?.properties.name)}</b> has the highest combined risk; <b>${esc(hottest?.properties.name)}</b> has the hottest average afternoon surface (${fmtTemp(hottest?.properties.lst?.day)}, ${fmtDelta((hottest?.properties.lst?.day ?? 0) - medians.lstDay, 1)}°C vs the city median ${fmtTemp(medians.lstDay)}). ${sev.length} units rated Severe or Extreme hold about <b>${fmtCompact(sevPop)}</b> residents${meta.totalPopulation ? ` (${Math.round((sevPop / meta.totalPopulation) * 100)}% of those modelled)` : ''}.</p>
    <div class="stack">${tiers.map(({ t, k }) => `<i style="width:${(k / units.length) * 100}%;background:${t.color}"></i>`).join('')}</div>
    <div class="legend">${tiers.map(({ t, k }) => `<span style="--c:${t.color}">${t.label}: ${k} unit${k === 1 ? '' : 's'}</span>`).join('')}</div>
    <div class="note">The index ranks units <i>relative to each other</i>. It is an explainable composite of measured indicators, not a trained machine-learning model and not a forecast.</div>`);
  }

  if (o.sections.findings) {
    out.push(h2(++n, 'Key findings'));
    const tone: Record<string, string> = { heat: '#e8602c', veg: '#5fa82a', pop: '#6b58c9', cool: '#1f9ab0', alert: '#d62f4b', gap: '#7a847f' };
    for (const f of insights) out.push(`<div class="find" style="--c:${tone[f.tone]}"><div class="k">${esc(f.title)}</div><h3>${esc(f.headline)}</h3><p>${esc(f.body)}</p>
      <div class="ev">${f.evidence.map((e) => `<span>${esc(e.label)}: <b>${esc(e.value)}</b> <em class="muted small">(${esc(e.kind)})</em></span>`).join('')}</div>
      <p class="small muted" style="margin:8px 0 0"><span class="badge">${esc(f.confidence.level)} confidence</span> ${esc(f.confidence.reason)}</p></div>`);
  }

  if (o.sections.live) {
    const lw = c.live?.weather ?? null, la = c.live?.air ?? null;
    const topUnits = all.slice(0, 5);
    const clock = (ms?: number) => (ms ? new Date(ms).toLocaleString('en-GB', { timeZone: 'Asia/Karachi', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + ' PKT' : 'not available');
    out.push(h2(++n, 'Live conditions and trends'));
    out.push(`<p class="muted small">Live feeds refresh automatically every 10 minutes and this report updates with them. Weather updated ${esc(clock(lw?.fetchedAt))}; air quality updated ${esc(clock(la?.fetchedAt))}.</p>`);
    const needs = unitNeeds({ units, scores, air: la, weather: lw, fieldCounts: new Map() }).slice(0, 5);
    out.push(`<h3>Where volunteers are needed most right now</h3><p class="small muted">The volunteer hub builds its tasks from this ranking: heat-risk index, live PM2.5, live feels-like temperature and green space.</p>
    <table><thead><tr><th>#</th><th>Neighbourhood</th><th>Need</th><th>Why</th></tr></thead><tbody>${needs.map((x, i) => `<tr><td>${i + 1}</td><td><b>${esc(x.name)}</b>${x.badWeather ? ' <span class="badge">bad weather</span>' : ''}</td><td>${x.priority}/100</td><td class="small">${esc(x.drivers.join(' · '))}</td></tr>`).join('')}</tbody></table>`);
    if (lw) {
      const dates = lw.byUnit[topUnits[0]?.properties.id]?.daily.map((d) => d.date.slice(5)) ?? [];
      out.push(`<h3>7-day maximum temperature, highest-risk neighbourhoods (live forecast)</h3>${lineSvg(topUnits.map((u) => ({ name: u.properties.short, pts: lw.byUnit[u.properties.id]?.daily.map((d) => d.tmax) ?? [] })), dates, '°C', 'Seven-day maximum temperature forecast for the five highest-risk neighbourhoods')}`);
    } else out.push('<div class="note warn">Live weather could not be loaded, so the forecast chart is not shown.</div>');
    if (c.climate?.years?.length) {
      const ys = c.climate.years.filter((y) => y.complete && y.hotSeasonTmax != null); // a part-year would plot as a false spike
      out.push(`<h3>Hot-season maximum temperature by year (ERA5-Land)</h3>${lineSvg([{ name: 'Hot-season mean daily max', pts: ys.map((y) => y.hotSeasonTmax) }, { name: 'Annual mean daily max', pts: ys.map((y) => y.meanTmax) }], ys.map((y) => String(y.year)), '°C', 'Hot-season and annual maximum temperature by year')}`);
    }
    const yrs = [...new Set(topUnits.flatMap((u) => Object.keys(u.properties.lst?.byYear ?? {})))].sort();
    if (yrs.length > 1) out.push(`<h3>Afternoon surface temperature by year, highest-risk neighbourhoods (NASA MODIS)</h3>${lineSvg(topUnits.map((u) => ({ name: u.properties.short, pts: yrs.map((y) => u.properties.lst?.byYear?.[y] ?? null) })), yrs, '°C', 'Afternoon land-surface temperature by year for the five highest-risk neighbourhoods')}`);
    if (la) {
      const pm = topUnits.map((u) => ({ n: u.properties.short, v: la.byUnit[u.properties.id]?.pm25 })).filter((r) => r.v != null);
      if (pm.length) out.push(`<h3>Live PM2.5 now (µg/m³)</h3><div class="legend">${pm.map((r) => `<span style="--c:${(r.v as number) > 35 ? '#d62f4b' : '#14805a'}">${esc(r.n)}: <b>${(r.v as number).toFixed(0)}</b></span>`).join('')}</div>`);
    }
  }

  if (o.sections.ranking) {
    const rows = scoped.slice(0, 14).map((u) => { const s = scores.get(u.properties.id)!; return { name: u.properties.short, v: s.index, color: s.tier.color }; });
    out.push(`${h2(++n, 'Heat risk ranking')}<p class="muted small">Heat Risk Index (0 to 100). Weights, hazard ${weights.hazard.toFixed(2)}, exposure ${weights.exposure.toFixed(2)}, vulnerability ${weights.vulnerability.toFixed(2)}. Numbers on the map are the five highest-ranked units.</p>
    <div class="two"><div>${mapSvg(units, scores)}</div><div>${barSvg(rows)}</div></div>
    <table><thead><tr><th>#</th><th>Unit</th><th>Tier</th><th class="n">Index</th><th class="n">Afternoon LST</th><th class="n">Night LST</th><th class="n">NDVI</th><th class="n">Residents</th><th class="n">Health/100k</th></tr></thead><tbody>
    ${scoped.map((u) => { const s = scores.get(u.properties.id)!, p = u.properties; return `<tr><td>${s.rank}</td><td><b>${esc(p.name)}</b></td><td>${pill(s)}</td><td class="n">${s.index.toFixed(0)}</td><td class="n">${fmtTemp(p.lst?.day)}</td><td class="n">${fmtTemp(p.lst?.night)}</td><td class="n">${p.ndvi?.toFixed(2) ?? 'n/a'}</td><td class="n">${fmtCompact(p.population)}</td><td class="n">${p.infra?.healthPer100k?.toFixed(1) ?? 'n/a'}</td></tr>`; }).join('')}</tbody></table>`);
  }

  if (o.sections.profiles) {
    const prof = o.scope === 'all' ? scoped.slice(0, 5) : scoped.slice(0, 12);
    out.push(`${h2(++n, 'Neighbourhood profiles')}${o.scope === 'all' ? '<p class="muted small">The five highest-risk units are profiled; choose “selected units” to profile others.</p>' : ''}`);
    for (const u of prof) {
      const p = u.properties, s = scores.get(p.id)!, conf = confidenceFor(u), opps = opportunitiesFor(u, medians, meta);
      const bar = (label: string, v: number, col: string) => `<div class="pill"><span style="width:96px">${label}</span><span class="t"><i style="width:${v.toFixed(0)}%;background:${col}"></i></span><b>${v.toFixed(0)}</b></div>`;
      out.push(`<div class="prof" style="--c:${s.tier.color}"><div class="prof-head"><div><h3 style="font-size:18px">${esc(p.name)}</h3><span class="small muted">${p.type === 'town' ? 'Town' : 'Cantonment'} · ${p.areaKm2} km² · rank ${s.rank} of ${units.length} · mainly driven by ${dominantDriver(s, weights)}</span></div><div style="text-align:right">${pill(s)}<div style="font-size:24px;font-weight:700;letter-spacing:-.04em">${s.index.toFixed(0)}</div></div></div>
      <div class="grid"><div><b>${fmtTemp(p.lst?.day)}</b><span>afternoon surface temp</span></div><div><b>${fmtTemp(p.lst?.night)}</b><span>night surface temp</span></div><div><b>${fmtTemp(p.lst?.peak8Day?.value)}</b><span>hottest 8-day composite</span></div><div><b>${p.ndvi?.toFixed(2) ?? 'n/a'}</b><span>vegetation (NDVI)</span></div><div><b>${fmtCompact(p.population)}</b><span>residents · ${fmtInt(p.popDensity)}/km²</span></div><div><b>${p.infra?.healthFacilities ?? 'n/a'}</b><span>mapped health facilities</span></div></div>
      ${bar('Hazard', s.hazard, '#e8602c')}${bar('Exposure', s.exposure, '#6b58c9')}${bar('Vulnerability', s.vulnerability, '#5fa82a')}
      <p class="small" style="margin:10px 0 2px"><b>Opportunities</b></p><ul class="small">${opps.map((x) => `<li><b>${esc(x.title)}</b>, ${esc(x.why)}</li>`).join('')}</ul>
      <p class="small muted" style="margin:0">Data confidence: <b>${esc(conf.level)}</b>, ${esc(conf.reason)}</p></div>`);
    }
  }

  if (o.sections.scenario) {
    out.push(h2(++n, 'Scenario analysis'));
    const { s, target, unitId } = scenario;
    const touched = s.warming !== 0 || s.dNdvi !== 0 || s.coolShare !== 0;
    if (!touched) out.push('<div class="note">No scenario has been set. Open the <b>Scenario lab</b> tab, adjust the sliders, then return here, this section updates automatically.</div>');
    else {
      const ranked = all;
      const targetIds = new Set(target === 'unit' ? [unitId ?? ranked[0].properties.id] : target === 'top5' ? ranked.slice(0, 5).map((u) => u.properties.id) : units.map((u) => u.properties.id));
      const port = runPortfolio(units, targetIds, baseline, weights, s, reg);
      const label = target === 'unit' ? uname(unitId ?? ranked[0].properties.id) : target === 'top5' ? 'the five highest-risk units' : 'all units';
      const canned: [string, ScenarioInput][] = [['+2°C warming, no action', { ...NO_CHANGE, warming: 2 }], ['Tree canopy (+0.10 NDVI)', { ...NO_CHANGE, dNdvi: 0.1 }], [`Cool roofs (30% @ ${s.coolEffect.toFixed(1)}°C)`, { ...NO_CHANGE, coolShare: 0.3, coolEffect: s.coolEffect }], ['Your scenario', s]];
      const rows = canned.map(([name, sc]) => ({ name, v: runPortfolio(units, targetIds, baseline, weights, sc, reg).popWeightedDLst }));
      out.push(`<p>Applied to <b>${esc(label)}</b>. This section reflects the settings currently chosen in the Scenario lab.</p>
      <table><thead><tr><th>Setting</th><th class="n">Value</th></tr></thead><tbody>
      <tr><td>Background warming (what-if, not a forecast)</td><td class="n">+${s.warming.toFixed(1)}°C</td></tr><tr><td>Greening, added vegetation</td><td class="n">+${s.dNdvi.toFixed(2)} NDVI</td></tr>
      <tr><td>Cool roofs / reflective surfaces, share treated</td><td class="n">${Math.round(s.coolShare * 100)}%</td></tr><tr><td>Assumed surface cooling of treated area <span class="badge">assumption</span></td><td class="n">${s.coolEffect.toFixed(1)}°C</td></tr></tbody></table>`);
      if (target === 'unit') {
        const u = units.find((x) => x.properties.id === (unitId ?? ranked[0].properties.id))!;
        const r = runScenario(u, baseline, weights, s, reg);
        if (r) {
          const rankAfter = 1 + units.filter((x) => x.properties.id !== u.properties.id && scores.get(x.properties.id)!.index > r.next.score.index).length;
          const tb = r.base.score.tier, ta = tierFor(r.next.score.index);
          out.push(`<div class="kpis"><div class="kpi" style="--c:#e8602c"><b>${fmtTemp(r.base.lstDay)} → ${fmtTemp(r.next.lstDay)}</b><span>afternoon surface temp (${fmtDelta(r.dLstDay, 2)}°C)</span></div>
          <div class="kpi" style="--c:#d62f4b"><b>${r.base.score.index.toFixed(0)} → ${r.next.score.index.toFixed(0)}</b><span>heat risk index (${fmtDelta(r.next.score.index - r.base.score.index, 1)})</span></div>
          <div class="kpi" style="--c:${ta.color}"><b>${esc(tb.label)} → ${esc(ta.label)}</b><span>risk tier</span></div>
          <div class="kpi" style="--c:#6b58c9"><b>#${scores.get(u.properties.id)!.rank} → #${rankAfter}</b><span>rank among ${units.length}</span></div></div>`);
        }
      } else {
        out.push(`<div class="kpis"><div class="kpi" style="--c:#6b58c9"><b>${fmtCompact(port.popAffected)}</b><span>residents in treated units</span></div><div class="kpi" style="--c:#e8602c"><b>${fmtDelta(port.popWeightedDLst, 2)}°C</b><span>population-weighted change</span></div>
        <div class="kpi" style="--c:#d62f4b"><b>${port.meanIndex.before.toFixed(1)} → ${port.meanIndex.after.toFixed(1)}</b><span>mean risk index</span></div><div class="kpi" style="--c:#14805a"><b>${fmtCompact(port.peopleSevere.before)} → ${fmtCompact(port.peopleSevere.after)}</b><span>residents in Severe/Extreme units</span></div></div>`);
      }
      out.push(`<h3>Which lever does most?</h3><p class="muted small">Population-weighted change in afternoon surface temperature across ${esc(label)} (negative is cooler).</p>${deltaSvg(rows)}
      <div class="note warn"><b>How to read this.</b> ΔLST = warming + β·ΔNDVI − treated share × assumed cooling.${reg ? ` β = ${reg.slopePerNdvi.toFixed(1)}°C per 1.0 NDVI, estimated from ${reg.n.toLocaleString()} Karachi pixels with R² = ${reg.r2.toFixed(2)}, a weak association, so greening effects are indicative only.` : ''} The cool-surface effect is an assumption, not a Karachi measurement. Night-time temperature responds only to background warming.</div>`);
    }
  }

  if (o.sections.volunteer) {
    out.push(h2(++n, 'Field observations'));
    const all_ = c.logs;
    if (!all_.length) out.push('<p class="muted">No field observations have been recorded by this team yet.</p>');
    else {
      const ver = all_.filter((l) => l.status === 'verified').length, flag = all_.filter((l) => l.status === 'flagged').length, pend = all_.length - ver - flag;
      const byUnit = new Map<string, VolunteerLog[]>();
      for (const l of logs) byUnit.set(l.unitId ?? '_none', [...(byUnit.get(l.unitId ?? '_none') ?? []), l]);
      out.push(`<div class="kpis"><div class="kpi" style="--c:#14805a"><b>${all_.length}</b><span>field logs from ${new Set(all_.map((l) => l.volunteer || 'anonymous')).size} volunteer(s)</span></div><div class="kpi" style="--c:#2a9d6b"><b>${ver}</b><span>verified by the organization</span></div><div class="kpi" style="--c:#e29a2a"><b>${pend}</b><span>awaiting review</span></div><div class="kpi" style="--c:#d62f4b"><b>${flag}</b><span>flagged (excluded below)</span></div></div>
      <p>${o.verifiedOnly ? 'Only <b>verified</b> logs are shown.' : 'Verified and awaiting-review logs are shown; flagged logs are excluded.'} These are human field notes, kept separate from the satellite-derived measurements.</p>
      <table><thead><tr><th>Unit</th><th class="n">Logs</th><th class="n">Field air (mean)</th><th class="n">Field surface (mean)</th><th class="n">Satellite afternoon LST</th><th class="n">Surface vs satellite</th></tr></thead><tbody>
      ${[...byUnit.entries()].map(([id, ls]) => { const u = units.find((x) => x.properties.id === id); const m = (k: 'air' | 'surface') => { const v = ls.filter((l) => l.measure === k && l.tempC != null).map((l) => l.tempC as number); return v.length ? { t: v.reduce((a, b) => a + b, 0) / v.length, n: v.length } : null; }; const a = m('air'), sf = m('surface'); return `<tr><td><b>${esc(uname(id === '_none' ? null : id))}</b></td><td class="n">${ls.length}</td><td class="n">${a ? `${a.t.toFixed(1)}°C (n=${a.n})` : 'n/a'}</td><td class="n">${sf ? `${sf.t.toFixed(1)}°C (n=${sf.n})` : 'n/a'}</td><td class="n">${fmtTemp(u?.properties.lst?.day)}</td><td class="n">${sf && u?.properties.lst ? `${fmtDelta(sf.t - u.properties.lst.day)}°C` : 'n/a'}</td></tr>`; }).join('')}</tbody></table>
      <table><thead><tr><th>Observed</th><th>Unit / place</th><th>Type</th><th class="n">Reading</th><th>Status</th><th>Notes</th></tr></thead><tbody>
      ${logs.slice(0, 40).map((l) => `<tr><td>${esc(new Date(l.observedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }))}<br><span class="muted small">${esc(l.volunteer || 'anonymous')}</span></td><td>${esc(uname(l.unitId))}${l.place ? `<br><span class="muted small">${esc(l.place)}</span>` : ''}</td><td>${esc(kindOf(l.kind).label)}</td><td class="n">${l.tempC != null ? `${l.tempC.toFixed(1)}°C ${esc(l.measure ?? '')}` : 'n/a'}</td><td>${l.status === 'verified' ? '<span class="tier" style="background:#2a9d6b">Verified</span>' : '<span class="badge">Awaiting</span>'}</td><td>${esc(l.notes)}</td></tr>`).join('')}</tbody></table>
      ${logs.length > 40 ? `<p class="small muted">Showing the 40 most recent of ${logs.length} logs.</p>` : ''}
      <div class="note">A handheld <i>air</i> reading and a satellite <i>surface</i> temperature measure different things, so gaps between them are expected. Surface readings are the closer comparison.</div>`);
    }
  }

  if (o.sections.method) {
    out.push(`${h2(++n, 'Data, method and limits')}
    <p><b>Index.</b> Risk = hazard + exposure + vulnerability. Hazard blends afternoon (${Math.round((1 - weights.night) * 100)}%) and night-time (${Math.round(weights.night * 100)}%) land-surface temperature; exposure is log population density; vulnerability blends vegetation deficit (${Math.round(weights.green * 100)}%) and the gap in mapped health-facility access (${Math.round((1 - weights.green) * 100)}%). Each component is min to max scaled across the ${units.length} units (0 = best, 100 = worst). Tier cutoffs are 40 / 52 / 60 / 68 and describe standing within Karachi, not absolute danger.</p>
    <table><thead><tr><th>Source</th><th>Provider &amp; licence</th><th>Notes</th></tr></thead><tbody>${meta.sources.map((x) => `<tr><td><b>${esc(x.name)}</b></td><td>${esc(x.provider)}<br><span class="muted small">${esc(x.license)}</span></td><td class="small">${esc([x.detail, x.limits && 'Limits: ' + x.limits].filter(Boolean).join(' '))}</td></tr>`).join('')}</tbody></table>
    <p><b>Limitations</b></p><ul class="small">
    <li>Satellite values are <i>surface</i> temperatures at ~1 km, not air temperature; cloud-contaminated pixels are excluded; Aqua overpasses at ~13:30, near but not at the daily peak.</li>
    <li>Only ${seasons.length} hot season${seasons.length === 1 ? '' : 's'} (${esc(seasonLabel)}) are averaged: this describes recent conditions, not a climate trend. The long-run trend comes from ERA5-Land reanalysis (~9 km model, not a station record).</li>
    <li>Population is a modelled 2020 estimate; OpenStreetMap health and green-space data are volunteer-mapped with uneven coverage; boundaries are the 2017 census towns and cantonments.</li>
    <li>Income, age, housing quality and indoor-cooling access are not included (no open town-level data).</li>
    ${reg ? `<li>In Karachi's pixel data, +0.1 NDVI is associated with ${reg.slopePer0p1Ndvi.toFixed(2)}°C afternoon surface temperature, but R² is only ${reg.r2.toFixed(2)}.</li>` : ''}
    <li>Field logs are volunteer observations; only those marked <i>verified</i> have been reviewed by the organization.</li></ul>`);
  }

  out.push(`</div><div class="foot"><span>Generated by KarachAir from open data. Every figure traces to a public source; interpretations are rule-generated and labelled as derived.</span><span>${esc(o.organisation || '')}</span></div></div>`);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(o.title || 'Karachi heat report')}</title><style>${CSS}</style></head><body>${out.join('\n')}</body></html>`;
}
