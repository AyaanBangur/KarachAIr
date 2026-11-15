import { useTerra } from '../lib/data';
import type { AirState, LiveWeather } from '../lib/hooks';

interface Src { name: string; provider: string; use: string; cadence: 'live' | 'periodic' | 'static'; url: string; note?: string }
const SOURCES: Src[] = [
  { name: 'Live air quality (PM2.5, PM10, NO₂, US AQI)', provider: 'Open-Meteo Air Quality API, built on the Copernicus Atmosphere Monitoring Service (CAMS) model', use: 'Air status, pollution-source guess, volunteer task priorities', cadence: 'live', url: 'https://open-meteo.com/en/docs/air-quality-api', note: '~11 km model, not street-level sensors' },
  { name: 'Live weather and 7-day forecast', provider: 'Open-Meteo forecast API', use: 'Feels-like temperature, heat alerts, report forecast graph', cadence: 'live', url: 'https://open-meteo.com/en/docs' },
  { name: 'Satellite surface temperature (day and night)', provider: 'NASA MODIS/Aqua MYD11A2, served by ORNL DAAC', use: 'Heat Risk Index, report trend graphs', cadence: 'periodic', url: 'https://lpdaac.usgs.gov/products/myd11a2v061/', note: '1 km, 8-day composites for the hot seasons; new satellite passes are added when the data is rebuilt' },
  { name: 'Vegetation (NDVI)', provider: 'NASA MODIS/Terra MOD13Q1', use: 'Green-space and shade deficit', cadence: 'periodic', url: 'https://lpdaac.usgs.gov/products/mod13q1v061/', note: '250 m' },
  { name: 'Long-term air-temperature record', provider: 'ERA5-Land reanalysis (ECMWF / Copernicus), via Open-Meteo', use: 'Warming trend graphs in the report', cadence: 'periodic', url: 'https://cds.climate.copernicus.eu/datasets/reanalysis-era5-land', note: '~9 km, 1950 to now' },
  { name: 'Population', provider: 'WorldPop 2020, UN-adjusted, 1 km', use: 'Exposure: how many people are affected', cadence: 'static', url: 'https://www.worldpop.org/', note: 'Modelled, not a census' },
  { name: 'Health facilities and green space', provider: 'OpenStreetMap contributors (Overpass API)', use: 'Vulnerability: access to health care and shade', cadence: 'static', url: 'https://www.openstreetmap.org/copyright', note: 'Volunteer-mapped; coverage is uneven' },
  { name: 'Neighbourhood boundaries', provider: 'geoBoundaries (PBS 2017)', use: 'The 18 towns and 6 cantonments', cadence: 'static', url: 'https://www.geoboundaries.org/' },
];
const clock = (ms?: number) => (ms ? new Date(ms).toLocaleTimeString('en-GB', { timeZone: 'Asia/Karachi', hour: '2-digit', minute: '2-digit' }) + ' PKT' : null);

/** Where every number comes from, with live status, so people can judge whether to trust it. */
export function SourcesPanel({ air, weather: wx }: { air: AirState; weather: { status: 'loading' | 'ok' | 'error'; data: LiveWeather | null } }) {
  const { data } = useTerra();
  const reg = data.meta.lst?.regression;
  const status = (s: Src) => {
    if (s.cadence === 'static') return <span className="src-tag static">Fixed dataset</span>;
    if (s.cadence === 'periodic') return <span className="src-tag periodic">Data build {new Date(data.meta.generatedAt).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}</span>;
    const st = s.name.startsWith('Live air') ? air : wx, t = clock(st.data?.fetchedAt);
    return <span className={`src-tag live ${st.status}`}><i className="dot" />{st.status === 'error' ? 'Unavailable right now' : t ? `Live · updated ${t}` : 'Connecting…'}</span>;
  };
  return (
    <section className="sources" aria-label="Data sources">
      <div className="sources-head"><span className="eyebrow">Where our data comes from</span><h2 className="fancy">Real data, with the receipts</h2>
        <p>Every figure in KarachAir traces to a named public source. Live feeds refresh on their own every 10 minutes. Satellite composites arrive in batches, so they are labelled with their build date instead of being called live.</p></div>
      <div className="card card-pad" style={{ margin: '0 0 18px' }}>
        <h3 style={{ marginTop: 0 }}>What this data can and cannot tell you</h3>
        <ul style={{ margin: '8px 0 0', paddingLeft: 18, lineHeight: 1.6 }}>
          {reg && <li><b>Greenery and heat are only weakly linked here.</b> Across {reg.n.toLocaleString('en-US')} pixels, R&sup2; is {reg.r2.toFixed(3)}: greenery explains about {(reg.r2 * 100).toFixed(1)}% of the differences in afternoon surface temperature. We treat greening effects as small and uncertain.</li>}
          <li><b>Only {data.meta.lst?.seasons.length ?? 0} hot seasons</b> of satellite data ({[...(data.meta.lst?.seasons ?? [])].sort().join(', ')}), so this shows today&rsquo;s pattern, not a long trend. Long-term warming comes from the separate ERA5 record.</li>
          <li><b>Air quality is a ~11 km model, not street-level sensors.</b> A school gate can differ from the number shown.</li>
          <li><b>The Heat Risk Index is a relative ranking</b> of the 24 neighbourhoods, not an absolute danger level and not a trained model. The volunteer missions are rules over live data; Hawa&rsquo;s activity understanding uses a small trained classifier (see docs/RESULTS.md).</li>
        </ul>
      </div>
      <div className="sources-grid">
        {SOURCES.map((s) => (
          <a key={s.name} className="src-card" href={s.url} target="_blank" rel="noopener noreferrer">
            <div className="src-top"><b>{s.name}</b>{status(s)}</div>
            <span className="src-provider">{s.provider}</span>
            <span className="src-use">Used for: {s.use}</span>
            {s.note && <span className="src-note">{s.note}</span>}
            <span className="src-link">View source ↗</span>
          </a>
        ))}
      </div>
    </section>
  );
}
