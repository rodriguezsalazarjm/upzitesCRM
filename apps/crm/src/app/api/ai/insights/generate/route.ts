import { NextResponse } from 'next/server';
import { AiInsightType } from '../../../../../../generated/prisma/client';
import { getCurrentWorkspaceId } from '@/lib/crm-data';
import { prisma } from '@/lib/prisma';

export async function POST() {
  const workspaceId = await getCurrentWorkspaceId();
  const contacts = await prisma.contact.findMany({
    where: { workspaceId },
    include: {
      opportunities: true,
      activities: true,
    },
    take: 25,
  });

  let generated = 0;

  for (const contact of contacts) {
    const openValue = contact.opportunities.reduce((sum, opportunity) => sum + opportunity.value, 0);
    const score = Math.min(100, Math.round(openValue / 100000 + contact.activities.length * 8 + (contact.email ? 10 : 0)));

    if (score >= 40) {
      await prisma.aiInsight.create({
        data: {
          workspaceId,
          contactId: contact.id,
          type: AiInsightType.LEAD_SCORE,
          title: `Lead score ${score}`,
          description: `${contact.firstName} ${contact.lastName} tiene señales comerciales suficientes para priorizar seguimiento.`,
          score,
        },
      });
      generated += 1;
    }
  }

  return NextResponse.json({ generated });
}
