import { lazy, Suspense, useMemo, useState } from 'react';
import { useTerra } from '../../lib/data';
import { METRICS, METRIC_ORDER, metricDomain, metricDomainLabels, metricGradient } from '../../lib/metrics';
import { rampGradient, TIERS } from '../../lib/colors';
import { Toggle, ScaleLegend, Slider } from '../ui';
import { Layers } from '../icons';
import { RASTERS, rasterLegend, type LayerSel, type RasterKey } from '../map/MapView';

const MapView = lazy(() => import('../map/MapView'));

export function MapExplorer({ selectedId, onSelect, compareIds }: { selectedId: string | null; onSelect: (id: string | null) => void; compareIds: string[] }) {
  const { data, scores } = useTerra();
  const [layer, setLayer] = useState<LayerSel>({ kind: 'unit', metric: 'hri' });
  const [facilities, setFacilities] = useState(false);
  const [opacity, setOpacity] = useState(0.85);
  const [panelOpen, setPanelOpen] = useState(true);

  const legend = useMemo(() => {
    if (layer.kind === 'unit') {
      const m = METRICS[layer.metric];
      const dom = metricDomain(m, data.units, scores);
      const [a, b] = metricDomainLabels(m, dom);
      return { label: `${m.label}${m.unit && m.unit !== '°C' ? ` (${m.unit})` : ''}`, gradient: metricGradient(m), min: a, max: b, unit: m.unit === '°C' ? '°C' : '', note: m.blurb };
    }
    const spec = RASTERS[layer.key], r = data.rasters[layer.key];
    const [lo, hi] = r ? rasterLegend(r, layer.key) : [0, 1];
    const f = (v: number) => (layer.key === 'ndvi' ? v.toFixed(2) : layer.key === 'pop' ? Math.round(v).toLocaleString() : v.toFixed(0));
    return { label: spec.label, gradient: rampGradient(spec.ramp), min: f(lo), max: f(hi), unit: layer.key === 'lstDay' || layer.key === 'lstNight' ? '°C' : '', note: spec.note };
  }, [layer, data, scores]);

  const rasterKeys = (['lstDay', 'lstNight', 'ndvi', 'pop'] as RasterKey[]).filter((k) => data.rasters[k]);

  return (
    <div className="map-shell card">
      <Suspense fallback={<div className="map-loading"><div className="skeleton" style={{ position: 'absolute', inset: 0, borderRadius: 0 }} /></div>}>
        <MapView layer={layer} selectedId={selectedId} onSelect={onSelect} showFacilities={facilities} opacity={opacity} compareIds={compareIds} />
      </Suspense>

      <div className={`map-panel glass ${panelOpen ? '' : 'closed'}`}>
        <button className="map-panel-head" onClick={() => setPanelOpen((o) => !o)} aria-expanded={panelOpen}><Layers />Layers<span className="muted mono" style={{ marginLeft: 'auto', fontSize: 11 }}>{panelOpen ? 'hide' : 'show'}</span></button>
        {panelOpen && (
          <div className="map-panel-body">
            <div className="layer-group">
              <div className="layer-label">Neighbourhood metric</div>
              {METRIC_ORDER.map((k) => (
                <button key={k} className={`layer-opt ${layer.kind === 'unit' && layer.metric === k ? 'on' : ''}`} onClick={() => setLayer({ kind: 'unit', metric: k })} aria-pressed={layer.kind === 'unit' && layer.metric === k}>
                  <i className="layer-swatch" style={{ background: metricGradient(METRICS[k]) }} />{METRICS[k].label}
                </button>
              ))}
            </div>
            {rasterKeys.length > 0 && (
              <div className="layer-group">
                <div className="layer-label">Satellite pixels</div>
                {rasterKeys.map((k) => (
                  <button key={k} className={`layer-opt ${layer.kind === 'raster' && layer.key === k ? 'on' : ''}`} onClick={() => setLayer({ kind: 'raster', key: k })} aria-pressed={layer.kind === 'raster' && layer.key === k}>
                    <i className="layer-swatch" style={{ background: rampGradient(RASTERS[k].ramp) }} />{RASTERS[k].label}
                  </button>
                ))}
              </div>
            )}
            <div className="layer-group">
              <Toggle checked={facilities} onChange={setFacilities}>Hospitals &amp; clinics <span className="muted">({data.facilities.length.toLocaleString()})</span></Toggle>
              {layer.kind === 'raster' && <Slider label="Layer opacity" value={opacity} min={0.3} max={1} step={0.05} onChange={setOpacity} format={(v) => `${Math.round(v * 100)}%`} />}
            </div>
          </div>
        )}
      </div>

      <div className="map-legend glass">
        <ScaleLegend label={legend.label} gradient={legend.gradient} min={legend.min} max={legend.max} unit={legend.unit} />
        <div className="map-legend-note">{legend.note}</div>
        {layer.kind === 'unit' && layer.metric === 'hri' && <div className="tier-legend tl-compact">{TIERS.map((t) => <span key={t.key} className="tier-key"><i style={{ background: t.color }} />{t.label}</span>)}</div>}
      </div>
      <div className="map-hint chip glass">Click any unit for details</div>
    </div>
  );
}
