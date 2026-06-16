import { NextResponse } from 'next/server';
import { ActivityType, AiInsightType } from '../../../../../generated/prisma/client';
import { getCurrentWorkspaceId } from '@/lib/crm-data';
import { prisma } from '@/lib/prisma';

export async function POST() {
  const workspaceId = await getCurrentWorkspaceId();
  const staleContacts = await prisma.contact.findMany({
    where: {
      workspaceId,
      status: { in: ['LEAD', 'ACTIVE'] },
      OR: [
        { lastActivityAt: null },
        { lastActivityAt: { lt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3) } },
      ],
    },
    take: 10,
  });

  for (const contact of staleContacts) {
    await prisma.activity.create({
      data: {
        workspaceId,
        contactId: contact.id,
        type: ActivityType.CALL,
        title: 'Recordatorio automatico de seguimiento',
        description: `Contactar a ${contact.firstName} ${contact.lastName}. No hay actividad reciente registrada.`,
        dueAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      },
    });

    await prisma.aiInsight.create({
      data: {
        workspaceId,
        contactId: contact.id,
        type: AiInsightType.NEXT_BEST_ACTION,
        title: 'Seguimiento automatico recomendado',
        description: 'Este contacto no tiene actividad reciente. Conviene contactarlo dentro de las proximas 24 horas.',
        score: 65,
      },
    });
  }

  await prisma.automationRule.updateMany({
    where: { workspaceId, isActive: true },
    data: { lastRunAt: new Date() },
  });

  return NextResponse.json({ createdTasks: staleContacts.length });
}
