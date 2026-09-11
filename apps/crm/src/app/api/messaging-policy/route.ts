import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireCurrentUser } from '@/lib/auth';
import { recordAudit } from '@/lib/domain/audit';
import { parseBody } from '@/lib/http';
import { getPolicy } from '@/lib/marketing/policy';
import { canManageMarketing } from '@/lib/marketing/roles';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const minuteOfDay = z.number().int().min(0).max(1439);

const updateSchema = z.object({
  timezone: z.string().min(1).max(64).optional(),
  quietStartMinute: minuteOfDay.optional(),
  quietEndMinute: minuteOfDay.optional(),
  maxWhatsappPerDay: z.number().int().min(0).max(10).optional(),
  maxEmailPerWeek: z.number().int().min(0).max(50).optional(),
  maxConsecutiveNoReply: z.number().int().min(1).max(10).optional(),
  allowSameDayMultichannel: z.boolean().optional(),
});

export async function GET() {
  const user = await requireCurrentUser();
  const policy = await getPolicy(user.workspace.id);
  return NextResponse.json({ data: policy });
}

export async function PATCH(request: Request) {
  const user = await requireCurrentUser();

  if (!canManageMarketing(user.role)) {
    return NextResponse.json(
      { message: 'Solo el owner o un admin puede cambiar los limites de contacto.' },
      { status: 403 },
    );
  }

  const parsed = await parseBody(request, updateSchema);
  if (!parsed.ok) return parsed.response;

  // Se valida la zona antes de guardarla: una zona invalida haria fallar el
  // calculo de quiet hours en cada envio, y el sintoma aparece lejos de aqui.
  if (parsed.data.timezone) {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: parsed.data.timezone });
    } catch {
      return NextResponse.json(
        { message: `Zona horaria desconocida: ${parsed.data.timezone}`, code: 'INVALID_TIMEZONE' },
        { status: 400 },
      );
    }
  }

  const policy = await prisma.messagingPolicy.upsert({
    where: { workspaceId: user.workspace.id },
    create: { workspaceId: user.workspace.id, ...parsed.data },
    update: parsed.data,
  });

  await recordAudit({
    workspaceId: user.workspace.id,
    actorId: user.id,
    action: 'messaging_policy.updated',
    entity: 'MessagingPolicy',
    entityId: policy.id,
    metadata: parsed.data,
  });

  return NextResponse.json({ data: policy });
}
