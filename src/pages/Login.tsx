import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { OrgLogo } from '../components/OrgLogo';
import { BrandLogo } from '../components/BrandLogo';
import { requestPasswordReset, rpc } from '../lib/api';
import { useAuth } from '../lib/auth';
import { SHARED_ENABLED } from '../lib/api';
import { hrefFor, type Go } from '../lib/hooks';
import { ArrowRight, Check, Leaf, Satellite, Sparkle, Users } from '../components/icons';
import { Seg } from '../components/ui';

export function Login({ tab, go }: { tab: string; go: Go }) {
  const auth = useAuth();
  const enter = (role: 'org' | 'volunteer') => go({ page: 'dashboard', tab: role === 'org' ? 'org' : 'volunteer' });
  return (
    <div className="auth">
      <header className="auth-top container-wide">
        <a className="brand" href={hrefFor({ page: 'login' })}><BrandLogo height={36} /></a>
        <nav className="auth-switch" aria-label="Choose how to sign in" style={{ display: 'inline-flex', gap: 6 }}>
          <a className={`btn btn-sm ${tab === 'volunteer' ? 'btn-primary' : 'btn-ghost'}`} href={hrefFor({ page: 'login', tab: 'volunteer' })}>Volunteer</a>
          <a className={`btn btn-sm ${tab === 'organization' ? 'btn-primary' : 'btn-ghost'}`} href={hrefFor({ page: 'login', tab: 'organization' })}>Organization</a>
        </nav>
      </header>
      {tab === 'volunteer' ? <VolunteerLogin go={go} onDone={() => enter('volunteer')} />
        : tab === 'organization' ? <OrgLogin go={go} onDone={() => enter('org')} />
        : tab === 'reset' ? <ResetPassword go={go} />
        : <Chooser demo={(r) => { auth.startDemo(r); enter(r); }} />}
    </div>
  );
}

// ---------------------------------------------------------------- role chooser
function Chooser({ demo }: { demo: (r: 'org' | 'volunteer') => void }) {
  return (
    <div className="auth-main container">
      <section className="mission" aria-label="Our mission">
        <span className="eyebrow">Our mission</span>
        <p>Empowering Karachi&rsquo;s kids, schools, and communities with real-time air tracking to clear the smoke, fight dust, and ensure safe, breathable air for everyone.</p>
      </section>
      <div className="auth-hero">
        <span className="eyebrow">Welcome</span>
        <h1 className="fancy">Who&rsquo;s joining <span className="serif heat-text">today?</span></h1>
        <p>Karachi&rsquo;s heat is measured from space, but only people on the ground can tell us what it feels like. Choose how you&rsquo;re taking part.</p>
      </div>

      <div className="role-grid">
        <a className="role-card role-volunteer card-glow" href={hrefFor({ page: 'login', tab: 'volunteer' })}>
          <span className="role-badge"><Sparkle />Student volunteers</span>
          <div className="role-icon"><Users /></div>
          <h2 className="fancy">I&rsquo;m a volunteer</h2>
          <p>Create an account, then choose the organization you volunteer with. Get missions built from live air quality and heat data, with the places that need help most first, and earn verified volunteer hours.</p>
          <ul>
            <li><Check />Get missions for the places that need help most</li>
            <li><Check />Complete missions set by your organization</li>
            <li><Check />Earn verified hours and a certificate</li>
          </ul>
          <span className="role-cta">Create account or sign in <ArrowRight /></span>
        </a>
        <a className="role-card role-org" href={hrefFor({ page: 'login', tab: 'organization' })}>
          <div className="role-icon org"><Satellite /></div>
          <h2 className="fancy">I represent an organization</h2>
          <p>For schools, NGOs and city teams. Run a volunteer programme and turn field logs into verified evidence.</p>
          <ul>
            <li><Check />Welcome volunteers and see your roster</li>
            <li><Check />Spot coverage gaps &amp; assign missions</li>
            <li><Check />Verify logs and build reports</li>
          </ul>
          <span className="role-cta">Sign in or register <ArrowRight /></span>
        </a>
      </div>

      <div className="why">
        <div><b>1 · Observe</b><span>Live air quality, weather and NASA satellite heat data show where Karachi needs help most.</span></div>
        <div><b>2 · Act</b><span>Volunteers get missions for the worst-hit places, and organizations can post their own.</span></div>
        <div><b>3 · Verify</b><span>Organizations verify the work, issue certificates and publish evidence-backed heat reports.</span></div>
      </div>

      {!SHARED_ENABLED && (
        <div className="callout" style={{ maxWidth: 640, margin: '24px auto 0' }}>
          <Leaf /><span><b>Demo mode.</b> The shared database isn&rsquo;t configured in this build, so accounts are unavailable. You can still explore with logs kept on this device only.
            <span className="demo-btns"><button className="btn btn-sm" onClick={() => demo('volunteer')}>Try as volunteer</button><button className="btn btn-sm" onClick={() => demo('org')}>Try as organization</button></span></span>
        </div>
      )}
      <div style={{ textAlign: 'center', margin: '22px 0 0' }}><button className="btn btn-ghost" onClick={() => demo('volunteer')}>Just looking? Explore as a guest (demo)</button><div className="muted" style={{ fontSize: 12, marginTop: 6 }}>No account needed. Your activity stays on this device only.</div></div>
      <p className="auth-foot muted">Not sure which organization to join? Ask your coordinator. Or <a href={hrefFor({ page: 'login', tab: 'organization' })}>register your organization</a>.</p>
    </div>
  );
}

