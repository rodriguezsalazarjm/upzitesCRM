import { JourneyEnrollmentStatus, Prisma } from '../../../generated/prisma/client';
import { SOLD_ORDER_STATUSES } from '../dashboard/widgets/loaders/commerce';
import { prisma } from '../prisma';
import { orderStatusLabel } from '../status-tone';
import { funnelRates, funnelStages, groupSales, type FunnelCounts } from './funnel-math';

/**
 * P30: embudo comercial del workspace en un periodo. Dinero solo en la moneda
 * del negocio (nunca se suman monedas). "Venta" = pedido pagado o en curso
 * (misma definición que el dashboard). Los upsells son pedidos hijos: no
 * cuentan como checkout ni como venta nueva, pero su dinero sí entra en ingresos.
 */
const PROVIDER_LABEL: Record<string, string> = { MERCADO_PAGO: 'Mercado Pago' };
const CHANNEL_LABEL: Record<string, string> = { WHATSAPP: 'WhatsApp', INSTAGRAM: 'Instagram', MESSENGER: 'Messenger', TIKTOK: 'TikTok' };
// shortcut: los desgloses leen hasta 5.000 ventas del periodo; agregar en SQL si un negocio vende más que eso.
const MAX_SALES = 5000;

export async function loadFunnel(workspaceId: string, input: { days: number; currency: string; now?: Date }) {
  const now = input.now ?? new Date();
  const since = new Date(now.getTime() - input.days * 86_400_000);
  const period = { gte: since, lte: now };
  const mainOrder = { upsellSource: { is: null } } satisfies Prisma.CustomerOrderWhereInput;
  const sold = { workspaceId, status: { in: SOLD_ORDER_STATUSES }, createdAt: period };

  const [adConversations, leads, conversations, withCheckout, checkouts, sales, soldOrders, offers, recovered] = await Promise.all([
    prisma.conversation.count({ where: { workspaceId, createdAt: period, OR: [{ campaignRouteId: { not: null } }, { attribution: { not: Prisma.DbNull } }] } }),
    prisma.contact.count({ where: { workspaceId, createdAt: period } }),
    prisma.conversation.count({ where: { workspaceId, createdAt: period } }),
    // Conversaciones del periodo que llegaron a un pedido.
    prisma.customerOrder.findMany({
      where: { workspaceId, ...mainOrder, status: { not: 'DRAFT' }, conversationId: { not: null }, createdAt: period },
      distinct: ['conversationId'],
      select: { conversationId: true },
    }),
    prisma.customerOrder.count({ where: { workspaceId, ...mainOrder, status: { not: 'DRAFT' }, createdAt: period } }),
    prisma.customerOrder.count({ where: { ...sold, ...mainOrder } }),
    prisma.customerOrder.findMany({
      where: { ...sold, currency: input.currency },
      select: { id: true, total: true, conversationId: true, campaignRouteId: true, campaignRoute: { select: { name: true } }, lines: { select: { name: true, total: true } } },
      orderBy: { createdAt: 'desc' },
      take: MAX_SALES,
    }),
    prisma.orderOffer.findMany({
      where: { workspaceId, shownAt: period },
      select: { kind: true, status: true, priceMinor: true, order: { select: { status: true, currency: true } }, resultOrder: { select: { status: true, currency: true, total: true } } },
    }),
    // Misma definición de "compra por seguimiento" que /recuperacion: hubo mensajes y la compra lo cortó.
    prisma.journeyEnrollment.findMany({
      where: { workspaceId, simulated: false, messagesSent: { gt: 0 }, purchaseOrderId: { not: null }, status: JourneyEnrollmentStatus.EXITED, exitedAt: period },
      select: { purchaseOrderId: true },
    }),
  ]);

  const isSold = (status: string) => (SOLD_ORDER_STATUSES as string[]).includes(status);
  const bumps = offers.filter((o) => o.kind === 'ORDER_BUMP');
  const acceptedBumps = bumps.filter((o) => o.status === 'ACCEPTED' && isSold(o.order.status) && o.order.currency === input.currency);
  const acceptedUpsells = offers.filter((o) => o.kind === 'UPSELL' && o.status === 'ACCEPTED' && o.resultOrder && isSold(o.resultOrder.status) && o.resultOrder.currency === input.currency);
  const recoveredIds = [...new Set(recovered.map((r) => r.purchaseOrderId!))];
  const recoveredOrders = recoveredIds.length
    ? await prisma.customerOrder.findMany({ where: { id: { in: recoveredIds }, workspaceId, status: { in: SOLD_ORDER_STATUSES }, currency: input.currency }, select: { total: true } })
    : [];

  const counts: FunnelCounts = {
    adConversations,
    leads,
    conversations,
    conversationsWithCheckout: withCheckout.length,
    checkouts,
    sales,
    revenue: soldOrders.reduce((sum, o) => sum + o.total, 0),
    bumpShown: bumps.length,
    bumpAccepted: acceptedBumps.length,
    bumpRevenue: acceptedBumps.reduce((sum, o) => sum + o.priceMinor, 0),
    upsellAccepted: acceptedUpsells.length,
    upsellRevenue: acceptedUpsells.reduce((sum, o) => sum + (o.resultOrder?.total ?? 0), 0),
    recoveredSales: recoveredOrders.length,
    recoveryRevenue: recoveredOrders.reduce((sum, o) => sum + o.total, 0),
  };

  // Canal y agente salen de la conversación del pedido.
  const conversationIds = [...new Set(soldOrders.map((o) => o.conversationId).filter((id): id is string => Boolean(id)))];
  const convs = conversationIds.length
    ? await prisma.conversation.findMany({ where: { id: { in: conversationIds }, workspaceId }, select: { id: true, channelType: true, currentAgentId: true } })
    : [];
  const agentIds = [...new Set(convs.map((c) => c.currentAgentId).filter((id): id is string => Boolean(id)))];
  const agents = agentIds.length ? await prisma.agentDefinition.findMany({ where: { id: { in: agentIds }, workspaceId }, select: { id: true, name: true } }) : [];
  const convById = new Map(convs.map((c) => [c.id, c]));
  const agentName = new Map(agents.map((a) => [a.id, a.name]));
  const lines = soldOrders.flatMap((o) => o.lines);

  return {
    since,
    currency: input.currency,
    counts,
    rates: funnelRates(counts),
    stages: funnelStages(counts),
    byProduct: groupSales(lines, (l) => ({ key: l.name, label: l.name }), (l) => l.total),
    byCampaign: groupSales(soldOrders, (o) => (o.campaignRouteId ? { key: o.campaignRouteId, label: o.campaignRoute?.name ?? 'Regla eliminada' } : { key: 'none', label: 'Sin campaña' }), (o) => o.total),
    byChannel: groupSales(soldOrders, (o) => {
      const channel = o.conversationId ? convById.get(o.conversationId)?.channelType : null;
      return channel ? { key: channel, label: CHANNEL_LABEL[channel] ?? channel } : { key: 'direct', label: 'Directo / web' };
    }, (o) => o.total),
    byAgent: groupSales(soldOrders, (o) => {
      const agentId = o.conversationId ? convById.get(o.conversationId)?.currentAgentId : null;
      return agentId ? { key: agentId, label: agentName.get(agentId) ?? 'Agente eliminado' } : { key: 'none', label: 'Sin agente de IA' };
    }, (o) => o.total),
    recentSales: soldOrders.slice(0, 10).map((o) => o.id),
    truncated: soldOrders.length === MAX_SALES,
  };
}

