import { createHash, createHmac } from 'node:crypto';
import { Prisma, SendCategory, type SalesQuote, type QuoteStudioSettings } from '../../../generated/prisma/client';
import { hasCapability } from '../billing/usage';
import { recordAudit } from '../domain/audit';
import { sendEmail } from '../email/send';
import { prisma } from '../prisma';
import { getSessionSecret } from '../session-token';
import { calculateQuote, type QuoteChargeInput, type QuoteLineInput } from './calc';
import type { RenderDoc } from './layout';
import { decodeLogo, logoMime, LogoError, tryDecodeLogo } from './logo';
export { formatQuoteNumber } from './schema';
import {
  blocksSchema, catalogItemSchema, contentSchema, customerSchema, defaultBlocks, formatQuoteNumber, parseBrand, quoteInputSchema, settingsInputSchema, templateInputSchema, TEXT_BLOCKS,
  type Block, type QuoteInput,
} from './schema';

/**
 * P37: Quote Studio. Reglas que impone el código:
 *  - Los totales se calculan SIEMPRE aquí (lo que mande el navegador se ignora).
 *  - Enviar congela un snapshot (SalesQuoteVersion); editar algo enviado abre la versión siguiente.
 *  - Aceptada o cancelada no se edita: se duplica.
 *  - Todo acotado al workspace; plantillas, marca y catálogo solo OWNER/ADMIN (en las rutas).
 */
export class QuoteStudioError extends Error {}

const TIME_ZONE = 'America/Santiago';
const EDITABLE = ['DRAFT', 'READY'] as const;
const REOPENABLE = ['SENT', 'VIEWED', 'REJECTED', 'EXPIRED'] as const;

export async function assertQuotesPlan(workspaceId: string) {
  if (!(await hasCapability(workspaceId, 'QUOTES'))) throw new QuoteStudioError('Tu plan no incluye cotizaciones.');
}

// --- Marca, numeración y plantillas ------------------------------------------

export async function getStudioSettings(workspaceId: string) {
  const existing = await prisma.quoteStudioSettings.findUnique({ where: { workspaceId } });
  if (existing) return existing;
  const workspace = await prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { name: true } });
  return prisma.quoteStudioSettings.upsert({ where: { workspaceId }, create: { workspaceId, brand: { companyName: workspace.name } }, update: {} });
}

export async function saveStudioSettings(workspaceId: string, raw: unknown) {
  const input = settingsInputSchema.parse(raw);
  await getStudioSettings(workspaceId);
  return prisma.quoteStudioSettings.update({ where: { workspaceId }, data: input });
}

export async function saveLogo(workspaceId: string, bytes: Uint8Array | null) {
  await getStudioSettings(workspaceId);
  if (!bytes) return prisma.quoteStudioSettings.update({ where: { workspaceId }, data: { logo: null, logoMime: null } });
  try {
    decodeLogo(bytes);
  } catch (error) {
    throw new QuoteStudioError(error instanceof LogoError ? error.message : 'No se pudo leer el logo.');
  }
  return prisma.quoteStudioSettings.update({ where: { workspaceId }, data: { logo: Buffer.from(bytes), logoMime: logoMime(bytes) } });
}

/** Logo para la vista previa (data URL) y su tamaño real. */
export function logoForClient(settings: Pick<QuoteStudioSettings, 'logo' | 'logoMime'>) {
  if (!settings.logo || !settings.logoMime) return null;
  const image = tryDecodeLogo(settings.logo);
  if (!image) return null;
  return { dataUrl: `data:${settings.logoMime};base64,${Buffer.from(settings.logo).toString('base64')}`, width: image.width, height: image.height };
}

export async function listTemplates(workspaceId: string) {
  const templates = await prisma.quoteTemplate.findMany({ where: { workspaceId, archivedAt: null }, orderBy: { createdAt: 'asc' } });
  if (templates.length) return templates;
  // Primera vez: una plantilla estándar lista para usar.
  return [await prisma.quoteTemplate.create({ data: { workspaceId, name: 'Cotización estándar', blocks: defaultBlocks() } })];
}

