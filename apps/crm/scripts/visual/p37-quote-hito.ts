/**
 * Hito P37 (crm_pruebas, workspace "Visual Flow A"): plantilla con logo,
 * colores y tipografía; cotización con varias líneas, descuentos e impuestos
 * (los totales los calcula el servidor aunque el cliente mande otros); PDF;
 * envío por email (proveedor SCRIPTED, nada sale a internet) y por enlace;
 * duplicado rápido; aceptación pública; el snapshot no cambia si después
 * cambia la marca; editar lo enviado crea v2 sin tocar lo que ve el cliente;
 * otro negocio no puede tocar la cotización.
 * Idempotente: borra las cotizaciones "QA P37" de corridas anteriores.
 */
import assert from 'node:assert/strict';
import { crc32, deflateSync } from 'node:zlib';
import { extractText } from 'unpdf';
import { prisma } from '../../src/lib/prisma';
import { calculateQuote } from '../../src/lib/quote-studio/calc';
import { resolvePublicQuote, respondPublicQuote, snapshotPdf } from '../../src/lib/quote-studio/public';
import { defaultBlocks, parseBrand } from '../../src/lib/quote-studio/schema';
import {
  buildRenderDoc, createSalesQuote, duplicateSalesQuote, getStudioSettings, publicToken, saveCatalogItem, saveLogo, saveSalesQuote,
  saveStudioSettings, saveTemplate, sendSalesQuote,
} from '../../src/lib/quote-studio/service';

const ok = (label: string) => console.log(`OK  ${label}`);
const ws = async (prefix: string) => (await prisma.workspace.findFirstOrThrow({ where: { name: { startsWith: prefix } }, select: { id: true } })).id;
const workspaceId = await ws('Visual Flow A');
const otherWorkspaceId = await ws('Visual Flow B');
const owner = await prisma.workspaceMembership.findFirstOrThrow({ where: { workspaceId, role: 'OWNER', status: 'ACTIVE' }, select: { userId: true } });
const userId = owner.userId;

// Limpieza de corridas anteriores (solo lo de este hito).
const old = await prisma.salesQuote.findMany({ where: { workspaceId, title: { startsWith: 'QA P37' } }, select: { id: true } });
await prisma.salesQuoteVersion.deleteMany({ where: { salesQuoteId: { in: old.map((q) => q.id) } } });
await prisma.salesQuote.deleteMany({ where: { id: { in: old.map((q) => q.id) } } });
await prisma.quoteTemplate.deleteMany({ where: { workspaceId, name: 'QA P37 Marca' } });
await prisma.quoteCatalogItem.deleteMany({ where: { workspaceId, name: 'QA P37 Malla' } });

// 1. Marca: logo PNG con transparencia, colores, tipografías y estilos.
const chunk = (type: string, data: Buffer) => { const b = Buffer.alloc(12 + data.length); b.writeUInt32BE(data.length, 0); b.write(type, 4, 'latin1'); data.copy(b, 8); b.writeUInt32BE(crc32(b.subarray(4, 8 + data.length)), 8 + data.length); return b; };
const W = 120, H = 40;
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 6;
const rows: number[] = [];
for (let y = 0; y < H; y++) { rows.push(0); for (let x = 0; x < W; x++) rows.push(x < 40 ? 31 : 255, x < 40 ? 75 : 90, x < 40 ? 255 : 54, x < 40 || (x > 50 && y > 10 && y < 30) ? 255 : 0); }
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.from(rows))), chunk('IEND', Buffer.alloc(0))]);
await saveLogo(workspaceId, new Uint8Array(png));
const base = await getStudioSettings(workspaceId);
const brand = { ...parseBrand(base.brand), companyName: 'Visual Flow A SpA', taxId: '76.000.000-1', email: 'ventas@visualflow.test', primary: '#0f3d2e', accent: '#e85d04', headingFont: 'times' as const, bodyFont: 'helvetica' as const, tableStyle: 'boxed' as const, headerStyle: 'band' as const };
await saveStudioSettings(workspaceId, { brand, numberPrefix: 'COT', includeYear: true, yearlyReset: true, numberPadding: 4, currency: 'CLP', taxRateBp: 1900, pricesIncludeTax: false, validityDays: 15 });
const template = await saveTemplate(workspaceId, { name: 'QA P37 Marca', blocks: defaultBlocks().map((b) => (b.type === 'conditions' ? { ...b, text: 'Garantía de 12 meses en la instalación.' } : b.type === 'signature' ? { ...b, visible: false } : b)) });
const item = await saveCatalogItem(workspaceId, { name: 'QA P37 Malla', description: 'Malla de seguridad certificada', unit: 'm²', unitPriceMinor: 12990, taxRateBp: null });
ok('marca (logo PNG con alfa, colores, Times/Helvetica, tabla en cuadrícula), plantilla y catálogo');

