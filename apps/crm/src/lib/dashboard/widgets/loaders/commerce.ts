import { JourneyEnrollmentStatus, JourneyTrigger, OrderStatus } from '../../../../../generated/prisma/enums';
import { prisma } from '../../../prisma';
import { toMajorUnits } from '../../../billing/money';
import { exponentOf } from '../../../commerce/money';
import type { WidgetContext, WidgetData } from '../types';
import { daysAgo, startOfDayInTimeZone } from './time';

/** Pedidos que cuentan como venta: pagados o en curso (no borradores, cancelados ni reembolsados). */
export const SOLD_ORDER_STATUSES = [OrderStatus.CONFIRMED, OrderStatus.PROCESSING, OrderStatus.FULFILLED];

/**
 * Montos del dashboard: solo pedidos en la moneda del negocio (ctx.currency) y
 * en unidades MAYORES (el widget formatea con esa moneda). Nunca se suman
 * monedas distintas: un pedido en otra moneda no entra en estas cifras.
 */
function toWidgetMoney(amountMinor: number, currency: string) {
  return exponentOf(currency) === 0 ? amountMinor : toMajorUnits(amountMinor, currency);
}

async function ordersToday({ workspaceId, now, timeZone, currency }: WidgetContext) {
  return prisma.customerOrder.aggregate({
    where: { workspaceId, currency, status: { in: SOLD_ORDER_STATUSES }, createdAt: { gte: startOfDayInTimeZone(now, timeZone) } },
    _count: { _all: true },
    _sum: { total: true },
  });
}

export async function loadOrdersToday({ workspaceId, now, timeZone }: WidgetContext): Promise<WidgetData> {
  // Contar pedidos no mezcla dinero: aqui entran todas las monedas.
  const count = await prisma.customerOrder.count({ where: { workspaceId, status: { in: SOLD_ORDER_STATUSES }, createdAt: { gte: startOfDayInTimeZone(now, timeZone) } } });
  return { kind: 'stat', value: count, format: 'number', hint: 'Pagados o en curso, hoy', href: '/pedidos' };
}

export async function loadRevenueToday(ctx: WidgetContext): Promise<WidgetData> {
  const result = await ordersToday(ctx);
  return { kind: 'stat', value: toWidgetMoney(result._sum.total ?? 0, ctx.currency), format: 'money', hint: 'Total de pedidos de hoy', href: '/pedidos' };
}

/** Productos mas vendidos (por monto) en los ultimos 30 dias. */
export async function loadTopProducts({ workspaceId, now, currency }: WidgetContext): Promise<WidgetData> {
  const grouped = await prisma.orderLine.groupBy({
    by: ['name'],
    where: { order: { workspaceId, currency, status: { in: SOLD_ORDER_STATUSES }, createdAt: { gte: daysAgo(now, 30) } } },
    _sum: { total: true, quantity: true },
    orderBy: { _sum: { total: 'desc' } },
    take: 5,
  });
  return {
    kind: 'list',
    rows: grouped.map((row) => ({ label: `${row.name} · ${row._sum.quantity ?? 0} u.`, value: toWidgetMoney(row._sum.total ?? 0, currency), format: 'money' as const })),
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
