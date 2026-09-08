import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  AgentRunStatus,
  ConversationMode,
  ConversationStatus,
} from '../../../../../../generated/prisma/client';
import { requireCurrentUser } from '@/lib/auth';
import { canManageChannels } from '@/lib/conversations';
import { parseBody } from '@/lib/http';
import { prisma } from '@/lib/prisma';
import { runAgent } from '@/lib/agents/runner';

const testSchema = z.object({
  versionId: z.string().min(1),
  message: z.string().min(1).max(2000),
});

/**
 * Simulador: prueba una version del agente sin publicarla y sin que el cliente
 * reciba nada.
 *
 * La spec lo pide como paso previo obligatorio a publicar. Corre sobre una
 * conversacion desechable del propio workspace, asi el agente ve datos reales
 * de contexto pero no toca a ningun contacto real ni manda mensajes.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireCurrentUser();

  if (!canManageChannels(user.role)) {
    return NextResponse.json({ message: 'Solo el owner o un admin puede probar agentes.' }, { status: 403 });
  }

  const parsed = await parseBody(request, testSchema);
  if (!parsed.ok) return parsed.response;

  const version = await prisma.agentVersion.findFirst({
    where: {
      id: parsed.data.versionId,
      agentDefinitionId: id,
      definition: { workspaceId: user.workspace.id },
    },
    include: { definition: true },
  });

  if (!version) return NextResponse.json({ message: 'Version no encontrada' }, { status: 404 });

  // Canal y contacto de laboratorio, reutilizados entre pruebas.
  const channel = await prisma.whatsAppChannel.upsert({
    where: { phoneNumberId: `simulador:${user.workspace.id}` },
    create: {
      workspaceId: user.workspace.id,
      wabaId: 'simulador',
      phoneNumberId: `simulador:${user.workspace.id}`,
      displayPhoneNumber: 'simulador',
      status: 'DISCONNECTED',
      metadata: { simulator: true },
    },
    update: {},
  });

  const contact = await prisma.contact.upsert({
    where: {
      workspaceId_email: { workspaceId: user.workspace.id, email: 'simulador@upzites.local' },
    },
    create: {
      workspaceId: user.workspace.id,
      firstName: 'Cliente',
      lastName: 'de prueba',
      email: 'simulador@upzites.local',
      source: 'Simulador',
      tags: ['simulador'],
    },
    update: {},
  });

  const conversation = await prisma.conversation.upsert({
    where: { channelId_contactId: { channelId: channel.id, contactId: contact.id } },
    create: {
      workspaceId: user.workspace.id,
      channelId: channel.id,
      contactId: contact.id,
      mode: ConversationMode.AI_ACTIVE,
      status: ConversationStatus.OPEN,
    },
    update: { mode: ConversationMode.AI_ACTIVE, status: ConversationStatus.OPEN },
  });

  await prisma.message.create({
    data: {
      workspaceId: user.workspace.id,
      conversationId: conversation.id,
      direction: 'INBOUND',
      senderType: 'CONTACT',
      text: parsed.data.message,
      status: 'DELIVERED',
    },
  });

  // La version en prueba se publica temporalmente: el runner usa la publicada.
  // Se restaura el estado anterior pase lo que pase, para no dejar publicada
  // por accidente una version que el owner no aprobo.
  const previouslyPublished = await prisma.agentVersion.findFirst({
    where: { agentDefinitionId: id, status: 'PUBLISHED' },
    select: { id: true },
  });

  const originalStatus = version.status;

  try {
    await prisma.$transaction([
      prisma.agentVersion.updateMany({
        where: { agentDefinitionId: id, status: 'PUBLISHED' },
        data: { status: 'ARCHIVED' },
      }),
      prisma.agentVersion.update({ where: { id: version.id }, data: { status: 'PUBLISHED' } }),
    ]);

    const result = await runAgent({
      workspaceId: user.workspace.id,
      conversationId: conversation.id,
      trigger: 'simulador',
      dryRun: true,
    });

    return NextResponse.json({
      data: {
        status: result.status,
        reply: result.reply ?? null,
        escalated: result.escalated ?? false,
        toolCalls: result.toolCalls ?? [],
        note:
          result.status === AgentRunStatus.ABORTED
            ? result.skippedReason
            : 'Respuesta de prueba: no se envio nada al cliente.',
      },
    });
  } finally {
    await prisma.$transaction([
      prisma.agentVersion.update({ where: { id: version.id }, data: { status: originalStatus } }),
      ...(previouslyPublished
        ? [
            prisma.agentVersion.update({
              where: { id: previouslyPublished.id },
              data: { status: 'PUBLISHED' },
            }),
          ]
        : []),
    ]);
  }
}