// 2. Cotización con varias líneas, descuentos e impuestos. El cliente manda totales falsos: se ignoran.
const quote = await createSalesQuote(workspaceId, userId, { templateId: template.id });
assert.match(quote.number, new RegExp(`^COT-${new Date().getFullYear()}-\\d{4}$`));
const lines = [
  { id: 'l1', catalogItemId: item.id, name: item.name, description: item.description, quantity: 24.5, unit: 'm²', unitPriceMinor: 12990, discountBp: 1000, taxRateBp: null },
  { id: 'l2', name: 'Instalación', description: 'Mano de obra, 2 técnicos', quantity: 1, unit: 'servicio', unitPriceMinor: 180000, discountBp: 0, taxRateBp: null },
  { id: 'l3', name: 'Asesoría (exenta)', description: '', quantity: 2, unit: 'hora', unitPriceMinor: 35000, discountBp: 0, taxRateBp: 0 },
];
const charges = [{ id: 'c1', label: 'Despacho', amountMinor: 15000, taxable: true }];
const input = {
  templateId: template.id, title: 'QA P37 Mallas edificio Las Condes', currency: 'CLP' as const, pricesIncludeTax: false,
  customer: { name: 'Camila Rojas', company: 'Comunidad Edificio Los Robles', email: 'camila@cliente-p37.test', phone: '+56911112222', taxId: '65.111.222-3', address: 'Av. Apoquindo 1234' },
  content: { intro: 'Gracias por tu interés.', payment: '50 % al aceptar, 50 % contra entrega.', conditions: 'Garantía de 12 meses.', delivery: '5 días hábiles.', notes: '', terms: '', contact_cta: 'Escríbenos a ventas@visualflow.test', footer: 'Visual Flow A SpA' },
  lines, globalDiscountBp: 500, charges, validUntil: new Date(Date.now() + 15 * 86_400_000).toISOString(),
  totalMinor: 1, subtotalMinor: 1, taxMinor: 0,
};
const saved = await saveSalesQuote(workspaceId, quote.id, input, userId);
const expected = calculateQuote({ lines, charges, globalDiscountBp: 500, defaultTaxRateBp: 1900, pricesIncludeTax: false });
assert.equal(saved.totalMinor, expected.totalMinor);
assert.equal(saved.taxMinor, expected.taxMinor);
assert.ok(saved.totalMinor > 500_000, 'el total es el real, no el 1 que mandó el cliente');
assert.equal(expected.taxes.length, 2, 'dos tasas: 19 % y exenta');
ok(`totales del servidor: subtotal ${saved.subtotalMinor}, descuento ${saved.discountMinor}, IVA ${saved.taxMinor}, total ${saved.totalMinor} (el cliente mandó 1)`);

// 3. PDF
const render = await buildRenderDoc(workspaceId, saved);
const pdf = snapshotPdf(render);
assert.equal(Buffer.from(pdf.subarray(0, 5)).toString(), '%PDF-');
const { text } = await extractText(new Uint8Array(pdf), { mergePages: true });
for (const s of [saved.number, 'Comunidad Edificio Los Robles', 'QA P37 Malla', 'Asesoría (exenta)', 'Garantía de 12 meses']) assert.ok(text.includes(s), `el PDF incluye "${s}"`);
assert.ok(render.logo, 'el PDF lleva el logo');
ok(`PDF de ${pdf.byteLength} bytes con número, cliente, líneas, condiciones y logo`);

// 4. Envío por email (SCRIPTED: no sale nada a internet) y por enlace
if (!(await prisma.emailDomain.findFirst({ where: { workspaceId, status: 'VERIFIED' } }))) {
  await prisma.emailDomain.create({ data: { workspaceId, domain: 'cotizaciones-p37.test', status: 'VERIFIED', fromEmail: 'ventas@cotizaciones-p37.test', verifiedAt: new Date() } });
}
const sent = await sendSalesQuote(workspaceId, quote.id, 'email', userId);
const afterSend = await prisma.salesQuote.findUniqueOrThrow({ where: { id: quote.id }, include: { versions: true } });
assert.equal(afterSend.status, 'SENT');
assert.equal(afterSend.versions.length, 1);
assert.ok(afterSend.contactId, 'cliente rápido: se creó el contacto al enviar por email');
const message = await prisma.emailMessage.findFirst({ where: { workspaceId, contactId: afterSend.contactId! }, orderBy: { createdAt: 'desc' } });
assert.ok(message?.subject.includes(saved.number), 'quedó el email operativo con el número');
const link = await sendSalesQuote(workspaceId, quote.id, 'link', userId);
assert.equal(link.url, sent.url, 'el mismo enlace por cualquier canal');
assert.equal((await prisma.salesQuoteVersion.count({ where: { salesQuoteId: quote.id } })), 1, 'reenviar la misma versión no duplica el snapshot');
ok(`enviada por email a ${sent.recipient} (SCRIPTED) y por enlace ${link.url}`);

