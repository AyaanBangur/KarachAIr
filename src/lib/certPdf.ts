// Builds the certificate as a real PDF titled "Certificate of Completion". Runs in the browser (pdf-lib), so no server is needed.
import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib';
import type { CertData } from './certificate';

const GREEN = rgb(0.055, 0.541, 0.384), DARK = rgb(0.043, 0.122, 0.09), GREY = rgb(0.36, 0.42, 0.39), PALE = rgb(0.933, 0.953, 0.945), LINE = rgb(0.847, 0.886, 0.871);

/** Standard PDF fonts only cover Latin letters. Accents are stripped and anything else becomes "?", so use Latin spellings for names. */
export const pdfSafe = (s: string) => s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[\u2013\u2014]/g, '-').replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/[^\x20-\x7E\u00A0-\u00FF]/g, '?');

/** Text the standard PDF fonts cannot draw (Urdu, Arabic, Hindi and other scripts) is drawn as a small picture using the device's own fonts. */
const needsImage = (t: string) => typeof document !== 'undefined' && /[^ -~ -ÿ–—‘’“”]/.test(t);
async function textImage(pdf: PDFDocument, text: string, size: number, bold: boolean, color: { red: number; green: number; blue: number }, maxW: number) {
  const scale = 3, c = document.createElement('canvas'), g = c.getContext('2d')!;
  const font = `${bold ? 700 : 400} ${size * scale}px "Noto Naskh Arabic", "Noto Nastaliq Urdu", "Segoe UI", Tahoma, Arial, sans-serif`;
  g.font = font;
  const rtl = /[֐-ࣿ]/.test(text), w = Math.ceil(g.measureText(text).width) + 6, h = Math.ceil(size * scale * 1.7);
  c.width = w; c.height = h; g.font = font; g.direction = rtl ? 'rtl' : 'ltr'; g.textAlign = rtl ? 'right' : 'left'; g.textBaseline = 'middle';
  g.fillStyle = `rgb(${Math.round(color.red * 255)},${Math.round(color.green * 255)},${Math.round(color.blue * 255)})`;
  g.fillText(text, rtl ? w - 3 : 3, h / 2);
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/png'));
  if (!blob) throw new Error('image');
  const img = await pdf.embedPng(new Uint8Array(await blob.arrayBuffer()));
  let dw = w / scale, dh = h / scale; if (dw > maxW) { dh *= maxW / dw; dw = maxW; }
  return { img, dw, dh };
}

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
  /** Draw one line of text; scripts the PDF fonts cannot show are drawn as a picture instead of turning into "?". */
  const put = async (text: string, x: number, y: number, size: number, font: PDFFont, color: ReturnType<typeof rgb>, maxW = W, isBold = false) => {
    if (needsImage(text)) {
      try { const { img, dw, dh } = await textImage(pdf, text, size, isBold || font === bold, color as unknown as { red: number; green: number; blue: number }, maxW); page.drawImage(img, { x, y: y - dh * 0.32, width: dw, height: dh }); return; } catch { /* fall back to the Latin spelling */ }
    }
    page.drawText(pdfSafe(text), { x, y, size, font, color });
  };

  page.drawRectangle({ x: 24, y: 24, width: 794, height: 547, borderColor: GREEN, borderWidth: 3 });
  page.drawRectangle({ x: 31, y: 31, width: 780, height: 533, borderColor: LINE, borderWidth: 0.8 });
  page.drawText('KARACHAIR  -  KARACHI CLIMATE ACTION', { x: X, y: 526, size: 9, font: mono, color: GREEN });
  page.drawText('Certificate of Completion', { x: X, y: 486, size: 32, font: bold, color: DARK });
  page.drawRectangle({ x: 640, y: 498, width: 142, height: 26, color: rgb(0.9, 0.972, 0.941), borderColor: rgb(0.608, 0.863, 0.761), borderWidth: 1 });
  page.drawText('VERIFIED HOURS', { x: 656, y: 507, size: 9.5, font: mono, color: GREEN });
  page.drawLine({ start: { x: X, y: 466 }, end: { x: X + W, y: 466 }, thickness: 1, color: LINE });

  page.drawText('THIS CERTIFIES THAT', { x: X, y: 436, size: 9, font: reg, color: GREY });
  await put(data.n, X, 400, 28, bold, DARK, W);
  if (data.s) await put(data.s, X, 378, 14, reg, GREY, W);

  const hrs = `${data.h % 1 === 0 ? data.h : data.h.toFixed(1)} verified volunteer hour${data.h === 1 ? '' : 's'}`;
  let y = 346;
  for (const line of wrap(`has successfully completed ${hrs} in ${pdfSafe(data.u && data.u !== 'Karachi' ? `${data.u}, Karachi` : 'Karachi')} for the climate mission:`, reg, 13, W)) { page.drawText(line, { x: X, y, size: 13, font: reg, color: DARK }); y -= 19; }

  const mission = needsImage(data.t) ? [data.t] : wrap(pdfSafe(data.t), bold, 14, W - 30);
  const boxH = 18 + mission.length * 19;
  y -= 6;
  page.drawRectangle({ x: X, y: y - boxH + 14, width: W, height: boxH, color: PALE });
  page.drawRectangle({ x: X, y: y - boxH + 14, width: 4, height: boxH, color: GREEN });
  for (const [i, l] of mission.entries()) await put(l, X + 18, y - 8 - i * 19 + 2, 14, bold, DARK, W - 30, true);

  // the organization's description of this student's work
  if (data.p) {
    let ny = y - boxH - 4;
    await put('NOTE FROM ' + (data.o || 'THE ORGANIZATION').toUpperCase(), X, ny, 8.5, reg, GREY);
    const room = Math.max(1, Math.min(3, Math.floor((ny - 208) / 15))); // never run into the sign-off block below
    const noteLines = needsImage(data.p) ? ['"' + data.p + '"'] : wrap('"' + pdfSafe(data.p) + '"', reg, 11.5, W).slice(0, room);
    for (const line of noteLines) { ny -= 15; await put(line, X, ny, 11.5, reg, DARK, W); }
  }

  const sy = 170;
  page.drawLine({ start: { x: X, y: sy + 30 }, end: { x: X + 400, y: sy + 30 }, thickness: 1, color: LINE });
  page.drawText('AUTHORIZED SIGN-OFF', { x: X, y: sy + 10, size: 8.5, font: reg, color: GREY });
  await put(data.g || '-', X, sy - 12, 15, bold, DARK, 400);
  if (data.r) await put(data.r, X, sy - 29, 11, reg, GREY, 400);
  if (data.d) page.drawText(`Issued: ${new Date(data.d + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}`, { x: X, y: sy - 47, size: 10, font: mono, color: GREY });
  await put(`On behalf of ${data.o || 'the organization'}`, X, sy - 63, 10, mono, GREY, 500);

  const fine = wrap(`KarachAir is a technology platform and does not issue volunteer hours itself. Hours are accredited by ${pdfSafe(data.o || 'the organization')} that signed them off.`, reg, 7.5, 700);
  fine.forEach((l, i) => page.drawText(l, { x: X, y: 62 - i * 10, size: 7.5, font: reg, color: GREY }));

  return pdf.save();
}
