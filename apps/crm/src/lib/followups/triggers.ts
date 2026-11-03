import {
  Channel,
  ConversationStatus,
  JourneyStatus,
  JourneyTrigger,
  MessageDirection,
  OpportunityStatus,
  OrderStatus,
  type Prisma,
} from '../../../generated/prisma/client';
import { enroll } from '../marketing/journeys';
import { crossTenantPrisma, prisma } from '../prisma';
import { PURCHASED } from './stop';

/**
 * Disparadores comerciales del Punto 7 (los ganchos de detencion estan en
 * `stop.ts`).
 *
 * Reglas comunes a todo disparador:
 *  - Solo cuentan hechos POSTERIORES a la publicacion de la estrategia:
 *    publicarla no le escribe a toda la base historica.
 *  - El hecho tiene que llevar un rato quieto (`SETTLE_MS`): una conversacion
 *    en curso no es un "no respondio".
 *  - Si la estrategia tiene producto, el hecho tiene que ser de ese producto.
 *  - El hecho queda guardado en `triggeredAt`, que es desde donde se cuenta la
 *    espera del primer paso.
 */

export const SETTLE_MS = 30 * 60_000;

const UNPAID: OrderStatus[] = [OrderStatus.DRAFT, OrderStatus.PENDING_PAYMENT];

/** Disparadores que resuelve este modulo (el resto sigue en el barrido de segmentos). */
export function isFollowUpScanned(trigger: JourneyTrigger, productId: string | null) {
  if (trigger === JourneyTrigger.NO_REPLY || trigger === JourneyTrigger.INQUIRY_NO_PURCHASE || trigger === JourneyTrigger.OPPORTUNITY_STALLED) return true;
  return trigger === JourneyTrigger.CHECKOUT_ABANDONED && Boolean(productId);
}

type Candidate = {
  contactId: string;
  triggeredAt: Date;
  conversationId?: string | null;
  opportunityId?: string | null;
  orderId?: string | null;
};

type ScanJourney = { id: string; workspaceId: string; trigger: JourneyTrigger; productId: string | null; publishedAt: Date };

function productLines(productId: string): Prisma.CustomerOrderWhereInput {
  return { lines: { some: { variant: { productId } } } };
}

