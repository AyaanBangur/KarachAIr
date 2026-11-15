// Sign-in for the two roles. Organizations sign in with a name + passcode; volunteers join with their
// volunteers have their own accounts (email + password) and then join an organization. Sessions are random tokens held in localStorage; the database stores only their hash.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
const read = (store: Storage): Session | null => { try { const v = store.getItem(KEY); return v ? (JSON.parse(v) as Session) : null; } catch { return null; } };
/**
 * Every browser tab keeps its OWN sign-in (in session storage), so two tabs can be two different accounts, and signing in,
 * out or refreshing in one tab never touches the other. A "remembered" copy in local storage only lets a brand-new tab, or a
 * reopened browser, start signed in: it is copied into that tab and from then on the tab is independent.
 */
const load = (): Session | null => {
  const own = read(sessionStorage); if (own) return own;
  const remembered = read(localStorage);
  if (remembered) { try { sessionStorage.setItem(KEY, JSON.stringify(remembered)); } catch { /* blocked */ } }
  return remembered;
};
const save = (s: Session | null, remember = true) => {
  try {
    if (s) { sessionStorage.setItem(KEY, JSON.stringify(s)); if (remember) localStorage.setItem(KEY, JSON.stringify(s)); }
    else { // signing out of this tab: forget the remembered copy only if it is this same sign-in
      const own = read(sessionStorage), remembered = read(localStorage);
      sessionStorage.removeItem(KEY);
      if (own && remembered && remembered.token === own.token) localStorage.removeItem(KEY);
    }
  } catch { /* storage may be blocked */ }
};

// Tabs can share the same sign-in (a new tab copies the remembered one). Signing out must not end the server session while another tab still uses it.
const TAB_ID = Math.random().toString(36).slice(2);
async function otherTabUsesToken(token: string): Promise<boolean> {
  if (typeof BroadcastChannel === 'undefined') return false;
  return new Promise((resolve) => {
    const bc = new BroadcastChannel('tw-auth');
    const done = (v: boolean) => { clearTimeout(timer); bc.close(); resolve(v); };
    const timer = setTimeout(() => done(false), 300);
    bc.onmessage = (e: MessageEvent) => { if (e.data?.type === 'have' && e.data.token === token && e.data.from !== TAB_ID) done(true); };
    bc.postMessage({ type: 'who', token, from: TAB_ID });
  });
}

interface Ctx {
  session: Session | null; checking: boolean;
  registerOrg: (name: string, pass: string, email: string) => Promise<string | null>;   // each returns an error message, or null on success
  loginOrg: (name: string, pass: string) => Promise<string | null>;
  signUpVolunteer: (name: string, email: string, pass: string) => Promise<string | null>;
  loginVolunteer: (email: string, pass: string) => Promise<string | null>;
  joinOrg: (orgId: string, code: string) => Promise<string | null>;
  leaveOrg: () => void;
  startDemo: (role: Role) => void;
  logout: () => void;
}
const AuthCtx = createContext<Ctx | null>(null);
export const useAuth = () => { const c = useContext(AuthCtx); if (!c) throw new Error('useAuth outside AuthProvider'); return c; };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(load);
  const [checking, setChecking] = useState(() => !!load() && !load()!.demo && SHARED_ENABLED);

  const set = useCallback((s: Session | null, remember = true) => { setSession(s); save(s, remember); }, []);
  const sessionRef = useRef(session); sessionRef.current = session;
  // answer other tabs that ask whether this tab is still using a sign-in
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const bc = new BroadcastChannel('tw-auth');
    bc.onmessage = (e: MessageEvent) => { if (e.data?.type === 'who' && e.data.from !== TAB_ID && sessionRef.current?.token === e.data.token) bc.postMessage({ type: 'have', token: e.data.token, from: TAB_ID }); };
    return () => bc.close();
  }, []);

  // Validate a stored session once on load (also refreshes the organization details).
  useEffect(() => {
    const s = load();
    if (!s || s.demo || !SHARED_ENABLED) { setChecking(false); return; }
    rpc<{ error?: string; role: Role; org: Session['org']; volunteer?: Session['volunteer']; member?: Session['member'] }>('tw_me', { p_token: s.token })
      .then((r) => { if (r.error) set(null); else set({ ...s, role: r.role, org: r.org ?? null, volunteer: r.volunteer ?? null, member: r.member ?? null }, false); })
      .catch((e) => { if (e instanceof ApiError && e.expired) set(null); /* offline: keep the session */ })
      .finally(() => setChecking(false));
  }, [set]);

  const apply = useCallback(async (call: Promise<Reply>): Promise<string | null> => {
    try { const r = await call; if ('error' in r) return r.error; set(r); return null; }
    catch (e) { return e instanceof ApiError && e.status === 0 ? 'The shared database is not configured for this build.' : 'Could not reach the server. Check your connection and try again.'; }
  }, [set]);

  const value = useMemo<Ctx>(() => ({
    session, checking,
    registerOrg: async (name, pass, email) => {
      // an email is kept with the organization so a forgotten passcode can be reset by email
      try {
        const r = await rpc<Reply>('tw_register_org', { p_name: name, p_pass: pass });
        if ('error' in r) return r.error;
        await rpc('tw_set_org_email', { p_token: r.token, p_email: email }).catch(() => undefined);
        set(r); return null;
      } catch (e) { return e instanceof ApiError && e.status === 0 ? 'The shared database is not configured for this build.' : 'Could not reach the server. Check your connection and try again.'; }
    },
    loginOrg: (name, pass) => apply(rpc<Reply>('tw_org_login', { p_name: name, p_pass: pass })),
    signUpVolunteer: (name, email, pass) => apply(rpc<Reply>('tw_volunteer_signup', { p_name: name, p_email: email, p_pass: pass })),
    loginVolunteer: (email, pass) => apply(rpc<Reply>('tw_volunteer_login', { p_email: email, p_pass: pass })),
    joinOrg: async (orgId, code) => {
      if (!session) return 'Please sign in again.';
      try { const r = await rpc<{ error?: string; org: NonNullable<Session['org']>; member: NonNullable<Session['member']> }>('tw_join_org_code', { p_token: session.token, p_org: orgId, p_code: code }); if (r.error) return r.error; set({ ...session, org: r.org, member: r.member }); return null; }
      catch { return 'Could not reach the server. Check your connection and try again.'; }
    },
    leaveOrg: () => { if (!session) return; if (!session.demo && SHARED_ENABLED) void rpc('tw_leave_org', { p_token: session.token }).catch(() => undefined); set({ ...session, org: null, member: null }); },
    startDemo: (role) => set({ token: 'demo', demo: true, role, org: { id: 'demo', name: 'Local demo team' }, member: role === 'volunteer' ? { id: 'demo-member', name: 'Demo volunteer' } : null }),
    logout: () => {
      const t = session?.token, real = !!t && !session?.demo && SHARED_ENABLED;
      set(null); window.location.hash = '#/login';
      // end the account's session on the server only when no other tab is still signed in with it
      if (real) void otherTabUsesToken(t!).then((used) => { if (!used) return rpc('tw_logout', { p_token: t }).catch(() => undefined); });
    },
  }), [session, checking, apply, set]);

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