export type SaleTrailStep = { key: string; label: string; detail: string; at: Date | null; done: boolean };

const asObject = (value: unknown) => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {});

/**
 * Recorrido de una venta, de la fuente al pago: fuente/campaña → contacto →
 * conversación → checkout → pago → bump/upsell → recuperación. Solo muestra
 * lo que quedó registrado; un paso sin dato se marca pendiente, no se inventa.
 */
export async function loadSaleTrail(workspaceId: string, orderId: string) {
  const order = await prisma.customerOrder.findFirst({
    where: { id: orderId, workspaceId },
    include: {
      contact: { select: { firstName: true, lastName: true, createdAt: true, source: true, utmSource: true, firstTouch: true } },
      campaignRoute: { select: { name: true, level: true, externalId: true } },
      payments: { orderBy: { createdAt: 'asc' }, select: { provider: true, status: true, amount: true, currency: true, approvedAt: true, metadata: true } },
      offers: { select: { kind: true, status: true, priceMinor: true, offer: { select: { headline: true } } } },
      followUpWins: { select: { journey: { select: { name: true } }, messagesSent: true, exitedAt: true } },
    },
  });
  if (!order) return null;
  const conversation = order.conversationId
    ? await prisma.conversation.findFirst({ where: { id: order.conversationId, workspaceId }, select: { channelType: true, createdAt: true, currentAgentId: true } })
    : null;
  const agent = conversation?.currentAgentId ? await prisma.agentDefinition.findFirst({ where: { id: conversation.currentAgentId, workspaceId }, select: { name: true } }) : null;

  const attribution = asObject(order.attribution);
  const firstTouch = asObject(order.contact?.firstTouch);
  const adId = (attribution.adId ?? firstTouch.adId) as string | undefined;
  const source = order.campaignRoute
    ? `Campaña "${order.campaignRoute.name}" (${order.campaignRoute.level.toLowerCase()} ${order.campaignRoute.externalId})`
    : adId ? `Anuncio ${adId} (sin regla de campaña)`
    : order.contact?.utmSource ? `UTM ${order.contact.utmSource}`
    : order.contact?.source ? order.contact.source
    : order.conversationId ? 'Conversación sin atribución' : 'Directo';
  const approved = order.payments.find((p) => p.status === 'APPROVED');
  const bump = order.offers.find((o) => o.kind === 'ORDER_BUMP' && o.status !== 'SHOWN');
  const upsell = order.offers.find((o) => o.kind === 'UPSELL' && o.status !== 'SHOWN');
  const recovery = order.followUpWins.find((e) => e.messagesSent > 0);
  const contactName = [order.contact?.firstName, order.contact?.lastName].filter(Boolean).join(' ') || order.customerName || 'Sin nombre';

  const steps: SaleTrailStep[] = [
    { key: 'source', label: 'Fuente', detail: source, at: (firstTouch.receivedAt as string | undefined) ? new Date(firstTouch.receivedAt as string) : null, done: source !== 'Directo' },
    { key: 'lead', label: 'Lead', detail: contactName, at: order.contact?.createdAt ?? null, done: Boolean(order.contact) },
    { key: 'conversation', label: 'Conversación', detail: conversation ? `${CHANNEL_LABEL[conversation.channelType] ?? conversation.channelType}${agent ? ` · agente ${agent.name}` : ''}` : 'Sin conversación (venta directa)', at: conversation?.createdAt ?? null, done: Boolean(conversation) },
    { key: 'checkout', label: 'Checkout', detail: `Pedido ${order.id.slice(-8).toUpperCase()} · ${orderStatusLabel[order.status] ?? order.status}`, at: order.createdAt, done: true },
    {
      key: 'payment',
      label: 'Pago',
      detail: approved ? `${PROVIDER_LABEL[approved.provider] ?? approved.provider} aprobado${asObject(approved.metadata).simulated ? ' (simulado)' : ''}` : order.payments.length ? `${order.payments.at(-1)!.status}` : 'Sin pago registrado',
      at: approved?.approvedAt ?? null,
      done: Boolean(approved),
    },
    { key: 'bump', label: 'Bump / upsell', detail: [bump && `Bump "${bump.offer.headline}": ${bump.status === 'ACCEPTED' ? 'aceptado' : 'rechazado'}`, upsell && `Upsell "${upsell.offer.headline}": ${upsell.status === 'ACCEPTED' ? 'aceptado' : 'rechazado'}`].filter(Boolean).join(' · ') || 'Sin ofertas decididas', at: null, done: bump?.status === 'ACCEPTED' || upsell?.status === 'ACCEPTED' },
    { key: 'recovery', label: 'Recuperación', detail: recovery ? `Compró tras el seguimiento "${recovery.journey.name}" (${recovery.messagesSent} mensaje(s))` : 'No vino de un seguimiento', at: recovery?.exitedAt ?? null, done: Boolean(recovery) },
  ];
  return { order: { id: order.id, total: order.total, currency: order.currency, status: order.status, contactName }, steps };
}
