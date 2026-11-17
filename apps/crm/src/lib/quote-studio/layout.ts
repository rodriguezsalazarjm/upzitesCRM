import { formatMinor } from '../commerce/money';
import { percentLabel, type CalcResult, type QuoteChargeInput, type QuoteLineInput } from './calc';
import { fontKey, sanitize, textWidth, wrap, type FontKey } from './fonts';
import { BLOCKS, type Block, type Brand, type Customer, type QuoteContent } from './schema';

/**
 * P37: maquetador único. Convierte (plantilla + marca + cotización) en páginas A4
 * de operaciones simples. El PDF (servidor) y la vista previa SVG (navegador)
 * dibujan EXACTAMENTE estas operaciones: mismo diseño en ambos, determinista.
 * Coordenadas en puntos, origen arriba a la izquierda, y = línea base del texto.
 */

export const PAGE = { width: 595, height: 842, margin: 48, footer: 36 };
export type Op =
  | { t: 'text'; x: number; y: number; s: string; f: FontKey; size: number; color: string }
  | { t: 'rect'; x: number; y: number; w: number; h: number; fill?: string; stroke?: string; lw?: number }
  | { t: 'line'; x1: number; y1: number; x2: number; y2: number; color: string; lw: number }
  | { t: 'image'; x: number; y: number; w: number; h: number };

export type RenderDoc = {
  brand: Brand;
  /** Tamaño real del logo (para respetar su proporción); los bytes los pone cada renderizador. */
  logo: { width: number; height: number } | null;
  blocks: Block[];
  number: string;
  version: number;
  title: string;
  issuedAt: string;
  validUntil: string | null;
  ownerName: string;
  customer: Customer;
  content: QuoteContent;
  currency: string;
  pricesIncludeTax: boolean;
  globalDiscountBp: number;
  lines: QuoteLineInput[];
  charges: QuoteChargeInput[];
  calc: CalcResult;
  timeZone: string;
};

const TEXT = '#1f2329';
const MUTED = '#6b7280';
const SIZES = { sm: 8.5, md: 9.5, lg: 10.5 } as const;
const GAPS = { compact: 6, normal: 11, airy: 18 } as const;
const BORDER = { none: 0, thin: 0.6, thick: 1.4 } as const;

export function formatDate(iso: string | null, timeZone: string) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric', timeZone });
}

/** Texto en hex más claro (para filas alternas). */
function tint(hex: string, amount: number) {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * amount).toString(16).padStart(2, '0');
  return `#${mix(n >> 16)}${mix((n >> 8) & 255)}${mix(n & 255)}`;
}

