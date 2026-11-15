// Browser side: certificate details for a signed-off mission, and the PDF download.
import type { Proof } from './service';

export interface CertData {
  /** student */ n: string; /** school */ s: string; /** mission title */ t: string; /** verified hours */ h: number;
  /** neighbourhood */ u: string; /** signer name */ g: string; /** signer role */ r: string; /** issued date YYYY-MM-DD */ d: string; /** organization */ o: string;
}

export function makeCertData(p: Proof, unitName: string, org: string): CertData {
  return { n: p.student, s: p.school, t: p.title, h: p.verifiedHours, u: unitName, g: p.signer?.name ?? '', r: p.signer?.role ?? '', d: p.signer?.date ?? '', o: org };
}

/** Make the PDF in the browser and save it as a file. The PDF code is loaded only when someone clicks Download. */
export async function downloadCertificate(d: CertData): Promise<void> {
  const { buildCertificatePdf } = await import('./certPdf');
  const bytes = await buildCertificatePdf(d);
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `Certificate-of-Completion-${d.n.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'volunteer'}.pdf`;
  document.body.appendChild(a); a.click(); a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}
