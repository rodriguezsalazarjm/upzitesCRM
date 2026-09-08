import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  IntegrationProvider,
  IntegrationStatus,
  WhatsAppChannelStatus,
} from '../../../../../../generated/prisma/client';
import { requireCurrentUser } from '@/lib/auth';
import { canManageChannels } from '@/lib/conversations';
import { EncryptionKeyMissingError, encryptSecret } from '@/lib/crypto';
import { recordAudit } from '@/lib/domain/audit';
import { parseBody } from '@/lib/http';
import { prisma } from '@/lib/prisma';

const connectSchema = z.object({
  wabaId: z.string().min(1),
  phoneNumberId: z.string().min(1),
  displayPhoneNumber: z.string().min(1),
  businessName: z.string().optional(),
  accessToken: z.string().min(1),
});

/**
 * Onboarding guiado de un numero de WhatsApp (pilotos).
 *
 * El Embedded Signup v4 llega en la Fase 9; hasta entonces el numero se conecta
 * a mano con los datos que el cliente obtiene en su Meta Business. El token se
 * guarda cifrado y nunca se devuelve al cliente.
 */
export async function POST(request: Request) {
  const user = await requireCurrentUser();

  if (!canManageChannels(user.role)) {
    return NextResponse.json(
      { message: 'Solo el owner o un admin puede conectar un numero de WhatsApp.' },
      { status: 403 },
    );
  }

  const parsed = await parseBody(request, connectSchema);
  if (!parsed.ok) return parsed.response;
  const input = parsed.data;

  // `phoneNumberId` es unico global: si otro workspace ya lo registro, se
  // rechaza. Sin esto, un tenant podria capturar los mensajes de otro.
  const taken = await prisma.whatsAppChannel.findUnique({
    where: { phoneNumberId: input.phoneNumberId },
    select: { workspaceId: true },
  });

  if (taken && taken.workspaceId !== user.workspace.id) {
    return NextResponse.json(
      { message: 'Ese numero ya esta conectado a otra cuenta.' },
      { status: 409 },
    );
  }

  let accessTokenEncrypted: string;
  try {
    accessTokenEncrypted = encryptSecret(input.accessToken);
  } catch (error) {
    if (error instanceof EncryptionKeyMissingError) {
      return NextResponse.json({ message: error.message }, { status: 503 });
    }
    throw error;
  }

  const channel = await prisma.whatsAppChannel.upsert({
    where: { phoneNumberId: input.phoneNumberId },
    create: {
      workspaceId: user.workspace.id,
      wabaId: input.wabaId,
      phoneNumberId: input.phoneNumberId,
      displayPhoneNumber: input.displayPhoneNumber,
      businessName: input.businessName,
      accessTokenEncrypted,
      status: WhatsAppChannelStatus.CONNECTED,
      webhookSubscribedAt: new Date(),
    },
    update: {
      wabaId: input.wabaId,
      displayPhoneNumber: input.displayPhoneNumber,
      businessName: input.businessName,
      accessTokenEncrypted,
      status: WhatsAppChannelStatus.CONNECTED,
    },
    select: { id: true, displayPhoneNumber: true, status: true },
  });

  await prisma.integration.upsert({
    where: {
      workspaceId_provider: { workspaceId: user.workspace.id, provider: IntegrationProvider.WHATSAPP },
    },
    create: {
      workspaceId: user.workspace.id,
      provider: IntegrationProvider.WHATSAPP,
      name: 'WhatsApp Business',
      status: IntegrationStatus.CONNECTED,
      lastSyncAt: new Date(),
    },
    update: { status: IntegrationStatus.CONNECTED, lastSyncAt: new Date() },
  });

  await recordAudit({
    workspaceId: user.workspace.id,
    actorId: user.id,
    action: 'whatsapp.channel_connected',
    entity: 'WhatsAppChannel',
    entityId: channel.id,
    // El token no entra al audit log.
    metadata: { phoneNumberId: input.phoneNumberId, wabaId: input.wabaId },
  });

  return NextResponse.json({ data: channel }, { status: 201 });
}
