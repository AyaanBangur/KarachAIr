// Supabase Edge Function: emails a volunteer (or an organization) a one-hour password reset link.
// Deploy with verify_jwt = false (the page calls it before anyone is signed in). Secrets to set in Supabase:
//   RESEND_API_KEY   an API key from https://resend.com (free tier works)
//   RESET_FROM       optional sender, e.g. "KarachAir <no-reply@your-verified-domain>" (default: Resend's test sender,
//                    which can only deliver to the Resend account owner until a domain is verified)
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase automatically.
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'apikey, content-type, authorization, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'POST only' });
  const resendKey = Deno.env.get('RESEND_API_KEY');
  if (!resendKey) return json(501, { error: 'email_not_configured' });

  let email = '', orgName = '';
  try { const b = (await req.json()) as { email?: string; orgName?: string }; email = String(b.email ?? '').trim(); orgName = String(b.orgName ?? '').trim().slice(0, 80); } catch { return json(400, { error: 'bad_request' }); }
  if (!email || email.length > 120 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json(200, { ok: true });

  // the link goes back to the site the request came from (https or localhost only)
  const origin = req.headers.get('origin') ?? '';
  if (!/^https:\/\/[^/]+$/.test(origin) && !/^http:\/\/localhost:\d+$/.test(origin)) return json(200, { ok: true });

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data, error } = await db.rpc('tw_create_reset', { p_email: email, p_org_name: orgName || null });
  if (error) return json(502, { error: 'database' });
  // always answer the same way, so nobody can use this to find out which emails have accounts
  if (!data?.found || data.limited || !data.token) return json(200, { ok: true });

  const link = `${origin}/#/login/reset?token=${encodeURIComponent(data.token)}`;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: Deno.env.get('RESET_FROM') ?? 'KarachAir <onboarding@resend.dev>',
      to: [data.email],
      subject: data.kind === 'org' ? 'Reset your KarachAir organization passcode' : 'Reset your KarachAir password',
      html: `<p>Hi ${esc(data.name ?? 'there')},</p><p>We got a request to reset your KarachAir ${data.kind === 'org' ? 'organization passcode' : 'password'}. This link works once and expires in one hour:</p><p><a href="${esc(link)}">Choose a new password</a></p><p>If you did not ask for this, you can ignore this email and your password will stay the same.</p>`,
    }),
  });
  return res.ok ? json(200, { ok: true }) : json(502, { error: 'email_failed' });
});
