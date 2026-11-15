import { useCallback, useEffect, useRef, useState } from 'react';

/** Opens the device webcam, lets the volunteer take a square photo, preview it and retake it. Nothing leaves the browser. */
export function WebcamCapture({ onConfirm, confirmLabel = 'Use this photo' }: { onConfirm: (dataUrl: string) => void; confirmLabel?: string }) {
  const video = useRef<HTMLVideoElement>(null), stream = useRef<MediaStream | null>(null);
  const [state, setState] = useState<'idle' | 'starting' | 'live' | 'error'>('idle');
  const [error, setError] = useState('');
  const [shot, setShot] = useState<string | null>(null);

  const stop = useCallback(() => { stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null; }, []);
  useEffect(() => stop, [stop]);
  // attach the camera stream as soon as the <video> element is on screen
  useEffect(() => {
    const v = video.current, st = stream.current;
    if (state === 'live' && v && st) { v.srcObject = st; void v.play().catch(() => undefined); }
  }, [state]);

  const start = async () => {
    setError(''); setShot(null); setState('starting');
    if (!navigator.mediaDevices?.getUserMedia) { setError('This browser cannot open a camera. Try a current version of Chrome, Edge, Safari or Firefox on a secure (https) page.'); setState('error'); return; }
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 640 } }, audio: false });
      stream.current = s;
      setState('live'); // the stream is attached to the <video> in the effect below, once that element exists
    } catch (e) {
      const n = (e as DOMException).name;
      setError(n === 'NotAllowedError' || n === 'SecurityError' ? 'Camera permission was blocked. Allow the camera for this site in your browser settings, then try again.' : n === 'NotFoundError' ? 'No camera was found on this device.' : 'The camera could not be started. Close other apps that use it and try again.');
      setState('error');
    }
  };

  const snap = () => {
    const v = video.current; if (!v || !v.videoWidth) return;
    const side = Math.min(v.videoWidth, v.videoHeight), out = 256, c = document.createElement('canvas');
    c.width = c.height = out;
    const g = c.getContext('2d'); if (!g) return;
    g.translate(out, 0); g.scale(-1, 1); // mirror, to match the preview
    g.drawImage(v, (v.videoWidth - side) / 2, (v.videoHeight - side) / 2, side, side, 0, 0, out, out);
    setShot(c.toDataURL('image/jpeg', 0.82));
    stop(); setState('idle');
  };

  return (
    <div className="webcam">
      <div className="webcam-frame">
        {shot ? <img src={shot} alt="Your captured profile photo" />
          : state === 'live' ? <video ref={video} autoPlay muted playsInline aria-label="Live camera preview" />
          : <div className="webcam-empty">{state === 'starting' ? 'Starting camera…' : 'Camera is off'}</div>}
      </div>
      {error && <p className="auth-err" role="alert" style={{ margin: 0 }}>{error}</p>}
      <div className="chip-row wrap" style={{ justifyContent: 'center' }}>
        {shot ? <>
          <button type="button" className="btn btn-primary" onClick={() => onConfirm(shot)}>{confirmLabel}</button>
          <button type="button" className="btn btn-ghost" onClick={() => void start()}>Retake</button>
        </> : state === 'live' ? <button type="button" className="btn btn-primary" onClick={snap}>Take photo</button>
          : <button type="button" className="btn btn-primary" onClick={() => void start()} disabled={state === 'starting'}>{state === 'error' ? 'Try again' : 'Turn on camera'}</button>}
      </div>
    </div>
  );
}
