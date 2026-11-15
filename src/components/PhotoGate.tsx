import { BrandLogo } from './BrandLogo';
import { WebcamCapture } from './WebcamCapture';
import { useAuth } from '../lib/auth';
import { savePhoto, skipPhoto } from '../lib/profilePhoto';

export const PRIVACY_NOTE = 'Privacy first: your photo is kept only in this browser’s temporary session. It is never uploaded to a server or database, and it is deleted when you sign out or close this tab.';

/** Shown to a volunteer after sign up, until they have taken a profile photo (or chosen to continue without one). */
export function PhotoGate({ id }: { id: string }) {
  const { session, logout } = useAuth();
  const who = session?.volunteer?.email ?? session?.member?.name ?? 'volunteer';
  return (
    <div className="auth">
      <header className="auth-top container-wide">
        <span className="brand"><BrandLogo height={36} /></span>
        <button className="btn btn-ghost btn-sm" onClick={logout}>Sign out</button>
      </header>
      <div className="auth-main container">
        <div className="auth-hero" style={{ marginBottom: 20 }}>
          <span className="role-badge">Volunteer sign-up</span>
          <h1 className="fancy">Say cheese</h1>
          <p>Take a quick profile photo so your coordinator can recognise you. It will show in the top right corner while you are signed in as <b>{who}</b>.</p>
        </div>
        <div className="auth-card card-glow" style={{ maxWidth: 520, margin: '0 auto', display: 'grid', gap: 16 }}>
          <WebcamCapture onConfirm={(url) => savePhoto(id, url)} />
          <div className="callout"><span>{PRIVACY_NOTE}</span></div>
          <button type="button" className="btn btn-ghost btn-sm" style={{ justifySelf: 'center' }} onClick={() => skipPhoto(id)}>Continue without a photo</button>
        </div>
      </div>
    </div>
  );
}