export async function saveTemplate(workspaceId: string, raw: unknown, templateId?: string) {
  const input = templateInputSchema.parse(raw);
  if (!templateId) return prisma.quoteTemplate.create({ data: { workspaceId, ...input } });
  const updated = await prisma.quoteTemplate.updateMany({ where: { id: templateId, workspaceId, archivedAt: null }, data: input });
  if (!updated.count) throw new QuoteStudioError('Plantilla no encontrada.');
  return prisma.quoteTemplate.findFirstOrThrow({ where: { id: templateId, workspaceId } });
}

export async function duplicateTemplate(workspaceId: string, templateId: string) {
  const source = await prisma.quoteTemplate.findFirst({ where: { id: templateId, workspaceId } });
  if (!source) throw new QuoteStudioError('Plantilla no encontrada.');
  return prisma.quoteTemplate.create({ data: { workspaceId, name: `${source.name} (copia)`.slice(0, 80), blocks: source.blocks as Prisma.InputJsonValue } });
}

export async function archiveTemplate(workspaceId: string, templateId: string) {
  const active = await prisma.quoteTemplate.count({ where: { workspaceId, archivedAt: null } });
  if (active <= 1) throw new QuoteStudioError('Debe quedar al menos una plantilla.');
  // Archivar no rompe cotizaciones: las enviadas tienen su snapshot.
  await prisma.quoteTemplate.updateMany({ where: { id: templateId, workspaceId }, data: { archivedAt: new Date() } });
}

// --- Catálogo -----------------------------------------------------------------

export async function saveCatalogItem(workspaceId: string, raw: unknown, itemId?: string) {
  const input = catalogItemSchema.parse(raw);
  if (!itemId) return prisma.quoteCatalogItem.create({ data: { workspaceId, ...input } });
  const updated = await prisma.quoteCatalogItem.updateMany({ where: { id: itemId, workspaceId }, data: input });
  if (!updated.count) throw new QuoteStudioError('Ítem no encontrado.');
  return prisma.quoteCatalogItem.findFirstOrThrow({ where: { id: itemId, workspaceId } });
}

export async function archiveCatalogItem(workspaceId: string, itemId: string) {
  await prisma.quoteCatalogItem.updateMany({ where: { id: itemId, workspaceId }, data: { archivedAt: new Date() } });
}

// --- Numeración ---------------------------------------------------------------

/** Pura: COT-2026-0001. */
/** Siguiente número, serializado por workspace (bloqueo de fila) y saltando los ya usados. */
async function nextNumber(tx: Prisma.TransactionClient, workspaceId: string, now: Date) {
  await tx.$queryRaw`SELECT "id" FROM "quote_studio_settings" WHERE "workspace_id" = ${workspaceId} FOR UPDATE`;
  const s = await tx.quoteStudioSettings.findUniqueOrThrow({ where: { workspaceId } });
  const year = Number(now.toLocaleString('en-US', { year: 'numeric', timeZone: TIME_ZONE }));
  let n = s.yearlyReset && s.lastNumberYear !== year ? 0 : s.lastNumber;
  let number: string;
  do {
    n += 1;
    number = formatQuoteNumber(s, year, n);
  } while (await tx.salesQuote.findFirst({ where: { workspaceId, number }, select: { id: true } }));
  await tx.quoteStudioSettings.update({ where: { workspaceId }, data: { lastNumber: n, lastNumberYear: year } });
  return number;
}

// --- Cotizaciones -------------------------------------------------------------

const asLines = (value: unknown) => (Array.isArray(value) ? value : []) as QuoteLineInput[];
const asCharges = (value: unknown) => (Array.isArray(value) ? value : []) as QuoteChargeInput[];

