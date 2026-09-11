import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ActivityType } from '../../../../../generated/prisma/client';
import { getCurrentWorkspaceId } from '@/lib/crm-data';
import { notFound, orNull, parseBody } from '@/lib/http';
import { prisma } from '@/lib/prisma';

const activityTypeMap = {
  email: ActivityType.EMAIL,
  call: ActivityType.CALL,
  meeting: ActivityType.MEETING,
  note: ActivityType.NOTE,
  deal: ActivityType.DEAL,
} as const;

const updateActivitySchema = z.object({
  type: z.enum(['email', 'call', 'meeting', 'note', 'deal']).optional(),
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  contactId: z.string().nullable().optional(),
  opportunityId: z.string().nullable().optional(),
  dueAt: z.string().datetime().nullable().optional(),
  completedAt: z.string().datetime().nullable().optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = await parseBody(request, updateActivitySchema);
  if (!parsed.ok) return parsed.response;
  const input = parsed.data;
  const workspaceId = await getCurrentWorkspaceId();

  const activity = await orNull(
    prisma.activity.update({
      where: { id, workspaceId },
      data: {
        contactId: input.contactId,
        opportunityId: input.opportunityId,
        type: input.type ? activityTypeMap[input.type] : undefined,
        title: input.title,
        description: input.description,
        dueAt: input.dueAt === undefined ? undefined : input.dueAt ? new Date(input.dueAt) : null,
        completedAt:
          input.completedAt === undefined
            ? undefined
            : input.completedAt
              ? new Date(input.completedAt)
              : null,
      },
    }),
  );

  // D13: un id de otro workspace no encuentra nada y eso es un 404,
  // no un error del servidor.
  if (!activity) return notFound('Actividad');

  return NextResponse.json({ data: activity });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const workspaceId = await getCurrentWorkspaceId();

  const eliminado = await orNull(
    prisma.activity.delete({
      where: { id, workspaceId },
    }),
  );
  if (!eliminado) return notFound('Actividad');

  return NextResponse.json({ ok: true });
}
