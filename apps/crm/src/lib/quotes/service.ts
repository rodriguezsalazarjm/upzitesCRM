import { randomBytes, createHmac } from 'node:crypto';
import {
  ApprovalStatus,
  ApprovalType,
  PricingRuleSetStatus,
  QuoteStatus,
  UserRole,
} from '../../../generated/prisma/client';
import { hasCapability } from '../billing/usage';
import { prisma } from '../prisma';
import { recordAudit } from '../domain/audit';
import { calculateQuote } from './engine';
import { parseIntakeSchema, parseRules, validateIntake } from './schema';

/**
 * Ciclo de vida de una cotizacion.
 *
 * Reglas que impone el codigo, no la buena voluntad:
 *   - Sin datos completos NO se calcula.
 *   - Toda cotizacion calculada nace con una solicitud de aprobacion.
 *   - Una cotizacion aprobada NO se edita: se crea una version nueva.
 *   - Solo OWNER y ADMIN aprueban.
 */
export class QuoteError extends Error {
  constructor(
    message: string,
    readonly code: 'NOT_FOUND' | 'MISSING_DATA' | 'INVALID_RULES' | 'INVALID_STATE' | 'FORBIDDEN',
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'QuoteError';
  }
}

export function canApproveQuotes(role: UserRole) {
  return role === UserRole.OWNER || role === UserRole.ADMIN;
}

function pdfSecret() {
  const value = process.env.CRM_SESSION_SECRET;
  if (!value || value.length < 16) {
    throw new Error('CRM_SESSION_SECRET es obligatorio para firmar cotizaciones.');
  }
  return value;
}

export function generateQuoteToken() {
  return randomBytes(24).toString('base64url');
}

export function hashQuoteToken(token: string) {
  return createHmac('sha256', pdfSecret()).update(token).digest('hex');
}

/** Regla publicada de un servicio. Nunca devuelve un borrador. */
export async function getPublishedRuleSet(workspaceId: string, serviceKey: string) {
  return prisma.pricingRuleSet.findFirst({
    where: { workspaceId, serviceKey, status: PricingRuleSetStatus.PUBLISHED },
    orderBy: { version: 'desc' },
  });
}

/** Servicios cotizables del workspace, para que el agente sepa que ofrecer. */
export async function listQuotableServices(workspaceId: string) {
  const sets = await prisma.pricingRuleSet.findMany({
    where: { workspaceId, status: PricingRuleSetStatus.PUBLISHED },
    orderBy: { serviceKey: 'asc' },
  });

  return sets.map((set) => ({
    serviceKey: set.serviceKey,
    name: set.name,
    description: set.description,
    fields: parseIntakeSchema(set.intakeSchema)?.fields ?? [],
  }));
}

async function nextQuoteNumber(workspaceId: string) {
  const count = await prisma.quote.count({ where: { workspaceId } });
  return `COT-${String(count + 1).padStart(4, '0')}`;
}

export type CreateQuoteInput = {
  workspaceId: string;
  serviceKey: string;
  inputs: Record<string, unknown>;
  contactId?: string | null;
  opportunityId?: string | null;
  conversationId?: string | null;
  actorId?: string | null;
  /** Version anterior, cuando esta reemplaza a una aprobada. */
  parentQuoteId?: string | null;
};

/**
 * Calcula y guarda una cotizacion, y abre su solicitud de revision.
 *
 * Si faltan datos lanza `MISSING_DATA` con la lista de campos: el agente
 * necesita saber que preguntar, no solo que fallo.
 */