function Shell({ title, sub, aside, children, go }: { title: string; sub: string; aside: ReactNode; children: ReactNode; go: Go }) {
  return (
    <div className="auth-main container">
      <button className="back-link" onClick={() => go({ page: 'login', tab: '' })}>← Back</button>
      <div className="auth-split">
        <div className="auth-card card-glow">
          <h1>{title}</h1><p className="muted">{sub}</p>
          {children}
        </div>
        <aside className="auth-aside">{aside}</aside>
      </div>
    </div>
  );
}

/** Password box with a show/hide button. */
function PassInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false);
  return (
    <span style={{ position: 'relative', display: 'block' }}>
      <input {...props} type={show ? 'text' : 'password'} style={{ ...(props.style ?? {}), width: '100%', paddingRight: 64 }} />
      <button type="button" onClick={() => setShow((x) => !x)} aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show}
        style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 0, color: 'var(--lime-300)', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: '4px 6px' }}>{show ? 'Hide' : 'Show'}</button>
    </span>
  );
}

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="auth-field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

// ---------------------------------------------------------------- volunteer account
function VolunteerLogin({ go, onDone }: { go: Go; onDone: () => void }) {
  const { signUpVolunteer, loginVolunteer } = useAuth();
  const [mode, setMode] = useState<'in' | 'up'>('up');
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [pass, setPass] = useState(''); const [pass2, setPass2] = useState('');
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState(false); const [sent, setSent] = useState<null | 'sent' | 'unavailable'>(null);
  const sendReset = async (e: FormEvent) => { e.preventDefault(); setBusy(true); setSent(await requestPasswordReset(email)); setBusy(false); };
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr(null);
    if (mode === 'up' && pass !== pass2) { setErr('The two passwords do not match.'); return; }
    setBusy(true);
    const r = mode === 'in' ? await loginVolunteer(email, pass) : await signUpVolunteer(name, email, pass);
    setBusy(false); if (r) setErr(r); else onDone();
  };
  if (forgot) return (
    <Shell go={go} title="Reset your password" sub="Enter the email address you signed up with. We will email you a link to choose a new password."
      aside={<><h3>How it works</h3><ul className="aside-list"><li><b>1.</b> Enter your account email.</li><li><b>2.</b> Open the email we send and press the link.</li><li><b>3.</b> Choose a new password and sign in.</li></ul></>}>
      {sent === 'sent' ? (
        <div className="callout"><span><b>Check your email.</b> If an account exists for <b>{email}</b>, we have sent a link to reset the password. It works for one hour. Also look in your spam folder.</span></div>
      ) : (
        <form onSubmit={sendReset} className="auth-form">
          <Field label="Email address"><input className="field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" maxLength={120} required autoComplete="email" autoFocus /></Field>
          {sent === 'unavailable' && <div className="auth-err" role="alert">Password reset emails are not switched on for this site yet, so we could not send one. Please ask your coordinator for help.</div>}
          <button className="btn btn-primary btn-lg" disabled={busy || !email.trim()}>{busy ? <><span className="spinner" />Sending…</> : <>Send reset link <ArrowRight /></>}</button>
        </form>
      )}
      <p className="auth-alt muted"><a href="#/login/volunteer" onClick={(e) => { e.preventDefault(); setForgot(false); setSent(null); setMode('in'); }}>Back to sign in</a></p>
    </Shell>
  );
  return (
    <Shell go={go} title={mode === 'up' ? 'Create your volunteer account' : 'Volunteer sign-in'} sub={mode === 'up' ? 'Sign up once with your name and email. After you sign in, you\u2019ll choose which organization you\u2019re volunteering with.' : 'Welcome back. Sign in to pick up where you left off.'}
      aside={<><h3>What you&rsquo;ll do</h3><ul className="aside-list"><li><b>Get missions</b> for the neighbourhoods with the worst air and heat right now.</li><li><b>Take missions</b> from your organization, like “three surface readings in Lyari”.</li><li><b>Earn hours</b>: your organization verifies the work and issues your certificate.</li></ul><p className="muted" style={{ fontSize: 12.5 }}>Your name and email are visible only to the coordinators of the organization you join. We never send you email, and your email address isn&rsquo;t verified.</p></>}>
      <div style={{ margin: '4px 0 14px' }}><Seg<'in' | 'up'> label="Sign in or create account" value={mode} onChange={(m) => { setMode(m); setErr(null); }} options={[{ value: 'up', label: 'Create account' }, { value: 'in', label: 'Sign in' }]} /></div>
      <form onSubmit={submit} className="auth-form">
        {mode === 'up' && <Field label="Your name"><input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ayesha Khan" maxLength={60} required autoComplete="name" autoFocus /></Field>}
        <Field label="Email address"><input className="field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" maxLength={120} required autoComplete="email" autoFocus={mode === 'in'} /></Field>
        <Field label="Password" hint={mode === 'up' ? 'At least 8 characters. Don\u2019t reuse a password from elsewhere.' : undefined}><PassInput className="field" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete={mode === 'in' ? 'current-password' : 'new-password'} required /></Field>
        {mode === 'up' && <Field label="Confirm password"><PassInput className="field" value={pass2} onChange={(e) => setPass2(e.target.value)} autoComplete="new-password" required /></Field>}
        {err && <div className="auth-err" role="alert">{err}</div>}
        <button className="btn btn-primary btn-lg" disabled={busy || !email.trim() || !pass || (mode === 'up' && !name.trim())}>{busy ? <><span className="spinner" />Please wait…</> : mode === 'up' ? <>Create account <ArrowRight /></> : <>Sign in <ArrowRight /></>}</button>
      </form>
      <p className="auth-alt muted">{mode === 'in' && <><a href="#/login/volunteer" onClick={(e) => { e.preventDefault(); setForgot(true); setSent(null); }}>Forgot your password?</a> </>}Representing an organization? <a href={hrefFor({ page: 'login', tab: 'organization' })}>Sign in here</a></p>
    </Shell>
  );
}