export function layoutQuote(doc: RenderDoc): Op[][] {
  const { brand } = doc;
  const body: number = SIZES[brand.textSize];
  const gap = GAPS[brand.spacing];
  const border = BORDER[brand.borders];
  const bodyFont = fontKey(brand.bodyFont);
  const bold = fontKey(brand.bodyFont, true);
  const heading = fontKey(brand.headingFont, true);
  const left = PAGE.margin;
  const width = PAGE.width - PAGE.margin * 2;
  const footerBlock = doc.blocks.find((b) => b.type === 'footer' && b.visible);
  const bottom = PAGE.height - PAGE.margin - (footerBlock ? PAGE.footer : 0);
  const money = (n: number) => sanitize(formatMinor(n, doc.currency));

  const pages: Op[][] = [[]];
  let y = PAGE.margin;
  const ops = () => pages[pages.length - 1];
  const newPage = () => { pages.push([]); y = PAGE.margin; };
  const ensure = (h: number) => { if (y + h > bottom && y > PAGE.margin) newPage(); };
  const text = (s: string, x: number, size: number, f: FontKey, color = TEXT, align: Block['align'] = 'left', boxWidth = width) => {
    const clean = sanitize(s);
    const w = textWidth(clean, f, size);
    const dx = align === 'right' ? boxWidth - w : align === 'center' ? (boxWidth - w) / 2 : 0;
    ops().push({ t: 'text', x: x + dx, y, s: clean, f, size, color });
  };
  const paragraph = (s: string, x: number, maxW: number, size = body, f = bodyFont, color = TEXT, align: Block['align'] = 'left') => {
    for (const line of wrap(s, f, size, maxW)) {
      ensure(size * 1.45);
      y += size * 1.2;
      text(line, x, size, f, color, align, maxW);
      y += size * 0.25;
    }
  };
  const label = (b: Block) => b.label || (b.type === 'contact_cta' ? 'Contacto' : BLOCKS[b.type]);
  const sectionTitle = (s: string, align: Block['align']) => {
    ensure(body * 3);
    y += body * 1.1;
    text(s.toUpperCase(), left, body * 0.9, heading, brand.accent, align);
    y += body * 0.45;
  };

  // Columnas lado a lado: empresa y cliente consecutivos se dibujan en dos columnas.
  const partyLines = (b: Block): [string, string[]] =>
    b.type === 'company'
      ? [sanitize(brand.companyName || 'Tu empresa'), [brand.taxId && `RUT ${brand.taxId}`, brand.address, brand.email, brand.phone, brand.website].filter(Boolean)]
      : [sanitize(doc.customer.name || doc.customer.company || 'Cliente'), [doc.customer.name && doc.customer.company, doc.customer.taxId && `RUT ${doc.customer.taxId}`, doc.customer.email, doc.customer.phone, doc.customer.address].filter(Boolean) as string[]];
  const party = (b: Block, x: number, colW: number) => {
    const start = y;
    y += body;
    text((b.label || (b.type === 'company' ? 'De' : 'Para')).toUpperCase(), x, body * 0.85, heading, brand.accent, 'left', colW);
    y += body * 0.5;
    const [name, rest] = partyLines(b);
    paragraph(name, x, colW, body * 1.1, bold);
    for (const line of rest) paragraph(line, x, colW, body * 0.95, bodyFont, MUTED);
    const used = y - start;
    return used;
  };

  const META: Record<string, (b: Block) => [string, string] | null> = {
    number: (b) => [b.label || 'Cotización N°', `${doc.number}${doc.version > 1 ? ` (v${doc.version})` : ''}`],
    date: (b) => [b.label || 'Fecha', formatDate(doc.issuedAt, doc.timeZone)],
    due_date: (b) => (doc.validUntil ? [b.label || 'Vence', formatDate(doc.validUntil, doc.timeZone)] : null),
    owner: (b) => (doc.ownerName ? [b.label || 'Ejecutivo', doc.ownerName] : null),
  };
  const TOTALS = ['subtotal', 'discount', 'taxes', 'charges', 'total'];
  const totalRows = (b: Block): [string, string, boolean][] => {
    const c = doc.calc;
    switch (b.type) {
      case 'subtotal': return [[b.label || 'Subtotal', money(c.subtotalMinor), false]];
      case 'discount': return c.globalDiscountMinor ? [[b.label || `Descuento (${percentLabel(doc.globalDiscountBp)})`, `-${money(c.globalDiscountMinor)}`, false]] : [];
      case 'taxes': return c.taxes.filter((t) => t.taxMinor).map((t) => [`${b.label || 'IVA'} ${percentLabel(t.rateBp)}`, money(t.taxMinor), false]);
      case 'charges': return doc.charges.map((ch) => [ch.label, money(ch.amountMinor), false]);
      case 'total': return [[b.label || 'Total', money(c.totalMinor), true]];
      default: return [];
    }
  };

  const visible = doc.blocks.filter((b) => b.visible && b.type !== 'footer');
  for (let i = 0; i < visible.length; i += 1) {
    const b = visible[i];
    const next = visible[i + 1];
    switch (b.type) {
      case 'header': {
        const titleText = b.label || 'COTIZACIÓN';
        if (brand.headerStyle === 'band') {
          ensure(56);
          ops().push({ t: 'rect', x: 0, y: y - PAGE.margin, w: PAGE.width, h: PAGE.margin + 46, fill: brand.primary });
          y += 30;
          text(titleText, left, 20, heading, '#ffffff');
          text(doc.number, left, body * 1.2, fontKey(brand.headingFont), '#ffffff', 'right');
          y += 26;
        } else {
          ensure(44);
          y += 24;
          text(titleText, left, 20, heading, brand.primary);
          text(doc.number, left, body * 1.2, fontKey(brand.headingFont), MUTED, 'right');
          y += 8;
          if (brand.headerStyle === 'line') ops().push({ t: 'line', x1: left, y1: y, x2: left + width, y2: y, color: brand.accent, lw: 2 });
          y += 6;
        }
        break;
      }
      case 'logo': {
        if (!doc.logo) break;
        // Alto de la marca, salvo que el logo muy ancho no quepa en media página.
        const aspect = doc.logo.width / doc.logo.height;
        const w = Math.min(width / 2, aspect * brand.logoHeight);
        const h = w / aspect;
        ensure(h + 4);
        const x = b.align === 'right' ? left + width - w : b.align === 'center' ? left + (width - w) / 2 : left;
        ops().push({ t: 'image', x, y, w, h });
        y += h;
        break;
      }
      case 'company':
      case 'customer': {
        const pair = next && (next.type === 'company' || next.type === 'customer') && next.type !== b.type ? next : null;
        ensure(body * 8);
        const start = y;
        if (pair) {
          const colW = (width - 24) / 2;
          const h1 = party(b, left, colW);
          y = start;
          const h2 = party(pair, left + colW + 24, colW);
          y = start + Math.max(h1, h2);
          i += 1;
        } else party(b, b.align === 'right' ? left + width / 2 : left, width / 2);
        break;
      }
      case 'number':
      case 'date':
      case 'due_date':
      case 'owner': {
        // Los datos consecutivos forman una ficha (alineada como el primero).
        const rows: [string, string][] = [];
        let j = i;
        for (; j < visible.length && META[visible[j].type]; j += 1) {
          const row = META[visible[j].type](visible[j]);
          if (row) rows.push(row);
        }
        i = j - 1;
        const boxW = 220;
        const x = b.align === 'left' ? left : b.align === 'center' ? left + (width - boxW) / 2 : left + width - boxW;
        y += gap / 2;
        for (const [k, v] of rows) {
          ensure(body * 1.6);
          y += body * 1.35;
          text(k, x, body, bodyFont, MUTED, 'left', boxW);
          text(v, x, body, bold, TEXT, 'right', boxW);
        }
        break;
      }
      case 'title': {
        if (!doc.title) break;
        y += gap;
        paragraph(doc.title, left, width, 15, heading, brand.primary, b.align);
        break;
      }
      case 'items': {
        const cols = [
          { key: 'desc', label: 'Descripción', w: width - 300, align: 'left' as const },
          { key: 'qty', label: 'Cant.', w: 60, align: 'right' as const },
          { key: 'price', label: 'Precio unit.', w: 85, align: 'right' as const },
          { key: 'disc', label: 'Desc.', w: 55, align: 'right' as const },
          { key: 'total', label: 'Total', w: 100, align: 'right' as const },
        ];
        const pad = 6;
        const headerRow = () => {
          ensure(body * 2.4);
          const h = body * 2.2;
          const fill = brand.tableStyle === 'lines' ? undefined : brand.primary;
          ops().push({ t: 'rect', x: left, y, w: width, h, fill, stroke: brand.tableStyle === 'boxed' && border ? brand.primary : undefined, lw: border });
          const color = fill ? '#ffffff' : brand.primary;
          let x = left;
          const base = y;
          y = base + h * 0.65;
          for (const c of cols) { text(c.label, x + pad, body * 0.9, bold, color, c.align, c.w - pad * 2); x += c.w; }
          y = base + h;
          if (!fill && border) ops().push({ t: 'line', x1: left, y1: y, x2: left + width, y2: y, color: brand.primary, lw: border * 1.5 });
        };
        y += gap;
        headerRow();
        doc.lines.forEach((line, index) => {
          const result = doc.calc.lines[index];
          const nameLines = wrap(line.name, bold, body, cols[0].w - pad * 2);
          const descLines = line.description ? wrap(line.description, bodyFont, body * 0.88, cols[0].w - pad * 2) : [];
          const h = pad * 1.6 + nameLines.length * body * 1.3 + descLines.length * body * 1.15;
          if (y + h > bottom) { newPage(); headerRow(); }
          const top = y;
          if (brand.tableStyle === 'striped' && index % 2 === 1) ops().push({ t: 'rect', x: left, y: top, w: width, h, fill: tint(brand.primary, 0.92) });
          y = top + pad * 0.6;
          for (const l of nameLines) { y += body * 1.3; text(l, left + pad, body, bold, TEXT, 'left', cols[0].w); }
          for (const l of descLines) { y += body * 1.15; text(l, left + pad, body * 0.88, bodyFont, MUTED, 'left', cols[0].w); }
          y = top + pad * 0.6 + body * 1.3;
          const qty = `${String(line.quantity).replace('.', ',')}${line.unit && line.unit !== 'unidad' ? ` ${line.unit}` : ''}`;
          const cells = [qty, money(line.unitPriceMinor), line.discountBp ? percentLabel(line.discountBp) : '-', money(result.grossMinor - result.lineDiscountMinor)];
          let x = left + cols[0].w;
          cells.forEach((cell, k) => { text(cell, x + pad, body, k === 3 ? bold : bodyFont, TEXT, 'right', cols[k + 1].w - pad * 2); x += cols[k + 1].w; });
          y = top + h;
          if (brand.tableStyle === 'boxed' && border) ops().push({ t: 'rect', x: left, y: top, w: width, h, stroke: tint(brand.primary, 0.5), lw: border });
          else if (border) ops().push({ t: 'line', x1: left, y1: y, x2: left + width, y2: y, color: tint(brand.primary, 0.75), lw: border });
        });
        if (doc.pricesIncludeTax) { y += body * 0.4; paragraph('Los precios unitarios incluyen impuestos.', left, width, body * 0.85, bodyFont, MUTED); }
        break;
      }
      case 'subtotal':
      case 'discount':
      case 'taxes':
      case 'charges':
      case 'total': {
        const rows: [string, string, boolean][] = [];
        let j = i;
        for (; j < visible.length && TOTALS.includes(visible[j].type); j += 1) rows.push(...totalRows(visible[j]));
        i = j - 1;
        const boxW = 240;
        const x = left + width - boxW;
        y += gap / 2;
        for (const [k, v, strong] of rows) {
          const h = strong ? body * 2.4 : body * 1.6;
          ensure(h + 2);
          if (strong) y += body * 0.5;
          if (strong) ops().push({ t: 'rect', x, y: y + 2, w: boxW, h, fill: brand.accent });
          y += strong ? body * 1.75 : body * 1.4;
          const color = strong ? '#ffffff' : TEXT;
          const size = strong ? body * 1.25 : body;
          text(k, x + 8, size, strong ? heading : bodyFont, strong ? color : MUTED, 'left', boxW - 16);
          text(v, x + 8, size, strong ? heading : bold, color, 'right', boxW - 16);
          if (strong) y += body * 0.9;
        }
        break;
      }
      case 'validity': {
        if (!doc.validUntil) break;
        sectionTitle(label(b), b.align);
        paragraph((b.text || 'Esta oferta es válida hasta el {fecha}.').replace('{fecha}', formatDate(doc.validUntil, doc.timeZone)), left, width, body, bodyFont, TEXT, b.align);
        break;
      }
      case 'signature': {
        ensure(80);
        y += 46;
        const w = 200;
        const x = b.align === 'right' ? left + width - w : b.align === 'center' ? left + (width - w) / 2 : left;
        ops().push({ t: 'line', x1: x, y1: y, x2: x + w, y2: y, color: TEXT, lw: 0.8 });
        y += body * 1.4;
        text(doc.ownerName || brand.companyName || '', x, body, bold, TEXT, 'center', w);
        y += body * 1.3;
        text(b.label || 'Firma y timbre', x, body * 0.85, bodyFont, MUTED, 'center', w);
        break;
      }
      default: {
        // Bloques de texto: el de la cotización manda; si está vacío, el de la plantilla.
        const value = (doc.content[b.type as keyof QuoteContent] || b.text || '').trim();
        if (!value) break;
        if (b.type !== 'intro') sectionTitle(label(b), b.align);
        else y += gap;
        paragraph(value, left, width, body, bodyFont, TEXT, b.align);
      }
    }
    y += gap;
  }

  // Pie en todas las páginas, con su número.
  if (footerBlock) {
    const base = sanitize(doc.content.footer || footerBlock.text || [brand.companyName, brand.website, brand.email].filter(Boolean).join(' · '));
    pages.forEach((page, index) => {
      const fy = PAGE.height - PAGE.margin + 4;
      if (brand.footerStyle === 'line') page.push({ t: 'line', x1: left, y1: fy - 14, x2: left + width, y2: fy - 14, color: tint(brand.primary, 0.7), lw: 0.5 });
      const size = body * 0.8;
      page.push({ t: 'text', x: left, y: fy, s: base.slice(0, 120), f: bodyFont, size, color: MUTED });
      const pageText = `Página ${index + 1} de ${pages.length}`;
      page.push({ t: 'text', x: left + width - textWidth(sanitize(pageText), bodyFont, size), y: fy, s: sanitize(pageText), f: bodyFont, size, color: MUTED });
    });
  }
  return pages;
}
