import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { crc32, deflateSync } from 'node:zlib';
import { extractText, getDocumentProxy } from 'unpdf';
import { allocate, calculateQuote, type QuoteLineInput } from './calc';
import { textWidth, wrap } from './fonts';
import { layoutQuote, type RenderDoc } from './layout';
import { decodeLogo, LogoError, tryDecodeLogo } from './logo';
import { writeQuotePdf } from './pdf';
import { brandSchema, contentSchema, customerSchema, defaultBlocks, lineSchema } from './schema';

const line = (id: string, quantity: number, unitPriceMinor: number, discountBp = 0, taxRateBp: number | null = null): QuoteLineInput => ({ id, name: `Ítem ${id}`, description: '', quantity, unit: 'unidad', unitPriceMinor, discountBp, taxRateBp });

test('P37: cálculo con descuentos por línea y global, IVA y cargos', () => {
  const r = calculateQuote({
    lines: [line('a', 2, 10_000, 1000), line('b', 1.5, 3_333), line('c', 1, 5_000, 0, 0)],
    charges: [{ id: 'x', label: 'Despacho', amountMinor: 4_000, taxable: true }],
    globalDiscountBp: 500, defaultTaxRateBp: 1900, pricesIncludeTax: false,
  });
  // a: 20000 − 2000 = 18000 ; b: round(4999.5) = 5000 ; c: 5000 exento
  assert.deepEqual(r.lines.map((l) => l.grossMinor - l.lineDiscountMinor), [18_000, 5_000, 5_000]);
  assert.equal(r.subtotalMinor, 28_000);
  assert.equal(r.globalDiscountMinor, 1_400);
  assert.equal(r.taxes.find((t) => t.rateBp === 0)?.taxMinor, 0);
  assert.equal(r.totalMinor, r.subtotalMinor - r.globalDiscountMinor + r.taxMinor + r.chargesMinor, 'el total cuadra');
  assert.equal(r.taxes.reduce((a, t) => a + t.baseMinor, 0), 28_000 - 1_400 + 4_000, 'la base imponible incluye el cargo gravado');
});

test('P37: precios con impuesto incluido y reparto exacto', () => {
  const r = calculateQuote({ lines: [line('a', 1, 11_900)], charges: [], globalDiscountBp: 0, defaultTaxRateBp: 1900, pricesIncludeTax: true });
  assert.deepEqual([r.subtotalMinor, r.taxMinor, r.totalMinor], [10_000, 1_900, 11_900]);
  assert.deepEqual(allocate(10, [1, 1, 1]), [4, 3, 3]);
  assert.equal(allocate(1_001, [333, 333, 334]).reduce((a, b) => a + b, 0), 1_001);
  assert.equal(lineSchema.safeParse({ ...line('a', 1.0005, 1), name: 'x' }).success, false, 'máximo 3 decimales');
  assert.equal(lineSchema.safeParse({ ...line('a', 0, 1), name: 'x' }).success, false);
});

test('P37: medidas de texto y corte de líneas', () => {
  assert.equal(textWidth('AAAA', 'courier', 10), 24);
  assert.ok(Math.abs(textWidth('Hola', 'helvetica', 10) - 20.56) < 0.01);
  const lines = wrap('palabra '.repeat(40), 'helvetica', 10, 200);
  assert.ok(lines.length > 3 && lines.every((l) => textWidth(l, 'helvetica', 10) <= 200));
});

function doc(lines: QuoteLineInput[]): RenderDoc {
  return {
    brand: brandSchema.parse({ companyName: 'Mallas Quintero', primary: '#123456', accent: '#ff5a36', headingFont: 'times' }),
    logo: null, blocks: defaultBlocks(), number: 'COT-2026-0001', version: 1, title: 'Instalación de mallas', issuedAt: '2026-11-16T12:00:00Z', validUntil: '2026-12-01T12:00:00Z', ownerName: 'Ana Ejecutiva',
    customer: customerSchema.parse({ name: 'Juan Pérez', company: 'Edificio Sol' }), content: contentSchema.parse({ notes: 'Incluye retiro de escombros.' }), currency: 'CLP', pricesIncludeTax: false, globalDiscountBp: 0,
    lines, charges: [], calc: calculateQuote({ lines, charges: [], globalDiscountBp: 0, defaultTaxRateBp: 1900, pricesIncludeTax: false }), timeZone: 'America/Santiago',
  };
}

test('P37: tabla larga en varias páginas con encabezado repetido y PDF determinista', async () => {
  const many = Array.from({ length: 60 }, (_, i) => ({ ...line(String(i), 1, 1000 + i), description: 'Malla de seguridad de alta resistencia instalada en ventana' }));
  const pages = layoutQuote(doc(many));
  assert.ok(pages.length >= 3);
  for (const page of pages.slice(1, -1)) assert.ok(page.some((op) => op.t === 'text' && op.s === 'Descripción'), 'el encabezado de la tabla se repite');
  assert.ok(pages.every((page) => page.some((op) => op.t === 'text' && op.s.startsWith('Página '))));
  for (const page of pages) for (const op of page) if (op.t === 'text') assert.ok(op.y <= 842 - 48 + 4, 'nada se sale de la hoja');
  const a = writeQuotePdf(pages, null, 'COT');
  assert.deepEqual(a, writeQuotePdf(layoutQuote(doc(many)), null, 'COT'), 'mismos datos, mismos bytes');
  const pdf = await getDocumentProxy(new Uint8Array(a));
  assert.equal(pdf.numPages, pages.length);
  const { text } = await extractText(pdf, { mergePages: true });
  assert.match(text, /COT-2026-0001/);
  assert.match(text, /Juan P.rez/);
  assert.match(text, /Total/);
});

test('P37: logos JPG y PNG con transparencia; lo raro se rechaza', () => {
  const jpg = decodeLogo(readFileSync(join(process.cwd(), '../web/public/blog/ia-content.jpg')).subarray(0, 500 * 1024));
  assert.equal(jpg.kind, 'jpeg');
  assert.ok(jpg.width > 0 && jpg.height > 0);
  // PNG RGBA 2×1 hecho a mano (filtro 0).
  const chunk = (type: string, data: Buffer) => { const b = Buffer.alloc(12 + data.length); b.writeUInt32BE(data.length, 0); b.write(type, 4, 'latin1'); data.copy(b, 8); b.writeUInt32BE(crc32(b.subarray(4, 8 + data.length)), 8 + data.length); return b; };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(2, 0); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.from([0, 255, 0, 0, 255, 0, 0, 255, 0]);
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
  const decoded = decodeLogo(png);
  assert.equal(decoded.kind, 'flate');
  assert.ok(decoded.kind === 'flate' && decoded.alpha, 'la transparencia va como máscara');
  const pdf = writeQuotePdf(layoutQuote({ ...doc([line('a', 1, 100)]), logo: { width: 2, height: 1 } }), decoded, 'x');
  assert.match(pdf.toString('latin1'), /\/SMask \d+ 0 R/);
  ihdr[8] = 16;
  const png16 = Buffer.concat([png.subarray(0, 8), chunk('IHDR', ihdr), chunk('IEND', Buffer.alloc(0))]);
  assert.throws(() => decodeLogo(png16), LogoError);
  const broken = Buffer.from(png); broken[broken.length - 13] ^= 0xff;
  assert.throws(() => decodeLogo(broken), /dañado/, 'CRC inválido: el navegador no lo mostraría');
  assert.equal(tryDecodeLogo(broken), null, 'lo ya guardado se omite en vez de romper la página');
  assert.throws(() => decodeLogo(Buffer.from('GIF89a')), LogoError);
});
