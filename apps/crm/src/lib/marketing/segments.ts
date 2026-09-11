import { z } from 'zod';
import {
  BuyingIntent,
  ConsentChannel,
  ConsentStatus,
  LeadTemperature,
  LifecycleStatus,
  OrderStatus,
  QuoteStatus,
  type Prisma,
} from '../../../generated/prisma/client';
import { normalizeIdentifier } from '../domain/consent';
import { prisma } from '../prisma';
import type { Db } from '../domain/audit';

/**
 * Segmentos: un filtro declarativo sobre dimensiones genericas del CRM.
 *
 * Ningun campo del lenguaje nombra un rubro. Se filtra por temperatura, ciclo
 * de vida, consentimiento, compras y silencio —cosas que existen en cualquier
 * negocio—, de modo que los segmentos de fabrica sirven igual a un infoproducto
 * y a un negocio de servicios. Es la restriccion multivertical aplicada aqui.
 *
 * Un segmento nunca se materializa. Lo que se guarda es la definicion; el
 * recuento es informativo y toda campana reevalua en el momento del envio, para
 * que nadie reciba algo por haber quedado en una lista vieja.
 */

const channelEnum = z.nativeEnum(ConsentChannel);

export const segmentFilterSchema = z.discriminatedUnion('field', [
  z.object({
    field: z.literal('lifecycleStatus'),
    operator: z.enum(['in', 'not_in']),
    value: z.array(z.nativeEnum(LifecycleStatus)).min(1),
  }),
  z.object({
    field: z.literal('temperature'),
    operator: z.enum(['in', 'not_in']),
    value: z.array(z.nativeEnum(LeadTemperature)).min(1),
  }),
  z.object({
    field: z.literal('buyingIntent'),
    operator: z.enum(['in', 'not_in']),
    value: z.array(z.nativeEnum(BuyingIntent)).min(1),
  }),
  z.object({
    field: z.literal('leadScore'),
    operator: z.enum(['gte', 'lte']),
    value: z.number().int().min(0).max(100),
  }),
  z.object({
    field: z.literal('tags'),
    operator: z.enum(['has', 'not_has']),
    value: z.string().min(1),
  }),
  z.object({
    field: z.literal('source'),
    operator: z.enum(['in', 'not_in']),
    value: z.array(z.string().min(1)).min(1),
  }),
  /** Dias sin actividad. `gte 7` = lleva al menos siete dias en silencio. */
  z.object({
    field: z.literal('inactiveDays'),
    operator: z.enum(['gte', 'lte']),
    value: z.number().int().min(0).max(3650),
  }),
  z.object({
    field: z.literal('createdDaysAgo'),
    operator: z.enum(['gte', 'lte']),
    value: z.number().int().min(0).max(3650),
  }),
  /** Tiene consentimiento GRANTED en al menos uno de estos canales. */
  z.object({
    field: z.literal('hasConsent'),
    operator: z.enum(['in', 'not_in']),
    value: z.array(channelEnum).min(1),
  }),
  z.object({
    field: z.literal('hasEmail'),
    operator: z.literal('eq'),
    value: z.boolean(),
  }),
  z.object({
    field: z.literal('hasPhone'),
    operator: z.literal('eq'),
    value: z.boolean(),
  }),
  z.object({
    field: z.literal('hasPendingQuote'),
    operator: z.literal('eq'),
    value: z.boolean(),
  }),
  z.object({
    field: z.literal('hasAbandonedCheckout'),
    operator: z.literal('eq'),
    value: z.boolean(),
  }),
  z.object({
    field: z.literal('hasPaidOrder'),
    operator: z.literal('eq'),
    value: z.boolean(),
  }),
  z.object({
    field: z.literal('boughtProduct'),
    operator: z.literal('eq'),
    value: z.string().min(1),
  }),
  /** Dias desde la ultima compra confirmada. Base de "sin recompra en X dias". */
  z.object({
    field: z.literal('daysSinceLastPurchase'),
    operator: z.enum(['gte', 'lte']),
    value: z.number().int().min(0).max(3650),
  }),
  /**
   * Solo tiene sentido en segmentos de consulta. Se resuelve fuera de la
   * consulta SQL porque la supresion vive por identidad, no por contacto.
   */
  z.object({
    field: z.literal('isSuppressed'),
    operator: z.literal('eq'),
    value: z.boolean(),
  }),
]);

export type SegmentFilter = z.infer<typeof segmentFilterSchema>;

