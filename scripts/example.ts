// A worked example of how KarachAir creates impact, built from LIVE data when this runs: which neighbourhood needs help most,
// how many people live there, what a student is offered, and how verified work changes coverage. It shows the pathway; it does not
// claim a measured change in pollution or temperature. Run: `npm run example` (needs internet). Writes docs/EXAMPLE.md.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { computeBaseline, DEFAULT_WEIGHTS, scoreAll } from '../src/lib/risk';
import { generateTasks, taskToMission, unitNeeds } from '../src/lib/needs';
import { coverage, reachNow } from '../src/lib/impact';

const units = JSON.parse(readFileSync(join(process.cwd(), 'public', 'data', 'units.geojson'), 'utf8')).features;
const scores = scoreAll(units, computeBaseline(units), DEFAULT_WEIGHTS);
const lat = units.map((u: any) => u.properties.centroid[1].toFixed(3)).join(','), lon = units.map((u: any) => u.properties.centroid[0].toFixed(3)).join(',');
const get = async (u: string) => { const r = await fetch(u); if (!r.ok) throw new Error(u + ' ' + r.status); const j = await r.json(); return Array.isArray(j) ? j : [j]; };
const [aq, wx] = await Promise.all([
  get(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=pm2_5,pm10,nitrogen_dioxide,us_aqi&timezone=Asia%2FKarachi`),
  get(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m&daily=temperature_2m_max,apparent_temperature_max&forecast_days=1&timezone=Asia%2FKarachi`),
]);
const air: any = { fetchedAt: Date.now(), byUnit: {} }, weather: any = { fetchedAt: Date.now(), byUnit: {} };
units.forEach((u: any, i: number) => {
  const id = u.properties.id, a = aq[i]?.current, w = wx[i]?.current, d = wx[i]?.daily;
  if (a) air.byUnit[id] = { pm25: a.pm2_5, pm10: a.pm10, no2: a.nitrogen_dioxide ?? null, aqi: a.us_aqi ?? null, time: a.time };
  if (w) weather.byUnit[id] = { current: { temp: w.temperature_2m, feels: w.apparent_temperature, humidity: w.relative_humidity_2m, wind: w.wind_speed_10m, time: w.time }, daily: [{ date: d?.time?.[0] ?? '', tmax: d?.temperature_2m_max?.[0] ?? w.temperature_2m, feelsMax: d?.apparent_temperature_max?.[0] ?? w.apparent_temperature }] };
});
const input = { units, scores, air, weather, fieldCounts: new Map<string, number>() };
const needs = unitNeeds(input), tasks = generateTasks(input), reach = reachNow(units, needs);
const top = needs[0], topUnit = units.find((u: any) => u.properties.id === top.unitId), task = tasks.find((t) => t.unitId === top.unitId)!, m = taskToMission(task);
const before = coverage(units, needs, []), after = coverage(units, needs, [top.unitId]);
const f = (n: number) => n.toLocaleString('en-US'), pc = (v: number) => (v * 100).toFixed(1) + '%';
const md = `# Worked example: how KarachAir creates impact

*Snapshot from live data on ${new Date().toISOString().slice(0, 10)} (air reading ${aq[0]?.current?.time ?? 'now'}) by \`npm run example\`. It shows the pathway from data to community action. It does **not** claim a measured drop in pollution or heat.*

**1. The data says where help is needed.** Combining the satellite heat-risk ranking with live PM2.5 and live feels-like temperature, the neighbourhood with the highest need right now is **${top.name}** (need ${top.priority}/100). Why: ${top.drivers.join('; ')}. About **${f(topUnit.properties.population ?? 0)} people** live there (WorldPop estimate).

**2. A student is offered a safe, explained mission.** "${m.title}" (${m.hours} hours, ${m.where === 'indoor' ? 'indoor' : 'outdoor, adult required, locked if the air is hazardous'}). The reason is attached: ${m.trigger}.

**3. The organization verifies the work.** The student's hours are signed off and a certificate is issued, so the effort is on record.

**4. Coverage rises, and the report goes to people who can act.** Across the city, **${reach.highNeedUnits} neighbourhoods** are the priority today (those in high or urgent need, or the top 5 on a calm day). They are home to **${f(reach.highNeedResidents)} residents (${pc(reach.highNeedShare)} of the ${f(reach.total)} modelled)**. With no verified work, ${before.covered} of ${before.highNeed} priority areas are covered. After this one verified mission, ${after.covered} of ${after.highNeed} are covered, reaching ${f(after.residentsReached)} residents. The report (live graphs plus this priority list) is what an NGO or school can use to decide where to send people next.

**What this shows and does not show.** It shows how data becomes a safe action, a verified record and a prioritised list for decision makers, and that each step is counted. Measuring the actual change in a neighbourhood is the next stage (a pilot with a school and an NGO); at hackathon stage we show how the impact happens and how it would be tracked.
`;
writeFileSync(join(process.cwd(), 'docs', 'EXAMPLE.md'), md);
console.log(`top=${top.name} ${top.priority} pop=${topUnit.properties.population} | high-need ${reach.highNeedUnits} units, ${reach.highNeedResidents} residents (${pc(reach.highNeedShare)}) | ${m.title}`);
