import { useMemo, useState } from 'react';
import { useTerra } from '../../lib/data';
import { useAuth } from '../../lib/auth';
import { useLogs } from '../../lib/logs';
import { useLocalState } from '../../lib/hooks';
import { STATUS_TEXT, TIER_NAME, ago, fmtH, parseProof, verifyNote, type Proof } from '../../lib/service';
import { Certificate } from '../service/Certificate';
import { Seg } from '../ui';
import { Alert, Check, Doc, Pin } from '../icons';

type Filter = 'pending' | 'verified' | 'flagged' | 'all';

/** Verification queue: volunteers accept missions; only the organization records the proof, verifies hours and issues the certificate. */
export function SignOff() {
  const { data } = useTerra();
  const { session } = useAuth();
  const { proofs, review, remove } = useLogs();
  const [filter, setFilter] = useState<Filter>('pending');
  const [open, setOpen] = useState<string | null>(null);
  const [cert, setCert] = useState<string | null>(null);
  const org = session?.org?.name ?? 'your organization';
  const list = useMemo(() => proofs.map(parseProof), [proofs]);
  const unitName = (id: string | null) => data.units.find((u) => u.properties.id === id)?.properties.name ?? 'Karachi';
  const count = (s: Filter) => list.filter((p) => s === 'all' || p.status === s).length;
  const shown = list.filter((p) => filter === 'all' || p.status === filter);

  const certProof = cert ? list.find((p) => p.id === cert) : null;

  return (
    <div className="signoff">
      <section className="card card-pad">
        <div className="card-title"><div><h3>Verification queue</h3><p>Volunteers accept missions. When the work is done, record the proof here and verify the hours. This is the only place proof is entered or viewed, and verifying issues the certificate with a QR code.</p></div><span className="chip">{org}</span></div>
        <div className="review-bar"><Seg<Filter> label="Verification filter" value={filter} onChange={setFilter} options={[{ value: 'pending', label: `Awaiting (${count('pending')})` }, { value: 'verified', label: `Verified (${count('verified')})` }, { value: 'flagged', label: `Not verified (${count('flagged')})` }, { value: 'all', label: 'All' }]} /></div>
        {shown.length === 0 && <p className="muted" style={{ marginTop: 14 }}>{filter === 'pending' ? 'Nothing waiting. Missions volunteers accept appear here.' : 'No missions in this view.'}</p>}
        <div className="so-list">
          {shown.map((p) => (
            <article key={p.id} className="so-card">
              <div className="so-top"><b>{p.student}{p.school ? `, ${p.school}` : ''}</b><span className="chip"><Pin />{unitName(p.unitId)}</span><span className="chip hrs">{p.status === 'verified' ? `+${fmtH(p.verifiedHours)} hrs verified` : `${fmtH(p.hours)} hrs committed`}</span><span className="muted tiny">accepted {ago(p.log.createdAt)}</span><span className={`chip status-chip ${STATUS_TEXT[p.status].cls}`}>{STATUS_TEXT[p.status].label}</span></div>
              <div className="so-title">{TIER_NAME[p.tier]}: {p.title}</div>
              {p.signer && <><p className="so-quote">Proof on record: “{p.signer.proof || 'No description'}”</p><div className="so-meta">Verified by {p.signer.name}{p.signer.role ? ` (${p.signer.role})` : ''} · {p.signer.date}</div></>}
              {p.status === 'flagged' && p.declineNote && <div className="so-meta">Note to volunteer: {p.declineNote}</div>}
              {open === p.id ? (
                <VerifyForm proof={p} org={org} onVerify={(v) => { void review(p.id, 'verified', verifyNote(v)); setOpen(null); }} onDecline={(n) => { void review(p.id, 'flagged', n.trim().slice(0, 250)); setOpen(null); }} onCancel={() => setOpen(null)} />
              ) : (
                <div className="so-actions">
                  {p.status === 'pending' && <button className="btn btn-primary btn-sm" onClick={() => setOpen(p.id)}><Check />Record proof &amp; verify</button>}
                  {p.status === 'verified' && <button className="btn btn-sm" onClick={() => setCert(p.id)}><Doc />View certificate</button>}
                  {p.status !== 'pending' && <button className="btn btn-sm btn-ghost" onClick={() => void review(p.id, 'pending', '')}>Reopen</button>}
                  <button className="btn btn-sm btn-ghost" onClick={() => { if (window.confirm(p.status === 'verified' ? `Delete this verified mission for ${p.student}? Their certificate and hours will be removed. This cannot be undone.` : `Delete this mission for ${p.student}? This cannot be undone.`)) remove(p.id); }}>Delete</button>
                </div>
              )}
            </article>
          ))}
        </div>
      </section>

      {certProof && <Certificate proof={certProof} unitName={unitName(certProof.unitId)} orgName={org} onClose={() => setCert(null)} />}
    </div>
  );
}

function VerifyForm({ proof, org, onVerify, onDecline, onCancel }: { proof: Proof; org: string; onVerify: (v: { name: string; role: string; hours: number; proof: string }) => void; onDecline: (note: string) => void; onCancel: () => void }) {
  const [signer, setSigner] = useLocalState<{ name: string; role: string }>('tw-signer', { name: '', role: '' });
  const [hours, setHours] = useState(proof.hours);
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const verify = () => {
    if (signer.name.trim().length < 3) return setErr('Enter the name of the person verifying.');
    if (!(hours >= 0.5 && hours <= 12)) return setErr('Verified hours must be between 0.5 and 12.');
    if (text.trim().length < 15) return setErr('Describe the proof (at least 15 characters): what you saw or checked.');
    onVerify({ name: signer.name, role: signer.role || org, hours, proof: text });
  };
  return (
    <div className="so-form">
      <label className="pill-field"><span>Verifier name</span><input className="field" value={signer.name} maxLength={50} onChange={(e) => setSigner({ ...signer, name: e.target.value })} placeholder="e.g. Tariq Mahmood" /></label>
      <label className="pill-field"><span>Role / organization</span><input className="field" value={signer.role} maxLength={60} onChange={(e) => setSigner({ ...signer, role: e.target.value })} placeholder="e.g. WWF-Pakistan Karachi Coordinator" /></label>
      <label className="pill-field"><span>Hours verified (committed: {fmtH(proof.hours)})</span><input className="field" type="number" min={0.5} max={12} step={0.5} value={hours} onChange={(e) => setHours(parseFloat(e.target.value))} /></label>
      <label className="pill-field wide"><span>Proof of work (what you saw or checked, kept by the organization only)</span><textarea className="field" rows={2} maxLength={130} value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Saw 4 neem saplings planted along the east wall; soil log checked." /></label>
      {err && <div className="callout wide" role="alert"><Alert /><span>{err}</span></div>}
      <div className="so-actions wide">
        <button className="btn btn-primary btn-sm" onClick={verify}><Check />Verify &amp; issue certificate</button>
        <button className="btn btn-sm" onClick={() => onDecline(text)}>Could not verify</button>
        <button className="btn btn-sm btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
