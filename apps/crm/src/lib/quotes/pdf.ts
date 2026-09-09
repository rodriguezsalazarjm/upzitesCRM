/**
 * Generacion de PDF sin dependencias.
 *
 * Se escribe el formato a mano en vez de sumar una libreria: el documento es
 * texto en una pagina, y `pdfkit` o `@react-pdf` traen decenas de megas y un
 * runtime que habria que mantener. Son ~120 lineas de PDF 1.4 con Helvetica.
 *
 * El resultado es **determinista**: los mismos datos producen los mismos bytes,
 * asi que el PDF de una cotizacion aprobada se puede regenerar identico.
 */
export type PdfLine = { label: string; detail?: string | null; amount: number };

export type QuotePdfData = {
  workspaceName: string;
  number: string;
  version: number;
  serviceName: string;
  customerName: string;
  issuedAt: Date;
  validUntil: Date | null;
  currency: string;
  lines: PdfLine[];
  subtotal: number;
  surcharges: number;
  discounts: number;
  total: number;
  inputs: { label: string; value: string }[];
  disclaimer: string | null;
};

/**
 * Escapa y transcodifica a WinAnsi.
 *
 * Las fuentes base de PDF no son UTF-8: un acento mal codificado sale como
 * basura. Se mapea lo que se usa en español y el resto se degrada a ASCII, que
 * es preferible a un caracter roto.
 */
const WIN_ANSI: Record<string, string> = {
  á: '\xe1', é: '\xe9', í: '\xed', ó: '\xf3', ú: '\xfa', ñ: '\xf1', ü: '\xfc',
  Á: '\xc1', É: '\xc9', Í: '\xcd', Ó: '\xd3', Ú: '\xda', Ñ: '\xd1', Ü: '\xdc',
  '¿': '\xbf', '¡': '\xa1', '°': '\xb0', '—': '-', '–': '-', '“': '"', '”': '"', '’': "'",
  // Se usan en el desglose: el punto medio separa numero de version y la cruz
  // multiplica cantidades. Sin mapearlos salian como '?' en el PDF.
  '·': '\xb7', '×': '\xd7', '±': '\xb1', º: '\xba', ª: '\xaa', '€': '\x80',
};

function pdfText(value: string) {
  let out = '';
  for (const char of value) {
    const mapped = WIN_ANSI[char] ?? (char.charCodeAt(0) < 128 ? char : '?');
    // Parentesis y barra son sintaxis dentro de una cadena PDF.
    out += mapped === '(' || mapped === ')' || mapped === '\\' ? `\\${mapped}` : mapped;
  }
  return out;
}

function money(amount: number, currency: string) {
  const sign = amount < 0 ? '-' : '';
  const absolute = Math.abs(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${sign}$${absolute} ${currency}`;
}

function formatDate(date: Date) {
  return date.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Corta un texto largo en lineas que quepan a lo ancho de la pagina. */
function wrap(text: string, maxChars: number) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    if ((current + ' ' + word).trim().length > maxChars) {
      if (current) lines.push(current.trim());
      current = word;
    } else {
      current = `${current} ${word}`;
    }
  }

  if (current.trim()) lines.push(current.trim());
  return lines;
}

type Op = { text: string; x: number; y: number; size: number; bold?: boolean };

export function renderQuotePdf(data: QuotePdfData): Buffer {
  const ops: Op[] = [];
  const left = 56;
  const right = 539;
  let y = 780;

  const write = (text: string, options: { x?: number; size?: number; bold?: boolean; dy?: number } = {}) => {
    y -= options.dy ?? 0;
    ops.push({ text, x: options.x ?? left, y, size: options.size ?? 10, bold: options.bold });
  };

  // Encabezado
  write(data.workspaceName, { size: 18, bold: true, dy: 0 });
  write(`Cotizacion ${data.number}${data.version > 1 ? ` · version ${data.version}` : ''}`, {
    size: 11,
    dy: 24,
  });
  write(data.serviceName, { size: 10, dy: 16 });

  write(`Fecha: ${formatDate(data.issuedAt)}`, { x: right - 150, size: 9, dy: 0 });
  if (data.validUntil) {
    write(`Valida hasta: ${formatDate(data.validUntil)}`, { x: right - 150, size: 9, dy: 12 });
  }

  write(`Cliente: ${data.customerName}`, { size: 10, dy: 26 });

  // Datos entregados
  if (data.inputs.length > 0) {
    write('DATOS CONSIDERADOS', { size: 8, bold: true, dy: 28 });
    for (const input of data.inputs) {
      write(`${input.label}: ${input.value}`, { size: 9, dy: 14 });
    }
  }

  // Desglose
  write('DETALLE', { size: 8, bold: true, dy: 26 });

  for (const line of data.lines) {
    write(line.label, { size: 10, dy: 16 });
    write(money(line.amount, data.currency), { x: right - 110, size: 10, dy: 0 });
    if (line.detail) {
      write(line.detail, { size: 8, dy: 11 });
    }
  }

  // Totales
  y -= 10;
  write('Subtotal', { x: right - 220, size: 9, dy: 16 });
  write(money(data.subtotal, data.currency), { x: right - 110, size: 9, dy: 0 });

  if (data.surcharges !== 0) {
    write('Recargos', { x: right - 220, size: 9, dy: 13 });
    write(money(data.surcharges, data.currency), { x: right - 110, size: 9, dy: 0 });
  }

  if (data.discounts !== 0) {
    write('Descuentos', { x: right - 220, size: 9, dy: 13 });
    write(money(-data.discounts, data.currency), { x: right - 110, size: 9, dy: 0 });
  }

  write('TOTAL', { x: right - 220, size: 13, bold: true, dy: 22 });
  write(money(data.total, data.currency), { x: right - 130, size: 13, bold: true, dy: 0 });

  // Disclaimer
  if (data.disclaimer) {
    y -= 24;
    for (const line of wrap(data.disclaimer, 92)) {
      write(line, { size: 8, dy: 11 });
    }
  }

  return buildPdf(ops);
}

/** Ensambla el archivo: objetos, tabla de referencias cruzadas y trailer. */
function buildPdf(ops: Op[]): Buffer {
  const content = ops
    .map(
      (op) =>
        `BT /${op.bold ? 'F2' : 'F1'} ${op.size} Tf 1 0 0 1 ${op.x} ${op.y} Tm (${pdfText(op.text)}) Tj ET`,
    )
    .join('\n');

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] ' +
      '/Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];

  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(pdf, 'latin1');
}
