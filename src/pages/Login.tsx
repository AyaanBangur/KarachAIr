import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { rpc } from '../lib/api';
import { useAuth } from '../lib/auth';
import { SHARED_ENABLED } from '../lib/api';
import { hrefFor, type Go } from '../lib/hooks';
import { ArrowRight, Check, Leaf, Logo, Satellite, Sparkle, Users } from '../components/icons';
import { Seg } from '../components/ui';

export function Login({ tab, go }: { tab: string; go: Go }) {
  const auth = useAuth();
  const enter = (role: 'org' | 'volunteer') => go({ page: 'dashboard', tab: role === 'org' ? 'org' : 'volunteer' });
  return (
    <div className="auth">
      <header className="auth-top container-wide">
        <a className="brand" href={hrefFor({ page: 'login' })}><Logo size={30} /><span className="brand-word">TerraWatch<span className="brand-ai">AI</span></span></a>
        <span className="chip nav-region"><i className="dot" />Karachi heat intelligence</span>
      </header>
      {tab === 'volunteer' ? <VolunteerLogin go={go} onDone={() => enter('volunteer')} />
        : tab === 'organization' ? <OrgLogin go={go} onDone={() => enter('org')} />
        : <Chooser demo={(r) => { auth.startDemo(r); enter(r); }} />}
    </div>
  );
}

// ---------------------------------------------------------------- role chooser
function Chooser({ demo }: { demo: (r: 'org' | 'volunteer') => void }) {
  return (
    <div className="auth-main container">
      <div className="auth-hero">
        <span className="eyebrow">Welcome</span>
        <h1>Who&rsquo;s joining <span className="serif heat-text">today?</span></h1>
        <p>Karachi&rsquo;s heat is measured from space — but only people on the ground can tell us what it feels like. Choose how you&rsquo;re taking part.</p>
      </div>

      <div className="role-grid">
        <a className="role-card role-volunteer card-glow" href={hrefFor({ page: 'login', tab: 'volunteer' })}>
          <span className="role-badge"><Sparkle />Student volunteers</span>
          <div className="role-icon"><Users /></div>
          <h2>I&rsquo;m a volunteer</h2>
          <p>Create an account, then choose the organization you volunteer with. Log what you see on the ground, take on field missions, and watch your observations check the satellite data.</p>
          <ul>
            <li><Check />Log temperatures, shade, water points &amp; heat illness</li>
            <li><Check />Complete missions set by your organization</li>
            <li><Check />See your impact on the map</li>
          </ul>
          <span className="role-cta">Create account or sign in <ArrowRight /></span>
        </a>
        <a className="role-card role-org" href={hrefFor({ page: 'login', tab: 'organization' })}>
          <div className="role-icon org"><Satellite /></div>
          <h2>I represent an organization</h2>
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
        <div><b>1 · Observe</b><span>Volunteers record temperature, shade and cooling spots street by street.</span></div>
        <div><b>2 · Compare</b><span>Each log is set against NASA satellite surface temperature for that neighbourhood.</span></div>
        <div><b>3 · Verify</b><span>Organizations review the logs and publish evidence-backed heat reports.</span></div>
      </div>

      {!SHARED_ENABLED && (
        <div className="callout" style={{ maxWidth: 640, margin: '24px auto 0' }}>
          <Leaf /><span><b>Demo mode.</b> The shared database isn&rsquo;t configured in this build, so accounts are unavailable. You can still explore with logs kept on this device only.
            <span className="demo-btns"><button className="btn btn-sm" onClick={() => demo('volunteer')}>Try as volunteer</button><button className="btn btn-sm" onClick={() => demo('org')}>Try as organization</button></span></span>
        </div>
      )}
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

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="auth-field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

// ---------------------------------------------------------------- volunteer account
function VolunteerLogin({ go, onDone }: { go: Go; onDone: () => void }) {
  const { signUpVolunteer, loginVolunteer } = useAuth();
  const [mode, setMode] = useState<'in' | 'up'>('up');
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [pass, setPass] = useState(''); const [pass2, setPass2] = useState('');
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr(null);
    if (mode === 'up' && pass !== pass2) { setErr('The two passwords do not match.'); return; }
    setBusy(true);
    const r = mode === 'in' ? await loginVolunteer(email, pass) : await signUpVolunteer(name, email, pass);
    setBusy(false); if (r) setErr(r); else onDone();
  };
  return (
    <Shell go={go} title={mode === 'up' ? 'Create your volunteer account' : 'Volunteer sign-in'} sub={mode === 'up' ? 'Sign up once with your name and email. After you sign in, you\u2019ll choose which organization you\u2019re volunteering with.' : 'Welcome back. Sign in to pick up where you left off.'}
      aside={<><h3>What you&rsquo;ll do</h3><ul className="aside-list"><li><b>Log</b> what you observe: temperatures, shade, water, heat illness.</li><li><b>Take missions</b> from your organization, like “three surface readings in Lyari”.</li><li><b>See impact</b>: your logs appear on the heat map and in your organization&rsquo;s reports.</li></ul><p className="muted" style={{ fontSize: 12.5 }}>Your name and email are visible only to the coordinators of the organization you join. We never send you email, and your email address isn&rsquo;t verified.</p></>}>
      <div style={{ margin: '4px 0 14px' }}><Seg<'in' | 'up'> label="Sign in or create account" value={mode} onChange={(m) => { setMode(m); setErr(null); }} options={[{ value: 'up', label: 'Create account' }, { value: 'in', label: 'Sign in' }]} /></div>
      <form onSubmit={submit} className="auth-form">
        {mode === 'up' && <Field label="Your name"><input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ayesha Khan" maxLength={60} required autoComplete="name" autoFocus /></Field>}
        <Field label="Email address"><input className="field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" maxLength={120} required autoComplete="email" autoFocus={mode === 'in'} /></Field>
        <Field label="Password" hint={mode === 'up' ? 'At least 8 characters. Don\u2019t reuse a password from elsewhere.' : undefined}><input className="field" type="password" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete={mode === 'in' ? 'current-password' : 'new-password'} required /></Field>
        {mode === 'up' && <Field label="Confirm password"><input className="field" type="password" value={pass2} onChange={(e) => setPass2(e.target.value)} autoComplete="new-password" required /></Field>}
        {err && <div className="auth-err" role="alert">{err}</div>}
        <button className="btn btn-primary btn-lg" disabled={busy || !email.trim() || !pass || (mode === 'up' && !name.trim())}>{busy ? <><span className="spinner" />Please wait…</> : mode === 'up' ? <>Create account <ArrowRight /></> : <>Sign in <ArrowRight /></>}</button>
      </form>
      <p className="auth-alt muted">There is no automatic password reset — keep your password safe. Representing an organization? <a href={hrefFor({ page: 'login', tab: 'organization' })}>Sign in here</a></p>
    </Shell>
  );
}

/** Shown right after a volunteer signs in, until they have joined an organization. */
export function JoinOrg() {
  const { session, joinOrg, logout } = useAuth();
  const [orgs, setOrgs] = useState<{ id: string; name: string }[] | null>(null);
  const [orgId, setOrgId] = useState(''); const [q, setQ] = useState('');
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  useEffect(() => { rpc<{ id: string; name: string }[]>('tw_list_orgs').then(setOrgs).catch(() => setOrgs([])); }, []);
  const list = (orgs ?? []).filter((o) => o.name.toLowerCase().includes(q.trim().toLowerCase()));
  const submit = async (e: FormEvent) => { e.preventDefault(); setErr(null); setBusy(true); const r = await joinOrg(orgId); setBusy(false); if (r) setErr(r); else window.location.hash = hrefFor({ tab: 'volunteer' }); };
  return (
    <div className="auth">
      <header className="auth-top container-wide">
        <span className="brand"><Logo size={30} /><span className="brand-word">TerraWatch<span className="brand-ai">AI</span></span></span>
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
                    <span className="org-radio" />{o.name}
                  </button>
                ))}
                {list.length === 0 && <p className="muted" style={{ fontSize: 13 }}>No organization matches “{q}”.</p>}
              </div>
              {err && <div className="auth-err" role="alert">{err}</div>}
              <button className="btn btn-primary btn-lg" disabled={busy || !orgId}>{busy ? <><span className="spinner" />Joining…</> : <>Join organization <ArrowRight /></>}</button>
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
  const [name, setName] = useState(''); const [pass, setPass] = useState(''); const [pass2, setPass2] = useState('');
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr(null);
    if (mode === 'up' && pass !== pass2) { setErr('The two passcodes do not match.'); return; }
    setBusy(true);
    const r = mode === 'in' ? await loginOrg(name, pass) : await registerOrg(name, pass);
    setBusy(false); if (r) setErr(r); else onDone();
  };
  return (
    <Shell go={go} title={mode === 'in' ? 'Organization sign-in' : 'Register your organization'} sub={mode === 'in' ? 'Sign in to manage your volunteers, missions and reports.' : 'Create a workspace for your school, NGO or team. Volunteers will then be able to choose it when they sign in.'}
      aside={<><h3>Organization tools</h3><ul className="aside-list"><li><b>Roster</b> — volunteers pick your organization and appear here with their activity.</li><li><b>Coverage map</b> — see which high-risk neighbourhoods have no field data.</li><li><b>Missions</b> — assign targeted observations to volunteers.</li><li><b>Review queue</b> — verify or flag logs against satellite data.</li><li><b>Reports</b> — build print-ready reports from verified evidence.</li></ul></>}>
      <div style={{ margin: '4px 0 14px' }}><Seg<'in' | 'up'> label="Sign in or register" value={mode} onChange={(m) => { setMode(m); setErr(null); }} options={[{ value: 'in', label: 'Sign in' }, { value: 'up', label: 'Register' }]} /></div>
      <form onSubmit={submit} className="auth-form">
        <Field label="Organization name"><input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Karachi Grammar School" maxLength={80} required autoFocus /></Field>
        <Field label="Passcode" hint={mode === 'up' ? 'At least 8 characters. Don’t reuse a password from elsewhere.' : undefined}><input className="field" type="password" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete={mode === 'in' ? 'current-password' : 'new-password'} required /></Field>
        {mode === 'up' && <Field label="Confirm passcode"><input className="field" type="password" value={pass2} onChange={(e) => setPass2(e.target.value)} autoComplete="new-password" required /></Field>}
        {err && <div className="auth-err" role="alert">{err}</div>}
        <button className="btn btn-primary btn-lg" disabled={busy || !name.trim() || !pass}>{busy ? <><span className="spinner" />Please wait…</> : mode === 'in' ? <>Sign in <ArrowRight /></> : <>Create organization <ArrowRight /></>}</button>
      </form>
      <p className="auth-alt muted">Forgot your passcode? There is no automatic reset — ask the person who registered the organization. Joining as a student? <a href={hrefFor({ page: 'login', tab: 'volunteer' })}>Volunteer sign-in</a></p>
    </Shell>
  );
}
