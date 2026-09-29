import { JourneyEnrollmentStatus, JourneyTrigger, OrderStatus } from '../../../../../generated/prisma/enums';
import { prisma } from '../../../prisma';
import type { WidgetContext, WidgetData } from '../types';
import { daysAgo, startOfDayInTimeZone } from './time';

/** Pedidos que cuentan como venta: pagados o en curso (no borradores, cancelados ni reembolsados). */
export const SOLD_ORDER_STATUSES = [OrderStatus.CONFIRMED, OrderStatus.PROCESSING, OrderStatus.FULFILLED];

async function ordersToday({ workspaceId, now, timeZone }: WidgetContext) {
  return prisma.customerOrder.aggregate({
    where: { workspaceId, status: { in: SOLD_ORDER_STATUSES }, createdAt: { gte: startOfDayInTimeZone(now, timeZone) } },
    _count: { _all: true },
    _sum: { total: true },
  });
}

export async function loadOrdersToday(ctx: WidgetContext): Promise<WidgetData> {
  const result = await ordersToday(ctx);
  return { kind: 'stat', value: result._count._all, format: 'number', hint: 'Pagados o en curso, hoy', href: '/pedidos' };
}

export async function loadRevenueToday(ctx: WidgetContext): Promise<WidgetData> {
  const result = await ordersToday(ctx);
  return { kind: 'stat', value: result._sum.total ?? 0, format: 'money', hint: 'Total de pedidos de hoy', href: '/pedidos' };
}

/** Productos mas vendidos (por monto) en los ultimos 30 dias. */
export async function loadTopProducts({ workspaceId, now }: WidgetContext): Promise<WidgetData> {
  const grouped = await prisma.orderLine.groupBy({
    by: ['name'],
    where: { order: { workspaceId, status: { in: SOLD_ORDER_STATUSES }, createdAt: { gte: daysAgo(now, 30) } } },
    _sum: { total: true, quantity: true },
    orderBy: { _sum: { total: 'desc' } },
    take: 5,
  });
  return {
    kind: 'list',
    rows: grouped.map((row) => ({ label: `${row.name} · ${row._sum.quantity ?? 0} u.`, value: row._sum.total ?? 0, format: 'money' as const })),
    href: '/pedidos',
  };
}

/**
 * Carritos recuperados (30 dias): inscripciones del seguimiento de checkout
 * abandonado que SALIERON antes del ultimo paso (pago, respuesta o toma
 * humana). Es la misma definicion de "recuperados" que usa /recuperacion.
 */
export async function loadRecoveredSales({ workspaceId, now }: WidgetContext): Promise<WidgetData> {
  const value = await prisma.journeyEnrollment.count({
    where: {
      workspaceId,
      status: JourneyEnrollmentStatus.EXITED,
      exitedAt: { gte: daysAgo(now, 30) },
      journey: { trigger: JourneyTrigger.CHECKOUT_ABANDONED },
    },
  });
  return { kind: 'stat', value, format: 'number', hint: 'Checkouts abandonados recuperados · 30 días', href: '/recuperacion' };
}
