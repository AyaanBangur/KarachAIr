// Community-service hours: the volunteer filters and ACCEPTS a mission -> the organization records the proof and verifies it
// -> the volunteer's record shows the verified hours and a certificate. Volunteers never submit or see the proof.
// Accepted missions are stored as ordinary logs (kind "other") tagged `volunteer-mission`, so the shared database works
// unchanged. The organization's verification (signer, verified hours, proof) lives in the log's review note.
import type { VolunteerLog } from './logs';
import { airBand, type AirBand } from './air';
import type { LiveAirReading } from './hooks';

export const PROOF_TAG = 'volunteer-mission';
export const isProof = (l: Pick<VolunteerLog, 'tags'>) => l.tags.includes(PROOF_TAG);

// ------------------------------------------------------------------ air-safety gate (under-18 rule)
export interface Gate { band: AirBand | null; pm25: number | null; aqi: number | null; simulated: boolean; outdoorOpen: boolean; chip: string; text: string }

export function gateFor(reading: LiveAirReading | null, simulate: boolean, place: string): Gate {
  if (simulate) {
    const band = airBand(999);
    return { band, pm25: null, aqi: null, simulated: true, outdoorOpen: false, chip: 'OUTDOOR MISSIONS LOCKED · HAZARDOUS AIR (SIMULATED)', text: `Simulated hazardous air in ${place}: every outdoor mission is locked automatically; indoor missions stay open.` };
  }
  if (!reading) return { band: null, pm25: null, aqi: null, simulated: false, outdoorOpen: false, chip: 'LIVE AIR STATUS UNAVAILABLE · OUTDOOR LOCKED', text: `Could not load live air quality for ${place}, so outdoor missions stay locked until it loads. Indoor missions are open.` };
  const band = airBand(reading.pm25);
  const aqi = reading.aqi != null ? ` (US AQI ${Math.round(reading.aqi)})` : '';
  return band.outdoorsOk
    ? { band, pm25: reading.pm25, aqi: reading.aqi, simulated: false, outdoorOpen: true, chip: 'OUTDOOR MISSIONS UNLOCKED · ADULT-SUPERVISED', text: `Current air quality in ${place}${aqi} permits supervised outdoor missions. Under-18 volunteers must always have an adult present.` }
    : { band, pm25: reading.pm25, aqi: reading.aqi, simulated: false, outdoorOpen: false, chip: 'OUTDOOR MISSIONS LOCKED · HAZARDOUS AIR', text: `PM2.5 in ${place}${aqi} is hazardous, so outdoor missions are locked. Indoor missions still count.` };
}

// ------------------------------------------------------------------ missions (generated from the report's data, see needs.ts)
export type Focus = 'air' | 'heat';
export interface Mission {
  id: string; tier: string; tierLabel: string; hours: number; min: number; max: number;
  where: 'indoor' | 'outdoor'; focus: Focus; title: string; desc: string; trigger: string;
}

export interface Filters { where: 'any' | 'indoor' | 'outdoor'; focus: 'any' | Focus }
export function matchesFilters(m: Mission, f: Filters): boolean {
  if (f.where !== 'any' && m.where !== f.where) return false;
  if (f.focus !== 'any' && m.focus !== f.focus) return false;
  return true;
}

export const missionLocked = (m: Mission, gate: Gate) => m.where === 'outdoor' && !gate.outdoorOpen;
export const fmtH = (h: number) => (h % 1 === 0 ? String(h) : h.toFixed(1));
const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

// ------------------------------------------------------------------ the accepted mission (written by the volunteer)
export interface AcceptInput { mission: Mission; hours: number; student: string; school: string; gate: Gate }
export const acceptTags = (i: AcceptInput) => [PROOF_TAG, `m:${i.mission.id}`, `h:${i.hours}`, `t:${i.mission.tier}`, `w:${i.mission.where}`];
export function acceptNote(i: AcceptInput): string {
  const air = i.gate.simulated ? 'simulated hazardous' : i.gate.band ? `${i.gate.band.label.toLowerCase()}${i.gate.pm25 != null ? ` (PM2.5 ${i.gate.pm25.toFixed(1)})` : ''}` : 'unknown';
  return [
    `MISSION ACCEPTED, ${i.mission.title}, ${fmtH(i.hours)} h`,
    `Student: ${clean(i.student).slice(0, 60)} · School: ${clean(i.school).slice(0, 80)}`,
    i.mission.where === 'outdoor' ? 'Volunteer confirmed an adult will be present for this outdoor mission.' : 'Indoor mission.',
    `Air when accepted: ${air}`,
  ].join('\n');
}

