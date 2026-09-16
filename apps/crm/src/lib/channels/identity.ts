import { ActivityType, type Channel } from '../../../generated/prisma/client';
import { prisma } from '../prisma';
import { CHANNEL_LABEL } from '../../components/channels/channel-badge';

/**
 * Resuelve el Contact para una identidad de canal (IGSID/PSID/id de TikTok),
 * creandolo si es la primera vez que se ve. Generaliza upsertContactByPhone
 * (src/lib/whatsapp/inbound.ts) al resto de canales: la identidad vive en
 * ContactChannelIdentity, nunca se fusiona automaticamente con un Contact
 * existente por nombre visible — cada canal es una identidad propia hasta que
 * alguien la vincule a mano o aparezca evidencia fuerte (mismo email/telefono
 * confirmado), que queda fuera de esta fase.
 */
export async function resolveContactForChannelIdentity(input: {
  workspaceId: string;
  channel: Channel;
  channelAccountId: string;
  externalUserId: string;
  displayName?: string | null;
}) {
  const existing = await prisma.contactChannelIdentity.findUnique({
    where: { channelAccountId_externalUserId: { channelAccountId: input.channelAccountId, externalUserId: input.externalUserId } },
    include: { contact: true },
  });
  if (existing) return existing.contact;

  const parts = (input.displayName ?? '').trim().split(/\s+/).filter(Boolean);
  const firstName = parts[0] ?? 'Contacto';
  const lastName = parts.slice(1).join(' ') || CHANNEL_LABEL[input.channel];

  const contact = await prisma.contact.create({
    data: {
      workspaceId: input.workspaceId,
      firstName,
      lastName,
      source: CHANNEL_LABEL[input.channel],
      tags: [input.channel.toLowerCase()],
      lastActivityAt: new Date(),
      channelIdentities: {
        create: {
          workspaceId: input.workspaceId,
          channel: input.channel,
          channelAccountId: input.channelAccountId,
          externalUserId: input.externalUserId,
          displayName: input.displayName ?? null,
        },
      },
    },
  });

  await prisma.activity.create({
    data: {
      workspaceId: input.workspaceId,
      contactId: contact.id,
      type: ActivityType.NOTE,
      title: `Nuevo contacto desde ${CHANNEL_LABEL[input.channel]}`,
      description: input.displayName ? `Perfil: ${input.displayName}` : undefined,
    },
  });

  return contact;
}
