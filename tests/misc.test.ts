import { describe, expect, it } from 'vitest';
import { auditNumbers, airBand, classifyCause } from '../src/lib/air';
import { cleanLocal } from '../src/lib/whisperFlow';
import { miniMapPaths } from '../src/lib/miniMap';
import { buildCertificatePdf, pdfSafe } from '../src/lib/certPdf';
import { buildReportHtml } from '../src/lib/report';
import { buildCityInsights } from '../src/lib/insights';
import { DEFAULT_WEIGHTS } from '../src/lib/risk';
import { fakeLive, baseline, climate, meta, scores, units } from './helpers';

describe('air bands and pollution-source guess', () => {
  it('uses the three-band PM2.5 scale', () => { expect(airBand(10).level).toBe('good'); expect(airBand(80).level).toBe('moderate'); expect(airBand(200).level).toBe('hazardous'); expect(airBand(200).outdoorsOk).toBe(false); });
  it('guesses traffic at rush hour with high NO2, and says "clear" for clean air', () => {
    expect(classifyCause({ pm25: 60, pm10: 90, no2: 70, windKmh: 8, hour: 8 }).id).toBe('traffic');
    expect(classifyCause({ pm25: 8, pm10: 20, no2: 10, windKmh: 12, hour: 13 }).id).toBe('clear');
  });
});

describe('air alert fact checker', () => {
  const facts = [{ name: 'PM2.5', value: 15.7 }, { name: 'PM10', value: 31.7 }, { name: 'Wind', value: 6.8 }];
  it('lets a coordinator add N95, times, ages and dates', () => { expect(auditNumbers('PM2.5 is 15.7 µg/m³. Wear an N95 mask, stay in until 2 PM, children under 12, April 16.', facts).ok).toBe(true); });
  it('still blocks a wrong reading', () => { const a = auditNumbers('PM2.5 is 99 µg/m³.', facts); expect(a.ok).toBe(false); expect(a.rows[0].matches).toBeNull(); });
});

describe('voice cleaning ("Whisper Flow", offline rules)', () => {
  it.each([['um I live in uh Orangi, actually Korangi', 'I live in Korangi'], ['Schedule it for 3, actually 4 pm', 'Schedule it for 4 pm'], ['I want to to plant trees you know', 'I want to plant trees'], ['hmm I I prefer outdoor', 'I prefer outdoor']])('%s', (raw, clean) => { expect(cleanLocal(raw)).toBe(clean); });
  it('never returns empty text', () => { expect(cleanLocal('um uh').length).toBeGreaterThan(0); });
});

describe('maps cover the whole city', () => {
  it('every unit centroid lands inside the 600x400 report / coverage map', () => {
    for (const p of miniMapPaths(units)) { expect(p.cx).toBeGreaterThanOrEqual(0); expect(p.cx).toBeLessThanOrEqual(600); expect(p.cy).toBeGreaterThanOrEqual(0); expect(p.cy).toBeLessThanOrEqual(400); }
  });
});

describe('certificate PDF', () => {
  const data = { n: 'Amina Baloch', s: 'Lyari Community School', t: 'Plant dust-barrier saplings in Lyari', h: 2, u: 'Lyari Town', g: 'Sana Ahmed', r: 'Coordinator', d: '2026-11-15', o: 'Karachi Weather Channel', p: 'Planted 4 neem saplings and logged soil moisture.' };
  it('builds a real PDF, with and without a note', async () => {
    const a = await buildCertificatePdf(data); expect(new TextDecoder().decode(a.slice(0, 5))).toBe('%PDF-');
    const b = await buildCertificatePdf({ ...data, p: '', u: 'Karachi' }); expect(b.length).toBeGreaterThan(1000);
  });
  it('keeps accents readable and falls back safely for other scripts', () => { expect(pdfSafe('Café “Nazimabad”')).toBe('Cafe "Nazimabad"'); expect(pdfSafe('اردو')).toBe('????'); });
});

describe('report', () => {
  const live = fakeLive();
  const html = (sections: Record<string, boolean> = {}) => buildReportHtml(
    { title: 'Test report', author: 'Tester', organisation: 'Org', scope: 'all', picks: [], verifiedOnly: false, sections: { summary: true, findings: true, live: true, ranking: true, profiles: true, scenario: false, volunteer: true, method: true, ...sections } },
    { units, scores, weights: DEFAULT_WEIGHTS, meta, insights: buildCityInsights(units, scores, DEFAULT_WEIGHTS, meta), logs: [], medians: { lstDay: 0, lstNight: 0, ndvi: 0, density: 0, health: 0 }, baseline, scenario: { s: { warming: 0, dNdvi: 0, coolShare: 0, coolEffect: 2 }, target: 'unit', unitId: null }, climate, live });
  it('renders every section, with line graphs and the missions volunteers are offered', () => {
    const h = html(); expect(h).toContain('Missions volunteers are being offered right now'); expect((h.match(/<svg/g) ?? []).length).toBeGreaterThan(3); expect(h).toContain('Live conditions and trends'); expect(h).not.toContain('NaN');
  });
  it('shows only complete climate years in the trend graph', () => {
    const partial = climate.years.find((y) => !y.complete)!.year, h = html(), i = h.indexOf('Hot-season maximum temperature by year'), chart = h.slice(i, h.indexOf('<h3>', i + 10));
    expect(i).toBeGreaterThan(0); expect(chart).not.toContain(`>${partial}<`); expect(chart).toContain('>2025<');
  });
  it('lists as many missions as the volunteer hub would', () => { const rows = (html().match(/Cooling-point|No-idling|Plant|Heat-safety|Log field|Prepare mask|Waste-burning|Compare field/g) ?? []).length; expect(rows).toBeGreaterThanOrEqual(8); });
});