function totalsFor(input: { lines: QuoteLineInput[]; charges: QuoteChargeInput[]; globalDiscountBp: number; pricesIncludeTax: boolean }, taxRateBp: number) {
  const calc = calculateQuote({ ...input, defaultTaxRateBp: taxRateBp });
  return { calc, data: { subtotalMinor: calc.subtotalMinor, discountMinor: calc.discountMinor, taxMinor: calc.taxMinor, chargesMinor: calc.chargesMinor, totalMinor: calc.totalMinor } };
}

async function checkLinks(workspaceId: string, contactId?: string | null, opportunityId?: string | null, ownerId?: string | null) {
  const [contact, opportunity, owner] = await Promise.all([
    contactId ? prisma.contact.findFirst({ where: { id: contactId, workspaceId }, select: { id: true } }) : null,
    opportunityId ? prisma.opportunity.findFirst({ where: { id: opportunityId, workspaceId }, select: { id: true } }) : null,
    ownerId ? prisma.workspaceMembership.findFirst({ where: { userId: ownerId, workspaceId }, select: { id: true } }) : null,
  ]);
  if (contactId && !contact) throw new QuoteStudioError('El contacto no es de este negocio.');
  if (opportunityId && !opportunity) throw new QuoteStudioError('La oportunidad no es de este negocio.');
  if (ownerId && !owner) throw new QuoteStudioError('El ejecutivo no es de este negocio.');
}

/** Nueva cotización en borrador, precargada desde contacto/oportunidad y la plantilla. */
export async function createSalesQuote(workspaceId: string, userId: string, from: { templateId?: string | null; contactId?: string | null; opportunityId?: string | null } = {}) {
  await assertQuotesPlan(workspaceId);
  const settings = await getStudioSettings(workspaceId);
  const templates = await listTemplates(workspaceId);
  const template = templates.find((t) => t.id === from.templateId) ?? templates[0];
  const opportunity = from.opportunityId
    ? await prisma.opportunity.findFirst({ where: { id: from.opportunityId, workspaceId }, select: { id: true, title: true, contactId: true, ownerId: true, company: { select: { name: true } } } })
    : null;
  if (from.opportunityId && !opportunity) throw new QuoteStudioError('La oportunidad no es de este negocio.');
  const contactId = from.contactId ?? opportunity?.contactId ?? null;
  const contact = contactId
    ? await prisma.contact.findFirst({ where: { id: contactId, workspaceId }, select: { id: true, firstName: true, lastName: true, email: true, phone: true, company: { select: { name: true } } } })
    : null;
  if (contactId && !contact) throw new QuoteStudioError('El contacto no es de este negocio.');

  const blocks = blocksSchema.parse(template.blocks);
  const content = contentSchema.parse(Object.fromEntries(TEXT_BLOCKS.map((k) => [k, blocks.find((b) => b.type === k)?.text ?? ''])));
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const number = await nextNumber(tx, workspaceId, now);
    const quote = await tx.salesQuote.create({
      data: {
        workspaceId, templateId: template.id, number, currency: settings.currency, pricesIncludeTax: settings.pricesIncludeTax,
        title: opportunity?.title ?? '', contactId: contact?.id ?? null, opportunityId: opportunity?.id ?? null, ownerId: opportunity?.ownerId ?? userId,
        customer: customerSchema.parse({ name: contact ? `${contact.firstName} ${contact.lastName}`.trim() : '', company: contact?.company?.name ?? opportunity?.company?.name ?? '', email: contact?.email ?? '', phone: contact?.phone ?? '' }),
        content, issuedAt: now, validUntil: new Date(now.getTime() + settings.validityDays * 86_400_000), createdById: userId,
      },
    });
    await recordAudit({ workspaceId, action: 'sales_quote.created', entity: 'SalesQuote', entityId: quote.id, actorId: userId, metadata: { number } }, tx);
    return quote;
  });
}