export const segmentDefinitionSchema = z.object({
  match: z.enum(['ALL', 'ANY']).default('ALL'),
  filters: z.array(segmentFilterSchema).min(1).max(20),
  /**
   * Marca el segmento como de solo consulta. La lista de suprimidos existe para
   * mirarse, nunca para enviarle nada: `resolveForSending` la rechaza.
   */
  queryOnly: z.boolean().default(false),
});

export type SegmentDefinition = z.infer<typeof segmentDefinitionSchema>;

export function parseDefinition(raw: unknown) {
  const parsed = segmentDefinitionSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

// --- Compilacion a consulta --------------------------------------------------

const PAID_ORDER_STATUSES: OrderStatus[] = [
  OrderStatus.CONFIRMED,
  OrderStatus.PROCESSING,
  OrderStatus.FULFILLED,
];

const OPEN_QUOTE_STATUSES: QuoteStatus[] = [
  QuoteStatus.PENDING_HUMAN_REVIEW,
  QuoteStatus.APPROVED,
  QuoteStatus.SENT,
];

const DAY_MS = 24 * 3_600_000;

/**
 * Traduce un filtro a una condicion de Prisma.
 *
 * `isSuppressed` devuelve null: no se puede expresar en SQL sobre contacts
 * porque la supresion se guarda por identidad normalizada, no por id. Se
 * resuelve despues, en `applySuppression`.
 */
function whereFor(filter: SegmentFilter, now: Date): Prisma.ContactWhereInput | null {
  switch (filter.field) {
    case 'lifecycleStatus':
      return filter.operator === 'in'
        ? { lifecycleStatus: { in: filter.value } }
        : { lifecycleStatus: { notIn: filter.value } };

    case 'temperature':
      return filter.operator === 'in'
        ? { temperature: { in: filter.value } }
        : { temperature: { notIn: filter.value } };

    case 'buyingIntent':
      return filter.operator === 'in'
        ? { buyingIntent: { in: filter.value } }
        : { buyingIntent: { notIn: filter.value } };

    case 'leadScore':
      return { leadScore: filter.operator === 'gte' ? { gte: filter.value } : { lte: filter.value } };

    case 'tags':
      return filter.operator === 'has'
        ? { tags: { has: filter.value } }
        : { NOT: { tags: { has: filter.value } } };

    case 'source':
      return filter.operator === 'in'
        ? { source: { in: filter.value } }
        : { OR: [{ source: null }, { source: { notIn: filter.value } }] };

    case 'inactiveDays': {
      const threshold = new Date(now.getTime() - filter.value * DAY_MS);
      // Sin actividad registrada cuenta como silencio maximo.
      return filter.operator === 'gte'
        ? { OR: [{ lastActivityAt: null }, { lastActivityAt: { lte: threshold } }] }
        : { lastActivityAt: { gt: threshold } };
    }

    case 'createdDaysAgo': {
      const threshold = new Date(now.getTime() - filter.value * DAY_MS);
      return { createdAt: filter.operator === 'gte' ? { lte: threshold } : { gt: threshold } };
    }

    case 'hasConsent': {
      const some = {
        channel: { in: filter.value },
        status: ConsentStatus.GRANTED,
      } satisfies Prisma.ContactChannelConsentWhereInput;
      return filter.operator === 'in' ? { consents: { some } } : { consents: { none: some } };
    }

    case 'hasEmail':
      return filter.value ? { email: { not: null } } : { email: null };

    case 'hasPhone':
      return filter.value ? { phone: { not: null } } : { phone: null };

    case 'hasPendingQuote': {
      const some = { status: { in: OPEN_QUOTE_STATUSES } } satisfies Prisma.QuoteWhereInput;
      return filter.value ? { quotes: { some } } : { quotes: { none: some } };
    }

    case 'hasAbandonedCheckout': {
      // Checkout abierto que nunca llego a pagarse. El contacto se considera
      // abandonado solo si NO tiene ademas una orden pagada equivalente.
      const some = {
        status: { in: [OrderStatus.DRAFT, OrderStatus.PENDING_PAYMENT] },
      } satisfies Prisma.CustomerOrderWhereInput;
      return filter.value
        ? { orders: { some }, buyingIntent: BuyingIntent.CHECKOUT_STARTED }
        : { orders: { none: some } };
    }

    case 'hasPaidOrder': {
      const some = { status: { in: PAID_ORDER_STATUSES } } satisfies Prisma.CustomerOrderWhereInput;
      return filter.value ? { orders: { some } } : { orders: { none: some } };
    }

    case 'boughtProduct':
      return {
        orders: {
          some: {
            status: { in: PAID_ORDER_STATUSES },
            lines: { some: { variant: { productId: filter.value } } },
          },
        },
      };

    case 'daysSinceLastPurchase': {
      const threshold = new Date(now.getTime() - filter.value * DAY_MS);
      const paid = { status: { in: PAID_ORDER_STATUSES } };
      // "Al menos X dias sin comprar" = compro alguna vez antes del umbral y
      // ninguna despues. Prisma no expresa max(fecha), pero some+none si.
      return filter.operator === 'gte'
        ? {
            orders: {
              some: { ...paid, createdAt: { lte: threshold } },
              none: { ...paid, createdAt: { gt: threshold } },
            },
          }
        : { orders: { some: { ...paid, createdAt: { gt: threshold } } } };
    }

    case 'isSuppressed':
      return null;

    default:
      return null;
  }
}

export function buildWhere(
  definition: SegmentDefinition,
  workspaceId: string,
  now = new Date(),
): Prisma.ContactWhereInput {
  const clauses = definition.filters
    .map((filter) => whereFor(filter, now))
    .filter((clause): clause is Prisma.ContactWhereInput => clause !== null);

  if (clauses.length === 0) return { workspaceId };

  return definition.match === 'ANY'
    ? { workspaceId, OR: clauses }
    : { workspaceId, AND: clauses };
}

// --- Resolucion --------------------------------------------------------------

export type ResolvedContact = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
};

