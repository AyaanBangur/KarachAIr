import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import { useTerra } from '../../lib/data';
import { METRICS, metricColor, metricDomain, type MetricKey } from '../../lib/metrics';
import { CYAN, GREEN, THERMAL, VIOLET, type Ramp } from '../../lib/colors';
import { rasterBounds, rasterRange, renderRaster } from '../../lib/raster';
import type { GridRaster } from '../../lib/types';

export type RasterKey = 'lstDay' | 'lstNight' | 'ndvi' | 'pop';
export type LayerSel = { kind: 'unit'; metric: MetricKey } | { kind: 'raster'; key: RasterKey };

export const RASTERS: Record<RasterKey, { label: string; ramp: Ramp; log?: boolean; hideZero?: boolean; unit: string; scale: number; lo: number; hi: number; note: string }> = {
  lstDay: { label: 'Afternoon heat (1 km)', ramp: THERMAL, unit: '°C', scale: 5, lo: 0.02, hi: 0.985, note: 'MODIS/Aqua LST ~13:30, hot-season mean' },
  lstNight: { label: 'Night heat (1 km)', ramp: THERMAL, unit: '°C', scale: 5, lo: 0.02, hi: 0.985, note: 'MODIS/Aqua LST ~01:30, hot-season mean' },
  ndvi: { label: 'Vegetation (250 m)', ramp: GREEN, unit: 'NDVI', scale: 3, lo: 0.02, hi: 0.985, note: 'MODIS/Terra NDVI, hot-season mean' },
  pop: { label: 'Population (1 km)', ramp: VIOLET, log: true, hideZero: true, unit: 'people/cell', scale: 5, lo: 0.02, hi: 0.995, note: 'WorldPop 2020, log colour scale' },
};
export const rasterLegend = (r: GridRaster, key: RasterKey): [number, number] => rasterRange(r, RASTERS[key].lo, RASTERS[key].hi, !!RASTERS[key].hideZero);
export { CYAN };

const VIEW = L.latLngBounds([24.74, 66.80], [25.32, 67.52]);

interface Props {
  layer: LayerSel; selectedId: string | null; onSelect: (id: string | null) => void;
  showFacilities: boolean; opacity: number; compareIds?: string[];
}

