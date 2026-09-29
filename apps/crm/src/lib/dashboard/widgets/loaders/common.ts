import { ConversationStatus } from '../../../../../generated/prisma/enums';
import { prisma } from '../../../prisma';
import type { WidgetContext, WidgetData } from '../types';
import { daysAgo } from './time';

/** Contactos creados en los ultimos 7 dias. */
export async function loadNewContacts({ workspaceId, now }: WidgetContext): Promise<WidgetData> {
  const value = await prisma.contact.count({ where: { workspaceId, createdAt: { gte: daysAgo(now, 7) } } });
  return { kind: 'stat', value, format: 'number', hint: 'Últimos 7 días', href: '/contactos' };
}

/** Mensajes sin leer en conversaciones abiertas. */
export async function loadUnreadMessages({ workspaceId }: WidgetContext): Promise<WidgetData> {
  const result = await prisma.conversation.aggregate({
    where: { workspaceId, status: { not: ConversationStatus.CLOSED }, unreadCount: { gt: 0 } },
    _sum: { unreadCount: true },
    _count: { _all: true },
  });
  const conversations = result._count._all;
  return {
    kind: 'stat',
    value: result._sum.unreadCount ?? 0,
    format: 'number',
    hint: `${conversations} ${conversations === 1 ? 'conversación' : 'conversaciones'}`,
    href: '/inbox',
  };
}

/** Automatizaciones ejecutadas (completadas) en los ultimos 7 dias. */
export async function loadAutomationActivity({ workspaceId, now }: WidgetContext): Promise<WidgetData> {
  const grouped = await prisma.automationExecution.groupBy({
    by: ['status'],
    where: { workspaceId, createdAt: { gte: daysAgo(now, 7) } },
    _count: { _all: true },
  });
  const count = (status: string) => grouped.find((row) => row.status === status)?._count._all ?? 0;
  const failed = count('FAILED');
  return {
    kind: 'stat',
    value: count('COMPLETED'),
    format: 'number',
    hint: failed > 0 ? `${failed} con error · 7 días` : 'Últimos 7 días',
    href: '/automatizaciones',
  };
}
