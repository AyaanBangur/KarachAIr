import { useEffect, useState } from 'react';
import { UNSAFE_PM25, outlookFor, type Hours, type Outlook, type OutlookModel } from '../../lib/outlook';

const LAT = 24.86, LON = 67.01; // Karachi city centre, the point the model was trained on
type State = { status: 'loading' | 'ok' | 'error'; outlook?: Outlook; model?: OutlookModel };

/** Tomorrow's air outlook from our own trained model, with its measured accuracy shown. It only helps planning; today's safety lock uses live readings. */
export function OutlookCard() {
  const [s, setS] = useState<State>({ status: 'loading' });
  useEffect(() => {
    let off = false;
    (async () => {
      try {
        const base = import.meta.env.BASE_URL;
        const [model, aq, wx] = await Promise.all([
          fetch(`${base}data/outlook-model.json`).then((r) => r.json() as Promise<OutlookModel>),
          fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${LAT}&longitude=${LON}&hourly=pm2_5&past_days=2&forecast_days=1&timezone=Asia%2FKarachi`).then((r) => r.json()),
          fetch(`https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&hourly=temperature_2m,relative_humidity_2m,wind_speed_10m,surface_pressure&past_days=2&forecast_days=1&timezone=Asia%2FKarachi`).then((r) => r.json()),
        ]);
        const now = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Karachi' }).slice(0, 13).replace(' ', 'T') + ':00';
        const idx = (aq.hourly.time as string[]).filter((t) => t <= now).length, from = idx - 48;
        if (from < 0) throw new Error('not enough hours');
        const cut = (a: number[]) => a.slice(from, idx);
        const h: Hours = { pm: cut(aq.hourly.pm2_5), temp: cut(wx.hourly.temperature_2m), hum: cut(wx.hourly.relative_humidity_2m), wind: cut(wx.hourly.wind_speed_10m), pres: cut(wx.hourly.surface_pressure) };
        const o = outlookFor(model, h);
        if (!off) setS(o ? { status: 'ok', outlook: o, model } : { status: 'error' });
      } catch { if (!off) setS({ status: 'error' }); }
    })();
    return () => { off = true; };
  }, []);

  if (s.status === 'error') return null; // the live safety lock and missions do not depend on this card
  const o = s.outlook;
  const text = !o ? 'Checking tomorrow…' : o.level === 'likely-unsafe' ? 'Tomorrow is likely to be unsafe outdoors, so plan indoor missions.' : o.level === 'likely-ok' ? 'Tomorrow looks likely to be fine for outdoor missions with an adult.' : 'Tomorrow is borderline. Check the live reading before you go outside.';
  return (
    <section className="card card-pad" aria-label="Tomorrow's air outlook" style={{ marginBottom: 14 }}>
      <div className="card-title"><div><h3>Tomorrow&rsquo;s air outlook <span className="chip" style={{ marginLeft: 8 }}>our trained model</span></h3><p>{text}</p></div></div>
      {o && <p style={{ margin: '4px 0' }}>Expected PM2.5 over the next 24 hours: <b>{o.expected.toFixed(0)} µg/m³</b> (likely range {o.low.toFixed(0)} to {o.high.toFixed(0)}; unsafe outdoors is {UNSAFE_PM25} or more).</p>}
      <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>City-centre estimate from the last 48 hours of air and weather, trained on {s.model?.trainDays} real days. On days it had never seen it was about as accurate as saying &ldquo;tomorrow equals today&rdquo;, not better by much (see docs/OUTLOOK.md). Planning aid only: today&rsquo;s lock always uses the live reading.</p>
    </section>
  );
}
