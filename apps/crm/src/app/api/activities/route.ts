import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ActivityType } from '../../../../generated/prisma/client';
import { getActivities, getCurrentWorkspaceId } from '@/lib/crm-data';
import { prisma } from '@/lib/prisma';

const activityTypeMap = {
  email: ActivityType.EMAIL,
  call: ActivityType.CALL,
  meeting: ActivityType.MEETING,
  note: ActivityType.NOTE,
  deal: ActivityType.DEAL,
} as const;

const activitySchema = z.object({
  type: z.enum(['email', 'call', 'meeting', 'note', 'deal']).default('note'),
  title: z.string().min(1),
  description: z.string().optional(),
  contactId: z.string().optional(),
  opportunityId: z.string().optional(),
  dueAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
});

export async function GET() {
  const activities = await getActivities(50);
  return NextResponse.json({ data: activities });
}

export async function POST(request: Request) {
  const input = activitySchema.parse(await request.json());
  const workspaceId = await getCurrentWorkspaceId();

  const activity = await prisma.activity.create({
    data: {
      workspaceId,
      contactId: input.contactId,
      opportunityId: input.opportunityId,
      type: activityTypeMap[input.type],
      title: input.title,
      description: input.description,
      dueAt: input.dueAt ? new Date(input.dueAt) : undefined,
      completedAt: input.completedAt ? new Date(input.completedAt) : undefined,
    },
  });

  return NextResponse.json({ data: activity }, { status: 201 });
}