export async function createQuote(input: CreateQuoteInput) {
  // Fase 9: cotizar es una capacidad del plan, no una funcion siempre presente.
  if (!(await hasCapability(input.workspaceId, 'QUOTES'))) {
    throw new QuoteError('El plan actual no incluye el cotizador.', 'FORBIDDEN');
  }

  const ruleSet = await getPublishedRuleSet(input.workspaceId, input.serviceKey);

  if (!ruleSet) {
    throw new QuoteError(`No hay reglas publicadas para el servicio ${input.serviceKey}.`, 'NOT_FOUND');
  }

  const intake = parseIntakeSchema(ruleSet.intakeSchema);
  const rules = parseRules(ruleSet.rules);

  if (!intake || !rules) {
    throw new QuoteError('La configuracion de precios del servicio es invalida.', 'INVALID_RULES');
  }

  const validation = validateIntake(intake, input.inputs);

  if (!validation.ok) {
    throw new QuoteError('Faltan datos para poder cotizar.', 'MISSING_DATA', {
      missing: validation.missing,
      invalid: validation.invalid,
      // Se devuelven las etiquetas para que el agente pregunte en lenguaje
      // natural, no con la clave tecnica.
      fields: intake.fields
        .filter((field) => validation.missing.includes(field.key))
        .map((field) => ({ key: field.key, label: field.label, unit: field.unit, help: field.help })),
    });
  }

  const calculation = calculateQuote(rules, validation.values);
  const parent = input.parentQuoteId
    ? await prisma.quote.findFirst({
        where: { id: input.parentQuoteId, workspaceId: input.workspaceId },
        select: { id: true, number: true, version: true },
      })
    : null;

  const number = parent?.number ?? (await nextQuoteNumber(input.workspaceId));
  const version = parent ? parent.version + 1 : 1;

  const quote = await prisma.quote.create({
    data: {
      workspaceId: input.workspaceId,
      contactId: input.contactId ?? null,
      opportunityId: input.opportunityId ?? null,
      conversationId: input.conversationId ?? null,
      ruleSetId: ruleSet.id,
      serviceKey: ruleSet.serviceKey,
      number,
      version,
      parentQuoteId: parent?.id ?? null,
      inputs: validation.values as never,
      subtotal: calculation.subtotal,
      surcharges: calculation.surcharges,
      discounts: calculation.discounts,
      total: calculation.total,
      currency: ruleSet.currency,
      disclaimer: ruleSet.disclaimer,
      validUntil: new Date(Date.now() + ruleSet.validityDays * 24 * 3_600_000),
      status: QuoteStatus.CALCULATED,
      lines: {
        create: calculation.lines.map((line, position) => ({
          kind: line.kind,
          label: line.label,
          detail: line.detail,
          amount: line.amount,
          position,
        })),
      },
    },
    include: { lines: { orderBy: { position: 'asc' } } },
  });

  // Toda cotizacion nace pidiendo revision: la spec la hace obligatoria.
  await requestReview({
    workspaceId: input.workspaceId,
    quoteId: quote.id,
    requestedById: input.actorId,
  });

  await recordAudit({
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    action: 'quote.created',
    entity: 'Quote',
    entityId: quote.id,
    metadata: { number, version, total: quote.total, serviceKey: ruleSet.serviceKey },
  });

  return quote;
}

/** Abre (o reutiliza) la solicitud de revision de una cotizacion. */
export async function requestReview(input: {
  workspaceId: string;
  quoteId: string;
  requestedById?: string | null;
  note?: string;
}) {
  await prisma.quote.updateMany({
    where: { id: input.quoteId, workspaceId: input.workspaceId, status: QuoteStatus.CALCULATED },
    data: { status: QuoteStatus.PENDING_HUMAN_REVIEW },
  });

  const existing = await prisma.approvalRequest.findFirst({
    where: {
      workspaceId: input.workspaceId,
      resourceType: 'Quote',
      resourceId: input.quoteId,
      status: ApprovalStatus.PENDING,
    },
  });

  if (existing) return existing;

  return prisma.approvalRequest.create({
    data: {
      workspaceId: input.workspaceId,
      resourceType: 'Quote',
      resourceId: input.quoteId,
      type: ApprovalType.QUOTE_REVIEW,
      requestedById: input.requestedById ?? null,
      requestedNote: input.note,
      dueAt: new Date(Date.now() + 24 * 3_600_000),
    },
  });
}

export type ReviewInput = {
  workspaceId: string;
  quoteId: string;
  reviewer: { id: string; role: UserRole };
  comment?: string;
};

/**
 * Aprueba una cotizacion y genera el token de su PDF publico.
 *
 * Solo owner o admin. Una cotizacion ya aprobada no se vuelve a aprobar: si hay
 * que cambiarla, se crea una version nueva.
 */
export async function approveQuote(input: ReviewInput) {
  if (!canApproveQuotes(input.reviewer.role)) {
    throw new QuoteError('Solo el owner o un admin puede aprobar cotizaciones.', 'FORBIDDEN');
  }

  const quote = await prisma.quote.findFirst({
    where: { id: input.quoteId, workspaceId: input.workspaceId },
    select: { id: true, status: true, number: true, version: true },
  });

  if (!quote) throw new QuoteError('Cotizacion no encontrada.', 'NOT_FOUND');

  if (quote.status !== QuoteStatus.PENDING_HUMAN_REVIEW && quote.status !== QuoteStatus.CALCULATED) {
    throw new QuoteError(
      `Una cotizacion en estado ${quote.status} no se puede aprobar. Crea una version nueva.`,
      'INVALID_STATE',
    );
  }

  const token = generateQuoteToken();

  await prisma.$transaction([
    prisma.quote.update({
      where: { id: quote.id },
      data: {
        status: QuoteStatus.APPROVED,
        reviewerId: input.reviewer.id,
        reviewedAt: new Date(),
        reviewNote: input.comment,
        pdfTokenHash: hashQuoteToken(token),
      },
    }),
    prisma.approvalRequest.updateMany({
      where: {
        workspaceId: input.workspaceId,
        resourceType: 'Quote',
        resourceId: quote.id,
        status: ApprovalStatus.PENDING,
      },
      data: {
        status: ApprovalStatus.APPROVED,
        approverId: input.reviewer.id,
        comment: input.comment,
        resolvedAt: new Date(),
      },
    }),
  ]);

  await recordAudit({
    workspaceId: input.workspaceId,
    actorId: input.reviewer.id,
    action: 'quote.approved',
    entity: 'Quote',
    entityId: quote.id,
    metadata: { number: quote.number, version: quote.version },
  });

  return { token };
}

