import { OpportunityStatus, QuoteStatus } from '../../../../../generated/prisma/enums';
import { prisma } from '../../../prisma';
import type { WidgetContext, WidgetData } from '../types';
import { startOfMonthInTimeZone } from './time';

async function openPipeline(workspaceId: string) {
  return prisma.opportunity.aggregate({
    where: { workspaceId, status: OpportunityStatus.OPEN },
    _count: { _all: true },
    _sum: { value: true },
  });
}

export async function loadOpenOpportunities({ workspaceId }: WidgetContext): Promise<WidgetData> {
  const result = await openPipeline(workspaceId);
  return { kind: 'stat', value: result._count._all, format: 'number', hint: 'Abiertas', href: '/oportunidades' };
}

export async function loadPipelineValue({ workspaceId }: WidgetContext): Promise<WidgetData> {
  const result = await openPipeline(workspaceId);
  return { kind: 'stat', value: result._sum.value ?? 0, format: 'money', hint: 'Suma de oportunidades abiertas', href: '/oportunidades' };
}

/** Cotizaciones enviadas que esperan respuesta del cliente. */
export async function loadQuotesPending({ workspaceId }: WidgetContext): Promise<WidgetData> {
  const result = await prisma.quote.aggregate({
    where: { workspaceId, status: QuoteStatus.SENT },
    _count: { _all: true },
    _sum: { total: true },
  });
  return {
    kind: 'stat',
    value: result._count._all,
    format: 'number',
    hint: result._count._all > 0 ? `Esperando respuesta` : 'Sin cotizaciones enviadas pendientes',
    href: '/cotizaciones',
  };
}

/**
 * Oportunidades ganadas este mes. Opportunity no guarda la fecha de cierre:
 * se usa la ultima actualizacion de las que estan en WON.
 */
export async function loadSalesWon({ workspaceId, now, timeZone }: WidgetContext): Promise<WidgetData> {
  const result = await prisma.opportunity.aggregate({
    where: { workspaceId, status: OpportunityStatus.WON, updatedAt: { gte: startOfMonthInTimeZone(now, timeZone) } },
    _count: { _all: true },
    _sum: { value: true },
  });
  return { kind: 'stat', value: result._sum.value ?? 0, format: 'money', hint: `${result._count._all} ganadas este mes`, href: '/oportunidades' };
}
