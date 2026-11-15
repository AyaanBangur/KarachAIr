import { BrandLogo } from './BrandLogo';
import { OrgLogo } from './OrgLogo';
import { hrefFor } from '../lib/hooks';
import { useAuth } from '../lib/auth';
import { clearPhoto, usePhoto } from '../lib/profilePhoto';

export function Navbar() {
  const { session, logout, leaveOrg } = useAuth();
  const photoId = session?.volunteer?.id ?? session?.member?.id ?? 'demo';
  const { photo } = usePhoto(photoId);
  const name = session?.role === 'org' ? session.org?.name ?? '' : session?.member?.name ?? '';
  const signOut = () => { clearPhoto(photoId); logout(); }; // the photo never outlives the session
  return (
    <header className="nav nav-solid">
      <div className="nav-inner container-wide">
        <a className="brand" href={hrefFor()} aria-label="KarachAir dashboard">
          <BrandLogo height={34} />
        </a>
        <div className="nav-right" style={{ marginLeft: 'auto' }}>
          <span className="chip nav-region"><i className="dot" />Karachi, Pakistan</span>
          {session && (
            <span className="who">
              <span className="who-chip" title={session.role === 'org' ? session.org?.name : `${session.member?.name} · ${session.org?.name}`}>
                {session.org && <OrgLogo name={session.org.name} size={24} />}<span className={`who-role ${session.role}`}>{session.role === 'org' ? 'Org' : 'Volunteer'}</span>
                <b>{session.role === 'org' ? session.org?.name : session.member?.name}</b>
                {session.role === 'volunteer' && <small>{session.org?.name}</small>}
              </span>
              {session.role === 'volunteer' && <button className="btn btn-ghost btn-sm" onClick={leaveOrg}>Switch organization</button>}
              {session.role === 'volunteer' && (
                <button type="button" className="avatar" onClick={() => clearPhoto(photoId)} title="Retake profile photo" aria-label="Profile photo. Press to retake it.">
                  {photo ? <img src={photo} alt="" /> : <span>{(name.trim()[0] ?? '?').toUpperCase()}</span>}
                </button>
              )}
              <button className="btn btn-ghost btn-sm" onClick={signOut}>Sign out</button>
            </span>
          )}
        </div>
      </div>
    </header>
  );
}
