import { ChannelAccountStatus, type Channel } from '../../../generated/prisma/client';
import { prisma } from '../prisma';
import { recordAudit } from '../domain/audit';

/**
 * Desconexion compartida por cualquier canal OAuth (Instagram, Messenger).
 *
 * Solo apaga la cuenta: nunca borra Conversation, Message, ContactChannelIdentity
 * ni AutomationFlowRun — el historial y el audit trail se conservan (spec Fase
 * D1, seccion 18). El token queda inutilizado (no solo "olvidado"): se limpia
 * para que ni un bug de lectura futura pueda reenviarlo.
 */
export async function disconnectChannelAccount(input: {
  workspaceId: string;
  channelAccountId: string;
  actorId: string;
}) {
  const account = await prisma.channelAccount.findFirst({
    where: { id: input.channelAccountId, workspaceId: input.workspaceId },
  });
  if (!account) throw new Error('Cuenta no encontrada en este workspace.');

  await prisma.channelAccount.update({
    where: { id: account.id },
    data: {
      status: ChannelAccountStatus.DISCONNECTED,
      accessTokenEncrypted: null,
      refreshTokenEncrypted: null,
      accessTokenExpiresAt: null,
      lastErrorCode: null,
      lastError: null,
    },
  });

  await recordAudit({
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    action: `${account.channel.toLowerCase()}.disconnected`,
    entity: 'ChannelAccount',
    entityId: account.id,
    metadata: { externalAccountId: account.externalAccountId },
  });

  return { channel: account.channel as Channel };
}