/** Guarda lo editado. Recalcula totales. Si ya se había enviado, abre la versión siguiente. */
export async function saveSalesQuote(workspaceId: string, quoteId: string, raw: QuoteInput, userId: string) {
  const input = quoteInputSchema.parse(raw);
  const quote = await prisma.salesQuote.findFirst({ where: { id: quoteId, workspaceId } });
  if (!quote) throw new QuoteStudioError('Cotización no encontrada.');
  if (quote.status === 'ACCEPTED' || quote.status === 'CANCELLED') throw new QuoteStudioError('Una cotización aceptada o cancelada no se edita: duplícala.');
  await checkLinks(workspaceId, input.contactId, input.opportunityId, input.ownerId);
  if (input.templateId && !(await prisma.quoteTemplate.findFirst({ where: { id: input.templateId, workspaceId }, select: { id: true } }))) throw new QuoteStudioError('Plantilla no encontrada.');
  const settings = await getStudioSettings(workspaceId);
  const { data: totals } = totalsFor({ lines: input.lines, charges: input.charges, globalDiscountBp: input.globalDiscountBp, pricesIncludeTax: input.pricesIncludeTax }, settings.taxRateBp);
  const reopen = (REOPENABLE as readonly string[]).includes(quote.status);
  // Condicional: si otra pestaña la aceptó o canceló entre medio, no se pisa.
  const updated = await prisma.salesQuote.updateMany({
    where: { id: quote.id, workspaceId, status: quote.status, version: quote.version },
    data: {
      templateId: input.templateId ?? null, title: input.title, currency: input.currency, pricesIncludeTax: input.pricesIncludeTax,
      customer: input.customer, contactId: input.contactId ?? null, opportunityId: input.opportunityId ?? null, ownerId: input.ownerId ?? null,
      content: input.content, lines: input.lines as Prisma.InputJsonValue, globalDiscountBp: input.globalDiscountBp, charges: input.charges as Prisma.InputJsonValue,
      validUntil: input.validUntil ? new Date(input.validUntil) : null, ...totals,
      ...(reopen ? { status: 'DRAFT' as const, version: quote.version + 1 } : {}),
    },
  });
  if (!updated.count) throw new QuoteStudioError('La cotización cambió mientras la editabas. Recarga la página.');
  if (reopen) await recordAudit({ workspaceId, action: 'sales_quote.new_version', entityId: quote.id, entity: 'SalesQuote', actorId: userId, metadata: { from: quote.version, to: quote.version + 1 } });
  return prisma.salesQuote.findFirstOrThrow({ where: { id: quote.id, workspaceId } });
}

export async function duplicateSalesQuote(workspaceId: string, quoteId: string, userId: string) {
  await assertQuotesPlan(workspaceId);
  const source = await prisma.salesQuote.findFirst({ where: { id: quoteId, workspaceId } });
  if (!source) throw new QuoteStudioError('Cotización no encontrada.');
  const settings = await getStudioSettings(workspaceId);
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const number = await nextNumber(tx, workspaceId, now);
    const copy = await tx.salesQuote.create({
      data: {
        workspaceId, number, templateId: source.templateId, contactId: source.contactId, opportunityId: source.opportunityId, ownerId: source.ownerId,
        title: source.title, currency: source.currency, pricesIncludeTax: source.pricesIncludeTax,
        customer: source.customer as Prisma.InputJsonValue, content: source.content as Prisma.InputJsonValue, lines: source.lines as Prisma.InputJsonValue,
        globalDiscountBp: source.globalDiscountBp, charges: source.charges as Prisma.InputJsonValue,
        subtotalMinor: source.subtotalMinor, discountMinor: source.discountMinor, taxMinor: source.taxMinor, chargesMinor: source.chargesMinor, totalMinor: source.totalMinor,
        issuedAt: now, validUntil: new Date(now.getTime() + settings.validityDays * 86_400_000), duplicatedFromId: source.id, createdById: userId,
      },
    });
    await recordAudit({ workspaceId, action: 'sales_quote.duplicated', entity: 'SalesQuote', entityId: copy.id, actorId: userId, metadata: { from: source.number, number } }, tx);
    return copy;
  });
}