async function candidatesFor(journey: ScanJourney, now: Date, limit: number): Promise<Candidate[]> {
  const settled = new Date(now.getTime() - SETTLE_MS);
  const notEnrolled = { journeyEnrollments: { none: { journeyId: journey.id } } };

  if (journey.trigger === JourneyTrigger.NO_REPLY || journey.trigger === JourneyTrigger.INQUIRY_NO_PURCHASE) {
    const noReply = journey.trigger === JourneyTrigger.NO_REPLY;
    const conversations = await prisma.conversation.findMany({
      where: {
        workspaceId: journey.workspaceId,
        status: { not: ConversationStatus.CLOSED },
        channelType: { in: [Channel.WHATSAPP, Channel.INSTAGRAM] },
        lastMessageAt: { lte: settled },
        ...(journey.productId ? { productId: journey.productId } : {}),
        ...(noReply
          ? { lastOutboundAt: { gte: journey.publishedAt, lte: settled } }
          : { lastInboundAt: { gte: journey.publishedAt, lte: settled } }),
        contact: notEnrolled,
      },
      orderBy: { lastMessageAt: 'asc' },
      take: limit * 2,
      select: { id: true, contactId: true, lastInboundAt: true, lastOutboundAt: true },
    });

    const out: Candidate[] = [];
    for (const conversation of conversations) {
      if (noReply) {
        // Le escribimos despues de su ultimo mensaje y no contesto.
        if (!conversation.lastOutboundAt) continue;
        if (conversation.lastInboundAt && conversation.lastInboundAt >= conversation.lastOutboundAt) continue;
        // Si lo ultimo que salio fue un seguimiento, no es un hecho nuevo: no
        // dispara otra secuencia sobre la anterior.
        const lastOutbound = await prisma.message.findFirst({
          where: { conversationId: conversation.id, workspaceId: journey.workspaceId, direction: MessageDirection.OUTBOUND },
          orderBy: { createdAt: 'desc' },
          select: { id: true },
        });
        if (lastOutbound && (await prisma.journeyStepRun.findFirst({ where: { messageId: lastOutbound.id, workspaceId: journey.workspaceId }, select: { id: true } }))) continue;
        out.push({ contactId: conversation.contactId, triggeredAt: conversation.lastOutboundAt, conversationId: conversation.id });
      } else {
        if (!conversation.lastInboundAt) continue;
        // Consulto y no compro: ninguna compra confirmada (de ese producto) desde la consulta.
        const bought = await prisma.customerOrder.findFirst({
          where: {
            workspaceId: journey.workspaceId,
            contactId: conversation.contactId,
            status: { in: PURCHASED },
            updatedAt: { gte: conversation.lastInboundAt },
            ...(journey.productId ? productLines(journey.productId) : {}),
          },
          select: { id: true },
        });
        if (bought) continue;
        // El ancla es el mensaje mismo: lo que llegue despues es una respuesta.
        const inquiry = await prisma.message.findFirst({
          where: { conversationId: conversation.id, workspaceId: journey.workspaceId, direction: MessageDirection.INBOUND },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true },
        });
        if (!inquiry) continue;
        out.push({ contactId: conversation.contactId, triggeredAt: inquiry.createdAt, conversationId: conversation.id });
      }
    }
    return out;
  }

  if (journey.trigger === JourneyTrigger.OPPORTUNITY_STALLED) {
    const opportunities = await prisma.opportunity.findMany({
      where: {
        workspaceId: journey.workspaceId,
        status: OpportunityStatus.OPEN,
        contactId: { not: null },
        updatedAt: { gte: journey.publishedAt, lte: settled },
        contact: notEnrolled,
      },
      orderBy: { updatedAt: 'asc' },
      take: limit,
      select: { id: true, contactId: true, updatedAt: true },
    });
    return opportunities.map((opportunity) => ({ contactId: opportunity.contactId!, triggeredAt: opportunity.updatedAt, opportunityId: opportunity.id }));
  }

  if (journey.trigger === JourneyTrigger.CHECKOUT_ABANDONED && journey.productId) {
    const orders = await prisma.customerOrder.findMany({
      where: {
        workspaceId: journey.workspaceId,
        status: { in: UNPAID },
        contactId: { not: null },
        createdAt: { gte: journey.publishedAt, lte: settled },
        contact: notEnrolled,
        ...productLines(journey.productId),
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
      select: { id: true, contactId: true, createdAt: true, conversationId: true },
    });
    return orders.map((order) => ({ contactId: order.contactId!, triggeredAt: order.createdAt, orderId: order.id, conversationId: order.conversationId }));
  }

  return [];
}

/**
 * Barrido de entradas de las estrategias comerciales. Lo llama el job
 * SCAN_JOURNEY_ENTRIES junto al barrido por segmentos.
 */
export async function scanFollowUpEntries(limit = 200, now = new Date()) {
  const journeys = await crossTenantPrisma.journey.findMany({
    where: {
      status: JourneyStatus.PUBLISHED,
      planLimitedAt: null,
      publishedAt: { not: null },
      trigger: { in: [JourneyTrigger.NO_REPLY, JourneyTrigger.INQUIRY_NO_PURCHASE, JourneyTrigger.OPPORTUNITY_STALLED, JourneyTrigger.CHECKOUT_ABANDONED] },
    },
    select: { id: true, workspaceId: true, trigger: true, productId: true, publishedAt: true },
  });

  let enrolled = 0;
  const skipped: Record<string, number> = {};
  for (const journey of journeys) {
    if (!isFollowUpScanned(journey.trigger, journey.productId) || !journey.publishedAt) continue;
    const candidates = await candidatesFor({ ...journey, publishedAt: journey.publishedAt }, now, limit);
    const seen = new Set<string>();
    for (const candidate of candidates) {
      if (seen.has(candidate.contactId)) continue;
      seen.add(candidate.contactId);
      const result = await enroll({
        workspaceId: journey.workspaceId,
        journeyId: journey.id,
        contactId: candidate.contactId,
        reason: `disparador ${journey.trigger}`,
        triggeredAt: candidate.triggeredAt,
        conversationId: candidate.conversationId ?? null,
        opportunityId: candidate.opportunityId ?? null,
        orderId: candidate.orderId ?? null,
        now,
      });
      if (result.enrolled) enrolled += 1;
      else skipped[result.reason] = (skipped[result.reason] ?? 0) + 1;
    }
  }

  return { journeys: journeys.length, enrolled, skipped };
}
