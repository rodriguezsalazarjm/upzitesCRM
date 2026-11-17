import { pdfText } from '../quotes/pdf';
import { PDF_FONT, type FontKey } from './fonts';
import { PAGE, type Op } from './layout';
import type { PdfImage } from './logo';

/**
 * P37: escribe las páginas maquetadas como PDF 1.4 (fuentes base, WinAnsi).
 * Sin fechas ni ids aleatorios: los mismos datos dan los mismos bytes.
 */

const num = (n: number) => (Math.round(n * 100) / 100).toString();
const rgb = (hex: string) => {
  const v = parseInt(hex.slice(1), 16);
  return `${num((v >> 16) / 255)} ${num(((v >> 8) & 255) / 255)} ${num((v & 255) / 255)}`;
};
const FONTS = Object.keys(PDF_FONT) as FontKey[];

function content(ops: Op[]) {
  const out: string[] = [];
  const Y = (y: number) => num(PAGE.height - y);
  for (const op of ops) {
    if (op.t === 'text') out.push(`BT /F${FONTS.indexOf(op.f) + 1} ${num(op.size)} Tf ${rgb(op.color)} rg ${num(op.x)} ${Y(op.y)} Td (${pdfText(op.s)}) Tj ET`);
    else if (op.t === 'rect') {
      const box = `${num(op.x)} ${num(PAGE.height - op.y - op.h)} ${num(op.w)} ${num(op.h)} re`;
      if (op.fill) out.push(`${rgb(op.fill)} rg ${box} f`);
      if (op.stroke && op.lw) out.push(`${rgb(op.stroke)} RG ${num(op.lw)} w ${box} S`);
    } else if (op.t === 'line') out.push(`${rgb(op.color)} RG ${num(op.lw)} w ${num(op.x1)} ${Y(op.y1)} m ${num(op.x2)} ${Y(op.y2)} l S`);
    else out.push(`q ${num(op.w)} 0 0 ${num(op.h)} ${num(op.x)} ${num(PAGE.height - op.y - op.h)} cm /Im1 Do Q`);
  }
  return out.join('\n');
}

export function writeQuotePdf(pages: Op[][], logo: PdfImage | null, title: string): Buffer {
  const objects: Buffer[] = [];
  const add = (body: string | Buffer) => { objects.push(Buffer.isBuffer(body) ? body : Buffer.from(body, 'latin1')); return objects.length; };
  const stream = (dict: string, data: Buffer) => Buffer.concat([Buffer.from(`<< ${dict} /Length ${data.length} >>\nstream\n`, 'latin1'), data, Buffer.from('\nendstream', 'latin1')]);

  const catalog = add('');
  const pagesId = add('');
  const fontIds = FONTS.map((f) => add(`<< /Type /Font /Subtype /Type1 /BaseFont /${PDF_FONT[f]} /Encoding /WinAnsiEncoding >>`));
  let imageId: number | null = null;
  if (logo) {
    const space = logo.gray ? '/DeviceGray' : '/DeviceRGB';
    const size = `/Type /XObject /Subtype /Image /Width ${logo.width} /Height ${logo.height} /BitsPerComponent 8`;
    if (logo.kind === 'jpeg') imageId = add(stream(`${size} /ColorSpace ${space} /Filter /DCTDecode`, logo.data));
    else {
      const mask = logo.alpha ? add(stream(`/Type /XObject /Subtype /Image /Width ${logo.width} /Height ${logo.height} /BitsPerComponent 8 /ColorSpace /DeviceGray /Filter /FlateDecode`, logo.alpha)) : null;
      imageId = add(stream(`${size} /ColorSpace ${space} /Filter /FlateDecode${mask ? ` /SMask ${mask} 0 R` : ''}`, logo.data));
    }
  }
  const resources = `<< /Font << ${fontIds.map((id, i) => `/F${i + 1} ${id} 0 R`).join(' ')} >>${imageId ? ` /XObject << /Im1 ${imageId} 0 R >>` : ''} >>`;
  const pageIds = pages.map((ops) => {
    const contentId = add(stream('', Buffer.from(content(ops), 'latin1')));
    return add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE.width} ${PAGE.height}] /Resources ${resources} /Contents ${contentId} 0 R >>`);
  });
  const info = add(`<< /Title (${pdfText(title)}) /Producer (Upzites Flow) >>`);
  objects[catalog - 1] = Buffer.from(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`, 'latin1');
  objects[pagesId - 1] = Buffer.from(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`, 'latin1');

  const chunks: Buffer[] = [Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'latin1')];
  let offset = chunks[0].length;
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(offset);
    const chunk = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`, 'latin1'), body, Buffer.from('\nendobj\n', 'latin1')]);
    chunks.push(chunk);
    offset += chunk.length;
  });
  const xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  chunks.push(Buffer.from(`${xref}trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${offset}\n%%EOF\n`, 'latin1'));
  return Buffer.concat(chunks);
}