export type QuoteAction = 'ready' | 'new_version' | 'accept' | 'reject' | 'cancel';

export async function salesQuoteAction(workspaceId: string, quoteId: string, action: QuoteAction, userId: string) {
  const quote = await prisma.salesQuote.findFirst({ where: { id: quoteId, workspaceId } });
  if (!quote) throw new QuoteStudioError('Cotización no encontrada.');
  const now = new Date();
  const rule: Record<QuoteAction, { from: readonly string[]; data: Prisma.SalesQuoteUpdateManyMutationInput; message: string }> = {
    ready: { from: ['DRAFT'], data: { status: 'READY' }, message: 'Solo un borrador pasa a lista.' },
    new_version: { from: REOPENABLE, data: { status: 'DRAFT', version: quote.version + 1 }, message: 'Solo una enviada, rechazada o vencida abre una versión nueva.' },
    accept: { from: ['SENT', 'VIEWED', 'EXPIRED'], data: { status: 'ACCEPTED', acceptedAt: now }, message: 'Solo una cotización enviada se marca aceptada.' },
    reject: { from: ['SENT', 'VIEWED', 'EXPIRED'], data: { status: 'REJECTED', rejectedAt: now }, message: 'Solo una cotización enviada se marca rechazada.' },
    cancel: { from: ['DRAFT', 'READY', 'SENT', 'VIEWED', 'EXPIRED', 'REJECTED'], data: { status: 'CANCELLED', cancelledAt: now }, message: 'Ya está aceptada o cancelada.' },
  };
  const { from, data, message } = rule[action];
  if (!from.includes(quote.status)) throw new QuoteStudioError(message);
  if (action === 'ready') problemsToSend(quote, true);
  const updated = await prisma.salesQuote.updateMany({ where: { id: quote.id, workspaceId, status: quote.status }, data });
  if (!updated.count) throw new QuoteStudioError('La cotización cambió mientras tanto. Recarga la página.');
  await recordAudit({ workspaceId, action: `sales_quote.${action}`, entity: 'SalesQuote', entityId: quote.id, actorId: userId, metadata: { from: quote.status } });
  return prisma.salesQuote.findFirstOrThrow({ where: { id: quote.id, workspaceId } });
}

function problemsToSend(quote: Pick<SalesQuote, 'customer' | 'lines'>, raise: boolean) {
  const customer = customerSchema.parse(quote.customer);
  const problem = !customer.name && !customer.company ? 'Falta el nombre del cliente.' : asLines(quote.lines).length === 0 ? 'Agrega al menos una línea.' : null;
  if (problem && raise) throw new QuoteStudioError(problem);
  return problem;
}

// --- Documento, PDF y envío -----------------------------------------------------

/** Datos de la maqueta a partir de lo guardado (lo usan el PDF, la vista previa y el snapshot). */
export async function buildRenderDoc(workspaceId: string, quote: SalesQuote, settings?: QuoteStudioSettings): Promise<{ doc: RenderDoc; logo: ReturnType<typeof logoForClient> }> {
  const s = settings ?? (await getStudioSettings(workspaceId));
  const [template, owner] = await Promise.all([
    quote.templateId ? prisma.quoteTemplate.findFirst({ where: { id: quote.templateId, workspaceId } }) : null,
    quote.ownerId ? prisma.user.findUnique({ where: { id: quote.ownerId }, select: { name: true } }) : null,
  ]);
  const blocks: Block[] = template ? blocksSchema.parse(template.blocks) : defaultBlocks();
  const lines = asLines(quote.lines);
  const charges = asCharges(quote.charges);
  const { calc } = totalsFor({ lines, charges, globalDiscountBp: quote.globalDiscountBp, pricesIncludeTax: quote.pricesIncludeTax }, s.taxRateBp);
  const logo = logoForClient(s);
  return {
    logo,
    doc: {
      brand: parseBrand(s.brand), logo: logo ? { width: logo.width, height: logo.height } : null, blocks, number: quote.number, version: quote.version, title: quote.title,
      issuedAt: quote.issuedAt.toISOString(), validUntil: quote.validUntil?.toISOString() ?? null, ownerName: owner?.name ?? '',
      customer: customerSchema.parse(quote.customer), content: contentSchema.parse(quote.content), currency: quote.currency, pricesIncludeTax: quote.pricesIncludeTax,
      globalDiscountBp: quote.globalDiscountBp, lines, charges, calc, timeZone: TIME_ZONE,
    },
  };
}

