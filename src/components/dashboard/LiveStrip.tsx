import type { LiveWeather } from '../../lib/hooks';
import { fmtTemp } from '../../lib/format';
import { thermal } from '../../lib/colors';

/** 7-day outlook from the live Open-Meteo forecast (a NWP model, ~11 km). Falls back silently if offline. */
export function LiveStrip({ weather, unitId, label }: { weather: LiveWeather | null; unitId?: string | null; label: string }) {
  if (!weather) return null;
  const ids = Object.keys(weather.byUnit);
  const pick = unitId && weather.byUnit[unitId] ? [unitId] : ids;
  const cur = pick.map((i) => weather.byUnit[i].current);
  const avg = (f: (c: (typeof cur)[number]) => number) => cur.reduce((s, c) => s + f(c), 0) / cur.length;
  const days = weather.byUnit[pick[0]].daily.map((d, k) => ({
    date: d.date,
    tmax: pick.reduce((s, i) => s + weather.byUnit[i].daily[k].tmax, 0) / pick.length,
    feels: pick.reduce((s, i) => s + weather.byUnit[i].daily[k].feelsMax, 0) / pick.length,
  }));
  const lo = 28, hi = 46;
  return (
    <section className="live-strip card card-pad" aria-label={`Live weather ${label}`}>
      <div className="card-title">
        <div><h3>Live weather · {label}</h3><p>Real-time model forecast from Open-Meteo (not the satellite record). Updated on page load.</p></div>
        <span className="chip chip-live"><i className="dot" />Live</span>
      </div>
      <div className="live-now">
        <div><div className="big-num">{fmtTemp(avg((c) => c.temp), 0)}</div><div className="muted" style={{ fontSize: 12.5 }}>air temperature now</div></div>
        <div><div className="mid-num">{fmtTemp(avg((c) => c.feels), 0)}</div><div className="muted" style={{ fontSize: 12.5 }}>feels like</div></div>
        <div><div className="mid-num">{avg((c) => c.humidity).toFixed(0)}%</div><div className="muted" style={{ fontSize: 12.5 }}>humidity</div></div>
      </div>
      <div className="live-days" role="list">
        {days.map((d) => {
          const t = Math.min(1, Math.max(0, (d.feels - lo) / (hi - lo)));
          return (
            <div key={d.date} role="listitem" className="live-day" title={`${d.date}: max ${d.tmax.toFixed(1)}°C, feels like ${d.feels.toFixed(1)}°C`}>
              <span className="mono live-dow">{new Date(d.date + 'T12:00').toLocaleDateString('en-GB', { weekday: 'short' })}</span>
              <span className="live-bar"><i style={{ height: `${18 + t * 82}%`, background: thermal(t) }} /></span>
              <b className="mono">{d.feels.toFixed(0)}°</b>
              <span className="muted mono" style={{ fontSize: 10.5 }}>{d.tmax.toFixed(0)}°</span>
            </div>
          );
        })}
      </div>
      <div className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>Bars: forecast daily max “feels like” · small number: max air temperature.</div>
    </section>
  );
}
