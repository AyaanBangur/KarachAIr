// Sign-in for the two roles. Organizations sign in with a name + passcode; volunteers join with their
// volunteers have their own accounts (email + password) and then join an organization. Sessions are random tokens held in localStorage; the database stores only their hash.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ApiError, SHARED_ENABLED, rpc } from './api';

export type Role = 'org' | 'volunteer';
export interface Session {
  token: string; role: Role; demo?: boolean;
  org: { id: string; name: string } | null;                 // null until a volunteer has joined an organization
  volunteer?: { id: string; name: string; email: string } | null;
  member?: { id: string; name: string; email?: string } | null;
}
type Reply = Session | { error: string };
const KEY = 'tw-session-v1';
const load = (): Session | null => { try { const s = localStorage.getItem(KEY); return s ? (JSON.parse(s) as Session) : null; } catch { return null; } };
const save = (s: Session | null) => { try { s ? localStorage.setItem(KEY, JSON.stringify(s)) : localStorage.removeItem(KEY); } catch { /* storage may be blocked */ } };

interface Ctx {
  session: Session | null; checking: boolean;
  registerOrg: (name: string, pass: string) => Promise<string | null>;   // each returns an error message, or null on success
  loginOrg: (name: string, pass: string) => Promise<string | null>;
  signUpVolunteer: (name: string, email: string, pass: string) => Promise<string | null>;
  loginVolunteer: (email: string, pass: string) => Promise<string | null>;
  joinOrg: (orgId: string) => Promise<string | null>;
  leaveOrg: () => void;
  startDemo: (role: Role) => void;
  logout: () => void;
}
const AuthCtx = createContext<Ctx | null>(null);
export const useAuth = () => { const c = useContext(AuthCtx); if (!c) throw new Error('useAuth outside AuthProvider'); return c; };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(load);
  const [checking, setChecking] = useState(() => !!load() && !load()!.demo && SHARED_ENABLED);

  const set = useCallback((s: Session | null) => { setSession(s); save(s); }, []);

  // Validate a stored session once on load (also refreshes the organization details).
  useEffect(() => {
    const s = load();
    if (!s || s.demo || !SHARED_ENABLED) { setChecking(false); return; }
    rpc<{ error?: string; role: Role; org: Session['org']; volunteer?: Session['volunteer']; member?: Session['member'] }>('tw_me', { p_token: s.token })
      .then((r) => { if (r.error) set(null); else set({ ...s, role: r.role, org: r.org ?? null, volunteer: r.volunteer ?? null, member: r.member ?? null }); })
      .catch((e) => { if (e instanceof ApiError && e.expired) set(null); /* offline: keep the session */ })
      .finally(() => setChecking(false));
  }, [set]);

  const apply = useCallback(async (call: Promise<Reply>): Promise<string | null> => {
    try { const r = await call; if ('error' in r) return r.error; set(r); return null; }
    catch (e) { return e instanceof ApiError && e.status === 0 ? 'The shared database is not configured for this build.' : 'Could not reach the server. Check your connection and try again.'; }
  }, [set]);

  const value = useMemo<Ctx>(() => ({
    session, checking,
    registerOrg: (name, pass) => apply(rpc<Reply>('tw_register_org', { p_name: name, p_pass: pass })),
    loginOrg: (name, pass) => apply(rpc<Reply>('tw_org_login', { p_name: name, p_pass: pass })),
    signUpVolunteer: (name, email, pass) => apply(rpc<Reply>('tw_volunteer_signup', { p_name: name, p_email: email, p_pass: pass })),
    loginVolunteer: (email, pass) => apply(rpc<Reply>('tw_volunteer_login', { p_email: email, p_pass: pass })),
    joinOrg: async (orgId) => {
      if (!session) return 'Please sign in again.';
      try { const r = await rpc<{ error?: string; org: NonNullable<Session['org']>; member: NonNullable<Session['member']> }>('tw_join_org', { p_token: session.token, p_org: orgId }); if (r.error) return r.error; set({ ...session, org: r.org, member: r.member }); return null; }
      catch { return 'Could not reach the server. Check your connection and try again.'; }
    },
    leaveOrg: () => { if (!session) return; if (!session.demo && SHARED_ENABLED) void rpc('tw_leave_org', { p_token: session.token }).catch(() => undefined); set({ ...session, org: null, member: null }); },
    startDemo: (role) => set({ token: 'demo', demo: true, role, org: { id: 'demo', name: 'Local demo team' }, member: role === 'volunteer' ? { id: 'demo-member', name: 'Demo volunteer' } : null }),
    logout: () => { const t = session?.token; if (t && !session?.demo && SHARED_ENABLED) void rpc('tw_logout', { p_token: t }).catch(() => undefined); set(null); window.location.hash = '#/login'; },
  }), [session, checking, apply, set]);

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