// ------------------------------------------------------------------ the organization's verification (proof stays with the organization)
export interface Signer { name: string; role: string; date: string; hours: number | null; proof: string }
/** Review note: "[signer=…; role=…; date=YYYY-MM-DD; hours=2.5] proof text" (the database allows 300 characters). */
export function verifyNote(s: { name: string; role: string; hours: number; proof: string }, date = new Date()): string {
  const f = (v: string, n: number) => clean(v).replace(/[;\]\[]/g, ' ').slice(0, n);
  return `[signer=${f(s.name, 50)}; role=${f(s.role, 60)}; date=${date.toISOString().slice(0, 10)}; hours=${s.hours}] ${clean(s.proof).slice(0, 130)}`.trim();
}
export function parseVerification(note: string): Signer | null {
  const m = note.match(/^\[signer=([^;\]]*); role=([^;\]]*); date=(\d{4}-\d{2}-\d{2}); hours=([\d.]+)\]\s*(.*)$/s);
  return m ? { name: m[1].trim(), role: m[2].trim(), date: m[3], hours: parseFloat(m[4]), proof: m[5].trim() } : null;
}

export interface Proof {
  log: VolunteerLog; id: string; title: string;
  /** Id of the mission (tag m:…), used to keep the certificate link short. */
  missionKey: string;
  /** Hours the volunteer committed to. */
  hours: number;
  /** Hours the organization verified (what counts, and what the certificate shows). */
  verifiedHours: number;
  tier: string; where: 'indoor' | 'outdoor';
  student: string; school: string; unitId: string | null;
  status: VolunteerLog['status']; signer: Signer | null;
  /** Organization's note when it did not verify the work. */
  declineNote: string;
}
const tagOf = (tags: string[], k: string) => tags.find((t) => t.startsWith(`${k}:`))?.slice(k.length + 1) ?? '';

export function parseProof(l: VolunteerLog): Proof {
  const head = l.notes.split('\n')[0].replace(/^MISSION ACCEPTED, /, '');
  const hours = parseFloat(tagOf(l.tags, 'h')) || 0;
  const so = l.status === 'verified' ? parseVerification(l.reviewNote) : null;
  const sp = l.notes.match(/^Student: (.*?) · School: (.*)$/m);
  return {
    log: l, id: l.id, missionKey: tagOf(l.tags, 'm'), title: head.replace(/, [\d.]+ h$/, ''), hours, verifiedHours: so?.hours ?? hours,
    tier: tagOf(l.tags, 't') || '2', where: tagOf(l.tags, 'w') === 'outdoor' ? 'outdoor' : 'indoor',
    student: sp?.[1]?.trim() || l.volunteer, school: /^not given$/i.test(sp?.[2]?.trim() ?? '') ? '' : sp?.[2]?.trim() ?? '', unitId: l.unitId, status: l.status, signer: so,
    declineNote: l.status === 'flagged' ? l.reviewNote : '',
  };
}

// ------------------------------------------------------------------ organization summary (verified hours only)
export interface Summary { verifiedHours: number; pendingHours: number; signed: number; pending: number; declined: number; volunteers: number; units: number; byTier: Record<string, number>; byUnit: { unitId: string | null; hours: number; missions: number }[] }
export function summarize(proofs: Proof[], unitId: string | null): Summary {
  const scope = proofs.filter((p) => !unitId || p.unitId === unitId);
  const signed = scope.filter((p) => p.status === 'verified');
  const byTier: Record<string, number> = {};
  signed.forEach((p) => { byTier[p.tier] = (byTier[p.tier] ?? 0) + p.verifiedHours; });
  const unitMap = new Map<string | null, { hours: number; missions: number }>();
  signed.forEach((p) => { const u = unitMap.get(p.unitId) ?? { hours: 0, missions: 0 }; u.hours += p.verifiedHours; u.missions++; unitMap.set(p.unitId, u); });
  return {
    verifiedHours: signed.reduce((t, p) => t + p.verifiedHours, 0), pendingHours: scope.filter((p) => p.status === 'pending').reduce((t, p) => t + p.hours, 0),
    signed: signed.length, pending: scope.filter((p) => p.status === 'pending').length, declined: scope.filter((p) => p.status === 'flagged').length,
    volunteers: new Set(signed.map((p) => p.log.volunteer)).size, units: new Set(signed.map((p) => p.unitId).filter(Boolean)).size,
    byTier, byUnit: [...unitMap.entries()].map(([id, v]) => ({ unitId: id, ...v })).sort((a, b) => b.hours - a.hours),
  };
}

export const TIER_NAME: Record<string, string> = { '1': 'Tier 1 · Quick Action', '2': 'Tier 2 · Field Audit', '3': 'Tier 3 · Stewardship', waste: 'Waste & burning', traffic: 'Traffic & no-idling', trees: 'Trees & dust', health: 'Health & masks', sensors: 'Sensors & data' };
export const STATUS_TEXT = { pending: { label: 'Accepted · awaiting verification', cls: '' }, verified: { label: 'Verified', cls: 'ok' }, flagged: { label: 'Not verified', cls: 'bad' } } as const;

export const ago = (iso: string) => { const m = Math.round((Date.now() - +new Date(iso)) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} mins ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };
