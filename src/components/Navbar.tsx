import { Logo } from './icons';
import { hrefFor } from '../lib/hooks';
import { useAuth } from '../lib/auth';

export function Navbar() {
  const { session, logout, leaveOrg } = useAuth();
  return (
    <header className="nav nav-solid">
      <div className="nav-inner container-wide">
        <a className="brand" href={hrefFor()} aria-label="TerraWatch AI dashboard">
          <Logo size={30} />
          <span className="brand-word">TerraWatch<span className="brand-ai">AI</span></span>
        </a>
        <div className="nav-right" style={{ marginLeft: 'auto' }}>
          <span className="chip nav-region"><i className="dot" />Karachi, Pakistan</span>
          {session && (
            <span className="who">
              <span className="who-chip" title={session.role === 'org' ? session.org?.name : `${session.member?.name} · ${session.org?.name}`}>
                <span className={`who-role ${session.role}`}>{session.role === 'org' ? 'Org' : 'Volunteer'}</span>
                <b>{session.role === 'org' ? session.org?.name : session.member?.name}</b>
                {session.role === 'volunteer' && <small>{session.org?.name}</small>}
              </span>
              {session.role === 'volunteer' && <button className="btn btn-ghost btn-sm" onClick={leaveOrg}>Switch organization</button>}
              <button className="btn btn-ghost btn-sm" onClick={logout}>Sign out</button>
            </span>
          )}
        </div>
      </div>
    </header>
  );
}
