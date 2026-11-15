import { useCallback, useEffect, useRef, useState } from 'react';
import type { UnitFeature } from './types';

// ------------------------------------------------------------------ hash router
// #/login · #/login/volunteer · #/login/organization · #/dashboard/<tab>?unit=<id>
export const TAB_IDS = ['explore', 'compare', 'trends', 'scenarios', 'air', 'report', 'volunteer', 'org', 'sources'] as const;
export interface Route { page: 'dashboard' | 'login'; tab: string; unit: string | null }
export function parseHash(h: string): Route {
  const [path, query = ''] = h.replace(/^#\/?/, '').split('?');
  const seg = path.split('/').filter(Boolean);
  if (seg[0] === 'login') return { page: 'login', tab: seg[1] === 'volunteer' || seg[1] === 'organization' || seg[1] === 'reset' ? seg[1] : '', unit: null };
  const tab = (seg[0] === 'dashboard' ? seg[1] : seg[0]) || 'explore';
  return { page: 'dashboard', tab: (TAB_IDS as readonly string[]).includes(tab) ? tab : 'explore', unit: new URLSearchParams(query).get('unit') };
}
export function hrefFor(r: Partial<Route> = {}) {
  if (r.page === 'login') return `#/login${r.tab ? '/' + r.tab : ''}`;
  const q = r.unit ? `?unit=${encodeURIComponent(r.unit)}` : '';
  return `#/dashboard/${r.tab || 'explore'}${q}`;
}
export type Go = (r: Partial<Route>) => void;
export function useRoute(): [Route, Go] {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  useEffect(() => {
    const on = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const go = useCallback<Go>((r) => { window.location.hash = hrefFor(r); }, []);
  return [route, go];
}

// ------------------------------------------------------------------ scroll reveal + count-up
export function useInView<T extends Element>(opts: IntersectionObserverInit = { threshold: 0.15 }) {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setInView(true); io.disconnect(); } }, opts);
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return [ref, inView] as const;
}

export function useCountUp(target: number, active: boolean, duration = 1400, decimals = 0) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!active) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setV(target); return; }
    let raf = 0; const t0 = performance.now();
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / duration), e = 1 - Math.pow(1 - k, 4);
      setV(target * e);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, active, duration]);
  return decimals ? Number(v.toFixed(decimals)) : Math.round(v);
}

// ------------------------------------------------------------------ live weather (Open-Meteo forecast, keyless, CORS-enabled)
export interface LiveCurrent { temp: number; feels: number; humidity: number; wind: number; time: string }
export interface LiveDay { date: string; tmax: number; feelsMax: number }
export interface LiveWeather { byUnit: Record<string, { current: LiveCurrent; daily: LiveDay[] }>; fetchedAt: number }

/** Live feeds refresh on their own every 10 minutes (and whenever the tab becomes visible again after a long wait). */
export const LIVE_REFRESH_MS = 10 * 60 * 1000;
function useTicker() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let last = Date.now();
    const bump = () => { last = Date.now(); setTick((t) => t + 1); };
    const id = window.setInterval(bump, LIVE_REFRESH_MS);
    const vis = () => { if (document.visibilityState === 'visible' && Date.now() - last > LIVE_REFRESH_MS) bump(); };
    document.addEventListener('visibilitychange', vis);
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', vis); };
  }, []);
  return tick;
}

export function useLiveWeather(units: UnitFeature[]) {
  const [state, setState] = useState<{ status: 'loading' | 'ok' | 'error'; data: LiveWeather | null }>({ status: 'loading', data: null });
  const auto = useTicker();
  useEffect(() => {
    const ctrl = new AbortController();
    const lat = units.map((u) => u.properties.centroid[1].toFixed(3)).join(',');
    const lon = units.map((u) => u.properties.centroid[0].toFixed(3)).join(',');
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m&daily=temperature_2m_max,apparent_temperature_max&forecast_days=7&timezone=Asia%2FKarachi`;
    fetch(url, { signal: ctrl.signal })
      .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then((json) => {
        const arr = Array.isArray(json) ? json : [json];
        const byUnit: LiveWeather['byUnit'] = {};
        arr.forEach((loc, i) => {
          byUnit[units[i].properties.id] = {
            current: { temp: loc.current.temperature_2m, feels: loc.current.apparent_temperature, humidity: loc.current.relative_humidity_2m, wind: loc.current.wind_speed_10m, time: loc.current.time },
            daily: loc.daily.time.map((d: string, k: number) => ({ date: d, tmax: loc.daily.temperature_2m_max[k], feelsMax: loc.daily.apparent_temperature_max[k] })),
          };
        });
        setState({ status: 'ok', data: { byUnit, fetchedAt: Date.now() } });
      })
      .catch((e) => { if (e.name !== 'AbortError') setState((s) => (s.data ? s : { status: 'error', data: null })); });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [units.length, auto]);
  return state;
}

// ------------------------------------------------------------------ live air quality (Open-Meteo / CAMS model, keyless, CORS-enabled)
export interface LiveAirReading { pm25: number; pm10: number; no2: number | null; aqi: number | null; time: string }
export interface LiveAir { byUnit: Record<string, LiveAirReading>; fetchedAt: number }
export type AirState = { status: 'loading' | 'ok' | 'error'; data: LiveAir | null; reload: () => void };

export function useLiveAir(units: UnitFeature[]): AirState {
  const [state, setState] = useState<Omit<AirState, 'reload'>>({ status: 'loading', data: null });
  const [tick, setTick] = useState(0);
  const auto = useTicker();
  useEffect(() => {
    const ctrl = new AbortController();
    setState((s) => (s.data ? s : { ...s, status: 'loading' })); // keep showing the last reading while a refresh runs
    const lat = units.map((u) => u.properties.centroid[1].toFixed(3)).join(',');
    const lon = units.map((u) => u.properties.centroid[0].toFixed(3)).join(',');
    const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=pm2_5,pm10,nitrogen_dioxide,us_aqi&timezone=Asia%2FKarachi`;
    fetch(url, { signal: ctrl.signal })
      .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then((json) => {
        const arr = Array.isArray(json) ? json : [json];
        const byUnit: LiveAir['byUnit'] = {};
        arr.forEach((loc, i) => {
          const c = loc?.current;
          if (c && typeof c.pm2_5 === 'number' && typeof c.pm10 === 'number') {
            byUnit[units[i].properties.id] = { pm25: c.pm2_5, pm10: c.pm10, no2: typeof c.nitrogen_dioxide === 'number' ? c.nitrogen_dioxide : null, aqi: typeof c.us_aqi === 'number' ? c.us_aqi : null, time: c.time };
          }
        });
        if (!Object.keys(byUnit).length) throw new Error('no data');
        setState({ status: 'ok', data: { byUnit, fetchedAt: Date.now() } });
      })
      .catch((e) => { if (e.name !== 'AbortError') setState((s) => (s.data ? s : { status: 'error', data: null })); });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [units.length, tick, auto]);
  return { ...state, reload: () => setTick((t) => t + 1) };
}

// ------------------------------------------------------------------ small utilities
export function useLocalState<T>(key: string, initial: T) {
  const [v, setV] = useState<T>(() => { try { const s = localStorage.getItem(key); return s ? (JSON.parse(s) as T) : initial; } catch { return initial; } });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage may be unavailable */ } }, [key, v]);
  return [v, setV] as const;
}
