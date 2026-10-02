import { NextResponse } from 'next/server';
import { z } from 'zod';
import { AgentKind, ConversationMode, ConversationStatus } from '../../../../../../../generated/prisma/client';
import { requireCurrentUser } from '@/lib/auth';
import { runAgent } from '@/lib/agents/runner';
import { canManageChannels } from '@/lib/conversations';
import { prisma } from '@/lib/prisma';

const inputSchema = z.object({ message: z.string().trim().min(1).max(2_000) }).strict();

async function simulator(workspaceId: string, productId: string) {
  const product = await prisma.product.findFirst({ where: { id: productId, workspaceId }, select: { id: true } });
  if (!product) return null;
  const channel = await prisma.whatsAppChannel.upsert({
    where: { phoneNumberId: `simulador-producto:${workspaceId}` },
    create: { workspaceId, wabaId: 'simulador', phoneNumberId: `simulador-producto:${workspaceId}`, displayPhoneNumber: 'simulador producto', status: 'DISCONNECTED', metadata: { simulator: true, productSalesBrain: true } },
    update: {},
  });
  const contact = await prisma.contact.upsert({
    where: { workspaceId_email: { workspaceId, email: 'simulador-producto@upzites.local' } },
    create: { workspaceId, firstName: 'Lead', lastName: 'de prueba', email: 'simulador-producto@upzites.local', source: 'Simulador Product Sales Brain', tags: ['simulador'] },
    update: {},
  });
  const existing = await prisma.conversation.findUnique({ where: { channelId_contactId: { channelId: channel.id, contactId: contact.id } } });
  if (existing?.productId && existing.productId !== productId) {
    await prisma.message.deleteMany({ where: { conversationId: existing.id } });
  }
  const conversation = await prisma.conversation.upsert({
    where: { channelId_contactId: { channelId: channel.id, contactId: contact.id } },
    create: { workspaceId, channelId: channel.id, contactId: contact.id, productId, mode: ConversationMode.AI_ACTIVE, status: ConversationStatus.OPEN },
    update: { productId, mode: ConversationMode.AI_ACTIVE, status: ConversationStatus.OPEN, summary: null },
  });
  return { conversation, contact };
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireCurrentUser();
  if (!canManageChannels(user.role)) return NextResponse.json({ message: 'Solo el owner o un admin puede probar el agente.' }, { status: 403 });
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message ?? 'Mensaje inválido.' }, { status: 400 });
  const { id } = await params;
  const lab = await simulator(user.workspace.id, id);
  if (!lab) return NextResponse.json({ message: 'Producto no encontrado.' }, { status: 404 });
  const definition = await prisma.agentDefinition.findFirst({
    where: { workspaceId: user.workspace.id, key: AgentKind.SALES, isActive: true },
    include: { versions: { where: { status: { in: ['DRAFT', 'PUBLISHED'] } }, orderBy: { version: 'desc' }, take: 1 } },
  });
  const version = definition?.versions[0];
  if (!version) return NextResponse.json({ message: 'Configura una versión del agente de ventas antes de probar.' }, { status: 409 });
  await prisma.message.create({ data: { workspaceId: user.workspace.id, conversationId: lab.conversation.id, direction: 'INBOUND', senderType: 'CONTACT', text: parsed.data.message, status: 'DELIVERED' } });
  const result = await runAgent({ workspaceId: user.workspace.id, conversationId: lab.conversation.id, trigger: 'product-sales-brain-simulator', dryRun: true, allowSimulatorCheckout: true, agentVersionId: version.id });
  if (result.reply) await prisma.message.create({ data: { workspaceId: user.workspace.id, conversationId: lab.conversation.id, direction: 'OUTBOUND', senderType: 'AI', text: result.reply, status: 'SENT', agentRunId: result.runId } });
  return NextResponse.json({ data: { reply: result.reply, status: result.status, escalated: result.escalated ?? false, toolCalls: result.toolCalls ?? [], context: result.context ?? null, note: result.skippedReason ?? null } });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireCurrentUser();
  if (!canManageChannels(user.role)) return NextResponse.json({ message: 'No autorizado.' }, { status: 403 });
  const { id } = await params;
  const lab = await simulator(user.workspace.id, id);
  if (!lab) return NextResponse.json({ message: 'Producto no encontrado.' }, { status: 404 });
  await prisma.$transaction([
    prisma.message.deleteMany({ where: { conversationId: lab.conversation.id } }),
    prisma.customerOrder.deleteMany({ where: { conversationId: lab.conversation.id, status: 'DRAFT' } }),
    prisma.conversation.update({ where: { id: lab.conversation.id }, data: { summary: null, mode: ConversationMode.AI_ACTIVE, status: ConversationStatus.OPEN } }),
  ]);
  return NextResponse.json({ data: { reset: true } });
}
