import { NextResponse } from 'next/server';
import { z } from 'zod';
import { CampaignStatus, JobType } from '../../../../../../generated/prisma/client';
import { requireCurrentUser } from '@/lib/auth';
import { recordAudit } from '@/lib/domain/audit';
import { parseBody } from '@/lib/http';
import { enqueue } from '@/lib/jobs/queue';
import { buildRecipients, CampaignError } from '@/lib/marketing/campaigns';
import { canManageMarketing } from '@/lib/marketing/roles';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const schema = z.object({
  /** Ausente = ahora. */
  scheduledAt: z.string().datetime().optional(),
});

/**
 * Programa una campana: materializa los destinatarios y la encola.
 *
 * Materializar aqui y no al enviar tiene una razon: el owner ve cuantos van a
 * recibir el correo ANTES de que salga, con la lista ya depurada de suprimidos.
 * Es la ultima oportunidad de detenerse.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireCurrentUser();

  if (!canManageMarketing(user.role)) {
    return NextResponse.json(
      { message: 'Solo el owner o un admin puede lanzar campanas.' },
      { status: 403 },
    );
  }

  const parsed = await parseBody(request, schema);
  if (!parsed.ok) return parsed.response;

  const campaign = await prisma.campaign.findFirst({
    where: { id, workspaceId: user.workspace.id },
    select: { id: true, name: true, status: true },
  });

  if (!campaign) return NextResponse.json({ message: 'Campana no encontrada' }, { status: 404 });

  if (campaign.status !== CampaignStatus.DRAFT && campaign.status !== CampaignStatus.PAUSED) {
    return NextResponse.json(
      { message: `Una campana en estado ${campaign.status} no se puede programar.`, code: 'INVALID_STATE' },
      { status: 409 },
    );
  }

  let recipients;
  try {
    recipients = await buildRecipients({ workspaceId: user.workspace.id, campaignId: campaign.id });
  } catch (error) {
    if (error instanceof CampaignError) {
      return NextResponse.json({ message: error.message, code: error.code }, { status: 409 });
    }
    throw error;
  }

  const scheduledAt = parsed.data.scheduledAt ? new Date(parsed.data.scheduledAt) : new Date();

  const updated = await prisma.campaign.update({
    where: { id: campaign.id },
    data: { status: CampaignStatus.SCHEDULED, scheduledAt },
  });

  await enqueue({
    type: JobType.SEND_CAMPAIGN,
    workspaceId: user.workspace.id,
    payload: { campaignId: campaign.id },
    dedupeKey: `campaign:${campaign.id}:start`,
    runAt: scheduledAt,
    priority: 100,
  });

  await recordAudit({
    workspaceId: user.workspace.id,
    actorId: user.id,
    action: 'campaign.scheduled',
    entity: 'Campaign',
    entityId: campaign.id,
    metadata: {
      name: campaign.name,
      recipients: recipients.recipientCount,
      scheduledAt: scheduledAt.toISOString(),
    },
  });

  return NextResponse.json({ data: { ...updated, recipients: recipients.recipientCount } });
}