// 5. Duplicado rápido
const t0 = performance.now();
const copy = await duplicateSalesQuote(workspaceId, quote.id, userId);
const ms = Math.round(performance.now() - t0);
assert.notEqual(copy.number, saved.number);
assert.equal(copy.status, 'DRAFT');
assert.equal(copy.totalMinor, saved.totalMinor);
assert.equal(copy.publicTokenHash, null, 'la copia no hereda el enlace');
ok(`duplicada en ${ms} ms como ${copy.number} (borrador, mismo total, sin enlace)`);

// 6. Público: vista, cambio de marca sin efecto en lo enviado, aceptación
const token = publicToken(quote.id);
const viewed = await resolvePublicQuote(token);
assert.equal(viewed?.status, 'VIEWED');
await saveStudioSettings(workspaceId, { brand: { ...brand, primary: '#990000', companyName: 'Marca Cambiada' }, numberPrefix: 'COT', includeYear: true, yearlyReset: true, numberPadding: 4, currency: 'CLP', taxRateBp: 1900, pricesIncludeTax: false, validityDays: 15 });
const again = await resolvePublicQuote(token);
assert.equal(again?.snapshot.doc.brand.primary, '#0f3d2e', 'el snapshot conserva la marca con la que se envió');
assert.equal(again?.snapshot.doc.brand.companyName, 'Visual Flow A SpA');
const publicText = (await extractText(new Uint8Array(snapshotPdf(again!.snapshot)), { mergePages: true })).text;
assert.ok(publicText.includes('Visual Flow A SpA') && !publicText.includes('Marca Cambiada'));
const accepted = await respondPublicQuote(token, { decision: 'accept', comment: 'Perfecto, avancemos.' });
assert.equal(accepted.ok, true);
const twice = await respondPublicQuote(token, { decision: 'reject' });
assert.equal(twice.ok, false, 'no se responde dos veces');
const final = await prisma.salesQuote.findUniqueOrThrow({ where: { id: quote.id } });
assert.equal(final.status, 'ACCEPTED');
assert.equal(final.responseComment, 'Perfecto, avancemos.');
await assert.rejects(saveSalesQuote(workspaceId, quote.id, input, userId), /aceptada/);
ok('el cliente la vio (VIEWED), el PDF público no cambió con la marca nueva, aceptó con comentario; aceptada no se edita');

// 7. Editar lo enviado = versión 2; el cliente sigue viendo la v1 y no responde mientras tanto
await sendSalesQuote(workspaceId, copy.id, 'link', userId);
const v2 = await saveSalesQuote(workspaceId, copy.id, { ...input, lines: [...lines, { id: 'l4', name: 'Extra', description: '', quantity: 1, unit: 'unidad', unitPriceMinor: 10000, discountBp: 0, taxRateBp: null }] }, userId);
assert.equal(v2.version, 2);
assert.equal(v2.status, 'DRAFT');
const copyPublic = await resolvePublicQuote(publicToken(copy.id));
assert.equal(copyPublic?.version, 1);
assert.equal(copyPublic?.editingNewVersion, true);
assert.equal((await respondPublicQuote(publicToken(copy.id), { decision: 'accept' })).ok, false);
ok('editar una enviada abre la v2; el cliente sigue viendo la v1 y no puede aceptarla a medias');

// 8. Aislamiento: otro negocio no ve ni toca la cotización; un token inventado no abre nada
await assert.rejects(saveSalesQuote(otherWorkspaceId, copy.id, input, userId), /no encontrada/);
// (B puede no tener el plan: se rechaza igual, antes de leer nada.)
await assert.rejects(sendSalesQuote(otherWorkspaceId, copy.id, 'link', userId), /no encontrada|no incluye/);
assert.equal(await resolvePublicQuote('x'.repeat(32)), null);
ok('otro negocio no puede editarla ni enviarla; un token inventado no abre nada');

// Deja la marca como quedó configurada para la QA visual.
await saveStudioSettings(workspaceId, { brand, numberPrefix: 'COT', includeYear: true, yearlyReset: true, numberPadding: 4, currency: 'CLP', taxRateBp: 1900, pricesIncludeTax: false, validityDays: 15 });
console.log(`\nHITO P37 OK · cotización ${saved.number} (aceptada) · copia ${copy.number} v2 · enlace ${sent.url}`);
await prisma.$disconnect();
