import { useEffect, useRef, useState } from 'react';
import { BrandLogo } from './BrandLogo';
import { WebcamCapture } from './WebcamCapture';
import { Seg } from './ui';
import { useAuth } from '../lib/auth';
import { askLater, cancelEdit, neverAskAgain, removePhoto, savePhoto } from '../lib/profilePhoto';
import { imageFileToSquare } from '../lib/imageUtil';

export const PRIVACY_NOTE = 'Your photo is saved with your account, so you only do this once. It is shown only to you, and you can change or remove it any time by pressing your picture in the top right.';

/** Asks a volunteer for a profile photo (camera or upload) until they have one, or they choose "don't ask me again". */
export function PhotoGate({ id, editing, hasPhoto }: { id: string; editing: boolean; hasPhoto: boolean }) {
  const { session, logout } = useAuth();
  const token = session?.token;
  const who = session?.volunteer?.email ?? session?.member?.name ?? 'volunteer';
  const [how, setHow] = useState<'camera' | 'upload'>('camera');
  const [shot, setShot] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [confirmSkip, setConfirmSkip] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const use = (url: string) => savePhoto(id, url, token);

  useEffect(() => {
    if (!confirmSkip) return;
    const on = (e: KeyboardEvent) => { if (e.key === 'Escape') setConfirmSkip(false); };
    window.addEventListener('keydown', on); return () => window.removeEventListener('keydown', on);
  }, [confirmSkip]);

  const pick = async (f: File | undefined) => { if (!f) return; setErr(''); try { setShot(await imageFileToSquare(f)); } catch (e) { setErr((e as Error).message); } };

  return (
    <div className="auth">
      <header className="auth-top container-wide">
        <span className="brand"><BrandLogo height={36} /></span>
        {editing ? <button className="btn btn-ghost btn-sm" onClick={() => cancelEdit(id)}>Cancel</button> : <button className="btn btn-ghost btn-sm" onClick={logout}>Sign out</button>}
      </header>
      <div className="auth-main container">
        <div className="auth-hero" style={{ marginBottom: 20 }}>
          <span className="role-badge">{editing ? 'Profile photo' : 'Volunteer sign-up'}</span>
          <h1 className="fancy">{editing ? 'Change your photo' : 'Add your photo'}</h1>
          <p>Take a quick photo or upload one so your coordinator can recognise you. It shows in the top right corner while you are signed in as <b>{who}</b>.</p>
        </div>
        <div className="auth-card card-glow" style={{ maxWidth: 520, margin: '0 auto', display: 'grid', gap: 16 }}>
          <div style={{ justifySelf: 'center' }}><Seg<'camera' | 'upload'> label="How to add your photo" value={how} onChange={(v) => { setHow(v); setShot(null); setErr(''); }} options={[{ value: 'camera', label: 'Use camera' }, { value: 'upload', label: 'Upload from computer or phone' }]} /></div>
          {how === 'camera' ? <WebcamCapture onConfirm={use} /> : (
            <div className="webcam">
              <div className="webcam-frame">{shot ? <img src={shot} alt="Your chosen profile photo" /> : <div className="webcam-empty">No picture chosen yet</div>}</div>
              <input ref={file} type="file" accept="image/*" hidden onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ''; }} />
              {err && <p className="auth-err" role="alert" style={{ margin: 0 }}>{err}</p>}
              <div className="chip-row wrap" style={{ justifyContent: 'center' }}>
                {shot ? <><button type="button" className="btn btn-primary" onClick={() => use(shot)}>Use this photo</button><button type="button" className="btn btn-ghost" onClick={() => file.current?.click()}>Choose a different one</button></>
                  : <button type="button" className="btn btn-primary" onClick={() => file.current?.click()}>Choose a picture</button>}
              </div>
              <p className="muted tiny" style={{ margin: 0, textAlign: 'center' }}>On a phone you can pick from your photos or take a new one.</p>
            </div>
          )}
          <div className="callout"><span>{PRIVACY_NOTE}</span></div>
          <div className="chip-row wrap" style={{ justifyContent: 'center' }}>
            {editing && hasPhoto && <button type="button" className="btn btn-ghost btn-sm" onClick={() => removePhoto(id, token)}>Remove my photo</button>}
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => (editing ? cancelEdit(id) : setConfirmSkip(true))}>{editing ? 'Cancel' : 'No thanks'}</button>
          </div>
        </div>
      </div>

      {confirmSkip && (
        <div className="cert-modal" role="dialog" aria-modal="true" aria-label="Skip the profile photo" onMouseDown={(e) => { if (e.target === e.currentTarget) setConfirmSkip(false); }}>
          <div className="auth-card card-glow" style={{ maxWidth: 420, display: 'grid', gap: 14 }}>
            <h2 style={{ margin: 0 }}>Skip the photo?</h2>
            <p className="muted" style={{ margin: 0 }}>You can add one later by pressing your picture in the top right. What would you like to do?</p>
            <button className="btn btn-primary" onClick={() => neverAskAgain(id, token)}>Don&rsquo;t ask me again</button>
            <button className="btn" onClick={() => askLater(id)}>Ask me next time</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setConfirmSkip(false)}>Go back</button>
          </div>
        </div>
      )}
    </div>
  );
}
