// An original finding from our own data: do Karachi's hottest neighbourhoods overlap with its most polluted ones right now?
// Heat = our satellite-based Heat Risk Index (a relative ranking). Air = live PM2.5 from Open-Meteo (CAMS model, ~11 km), fetched when this runs.
// Run: `npm run findings` (needs internet). Writes docs/FINDINGS.md with the date, so the number is a dated snapshot, not a permanent fact.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { computeBaseline, DEFAULT_WEIGHTS, scoreAll } from '../src/lib/risk';

const units = JSON.parse(readFileSync(join(process.cwd(), 'public', 'data', 'units.geojson'), 'utf8')).features;
const scores = scoreAll(units, computeBaseline(units), DEFAULT_WEIGHTS);
const lat = units.map((u: any) => u.properties.centroid[1].toFixed(3)).join(','), lon = units.map((u: any) => u.properties.centroid[0].toFixed(3)).join(',');
const res = await fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=pm2_5&timezone=Asia%2FKarachi`);
if (!res.ok) throw new Error('air quality request failed: ' + res.status);
const json = await res.json(); const arr = Array.isArray(json) ? json : [json];
const rows = units.map((u: any, i: number) => ({ name: u.properties.short, heat: scores.get(u.properties.id)!.index, pm: arr[i]?.current?.pm2_5 as number, rank: scores.get(u.properties.id)!.rank })).filter((r: any) => Number.isFinite(r.pm));
const ranks = (xs: number[]) => { const idx = xs.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]), r = new Array(xs.length); idx.forEach(([, i], k) => (r[i] = k + 1)); return r; };
const rh = ranks(rows.map((r: any) => r.heat)), rp = ranks(rows.map((r: any) => r.pm)), n = rows.length;
const rho = 1 - (6 * rh.reduce((a: number, x: number, i: number) => a + (x - rp[i]) ** 2, 0)) / (n * (n * n - 1));
const topBy = (key: 'heat' | 'pm', k: number) => [...rows].sort((a: any, b: any) => b[key] - a[key]).slice(0, k).map((r: any) => r.name);
const both = (k: number) => topBy('heat', k).filter((x) => topBy('pm', k).includes(x));
const when = arr[0]?.current?.time ?? 'now';
// chance level: expected overlap of two random top-5 lists out of 24 is 5*5/24
const md = `# Finding: heat and bad air do not line up neatly in Karachi

*Snapshot taken ${new Date().toISOString().slice(0, 10)} (air reading time ${when}) by \`npm run findings\`. Air quality changes hour to hour, so re-run it for a fresh number.*

**Question.** Are the neighbourhoods with the highest satellite heat risk also the ones with the worst air right now? If yes, one mission type would fix both. If no, volunteers need different missions in different places.

**Method.** Heat = our Heat Risk Index (satellite surface temperature, population and vegetation, a relative ranking). Air = live PM2.5 for each of the ${n} neighbourhoods. We compared the two rankings with Spearman rank correlation and counted how many places appear in both top lists.

**Result.**
- Rank correlation between heat risk and PM2.5: **${rho.toFixed(2)}** (1 = identical order, 0 = unrelated, -1 = opposite).
- Top 5 hottest: ${topBy('heat', 5).join(', ')}.
- Top 5 most polluted now: ${topBy('pm', 5).join(', ')}.
- In **both** top-5 lists: **${both(5).length}** place${both(5).length === 1 ? '' : 's'}${both(5).length ? ' (' + both(5).join(', ') + ')' : ''}. By pure chance you would expect about ${(25 / n).toFixed(1)}.
- In both top-8 lists: **${both(8).length}** (chance: about ${(64 / n).toFixed(1)}).

**What it means for volunteers.** ${Math.abs(rho) < 0.4 ? 'The two problems mostly sit in different places, so one kind of mission cannot serve every neighbourhood. This is why KarachAir ranks need from heat and air together and picks the mission type (shade and hydration for heat, no-idling and dust for air) by what is wrong in each place.' : 'Heat and air overlap more than chance, so some places carry a double burden and are the best places to start.'}

**Honest limits.** One snapshot, not a trend. The air values are a ~11 km atmospheric model, so neighbouring units can share a value. The heat index is a relative ranking built from three hot seasons. Treat this as a clear question we asked of our own data, not a final scientific result.
`;
writeFileSync(join(process.cwd(), 'docs', 'FINDINGS.md'), md);
console.log(`n=${n} rho=${rho.toFixed(2)} top5 both=${both(5).length} (${both(5).join(', ')}) top8 both=${both(8).length}`);
console.log('hot5:', topBy('heat', 5).join(', '), '| polluted5:', topBy('pm', 5).join(', '));