export type ResolveOptions = {
  workspaceId: string;
  definition: SegmentDefinition;
  /**
   * Canal del envio. Determina que identidades suprimidas se excluyen y que
   * contactos quedan fuera por no tener direccion en ese canal.
   */
  channel?: ConsentChannel;
  limit?: number;
  now?: Date;
};

/**
 * Identidades suprimidas del workspace en un canal, ya normalizadas.
 *
 * Se traen todas de una vez en lugar de consultar por contacto: la lista de
 * supresion de un workspace es chica comparada con su base de contactos, y asi
 * el filtro es una operacion en memoria en vez de N consultas.
 */
async function suppressedIdentifiers(workspaceId: string, channel: ConsentChannel, db: Db = prisma) {
  const rows = await db.suppressionEntry.findMany({
    where: { workspaceId, channel },
    select: { identifier: true },
  });
  return new Set(rows.map((row) => row.identifier));
}

function identifierOf(channel: ConsentChannel, contact: ResolvedContact) {
  const raw = channel === ConsentChannel.EMAIL ? contact.email : contact.phone;
  return raw ? normalizeIdentifier(channel, raw) : null;
}

/**
 * Resuelve el segmento excluyendo siempre a los suprimidos del canal.
 *
 * La exclusion vive aca y no en cada llamador a proposito: quien construya una
 * campana o un journey nuevo no tiene que acordarse de filtrar. Olvidarlo seria
 * exactamente el error que la fase busca hacer imposible.
 */
export async function resolveSegment(options: ResolveOptions): Promise<ResolvedContact[]> {
  const now = options.now ?? new Date();
  const channel = options.channel ?? ConsentChannel.EMAIL;
  const where = buildWhere(options.definition, options.workspaceId, now);

  const contacts = await prisma.contact.findMany({
    where,
    select: { id: true, firstName: true, lastName: true, email: true, phone: true },
    orderBy: { createdAt: 'asc' },
    take: options.limit ?? 5000,
  });

  const suppressed = await suppressedIdentifiers(options.workspaceId, channel);
  const wantsSuppressed = options.definition.filters.some(
    (filter) => filter.field === 'isSuppressed' && filter.value === true,
  );

  return contacts.filter((contact) => {
    const identifier = identifierOf(channel, contact);
    if (!identifier) return false;
    const isSuppressed = suppressed.has(identifier);
    return wantsSuppressed ? isSuppressed : !isSuppressed;
  });
}

export class SegmentError extends Error {
  constructor(message: string, readonly code: 'QUERY_ONLY' | 'NOT_FOUND' | 'INVALID') {
    super(message);
    this.name = 'SegmentError';
  }
}

/**
 * Igual que `resolveSegment`, pero rechaza los segmentos de solo consulta.
 * Es lo que usan campanas y journeys.
 */
export async function resolveForSending(options: ResolveOptions): Promise<ResolvedContact[]> {
  if (options.definition.queryOnly) {
    throw new SegmentError('Este segmento es de solo consulta: no se le puede enviar.', 'QUERY_ONLY');
  }

  return resolveSegment(options);
}

