import { useEffect, useMemo, useRef, useState } from 'react';
import { useTerra } from '../lib/data';
import { THERMAL, VIOLET, rampGradient, thermal } from '../lib/colors';
import { rasterBounds, rasterRange, renderRaster, sampleRaster } from '../lib/raster';
import { makeProjection, unitAt, type View } from '../lib/geo';
import { fmtTemp } from '../lib/format';
import { TierBadge } from './ui';
import type { UnitFeature } from '../lib/types';

/** Hero visual: the real satellite heat field of Karachi, drawn on a canvas, with live pointer readout. */
const VIEW: View = { west: 66.78, east: 67.52, south: 24.74, north: 25.3 };

export function HeatField({ onOpenUnit }: { onOpenUnit: (id: string) => void }) {
  const { data, scores } = useTerra();
  const wrap = useRef<HTMLDivElement>(null);
  const cvs = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 800, h: 640 });
  const [hover, setHover] = useState<{ unit: UnitFeature; px: number | null; x: number; y: number } | null>(null);
  const hoverRef = useRef<typeof hover>(null);
  hoverRef.current = hover;

  const raster = data.rasters.lstDay ?? data.rasters.pop;
  const isLst = !!data.rasters.lstDay;
  const heat = useMemo(() => {
    if (!raster) return null;
    const range = isLst ? rasterRange(raster, 0.03, 0.985) : rasterRange(raster, 0.02, 0.99, true);
    return { canvas: renderRaster(raster, isLst ? { ramp: THERMAL, range, mask: data.units, scale: 5 } : { ramp: VIOLET, range, mask: data.units, scale: 5, log: true, hideZero: true }), range };
  }, [raster, isLst, data.units]);

  useEffect(() => {
    const el = wrap.current; if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el); setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const proj = useMemo(() => makeProjection(VIEW, size.w, size.h, 8), [size]);

  // ------------------------------------------------------------ render loop (scan line + hotspot pulses)
  useEffect(() => {
    const c = cvs.current; if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = size.w * dpr; c.height = size.h * dpr;
    const ctx = c.getContext('2d')!; ctx.scale(dpr, dpr);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const top = [...scores.values()].sort((a, b) => b.rank - a.rank).slice(-3).map((s) => data.units.find((u) => u.properties.id === s.id)!);
    let raf = 0; const t0 = performance.now();

    const outline = (u: UnitFeature) => {
      const polys = u.geometry.type === 'Polygon' ? [u.geometry.coordinates] : u.geometry.coordinates;
      ctx.beginPath();
      for (const p of polys) for (const ring of p) ring.forEach(([lon, lat], i) => { const [x, y] = proj.toXY(lon, lat); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    };

    const draw = (now: number) => {
      const t = (now - t0) / 1000;
      ctx.clearRect(0, 0, size.w, size.h);
      if (heat && raster) {
        const b = rasterBounds(raster);
        const [x0, y0] = proj.toXY(b.west, b.north), [x1, y1] = proj.toXY(b.east, b.south);
        ctx.globalAlpha = 0.95; ctx.drawImage(heat.canvas, x0, y0, x1 - x0, y1 - y0); ctx.globalAlpha = 1;
      }
      // unit outlines
      ctx.lineJoin = 'round';
      for (const u of data.units) { outline(u); ctx.strokeStyle = 'rgba(242,240,230,0.28)'; ctx.lineWidth = 0.8; ctx.stroke(); }
      const h = hoverRef.current;
      if (h) {
        outline(h.unit); ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fill();
        ctx.shadowColor = 'rgba(184,240,74,0.9)'; ctx.shadowBlur = 14; ctx.strokeStyle = '#d7f98a'; ctx.lineWidth = 1.8; ctx.stroke(); ctx.shadowBlur = 0;
      }
      // scanning sweep
      if (!reduce) {
        const k = (t * 0.14) % 1.25 - 0.125, x = k * size.w;
        const g = ctx.createLinearGradient(x - 90, 0, x + 6, 0);
        g.addColorStop(0, 'rgba(184,240,74,0)'); g.addColorStop(1, 'rgba(184,240,74,0.22)');
        ctx.fillStyle = g; ctx.fillRect(x - 90, 0, 96, size.h);
        ctx.fillStyle = 'rgba(205,247,122,0.65)'; ctx.fillRect(x + 5, 0, 1, size.h);
      }
      // pulsing markers on the three highest-risk units
      top.forEach((u, i) => {
        const [x, y] = proj.toXY(u.properties.centroid[0], u.properties.centroid[1]);
        const ph = reduce ? 0.4 : ((t * 0.7 + i * 0.33) % 1);
        ctx.beginPath(); ctx.arc(x, y, 5 + ph * 22, 0, Math.PI * 2); ctx.strokeStyle = `rgba(255,120,90,${0.55 * (1 - ph)})`; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fillStyle = '#ffb199'; ctx.fill();
        ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(10,15,13,0.9)'; ctx.stroke();
        ctx.font = '600 11px Geist Variable, system-ui, sans-serif'; ctx.fillStyle = 'rgba(242,240,230,0.92)';
        ctx.shadowColor = 'rgba(0,0,0,0.85)'; ctx.shadowBlur = 5; ctx.fillText(`#${scores.get(u.properties.id)?.rank}  ${u.properties.short}`, x + 10, y + 4); ctx.shadowBlur = 0;
      });
      raf = requestAnimationFrame(draw); // cheap (24 polygons); keeps hover highlight live even with reduced motion
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [size, proj, heat, raster, data.units, scores]);

  const pointer = (e: React.PointerEvent) => {
    const r = cvs.current!.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const [lon, lat] = proj.toLonLat(x, y);
    const u = unitAt(data.units, lon, lat);
    setHover(u ? { unit: u, px: raster && isLst ? sampleRaster(raster, lon, lat) : null, x, y } : null);
  };

  const hs = hover ? scores.get(hover.unit.properties.id) : null;
  return (
    <div className="heatfield" ref={wrap}>
      <canvas ref={cvs} style={{ width: size.w, height: size.h, cursor: hover ? 'pointer' : 'crosshair', touchAction: 'pan-y' }}
        onPointerMove={pointer} onPointerDown={pointer} onPointerLeave={() => setHover(null)}
        onClick={() => hover && onOpenUnit(hover.unit.properties.id)} role="img"
        aria-label="Map of Karachi's 24 administrative units coloured by afternoon land-surface temperature. Hover or tap a unit to read its values." />
      {hover && hs && (
        <div className="hf-readout glass" style={{ left: Math.min(size.w - 236, Math.max(8, hover.x + 16)), top: Math.min(size.h - 150, Math.max(8, hover.y + 16)) }}>
          <div className="hf-name">{hover.unit.properties.name}</div>
          <div className="hf-row">
            <span className="hf-temp mono" style={{ color: thermal(0.75) }}>{fmtTemp(hover.px ?? hover.unit.properties.lst?.day)}</span>
            <span className="muted" style={{ fontSize: 12 }}>{hover.px != null ? 'surface temp here (1 km pixel)' : 'afternoon surface temp'}</span>
          </div>
          <div className="hf-row"><TierBadge index={hs.index} compact /><span className="muted" style={{ fontSize: 12 }}>rank {hs.rank} of {data.units.length} · click to open</span></div>
        </div>
      )}
      {heat && (
        <div className="hf-legend glass">
          <div className="hf-legend-title">{isLst ? 'Afternoon surface temperature · hot-season mean' : 'Population density (log scale)'}</div>
          <div className="legend-bar" style={{ background: rampGradient(isLst ? THERMAL : VIOLET) }} />
          <div className="mono hf-legend-ends"><span>{isLst ? `${heat.range[0].toFixed(0)}°C` : 'sparse'}</span><span>{isLst ? `${heat.range[1].toFixed(0)}°C` : 'dense'}</span></div>
        </div>
      )}
    </div>
  );
}
