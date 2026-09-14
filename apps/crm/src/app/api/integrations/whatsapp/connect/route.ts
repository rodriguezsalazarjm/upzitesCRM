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
import { MetaWhatsAppError, verifyAndSubscribeWhatsAppChannel } from '@/lib/whatsapp/meta';
import {
  assertWhatsAppChannelOwnership,
  isWhatsAppChannelOwnershipConflict,
} from '@/lib/whatsapp/ownership';

const connectSchema = z.object({
  wabaId: z.string().regex(/^\d+$/, 'WABA ID debe contener solo numeros.'),
  phoneNumberId: z.string().regex(/^\d+$/, 'Phone Number ID debe contener solo numeros.'),
  displayPhoneNumber: z.string().min(1),
  businessName: z.string().optional(),
  accessToken: z.string().min(20, 'El token de Meta no parece completo.').max(4096),
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

  let verified;
  try {
    verified = await verifyAndSubscribeWhatsAppChannel(input);
  } catch (error) {
    if (error instanceof MetaWhatsAppError) {
      return NextResponse.json(
        { message: error.message, code: error.code },
        { status: error.httpStatus },
      );
    }
    throw error;
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

  let channel;
  try {
    channel = await prisma.$transaction(async (tx) => {
      // La lectura y la escritura viven en la misma transaccion. Si dos tenants
      // compiten, el unique global hace fallar al perdedor sin sobrescribir.
      const taken = await tx.whatsAppChannel.findUnique({
        where: { phoneNumberId: verified.phoneNumberId },
        select: { id: true, workspaceId: true },
      });
      assertWhatsAppChannelOwnership(taken?.workspaceId, user.workspace.id);

      const integration = await tx.integration.upsert({
        where: {
          workspaceId_provider: {
            workspaceId: user.workspace.id,
            provider: IntegrationProvider.WHATSAPP,
          },
        },
        create: {
          workspaceId: user.workspace.id,
          provider: IntegrationProvider.WHATSAPP,
          name: 'WhatsApp Business',
          status: IntegrationStatus.CONNECTED,
          lastSyncAt: verified.verifiedAt,
        },
        update: { status: IntegrationStatus.CONNECTED, lastSyncAt: verified.verifiedAt },
      });

      const data = {
        integrationId: integration.id,
        wabaId: input.wabaId,
        displayPhoneNumber: verified.displayPhoneNumber,
        businessName: verified.verifiedName ?? (input.businessName?.trim() || null),
        accessTokenEncrypted,
        status: WhatsAppChannelStatus.CONNECTED,
        qualityRating: verified.qualityRating,
        lastHealthCheckAt: verified.verifiedAt,
        webhookSubscribedAt: verified.subscribedAt,
        metadata: { graphVersion: process.env.WHATSAPP_GRAPH_API_VERSION ?? 'v26.0' },
      } as const;

      const saved = taken
        ? await tx.whatsAppChannel.update({
            where: { id: taken.id, workspaceId: user.workspace.id },
            data,
            select: { id: true, displayPhoneNumber: true, businessName: true, status: true },
          })
        : await tx.whatsAppChannel.create({
            data: {
              ...data,
              workspaceId: user.workspace.id,
              phoneNumberId: verified.phoneNumberId,
            },
            select: { id: true, displayPhoneNumber: true, businessName: true, status: true },
          });

      await recordAudit(
        {
          workspaceId: user.workspace.id,
          actorId: user.id,
          action: taken ? 'whatsapp.credentials_updated' : 'whatsapp.channel_connected',
          entity: 'WhatsAppChannel',
          entityId: saved.id,
          metadata: { phoneNumberId: verified.phoneNumberId, wabaId: input.wabaId },
        },
        tx,
      );
      return saved;
    });
  } catch (error) {
    if (isWhatsAppChannelOwnershipConflict(error)) {
      return NextResponse.json(
        { message: 'Ese numero ya esta conectado a otra cuenta.' },
        { status: 409 },
      );
    }
    throw error;
  }

  return NextResponse.json({ data: channel }, { status: 201 });
}