export type QuoteSnapshot = { doc: RenderDoc; logo: { dataUrl: string; width: number; height: number } | null };

/** Token del enlace público: derivado (se puede volver a mostrar) y guardado solo como hash. */
export function publicToken(quoteId: string) {
  return createHmac('sha256', getSessionSecret()).update(`sales-quote:${quoteId}`).digest('base64url').slice(0, 32);
}
export const hashPublicToken = (token: string) => createHash('sha256').update(token).digest('hex');
export const publicQuoteUrl = (token: string) => `${(process.env.NEXT_PUBLIC_CRM_BASE_URL ?? 'http://localhost:3001').replace(/\/+$/, '')}/cotizacion/${token}`;

export type SendChannel = 'email' | 'whatsapp' | 'link';

/**
 * Envía la versión actual: congela el snapshot, deja el enlace público activo y
 * marca SENT. Con email, solo si el correo salió de verdad.
 */
export async function sendSalesQuote(workspaceId: string, quoteId: string, channel: SendChannel, userId: string) {
  await assertQuotesPlan(workspaceId);
  const quote = await prisma.salesQuote.findFirst({ where: { id: quoteId, workspaceId } });
  if (!quote) throw new QuoteStudioError('Cotización no encontrada.');
  if (!['DRAFT', 'READY', 'SENT', 'VIEWED'].includes(quote.status)) throw new QuoteStudioError('Esta cotización ya no se puede enviar: duplícala o abre una versión nueva.');
  problemsToSend(quote, true);
  const settings = await getStudioSettings(workspaceId);
  const { doc, logo } = await buildRenderDoc(workspaceId, quote, settings);
  const token = publicToken(quote.id);
  const url = publicQuoteUrl(token);
  const brand = parseBrand(settings.brand);
  const customer = customerSchema.parse(quote.customer);
  let recipient: string | null = null;

  if (channel === 'email') {
    if (!customer.email) throw new QuoteStudioError('Agrega el email del cliente.');
    // Cliente rápido: si no hay contacto, se crea con lo escrito en la cotización.
    // Si ya existe un contacto con ese email se reutiliza (email único por negocio).
    const existing = quote.contactId ? null : await prisma.contact.findFirst({ where: { workspaceId, email: customer.email }, select: { id: true } });
    const contactId = quote.contactId ?? existing?.id ?? (await prisma.contact.create({ data: { workspaceId, firstName: customer.name || customer.company || customer.email, lastName: '', email: customer.email, phone: customer.phone || null, source: 'quote' }, select: { id: true } })).id;
    if (!quote.contactId) await prisma.salesQuote.updateMany({ where: { id: quote.id, workspaceId }, data: { contactId } });
    const from = brand.companyName || 'nosotros';
    const result = await sendEmail({
      workspaceId, contactId, category: SendCategory.OPERATIONAL, ignoreQuietHours: true, actorId: userId,
      subject: `Cotización ${quote.number} de ${from}`,
      bodyText: `Hola ${customer.name || ''}\n\nTe enviamos la cotización ${quote.number}${quote.title ? ` (${quote.title})` : ''}.\nPuedes verla, descargarla en PDF y aceptarla aquí: ${url}\n\n${from}`,
      bodyHtml: `<p>Hola ${escapeHtml(customer.name)},</p><p>Te enviamos la cotización <strong>${escapeHtml(quote.number)}</strong>${quote.title ? ` (${escapeHtml(quote.title)})` : ''}.</p><p><a href="${url}">Ver, descargar y aceptar la cotización</a></p><p>${escapeHtml(from)}</p>`,
    });
    if (result.status !== 'SENT') throw new QuoteStudioError(emailProblem(result.status === 'SKIPPED' ? result.reason : result.error));
    recipient = customer.email;
  }
  if (channel === 'whatsapp') recipient = customer.phone || null;

  const snapshot: QuoteSnapshot = { doc, logo };
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    // La misma versión enviada por otro canal no duplica el snapshot.
    await tx.salesQuoteVersion.upsert({
      where: { salesQuoteId_version: { salesQuoteId: quote.id, version: quote.version } },
      create: { workspaceId, salesQuoteId: quote.id, version: quote.version, snapshot: snapshot as unknown as Prisma.InputJsonValue, channel, recipient, sentById: userId },
      update: { snapshot: snapshot as unknown as Prisma.InputJsonValue, channel, recipient, sentById: userId },
    });
    await tx.salesQuote.updateMany({
      where: { id: quote.id, workspaceId },
      data: { status: quote.status === 'VIEWED' ? 'VIEWED' : 'SENT', sentAt: quote.sentAt ?? now, publicTokenHash: hashPublicToken(token) },
    });
    await recordAudit({ workspaceId, action: 'sales_quote.sent', entity: 'SalesQuote', entityId: quote.id, actorId: userId, metadata: { channel, version: quote.version, recipient } }, tx);
  });

  const phone = customer.phone.replace(/\D/g, '');
  const message = `Hola ${customer.name || ''}, te comparto la cotización ${quote.number}${quote.title ? ` (${quote.title})` : ''}: ${url}`;
  return { url, whatsappUrl: `https://wa.me/${phone}?text=${encodeURIComponent(message)}`, recipient };
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
function emailProblem(reason: string) {
  const known: Record<string, string> = {
    NO_SENDER_DOMAIN: 'Configura un dominio de envío de email (Integraciones) para enviar cotizaciones.',
    EMAIL_DISABLED: 'El envío de emails está desactivado.',
    SUBSCRIPTION_INACTIVE: 'La suscripción del negocio no está vigente.',
    NO_IDENTIFIER: 'El contacto no tiene email.',
  };
  return `No se envió el email: ${known[reason] ?? reason}. Puedes compartirla por WhatsApp o con el enlace.`;
}

