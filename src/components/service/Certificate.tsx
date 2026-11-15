import { useEffect, useRef, useState } from 'react';
import { downloadCertificate, makeCertData, type CertData } from '../../lib/certificate';
import { fmtH, type Proof } from '../../lib/service';
import { Download, Close } from '../icons';

/** On-screen certificate. The Download PDF button saves the same certificate as a PDF file. */
function CertSheet({ data }: { data: CertData }) {
  const issued = data.d ? new Date(data.d + 'T12:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  return (
    <article className="cert" id="cert-print">
      <header>
        <div><span className="cert-eyebrow">KarachAir · Karachi climate action</span><h2>Certificate of Completion</h2></div>
        <span className="cert-badge">Verified hours</span>
      </header>
      <p className="cert-label">This certifies that</p>
      <h3 className="cert-name">{data.n}{data.s ? `, ${data.s}` : ''}</h3>
      <p className="cert-text">has successfully completed <b>{fmtH(data.h)} verified volunteer hour{data.h === 1 ? '' : 's'}</b> in <b>{data.u || 'Karachi'}</b> for the climate mission:</p>
      <div className="cert-mission"><b>{data.t}</b></div>
      {data.p && <div className="cert-note"><span>Note from {data.o || 'the organization'}</span><p>&ldquo;{data.p}&rdquo;</p></div>}
      <footer>
        <div><span className="cert-label">Authorized sign-off</span><b>{data.g ? data.g : 'n/a'}</b>{data.r && <span className="cert-issued">{data.r}</span>}<span className="cert-issued">Issued: {issued}</span><span className="cert-org">On behalf of {data.o || 'the organization'}</span></div>
      </footer>
      <p className="cert-fine">KarachAir is a technology platform and does not issue volunteer hours itself. Hours are accredited by {data.o || 'the organization'} that signed them off.</p>
    </article>
  );
}

/** Pop-up shown to the volunteer and the organization. */
export function Certificate({ proof, unitName, orgName, onClose }: { proof: Proof; unitName: string; orgName: string; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const data = makeCertData(proof, unitName, orgName);
  useEffect(() => {
    closeRef.current?.focus();
    const on = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [onClose]);
  const download = async () => { setBusy(true); setErr(''); try { await downloadCertificate(data); } catch { setErr('Could not create the PDF. Please try again.'); } setBusy(false); };
  return (
    <div className="cert-modal" role="dialog" aria-modal="true" aria-label="Certificate of completion" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="cert-shell">
        <div className="cert-bar"><span>Certificate of completion</span><button ref={closeRef} className="icon-btn" aria-label="Close certificate" onClick={onClose}><Close /></button></div>
        <CertSheet data={data} />
        {err && <p className="cert-err" role="alert">{err}</p>}
        <div className="cert-actions"><button className="btn btn-primary" onClick={() => void download()} disabled={busy}><Download />{busy ? 'Preparing…' : 'Download PDF'}</button></div>
      </div>
    </div>
  );
}