/** Shown right after a volunteer signs in, until they have joined an organization. */
export function JoinOrg() {
  const { session, joinOrg, logout } = useAuth();
  const [orgs, setOrgs] = useState<{ id: string; name: string }[] | null>(null);
  const [orgId, setOrgId] = useState(''); const [q, setQ] = useState(''); const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  useEffect(() => { rpc<{ id: string; name: string }[]>('tw_list_orgs').then(setOrgs).catch(() => setOrgs([])); }, []);
  const list = (orgs ?? []).filter((o) => o.name.toLowerCase().includes(q.trim().toLowerCase()));
  const submit = async (e: FormEvent) => { e.preventDefault(); setErr(null); setBusy(true); const r = await joinOrg(orgId, code); setBusy(false); if (r) setErr(r); else window.location.hash = hrefFor({ tab: 'volunteer' }); };
  return (
    <div className="auth">
      <header className="auth-top container-wide">
        <span className="brand"><BrandLogo height={36} /></span>
        <button className="btn btn-ghost btn-sm" onClick={logout}>Sign out</button>
      </header>
      <div className="auth-main container">
        <div className="auth-hero" style={{ marginBottom: 24 }}>
          <span className="role-badge"><Sparkle />Signed in</span>
          <h1>Welcome, <span className="grad-text">{session?.volunteer?.name?.split(' ')[0] ?? 'volunteer'}.</span></h1>
          <p>Which organization are you volunteering with? Your logs will be shared with its coordinators, who review them and build the reports.</p>
        </div>
        <form onSubmit={submit} className="auth-card card-glow" style={{ maxWidth: 560, margin: '0 auto' }}>
          {orgs == null ? <div className="skeleton" style={{ height: 120 }} /> : orgs.length === 0 ? (
            <p className="muted">No organizations have registered yet. Ask your coordinator to register their organization first, then come back and refresh this page.</p>
          ) : (
            <>
              {orgs.length > 6 && <input className="field" type="search" placeholder="Search organizations" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search organizations" style={{ width: '100%', height: 44 }} />}
              <div className="org-pick" role="radiogroup" aria-label="Organizations">
                {list.map((o) => (
                  <button type="button" key={o.id} role="radio" aria-checked={orgId === o.id} className={`org-opt ${orgId === o.id ? 'on' : ''}`} onClick={() => setOrgId(o.id)}>
                    <span className="org-radio" /><OrgLogo name={o.name} size={34} /><span>{o.name}</span>
                  </button>
                ))}
                {list.length === 0 && <p className="muted" style={{ fontSize: 13 }}>No organization matches “{q}”.</p>}
              </div>
              <Field label="Invite code" hint="Your coordinator gives you this code. It stops strangers joining the organization."><input className="field" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={20} placeholder="e.g. AB12CD" autoComplete="off" required /></Field>
              {err && <div className="auth-err" role="alert">{err}</div>}
              <button className="btn btn-primary btn-lg" disabled={busy || !orgId || !code.trim()}>{busy ? <><span className="spinner" />Joining…</> : <>Join organization <ArrowRight /></>}</button>
            </>
          )}
        </form>
        <p className="auth-foot muted">You can switch organizations later from the top bar.</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- organization
function OrgLogin({ go, onDone }: { go: Go; onDone: () => void }) {
  const { loginOrg, registerOrg } = useAuth();
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [pass, setPass] = useState(''); const [pass2, setPass2] = useState('');
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState(false); const [sent, setSent] = useState<null | 'sent' | 'unavailable'>(null);
  const sendReset = async (e: FormEvent) => { e.preventDefault(); setBusy(true); setSent(await requestPasswordReset(email, name)); setBusy(false); };
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr(null);
    if (mode === 'up' && pass !== pass2) { setErr('The two passcodes do not match.'); return; }
    setBusy(true);
    const r = mode === 'in' ? await loginOrg(name, pass) : await registerOrg(name, pass, email.trim());
    setBusy(false); if (r) setErr(r); else onDone();
  };
  if (forgot) return (
    <Shell go={go} title="Reset your passcode" sub="Enter your organization name and the email address you registered it with. We will email you a link to choose a new passcode."
      aside={<><h3>How it works</h3><ul className="aside-list"><li><b>1.</b> Enter the organization name and its email.</li><li><b>2.</b> Open the email and press the link.</li><li><b>3.</b> Choose a new passcode and sign in.</li></ul></>}>
      {sent === 'sent' ? (
        <div className="callout"><span><b>Check your email.</b> If <b>{name}</b> is registered with <b>{email}</b>, we have sent a link to reset the passcode. It works for one hour. Also look in your spam folder.</span></div>
      ) : (
        <form onSubmit={sendReset} className="auth-form">
          <Field label="Organization name"><input className="field" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required autoFocus /></Field>
          <Field label="Organization email"><input className="field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="office@yourschool.org" maxLength={120} required autoComplete="email" /></Field>
          {sent === 'unavailable' && <div className="auth-err" role="alert">Password reset emails are not switched on for this site yet, so we could not send one.</div>}
          <button className="btn btn-primary btn-lg" disabled={busy || !name.trim() || !email.trim()}>{busy ? <><span className="spinner" />Sending…</> : <>Send reset link <ArrowRight /></>}</button>
        </form>
      )}
      <p className="auth-alt muted"><a href="#/login/organization" onClick={(e) => { e.preventDefault(); setForgot(false); setSent(null); }}>Back to sign in</a></p>
    </Shell>
  );
  return (
    <Shell go={go} title={mode === 'in' ? 'Organization sign-in' : 'Register your organization'} sub={mode === 'in' ? 'Sign in to manage your volunteers, missions and reports.' : 'Create a workspace for your school, NGO or team. Volunteers will then be able to choose it when they sign in.'}
      aside={<><h3>Organization tools</h3><ul className="aside-list"><li><b>Roster</b>, volunteers pick your organization and appear here with their activity.</li><li><b>Coverage map</b>, see which high-risk neighbourhoods have no field data.</li><li><b>Missions</b>, assign targeted observations to volunteers.</li><li><b>Review queue</b>, verify or flag logs against satellite data.</li><li><b>Reports</b>, build print-ready reports from verified evidence.</li></ul></>}>
      <div style={{ margin: '4px 0 14px' }}><Seg<'in' | 'up'> label="Sign in or register" value={mode} onChange={(m) => { setMode(m); setErr(null); }} options={[{ value: 'in', label: 'Sign in' }, { value: 'up', label: 'Register' }]} /></div>
      <form onSubmit={submit} className="auth-form">
        <Field label="Organization name"><input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Karachi Grammar School" maxLength={80} required autoFocus /></Field>
        {name.trim().length > 1 && mode === 'up' && <div className="org-logo-preview" style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '4px 0 8px' }}><OrgLogo name={name} size={56} /><span className="muted" style={{ fontSize: 12.5 }}>Your organization&rsquo;s logo is created from its name. Volunteers see it when choosing an organization to join.</span></div>}
        {mode === 'up' && <Field label="Organization email" hint="Used to email you a reset link if the passcode is forgotten."><input className="field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="office@yourschool.org" maxLength={120} required autoComplete="email" /></Field>}
        <Field label="Passcode" hint={mode === 'up' ? 'At least 8 characters. Don’t reuse a password from elsewhere.' : undefined}><PassInput className="field" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete={mode === 'in' ? 'current-password' : 'new-password'} required /></Field>
        {mode === 'up' && <Field label="Confirm passcode"><PassInput className="field" value={pass2} onChange={(e) => setPass2(e.target.value)} autoComplete="new-password" required /></Field>}
        {err && <div className="auth-err" role="alert">{err}</div>}
        <button className="btn btn-primary btn-lg" disabled={busy || !name.trim() || !pass || (mode === 'up' && !email.trim())}>{busy ? <><span className="spinner" />Please wait…</> : mode === 'in' ? <>Sign in <ArrowRight /></> : <>Create organization <ArrowRight /></>}</button>
      </form>
      <p className="auth-alt muted">{mode === 'in' && <><a href="#/login/organization" onClick={(e) => { e.preventDefault(); setForgot(true); setSent(null); }}>Forgot your passcode?</a> </>}Joining as a student? <a href={hrefFor({ page: 'login', tab: 'volunteer' })}>Volunteer sign-in</a></p>
    </Shell>
  );
}

// ---------------------------------------------------------------- choose a new password (link from the reset email)
function ResetPassword({ go }: { go: Go }) {
  const token = new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('token') ?? '';
  const [pass, setPass] = useState(''); const [pass2, setPass2] = useState('');
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false); const [done, setDone] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr(null);
    if (pass !== pass2) { setErr('The two passwords do not match.'); return; }
    setBusy(true);
    try { const r = await rpc<{ ok?: boolean; error?: string }>('tw_reset_password', { p_token: token, p_pass: pass }); if (r.ok) setDone(true); else setErr(r.error ?? 'Could not reset the password.'); }
    catch { setErr('Could not reach the server. Check your connection and try again.'); }
    setBusy(false);
  };
  return (
    <Shell go={go} title="Choose a new password" sub="Pick a password with at least 8 characters. You will be signed out everywhere and can sign in with the new one."
      aside={<><h3>Tips</h3><ul className="aside-list"><li>Use a password you do not use anywhere else.</li><li>The link in your email works once, for one hour.</li></ul></>}>
      {!token ? <div className="auth-err" role="alert">This reset link is missing its code. Please use the link from your email, or request a new one.</div>
        : done ? <div className="callout"><span><b>Password changed.</b> You can now <a href="#/login/volunteer">sign in</a> with your new password.</span></div>
        : (
          <form onSubmit={submit} className="auth-form">
            <Field label="New password" hint="At least 8 characters."><PassInput className="field" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="new-password" required autoFocus /></Field>
            <Field label="Confirm new password"><PassInput className="field" value={pass2} onChange={(e) => setPass2(e.target.value)} autoComplete="new-password" required /></Field>
            {err && <div className="auth-err" role="alert">{err}</div>}
            <button className="btn btn-primary btn-lg" disabled={busy || pass.length < 8}>{busy ? <><span className="spinner" />Saving…</> : <>Save new password <ArrowRight /></>}</button>
          </form>
        )}
    </Shell>
  );
}