export async function rejectQuote(input: ReviewInput & { changesRequested?: boolean }) {
  if (!canApproveQuotes(input.reviewer.role)) {
    throw new QuoteError('Solo el owner o un admin puede revisar cotizaciones.', 'FORBIDDEN');
  }

  const quote = await prisma.quote.findFirst({
    where: { id: input.quoteId, workspaceId: input.workspaceId },
    select: { id: true, status: true },
  });

  if (!quote) throw new QuoteError('Cotizacion no encontrada.', 'NOT_FOUND');
  if (quote.status === QuoteStatus.APPROVED || quote.status === QuoteStatus.ACCEPTED) {
    throw new QuoteError('Una cotizacion aprobada no se rechaza: crea una version nueva.', 'INVALID_STATE');
  }

  await prisma.$transaction([
    prisma.quote.update({
      where: { id: quote.id },
      data: {
        status: QuoteStatus.REJECTED,
        reviewerId: input.reviewer.id,
        reviewedAt: new Date(),
        reviewNote: input.comment,
        rejectedAt: new Date(),
      },
    }),
    prisma.approvalRequest.updateMany({
      where: {
        workspaceId: input.workspaceId,
        resourceType: 'Quote',
        resourceId: quote.id,
        status: ApprovalStatus.PENDING,
      },
      data: {
        status: input.changesRequested ? ApprovalStatus.CHANGES_REQUESTED : ApprovalStatus.REJECTED,
        approverId: input.reviewer.id,
        comment: input.comment,
        resolvedAt: new Date(),
      },
    }),
  ]);

  await recordAudit({
    workspaceId: input.workspaceId,
    actorId: input.reviewer.id,
    action: 'quote.rejected',
    entity: 'Quote',
    entityId: quote.id,
    metadata: { changesRequested: Boolean(input.changesRequested) },
  });

  return { rejected: true };
}

/** Marca la cotizacion como enviada. Solo se envia lo aprobado. */
export async function markQuoteSent(input: { workspaceId: string; quoteId: string; actorId?: string }) {
  const updated = await prisma.quote.updateMany({
    where: { id: input.quoteId, workspaceId: input.workspaceId, status: QuoteStatus.APPROVED },
    data: { status: QuoteStatus.SENT, sentAt: new Date() },
  });

  if (updated.count === 0) {
    throw new QuoteError('Solo se puede enviar una cotizacion aprobada.', 'INVALID_STATE');
  }

  await recordAudit({
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    action: 'quote.sent',
    entity: 'Quote',
    entityId: input.quoteId,
  });

  return { sent: true };
}

export async function acceptQuote(input: { workspaceId: string; quoteId: string; actorId?: string }) {
  const quote = await prisma.quote.findFirst({
    where: { id: input.quoteId, workspaceId: input.workspaceId },
    select: { id: true, status: true, total: true, contactId: true, opportunityId: true },
  });

  if (!quote) throw new QuoteError('Cotizacion no encontrada.', 'NOT_FOUND');

  if (quote.status !== QuoteStatus.SENT && quote.status !== QuoteStatus.APPROVED) {
    throw new QuoteError('Solo se acepta una cotizacion enviada.', 'INVALID_STATE');
  }

  await prisma.quote.update({
    where: { id: quote.id },
    data: { status: QuoteStatus.ACCEPTED, acceptedAt: new Date() },
  });

  // Aceptar mueve la oportunidad, pero NO convierte en cliente: eso requiere
  // pago aprobado o confirmacion humana (regla de la Fase 1).
  if (quote.opportunityId) {
    await prisma.opportunity.updateMany({
      where: { id: quote.opportunityId, workspaceId: input.workspaceId },
      data: { value: quote.total },
    });
  }

  await recordAudit({
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    action: 'quote.accepted',
    entity: 'Quote',
    entityId: quote.id,
    metadata: { total: quote.total },
  });

  return { accepted: true };
}

/** Cola de revision: lo que espera decision humana. */
export async function pendingApprovals(workspaceId: string) {
  const requests = await prisma.approvalRequest.findMany({
    where: { workspaceId, status: ApprovalStatus.PENDING },
    orderBy: { createdAt: 'asc' },
    take: 100,
  });

  const quoteIds = requests.filter((r) => r.resourceType === 'Quote').map((r) => r.resourceId);

  const quotes = await prisma.quote.findMany({
    where: { id: { in: quoteIds }, workspaceId },
    include: {
      lines: { orderBy: { position: 'asc' } },
      contact: { select: { firstName: true, lastName: true, phone: true } },
      parent: { select: { total: true, version: true } },
    },
  });

  const byId = new Map(quotes.map((quote) => [quote.id, quote]));

  return requests
    .map((request) => ({ request, quote: byId.get(request.resourceId) ?? null }))
    .filter((row) => row.quote !== null);
}

/** Resuelve el PDF publico por token. */
export async function resolveQuoteByToken(token: string) {
  return prisma.quote.findUnique({
    where: { pdfTokenHash: hashQuoteToken(token) },
    include: {
      lines: { orderBy: { position: 'asc' } },
      workspace: { select: { name: true } },
      contact: { select: { firstName: true, lastName: true } },
    },
  });
}