export default function MapView({ layer, selectedId, onSelect, showFacilities, opacity, compareIds = [] }: Props) {
  const { data, scores } = useTerra();
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const unitLayer = useRef<L.GeoJSON | null>(null);
  const rasterLayer = useRef<L.ImageOverlay | null>(null);
  const facLayer = useRef<L.LayerGroup | null>(null);
  const hovered = useRef<string | null>(null);
  const cache = useRef(new Map<RasterKey, string>());
  const selRef = useRef(onSelect); selRef.current = onSelect;

  const dom = useMemo(() => (layer.kind === 'unit' ? metricDomain(METRICS[layer.metric], data.units, scores) : ([0, 1] as [number, number])), [layer, data.units, scores]);

  // ---------------------------------------------------------------- init (once)
  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { zoomControl: false, minZoom: 9, maxZoom: 14, maxBounds: L.latLngBounds([24.3, 66.3], [25.9, 68.0]), zoomSnap: 0.25, preferCanvas: true });
    m.fitBounds(VIEW, { animate: false });
    L.control.zoom({ position: 'bottomright' }).addTo(m);
    m.createPane('raster').style.zIndex = '250';
    m.createPane('units').style.zIndex = '400';
    m.createPane('labels').style.zIndex = '450'; m.getPane('labels')!.style.pointerEvents = 'none';
    m.createPane('facilities').style.zIndex = '460';
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', { subdomains: 'abcd', attribution: '© OpenStreetMap contributors © CARTO', maxZoom: 14 }).addTo(m);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png', { subdomains: 'abcd', pane: 'labels', maxZoom: 14, opacity: 0.75 }).addTo(m);

    const gj = L.geoJSON(data.collection, {
      pane: 'units',
      style: () => ({ weight: 1, color: 'rgba(8,13,11,0.9)', fillOpacity: 0.8 }),
      onEachFeature: (f, lyr) => {
        const id = (f.properties as { id: string }).id;
        lyr.on({
          click: () => selRef.current(id),
          mouseover: () => { hovered.current = id; restyle(); },
          mouseout: () => { hovered.current = null; restyle(); },
        });
        lyr.bindTooltip('', { sticky: true, direction: 'top', className: 'tw-tip', opacity: 1, offset: [0, -6] });
      },
    }).addTo(m);
    unitLayer.current = gj;
    facLayer.current = L.layerGroup().addTo(m);
    map.current = m;
    setTimeout(() => m.invalidateSize(), 60);
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(el.current);
    return () => { ro.disconnect(); m.remove(); map.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------- (re)style units
  const restyleRef = useRef<() => void>(() => {});
  function restyle() { restyleRef.current(); }
  restyleRef.current = () => {
    const gj = unitLayer.current; if (!gj) return;
    gj.eachLayer((lyr) => {
      const path = lyr as L.Path & { feature?: { properties: { id: string; name: string } } };
      const id = path.feature!.properties.id;
      const u = data.units.find((x) => x.properties.id === id)!;
      const sel = id === selectedId, hov = id === hovered.current, cmp = compareIds.indexOf(id);
      const base = layer.kind === 'unit' ? metricColor(METRICS[layer.metric], METRICS[layer.metric].value(u, scores.get(id)), dom) : 'transparent';
      path.setStyle({
        fillColor: base,
        fillOpacity: layer.kind === 'unit' ? (sel ? 0.95 : hov ? 0.92 : 0.78) : hov ? 0.12 : 0,
        weight: sel ? 3 : hov ? 2.2 : cmp >= 0 ? 2.4 : 1,
        color: sel ? '#d7f98a' : hov ? '#ffffff' : cmp >= 0 ? ['#1fa3bd', '#d9772a', '#8f80e8'][cmp] : layer.kind === 'unit' ? 'rgba(8,13,11,0.9)' : 'rgba(242,240,230,0.42)',
        className: sel ? 'unit-selected' : '',
      });
      if (sel || hov) path.bringToFront();
      const tip = path.getTooltip();
      if (tip) {
        const s = scores.get(id)!;
        const mDef = layer.kind === 'unit' ? METRICS[layer.metric] : METRICS.hri;
        tip.setContent(`<div class="tw-tip-name">${u.properties.name}</div><div class="tw-tip-row"><span>${mDef.label}</span><b>${mDef.fmt(mDef.value(u, s))}${mDef.unit && mDef.unit !== '°C' && mDef.unit !== '/100' ? ' ' + mDef.unit : ''}</b></div><div class="tw-tip-row"><span>Risk tier</span><b style="color:${s.tier.color}">${s.tier.glyph} ${s.tier.label} · #${s.rank}</b></div>`);
      }
    });
  };
  useEffect(restyle, [layer, selectedId, dom, scores, data.units, compareIds.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------- raster overlay
  useEffect(() => {
    const m = map.current; if (!m) return;
    rasterLayer.current?.remove(); rasterLayer.current = null;
    if (layer.kind !== 'raster') return;
    const r = data.rasters[layer.key]; if (!r) return;
    let url = cache.current.get(layer.key);
    if (!url) {
      const spec = RASTERS[layer.key];
      url = renderRaster(r, { ramp: spec.ramp, range: rasterLegend(r, layer.key), mask: data.units, scale: spec.scale, log: spec.log, hideZero: spec.hideZero }).toDataURL('image/png');
      cache.current.set(layer.key, url);
    }
    const b = rasterBounds(r);
    rasterLayer.current = L.imageOverlay(url, [[b.south, b.west], [b.north, b.east]], { pane: 'raster', opacity, interactive: false }).addTo(m);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layer, data.rasters, data.units]);
  useEffect(() => { rasterLayer.current?.setOpacity(opacity); }, [opacity]);

  // ---------------------------------------------------------------- facilities
  useEffect(() => {
    const g = facLayer.current; if (!g) return;
    g.clearLayers();
    if (!showFacilities) return;
    const canvas = L.canvas({ pane: 'facilities', padding: 0.3 });
    for (const f of data.facilities) {
      const hosp = f.kind === 'hospital';
      L.circleMarker([f.lat, f.lon], { renderer: canvas, radius: hosp ? 4.5 : 2.6, color: '#06201f', weight: hosp ? 1.5 : 0.8, fillColor: hosp ? '#7fe0ea' : '#2aa7b8', fillOpacity: 0.95 })
        .bindTooltip(`${f.name || (hosp ? 'Hospital' : 'Clinic')} · ${hosp ? 'hospital' : 'clinic'}`, { className: 'tw-tip', direction: 'top' }).addTo(g);
    }
  }, [showFacilities, data.facilities]);

  // ---------------------------------------------------------------- pan to selection when it is off-screen
  useEffect(() => {
    const m = map.current, gj = unitLayer.current; if (!m || !gj || !selectedId) return;
    gj.eachLayer((lyr) => {
      const p = lyr as L.Polygon & { feature?: { properties: { id: string } } };
      if (p.feature?.properties.id !== selectedId) return;
      const c = p.getBounds().getCenter();
      if (!m.getBounds().pad(-0.12).contains(c)) m.flyTo(c, Math.max(m.getZoom(), 11), { duration: 0.8 });
    });
  }, [selectedId]);

  return <div ref={el} className="map-canvas" role="application" aria-label="Interactive map of Karachi heat risk by administrative unit. Click a unit to open its details." />;
}

export function resetView(m: L.Map | null) { m?.fitBounds(VIEW); }
