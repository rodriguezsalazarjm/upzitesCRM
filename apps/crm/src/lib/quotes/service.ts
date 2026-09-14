import { randomBytes, createHmac } from 'node:crypto';
import {
  ApprovalStatus,
  ApprovalType,
  PricingRuleSetStatus,
  Prisma,
  QuoteStatus,
  type UserRole,
} from '../../../generated/prisma/client';
import { hasCapability } from '../billing/usage';
import { prisma } from '../prisma';
import { recordAudit } from '../domain/audit';
import { calculateQuote } from './engine';
import { parseIntakeSchema, parseRules, validateIntake } from './schema';
import { canApproveQuotes } from './roles';
import { queuePushSafely } from '../push/events';

export { canApproveQuotes } from './roles';

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

async function nextQuoteNumber(db: Prisma.TransactionClient, workspaceId: string) {
  const count = await db.quote.count({ where: { workspaceId } });
  return `COT-${String(count + 1).padStart(4, '0')}`;
}

async function lockWorkspaceForQuote(db: Prisma.TransactionClient, workspaceId: string) {
  const rows = await db.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "workspaces" WHERE "id" = ${workspaceId} FOR UPDATE
  `;
  if (rows.length === 0) throw new QuoteError('Workspace no encontrado.', 'NOT_FOUND');
}

async function validateQuoteLinks(db: Prisma.TransactionClient, input: CreateQuoteInput) {
  const [contact, opportunity, conversation] = await Promise.all([
    input.contactId
      ? db.contact.findFirst({
          where: { id: input.contactId, workspaceId: input.workspaceId },
          select: { id: true },
        })
      : null,
    input.opportunityId
      ? db.opportunity.findFirst({
          where: { id: input.opportunityId, workspaceId: input.workspaceId },
          select: { id: true, contactId: true },
        })
      : null,
    input.conversationId
      ? db.conversation.findFirst({
          where: { id: input.conversationId, workspaceId: input.workspaceId },
          select: { id: true, contactId: true },
        })
      : null,
  ]);

  if (input.contactId && !contact) throw new QuoteError('Contacto no encontrado.', 'NOT_FOUND');
  if (input.opportunityId && !opportunity)
    throw new QuoteError('Oportunidad no encontrada.', 'NOT_FOUND');
  if (input.conversationId && !conversation)
    throw new QuoteError('Conversación no encontrada.', 'NOT_FOUND');

  const linkedContactIds = [
    input.contactId,
    opportunity?.contactId,
    conversation?.contactId,
  ].filter((id): id is string => Boolean(id));
  if (new Set(linkedContactIds).size > 1) {
    throw new QuoteError(
      'El contacto, la oportunidad y la conversación deben corresponder a la misma persona.',
      'INVALID_STATE',
    );
  }
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
    throw new QuoteError(
      `No hay reglas publicadas para el servicio ${input.serviceKey}.`,
      'NOT_FOUND',
    );
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
        .map((field) => ({
          key: field.key,
          label: field.label,
          unit: field.unit,
          help: field.help,
        })),
    });
  }

  const calculation = calculateQuote(rules, validation.values);

  const quote = await prisma.$transaction(async (tx) => {
    // Serializa numeración y revisiones solo dentro de este workspace.
    await lockWorkspaceForQuote(tx, input.workspaceId);
    await validateQuoteLinks(tx, input);

    const parent = input.parentQuoteId
      ? await tx.quote.findFirst({
          where: { id: input.parentQuoteId, workspaceId: input.workspaceId },
          select: { id: true, number: true, version: true, serviceKey: true },
        })
      : null;
    if (input.parentQuoteId && !parent) {
      throw new QuoteError('Cotización anterior no encontrada.', 'NOT_FOUND');
    }
    if (parent && parent.serviceKey !== ruleSet.serviceKey) {
      throw new QuoteError(
        'La nueva versión debe usar el mismo servicio que la cotización anterior.',
        'INVALID_STATE',
      );
    }
    if (parent) {
      const latest = await tx.quote.findFirst({
        where: { workspaceId: input.workspaceId, number: parent.number },
        orderBy: { version: 'desc' },
        select: { id: true },
      });
      if (latest?.id !== parent.id) {
        throw new QuoteError(
          'Ya existe una versión posterior de esta cotización.',
          'INVALID_STATE',
        );
      }
    }

    const number = parent?.number ?? (await nextQuoteNumber(tx, input.workspaceId));
    const version = parent ? parent.version + 1 : 1;
    const quote = await tx.quote.create({
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

    await requestReview(
      {
        workspaceId: input.workspaceId,
        quoteId: quote.id,
        requestedById: input.actorId,
      },
      tx,
    );
    await recordAudit(
      {
        workspaceId: input.workspaceId,
        actorId: input.actorId,
        action: 'quote.created',
        entity: 'Quote',
        entityId: quote.id,
        metadata: { number, version, total: quote.total, serviceKey: ruleSet.serviceKey },
      },
      tx,
    );
    return quote;
  });

  await queuePushSafely({
    workspaceId: input.workspaceId,
    kind: 'QUOTE_APPROVAL',
    dedupeKey: `quote-review:${quote.id}`,
    quoteId: quote.id,
  });
  return quote;
}

/** Abre (o reutiliza) la solicitud de revision de una cotizacion. */
export async function requestReview(
  input: {
    workspaceId: string;
    quoteId: string;
    requestedById?: string | null;
    note?: string;
  },
  db: Prisma.TransactionClient | typeof prisma = prisma,
) {
  await db.quote.updateMany({
    where: { id: input.quoteId, workspaceId: input.workspaceId, status: QuoteStatus.CALCULATED },
    data: { status: QuoteStatus.PENDING_HUMAN_REVIEW },
  });

  const existing = await db.approvalRequest.findFirst({
    where: {
      workspaceId: input.workspaceId,
      resourceType: 'Quote',
      resourceId: input.quoteId,
      status: ApprovalStatus.PENDING,
    },
  });

  if (existing) return existing;

  return db.approvalRequest.create({
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

  if (
    quote.status !== QuoteStatus.PENDING_HUMAN_REVIEW &&
    quote.status !== QuoteStatus.CALCULATED
  ) {
    throw new QuoteError(
      `Una cotizacion en estado ${quote.status} no se puede aprobar. Crea una version nueva.`,
      'INVALID_STATE',
    );
  }

  const token = generateQuoteToken();

  await prisma.$transaction(async (tx) => {
    const updated = await tx.quote.updateMany({
      where: {
        id: quote.id,
        workspaceId: input.workspaceId,
        status: { in: [QuoteStatus.PENDING_HUMAN_REVIEW, QuoteStatus.CALCULATED] },
      },
      data: {
        status: QuoteStatus.APPROVED,
        reviewerId: input.reviewer.id,
        reviewedAt: new Date(),
        reviewNote: input.comment,
        pdfTokenHash: hashQuoteToken(token),
      },
    });
    if (updated.count === 0) {
      throw new QuoteError(
        'La cotización ya fue resuelta por otra persona. Recarga para ver su estado.',
        'INVALID_STATE',
      );
    }
    await tx.approvalRequest.updateMany({
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
    });
    await recordAudit(
      {
        workspaceId: input.workspaceId,
        actorId: input.reviewer.id,
        action: 'quote.approved',
        entity: 'Quote',
        entityId: quote.id,
        metadata: { number: quote.number, version: quote.version },
      },
      tx,
    );
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
  if (
    quote.status !== QuoteStatus.PENDING_HUMAN_REVIEW &&
    quote.status !== QuoteStatus.CALCULATED
  ) {
    throw new QuoteError('Esta cotización ya no está pendiente de revisión.', 'INVALID_STATE');
  }

  await prisma.$transaction(async (tx) => {
    const updated = await tx.quote.updateMany({
      where: {
        id: quote.id,
        workspaceId: input.workspaceId,
        status: { in: [QuoteStatus.PENDING_HUMAN_REVIEW, QuoteStatus.CALCULATED] },
      },
      data: {
        status: QuoteStatus.REJECTED,
        reviewerId: input.reviewer.id,
        reviewedAt: new Date(),
        reviewNote: input.comment,
        rejectedAt: new Date(),
      },
    });
    if (updated.count === 0) {
      throw new QuoteError(
        'La cotización ya fue resuelta por otra persona. Recarga para ver su estado.',
        'INVALID_STATE',
      );
    }
    await tx.approvalRequest.updateMany({
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
    });
    await recordAudit(
      {
        workspaceId: input.workspaceId,
        actorId: input.reviewer.id,
        action: 'quote.rejected',
        entity: 'Quote',
        entityId: quote.id,
        metadata: { changesRequested: Boolean(input.changesRequested) },
      },
      tx,
    );
  });

  return { rejected: true };
}

/** Marca la cotizacion como enviada. Solo se envia lo aprobado. */
export async function markQuoteSent(input: {
  workspaceId: string;
  quoteId: string;
  actorId?: string;
}) {
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

export async function acceptQuote(input: {
  workspaceId: string;
  quoteId: string;
  actorId?: string;
}) {
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
