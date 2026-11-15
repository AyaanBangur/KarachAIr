import { useTerra } from '../../lib/data';
import { AnomalyChart, ExposureCard, ProfileChart } from '../charts/ClimateCharts';
import { SeasonLines } from '../charts/UnitCharts';
import { InfoNote, StatTile } from '../ui';
import { Thermometer, Flame } from '../icons';
import { fmtDelta } from '../../lib/format';

export function TrendsTab({ picks }: { picks: string[] }) {
  const { data, scores } = useTerra();
  const climate = data.climate;
  const ranked = [...data.units].sort((a, b) => scores.get(a.properties.id)!.rank - scores.get(b.properties.id)!.rank);
  const seasonPicks = picks.length ? picks : ranked.slice(0, 3).map((u) => u.properties.id);
  const tr = climate?.city.trend;
  const recent = climate?.years.filter((y) => y.complete).slice(-1)[0];
  const hot = climate ? [...climate.years].filter((y) => y.complete).sort((a, b) => b.meanTmax - a.meanTmax)[0] : null;
  return (
    <div className="tab-body container-wide">
      {climate && tr ? (
        <>
          <div className="trend-stats">
            <StatTile icon={<Thermometer />} tone="var(--c-heat)" label={`Annual Tmax trend since ${tr.from}`} value={`${fmtDelta(tr.annualMeanTmaxPerDecade, 2)}°C / decade`} sub={`± ${tr.annualCi95.toFixed(2)} (95% CI) · R² ${tr.annualR2.toFixed(2)}`} />
            <StatTile icon={<Flame />} tone="var(--c-alert)" label="Hot-season (May to Jun) Tmax trend" value={`${fmtDelta(tr.hotSeasonTmaxPerDecade, 2)}°C / decade`} sub={`± ${tr.hotSeasonCi95.toFixed(2)} · R² ${tr.hotSeasonR2.toFixed(2)}`} />
            {hot && <StatTile icon={<Thermometer />} tone="var(--c-warn)" label="Warmest complete year on record" value={String(hot.year)} sub={`mean daily max ${hot.meanTmax.toFixed(1)}°C`} />}
            {recent && <StatTile icon={<Thermometer />} tone="var(--c-cool)" label={`Latest complete year (${recent.year})`} value={recent.anomaly != null ? `${fmtDelta(recent.anomaly, 2)}°C` : 'n/a'} sub="vs 1991 to 2020 mean" />}
          </div>
          <div className="trend-grid">
            <AnomalyChart climate={climate} height={300} />
            <ProfileChart climate={climate} height={300} />
          </div>
        </>
      ) : <InfoNote>Climate record not available, run <code>npm run data</code>.</InfoNote>}
      <div className="trend-grid">
        {data.meta.exposure.length > 0 && <ExposureCard meta={data.meta} />}
        <SeasonLines units={data.units} picks={seasonPicks} />
      </div>
      <InfoNote>Air-temperature charts use ERA5-Land, a ~9 km model reanalysis for central Karachi (a single grid cell). It shows the regional signal; neighbourhood differences come from the satellite surface-temperature layers. Different quantities, air at 2 m versus the ground surface, so their numbers are not interchangeable.</InfoNote>
    </div>
  );
}