export async function countSegment(options: ResolveOptions) {
  const contacts = await resolveSegment(options);
  return contacts.length;
}

/** Recalcula y guarda el recuento estimado. Es informativo, no operativo. */
export async function refreshSegmentCount(workspaceId: string, segmentId: string) {
  const segment = await prisma.segment.findFirst({ where: { id: segmentId, workspaceId } });
  if (!segment) return null;

  const definition = parseDefinition(segment.definition);
  if (!definition) return null;

  const count = await countSegment({ workspaceId, definition });

  await prisma.segment.update({
    where: { id: segment.id },
    data: { estimatedCount: count, lastEvaluatedAt: new Date() },
  });

  return count;
}

// --- Segmentos de fabrica ----------------------------------------------------

/**
 * Los ocho segmentos que pide la spec (seccion 10).
 *
 * Estan expresados con el mismo lenguaje que un segmento propio del cliente:
 * no hay codigo privilegiado detras de un preset. Eso significa que el cliente
 * puede duplicar cualquiera y ajustarlo.
 */
export const PRESET_SEGMENTS: {
  key: string;
  name: string;
  description: string;
  definition: SegmentDefinition;
}[] = [
  {
    key: 'leads-calientes-sin-compra',
    name: 'Leads calientes sin compra',
    description: 'Temperatura HOT y todavia sin ninguna orden pagada.',
    definition: {
      match: 'ALL',
      queryOnly: false,
      filters: [
        { field: 'temperature', operator: 'in', value: [LeadTemperature.HOT] },
        { field: 'hasPaidOrder', operator: 'eq', value: false },
      ],
    },
  },
  {
    key: 'leads-frios-con-consentimiento',
    name: 'Leads frios con consentimiento',
    description: 'Temperatura COLD que si autorizaron ser contactados.',
    definition: {
      match: 'ALL',
      queryOnly: false,
      filters: [
        { field: 'temperature', operator: 'in', value: [LeadTemperature.COLD] },
        {
          field: 'hasConsent',
          operator: 'in',
          value: [ConsentChannel.WHATSAPP, ConsentChannel.EMAIL],
        },
      ],
    },
  },
  {
    key: 'cotizaciones-pendientes',
    name: 'Cotizaciones pendientes',
    description: 'Tienen una cotizacion en revision, aprobada o enviada sin respuesta.',
    definition: {
      match: 'ALL',
      queryOnly: false,
      filters: [{ field: 'hasPendingQuote', operator: 'eq', value: true }],
    },
  },
  {
    key: 'checkouts-abandonados',
    name: 'Checkouts abandonados',
    description: 'Abrieron un checkout que nunca se pago.',
    definition: {
      match: 'ALL',
      queryOnly: false,
      filters: [{ field: 'hasAbandonedCheckout', operator: 'eq', value: true }],
    },
  },
  {
    key: 'compradores',
    name: 'Compradores',
    description:
      'Al menos una orden pagada. Para "compradores de un producto" se agrega un filtro boughtProduct.',
    definition: {
      match: 'ALL',
      queryOnly: false,
      filters: [{ field: 'hasPaidOrder', operator: 'eq', value: true }],
    },
  },
  {
    key: 'clientes-sin-recompra',
    name: 'Clientes sin recompra en 90 dias',
    description: 'Compraron alguna vez y llevan 90 dias sin volver.',
    definition: {
      match: 'ALL',
      queryOnly: false,
      filters: [
        {
          field: 'lifecycleStatus',
          operator: 'in',
          value: [LifecycleStatus.CUSTOMER, LifecycleStatus.REPEAT_CUSTOMER],
        },
        { field: 'daysSinceLastPurchase', operator: 'gte', value: 90 },
      ],
    },
  },
  {
    key: 'perdidos-por-precio',
    name: 'Perdidos por precio',
    description:
      'Marcados como perdidos con la etiqueta "perdido-precio". La etiqueta la pone el agente o una automatizacion.',
    definition: {
      match: 'ALL',
      queryOnly: false,
      filters: [
        { field: 'lifecycleStatus', operator: 'in', value: [LifecycleStatus.LOST] },
        { field: 'tags', operator: 'has', value: 'perdido-precio' },
      ],
    },
  },
  {
    key: 'suprimidos',
    name: 'Contactos suprimidos',
    description: 'Solo consulta: pidieron no ser contactados o su direccion reboto.',
    definition: {
      match: 'ALL',
      queryOnly: true,
      filters: [{ field: 'isSuppressed', operator: 'eq', value: true }],
    },
  },
];
