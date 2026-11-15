// Builds the certificate as a real PDF titled "Certificate of Completion". Runs in the browser (pdf-lib), so no server is needed.
import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib';
import type { CertData } from './certificate';

const GREEN = rgb(0.055, 0.541, 0.384), DARK = rgb(0.043, 0.122, 0.09), GREY = rgb(0.36, 0.42, 0.39), PALE = rgb(0.933, 0.953, 0.945), LINE = rgb(0.847, 0.886, 0.871);

/** Standard PDF fonts only cover Latin letters. Accents are stripped and anything else becomes "?", so use Latin spellings for names. */
export const pdfSafe = (s: string) => s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[\u2013\u2014]/g, '-').replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/[^\x20-\x7E\u00A0-\u00FF]/g, '?');

function wrap(text: string, font: PDFFont, size: number, max: number): string[] {
  const lines: string[] = []; let cur = '';
  for (const w of text.split(/\s+/).filter(Boolean)) {
    const next = cur ? `${cur} ${w}` : w;
    if (font.widthOfTextAtSize(next, size) > max && cur) { lines.push(cur); cur = w; } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}

export async function buildCertificatePdf(data: CertData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const name = pdfSafe(data.n);
  pdf.setTitle(`Certificate of Completion - ${name}`);
  pdf.setAuthor('KarachAir');
  pdf.setSubject('Verified community service hours');
  const page = pdf.addPage([842, 595]); // A4 landscape
  const reg = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold), mono = await pdf.embedFont(StandardFonts.CourierBold);
  const X = 60, W = 722;

  page.drawRectangle({ x: 24, y: 24, width: 794, height: 547, borderColor: GREEN, borderWidth: 3 });
  page.drawRectangle({ x: 31, y: 31, width: 780, height: 533, borderColor: LINE, borderWidth: 0.8 });
  page.drawText('KARACHAIR  -  KARACHI CLIMATE ACTION', { x: X, y: 526, size: 9, font: mono, color: GREEN });
  page.drawText('Certificate of Completion', { x: X, y: 486, size: 32, font: bold, color: DARK });
  page.drawRectangle({ x: 640, y: 498, width: 142, height: 26, color: rgb(0.9, 0.972, 0.941), borderColor: rgb(0.608, 0.863, 0.761), borderWidth: 1 });
  page.drawText('VERIFIED HOURS', { x: 656, y: 507, size: 9.5, font: mono, color: GREEN });
  page.drawLine({ start: { x: X, y: 466 }, end: { x: X + W, y: 466 }, thickness: 1, color: LINE });

  page.drawText('THIS CERTIFIES THAT', { x: X, y: 436, size: 9, font: reg, color: GREY });
  page.drawText(name, { x: X, y: 400, size: 28, font: bold, color: DARK });
  if (data.s) page.drawText(pdfSafe(data.s), { x: X, y: 378, size: 14, font: reg, color: GREY });

  const hrs = `${data.h % 1 === 0 ? data.h : data.h.toFixed(1)} verified volunteer hour${data.h === 1 ? '' : 's'}`;
  let y = 346;
  for (const line of wrap(`has successfully completed ${hrs} in ${pdfSafe(data.u || 'Karachi')}, Karachi for the climate mission:`, reg, 13, W)) { page.drawText(line, { x: X, y, size: 13, font: reg, color: DARK }); y -= 19; }

  const mission = wrap(pdfSafe(data.t), bold, 14, W - 30);
  const boxH = 18 + mission.length * 19;
  y -= 6;
  page.drawRectangle({ x: X, y: y - boxH + 14, width: W, height: boxH, color: PALE });
  page.drawRectangle({ x: X, y: y - boxH + 14, width: 4, height: boxH, color: GREEN });
  mission.forEach((l, i) => page.drawText(l, { x: X + 18, y: y - 8 - i * 19 + 2, size: 14, font: bold, color: DARK }));

  const sy = 170;
  page.drawLine({ start: { x: X, y: sy + 30 }, end: { x: X + 400, y: sy + 30 }, thickness: 1, color: LINE });
  page.drawText('AUTHORIZED SIGN-OFF', { x: X, y: sy + 10, size: 8.5, font: reg, color: GREY });
  page.drawText(pdfSafe(data.g || '-'), { x: X, y: sy - 12, size: 15, font: bold, color: DARK });
  if (data.r) page.drawText(pdfSafe(data.r), { x: X, y: sy - 29, size: 11, font: reg, color: GREY });
  if (data.d) page.drawText(`Issued: ${new Date(data.d + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}`, { x: X, y: sy - 47, size: 10, font: mono, color: GREY });
  page.drawText(`On behalf of ${pdfSafe(data.o || 'the organization')}`, { x: X, y: sy - 63, size: 10, font: mono, color: GREY });

  const fine = wrap(`KarachAir is a technology platform and does not issue volunteer hours itself. Hours are accredited by ${pdfSafe(data.o || 'the organization')} that signed them off.`, reg, 7.5, 700);
  fine.forEach((l, i) => page.drawText(l, { x: X, y: 62 - i * 10, size: 7.5, font: reg, color: GREY }));

  return pdf.save();
}
