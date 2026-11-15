// Field logs: types, storage and sync. Logs belong to an organization (team). Volunteers see their team's logs,
// organizations see and review their volunteers' logs. Every log is saved on the device first and uploaded when
// online, so nothing is lost offline. Free text is parsed with simple, visible rules (no model).
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { UnitFeature } from './types';
import { ApiError, SHARED_ENABLED, rpc } from './api';
import { useAuth } from './auth';
import { isProof } from './service';

export { SHARED_ENABLED };
export type LogKind = 'temperature' | 'shade' | 'water' | 'health' | 'surface' | 'other';
export type Shade = 'none' | 'partial' | 'full';
export type Measure = 'air' | 'surface';
export type Status = 'pending' | 'verified' | 'flagged';

export const LOG_KINDS: { id: LogKind; label: string; hint: string; color: string; example: string }[] = [
  { id: 'temperature', label: 'Temperature reading', hint: 'A thermometer or infrared reading', color: '#f08a3c', example: '42°C air temperature at the main bus stop, 2:15 pm, no shade' },
  { id: 'shade', label: 'Shade & trees', hint: 'Where shade exists, or is missing', color: '#8bd43a', example: 'Street has no trees for 300 m; only shade is under the flyover' },
  { id: 'water', label: 'Water & cooling point', hint: 'Water coolers, shelters, fans', color: '#3cc3d6', example: 'Free water cooler outside the mosque, queue of ~20 people' },
  { id: 'health', label: 'Heat illness / health', hint: 'Signs of heat stress observed', color: '#ef5b4c', example: 'Two rickshaw drivers resting with dizziness near the market' },
  { id: 'surface', label: 'Roofs, roads & surfaces', hint: 'Tin roofs, dark asphalt, paving', color: '#a08ff5', example: 'Dense tin-roof housing, surface felt very hot to touch' },
  { id: 'other', label: 'Other', hint: 'Anything else worth recording', color: '#959c90', example: 'Power cut lasting 3 hours; fans not working' },
];
export const kindOf = (id: LogKind) => LOG_KINDS.find((k) => k.id === id) ?? LOG_KINDS[LOG_KINDS.length - 1];

export interface VolunteerLog {
  id: string; createdAt: string; observedAt: string; volunteer: string;
  unitId: string | null; place: string; lat: number | null; lon: number | null;
  kind: LogKind; tempC: number | null; measure: Measure | null; shade: Shade | null;
  tags: string[]; notes: string;
  status: Status; reviewNote: string; missionId: string | null;
}
export interface Mission { id: string; title: string; details: string; unitId: string | null; kind: LogKind | null; target: number; active: boolean; createdAt: string; done: number }
export type NewLog = Omit<VolunteerLog, 'id' | 'createdAt' | 'status' | 'reviewNote'>;

interface Row { id: string; created_at: string; observed_at: string; volunteer: string; unit_id: string | null; place: string; lat: number | null; lon: number | null; kind: LogKind; temp_c: number | null; measure: Measure | null; shade: Shade | null; tags: string[]; notes: string; status: Status; review_note: string; mission_id: string | null; mine: boolean }
const fromRow = (r: Row): VolunteerLog => ({ id: r.id, createdAt: r.created_at, observedAt: r.observed_at, volunteer: r.volunteer, unitId: r.unit_id, place: r.place, lat: r.lat, lon: r.lon, kind: r.kind, tempC: r.temp_c == null ? null : Number(r.temp_c), measure: r.measure, shade: r.shade, tags: r.tags ?? [], notes: r.notes, status: r.status, reviewNote: r.review_note ?? '', missionId: r.mission_id });
const toPayload = (l: VolunteerLog) => ({ id: l.id, observed_at: l.observedAt, volunteer: l.volunteer, unit_id: l.unitId, place: l.place, lat: l.lat, lon: l.lon, kind: l.kind, temp_c: l.tempC, measure: l.measure, shade: l.shade, tags: l.tags, notes: l.notes, mission_id: l.missionId });
const round3 = (v: number | null) => (v == null ? null : Math.round(v * 1000) / 1000); // ~100 m: enough for a map, less precise than an address

const readJson = <T,>(k: string, d: T): T => { try { const s = localStorage.getItem(k); return s ? (JSON.parse(s) as T) : d; } catch { return d; } };
const writeJson = (k: string, v: unknown): boolean => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };

export type SyncState = 'local' | 'connecting' | 'online' | 'offline';
interface Ctx {
  /** Field observations only. Proof-of-work submissions are kept separately in `proofs`. */
  logs: VolunteerLog[]; proofs: VolunteerLog[]; /** every record: field logs and accepted missions together */ allLogs: VolunteerLog[]; mine: Set<string>; missions: Mission[];
  add: (l: NewLog) => VolunteerLog; remove: (id: string) => void;
  review: (id: string, status: Status, note?: string) => Promise<void>;
  createMission: (m: { title: string; details: string; unitId: string | null; kind: LogKind | null; target: number }) => Promise<string | null>;
  setMissionActive: (id: string, active: boolean) => Promise<void>;
  sync: SyncState; unsynced: number; refresh: () => void; persisted: boolean; shared: boolean;
}
const LogsCtx = createContext<Ctx | null>(null);
export const useLogs = () => { const c = useContext(LogsCtx); if (!c) throw new Error('useLogs outside LogsProvider'); return c; };

export function LogsProvider({ children }: { children: ReactNode }) {
  const { session, logout } = useAuth();
  const shared = !!session && !!session.org && !session.demo && SHARED_ENABLED;
  const token = session?.token ?? '';
  const ownerKey = session ? (session.member?.id ?? session.org?.id ?? session.volunteer?.id ?? 'none') : 'none';
  const pendKey = `tw-pending-v2-${ownerKey}`, demoKey = 'tw-demo-logs-v2';

  const [remote, setRemote] = useState<VolunteerLog[]>([]);
  const [remoteMine, setRemoteMine] = useState<Set<string>>(new Set());
  const [missions, setMissions] = useState<Mission[]>([]);
  const [pending, setPending] = useState<VolunteerLog[]>([]);
  const [local, setLocal] = useState<VolunteerLog[]>(() => readJson<VolunteerLog[]>(demoKey, []));
  const [sync, setSync] = useState<SyncState>(shared ? 'connecting' : 'local');
  const [persisted, setPersisted] = useState(true);

  // reload per-user local state whenever the signed-in identity changes
  useEffect(() => { setPending(readJson<VolunteerLog[]>(pendKey, [])); setLocal(readJson<VolunteerLog[]>(demoKey, [])); setRemote([]); setMissions([]); setSync(shared ? 'connecting' : 'local'); }, [pendKey, shared]);
  useEffect(() => { if (shared && !writeJson(pendKey, pending)) setPersisted(false); }, [pending, pendKey, shared]);
  useEffect(() => { if (!shared && session && !writeJson(demoKey, local)) setPersisted(false); }, [local, shared, session]);

  const pendRef = useRef(pending); pendRef.current = pending;
  const inFlight = useRef(new Set<string>()); // ids already being uploaded, so a log is never sent twice
  const refresh = useCallback(async () => {
    if (!shared) return;
    try {
      for (const l of pendRef.current) {
        if (inFlight.current.has(l.id)) continue;
        inFlight.current.add(l.id);
        try { await rpc('tw_submit_log', { p_token: token, p: toPayload(l) }); setPending((x) => x.filter((y) => y.id !== l.id)); } finally { inFlight.current.delete(l.id); }
      }
      const rows = await rpc<Row[]>('tw_list_logs', { p_token: token });
      setRemote(rows.map(fromRow)); setRemoteMine(new Set(rows.filter((r) => r.mine).map((r) => r.id)));
      const ms = await rpc<{ id: string; title: string; details: string; unit_id: string | null; kind: LogKind | null; target: number; active: boolean; created_at: string; done: number }[]>('tw_list_missions', { p_token: token });
      setMissions(ms.map((m) => ({ id: m.id, title: m.title, details: m.details, unitId: m.unit_id, kind: m.kind, target: m.target, active: m.active, createdAt: m.created_at, done: Number(m.done) })));
      setSync('online');
    } catch (e) { if (e instanceof ApiError && e.expired) logout(); else setSync('offline'); }
  }, [shared, token, logout]);
  useEffect(() => {
    if (!shared) return;
    void refresh();
    const t = setInterval(() => void refresh(), 30000);
    const on = () => void refresh();
    window.addEventListener('online', on);
    return () => { clearInterval(t); window.removeEventListener('online', on); };
  }, [refresh, shared]);

  const add = useCallback<Ctx['add']>((l) => {
    const log: VolunteerLog = { ...l, lat: round3(l.lat), lon: round3(l.lon), id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`, createdAt: new Date().toISOString(), status: 'pending', reviewNote: '' };
    if (!shared) { setLocal((x) => [log, ...x]); return log; }
    setPending((x) => [log, ...x]);
    inFlight.current.add(log.id);
    void rpc('tw_submit_log', { p_token: token, p: toPayload(log) }).then(() => { setPending((x) => x.filter((y) => y.id !== log.id)); inFlight.current.delete(log.id); void refresh(); }).catch((e) => { inFlight.current.delete(log.id); if (e instanceof ApiError && e.expired) logout(); else setSync('offline'); });
    return log;
  }, [shared, token, refresh, logout]);

  const remove = useCallback((id: string) => {
    setPending((x) => x.filter((y) => y.id !== id)); setLocal((x) => x.filter((y) => y.id !== id)); setRemote((x) => x.filter((y) => y.id !== id));
    if (shared) void rpc('tw_delete_log', { p_token: token, p_id: id }).catch(() => setSync('offline'));
  }, [shared, token]);

  const review = useCallback<Ctx['review']>(async (id, status, note = '') => {
    setRemote((x) => x.map((l) => (l.id === id ? { ...l, status, reviewNote: note } : l)));
    if (shared) { try { await rpc('tw_review_log', { p_token: token, p_id: id, p_status: status, p_note: note }); } catch { setSync('offline'); void refresh(); } }
  }, [shared, token, refresh]);

  const createMission = useCallback<Ctx['createMission']>(async (m) => {
    if (!shared) return 'Missions need the shared database.';
    try { await rpc('tw_create_mission', { p_token: token, p: { title: m.title, details: m.details, unit_id: m.unitId, kind: m.kind, target: m.target } }); await refresh(); return null; }
    catch (e) { return e instanceof ApiError ? e.message : 'Could not create the mission.'; }
  }, [shared, token, refresh]);
  const setMissionActive = useCallback<Ctx['setMissionActive']>(async (id, active) => {
    setMissions((x) => x.map((m) => (m.id === id ? { ...m, active } : m)));
    if (shared) { try { await rpc('tw_set_mission_active', { p_token: token, p_id: id, p_active: active }); } catch { void refresh(); } }
  }, [shared, token, refresh]);

  const allLogs = useMemo(() => {
    if (!shared) return [...local].sort((a, b) => b.observedAt.localeCompare(a.observedAt));
    const ids = new Set(remote.map((r) => r.id));
    return [...remote, ...pending.filter((p) => !ids.has(p.id))].sort((a, b) => b.observedAt.localeCompare(a.observedAt));
  }, [shared, local, remote, pending]);
  const logs = useMemo(() => allLogs.filter((l) => !isProof(l)), [allLogs]);
  const proofs = useMemo(() => allLogs.filter(isProof), [allLogs]);
  const mine = useMemo(() => (shared ? new Set([...remoteMine, ...pending.map((p) => p.id)]) : new Set(local.map((l) => l.id))), [shared, remoteMine, pending, local]);
  const value = useMemo<Ctx>(() => ({ logs, proofs, allLogs, mine, missions, add, remove, review, createMission, setMissionActive, sync, unsynced: pending.length, refresh: () => void refresh(), persisted, shared }), [logs, proofs, allLogs, mine, missions, add, remove, review, createMission, setMissionActive, sync, pending.length, refresh, persisted, shared]);
  return <LogsCtx.Provider value={value}>{children}</LogsCtx.Provider>;
}

// ------------------------------------------------------------------ export
const q = (v: unknown) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export function logsToCsv(logs: VolunteerLog[], units: UnitFeature[]): string {
  const name = (id: string | null) => units.find((u) => u.properties.id === id)?.properties.name ?? '';
  const head = ['id', 'observed_at', 'saved_at', 'volunteer', 'unit', 'place', 'latitude', 'longitude', 'type', 'temperature_c', 'temperature_measure', 'shade', 'tags', 'notes', 'status'];
  return [head.join(','), ...logs.map((l) => [l.id, l.observedAt, l.createdAt, l.volunteer, name(l.unitId), l.place, l.lat, l.lon, kindOf(l.kind).label, l.tempC, l.measure, l.shade, l.tags.join('; '), l.notes, l.status].map(q).join(','))].join('\n');
}

/** A record's map position: its own GPS point if it has one, otherwise the centre of its neighbourhood. */
export function logPosition(l: Pick<VolunteerLog, 'lat' | 'lon' | 'unitId'>, units: UnitFeature[]): [number, number] | null {
  if (l.lat != null && l.lon != null) return [l.lat, l.lon];
  const u = l.unitId ? units.find((x) => x.properties.id === l.unitId) : null;
  return u ? [u.properties.centroid[1], u.properties.centroid[0]] : null;
}
