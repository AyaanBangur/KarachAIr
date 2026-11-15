// Thin client for the shared database. Every call is a token-checked Postgres function (no direct table access).
export const SB_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '');
const SB_KEY = import.meta.env.VITE_SUPABASE_KEY as string | undefined;
export const SHARED_ENABLED = !!(SB_URL && SB_KEY);

export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string) { super(message); }
  get expired() { return this.code === '28000'; }
}

export async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  if (!SHARED_ENABLED) throw new ApiError('Shared database is not configured.', 0);
  const res = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: SB_KEY!, 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
  const text = await res.text();
  let json: unknown = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON error body */ }
  if (!res.ok) { const j = (json ?? {}) as { message?: string; code?: string }; throw new ApiError(j.message ?? `HTTP ${res.status}`, res.status, j.code); }
  return json as T;
}

/** Ask for a password reset email. Resolves 'sent' when the request was accepted, or 'unavailable' when the email service is not switched on yet. */
export async function requestPasswordReset(email: string, orgName?: string): Promise<'sent' | 'unavailable'> {
  if (!SHARED_ENABLED) return 'unavailable';
  try {
    const res = await fetch(`${SB_URL}/functions/v1/request-password-reset`, { method: 'POST', headers: { apikey: SB_KEY!, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, orgName: orgName || undefined }) });
    return res.ok ? 'sent' : 'unavailable';
  } catch { return 'unavailable'; }
}