// --- Métricas -----------------------------------------------------------------

export async function quoteMetrics(workspaceId: string, currency: string) {
  const quotes = await prisma.salesQuote.findMany({ where: { workspaceId, currency }, select: { status: true, totalMinor: true, sentAt: true, acceptedAt: true } });
  const count = (s: string[]) => quotes.filter((q) => s.includes(q.status)).length;
  const sent = quotes.filter((q) => q.sentAt);
  const accepted = quotes.filter((q) => q.status === 'ACCEPTED');
  const decided = count(['ACCEPTED', 'REJECTED']);
  const times = accepted.filter((q) => q.sentAt && q.acceptedAt).map((q) => q.acceptedAt!.getTime() - q.sentAt!.getTime());
  return {
    created: quotes.length,
    sent: sent.length,
    viewed: count(['VIEWED']),
    accepted: accepted.length,
    rejected: count(['REJECTED']),
    expired: count(['EXPIRED']),
    acceptanceRate: decided ? accepted.length / decided : null,
    quotedMinor: sent.reduce((a, q) => a + q.totalMinor, 0),
    acceptedMinor: accepted.reduce((a, q) => a + q.totalMinor, 0),
    avgHoursToAccept: times.length ? times.reduce((a, b) => a + b, 0) / times.length / 3_600_000 : null,
  };
}
