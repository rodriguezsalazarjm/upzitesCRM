import { ConversationMode, ConversationStatus, UserRole } from '../../generated/prisma/client';
import { requireCurrentUser } from './auth';
import { recordAudit } from './domain/audit';
import { prisma } from './prisma';

/**
 * Consultas y acciones de la bandeja. Toda funcion resuelve el workspace desde
 * la sesion: ninguna acepta un workspaceId por parametro.
 */
export type ConversationListItem = {
  id: string;
  contactName: string;
  contactPhone: string | null;
  lastMessageAt: string;
  lastMessagePreview: string | null;
  mode: ConversationMode;
  status: ConversationStatus;
  unreadCount: number;
  assignedUserId: string | null;
  assigneeName: string | null;
  temperature: string;
  withinServiceWindow: boolean;
};

export type ConversationFilters = {
  status?: ConversationStatus;
  assignedUserId?: string;
  onlyUnread?: boolean;
};

export async function listConversations(filters: ConversationFilters = {}) {
  const user = await requireCurrentUser();

  const conversations = await prisma.conversation.findMany({
    where: {
      workspaceId: user.workspace.id,
      status: filters.status ?? undefined,
      assignedUserId: filters.assignedUserId ?? undefined,
      ...(filters.onlyUnread ? { unreadCount: { gt: 0 } } : {}),
    },
    orderBy: { lastMessageAt: 'desc' },
    take: 100,
    include: {
      contact: { select: { firstName: true, lastName: true, phone: true, temperature: true } },
      assignee: { select: { name: true } },
      messages: { orderBy: { createdAt: 'desc' }, take: 1, select: { text: true } },
    },
  });

  const now = Date.now();

  return conversations.map<ConversationListItem>((conversation) => ({
    id: conversation.id,
    contactName: `${conversation.contact.firstName} ${conversation.contact.lastName}`.trim(),
    contactPhone: conversation.contact.phone,
    lastMessageAt: conversation.lastMessageAt.toISOString(),
    lastMessagePreview: conversation.messages[0]?.text ?? null,
    mode: conversation.mode,
    status: conversation.status,
    unreadCount: conversation.unreadCount,
    assignedUserId: conversation.assignedUserId,
    assigneeName: conversation.assignee?.name ?? null,
    temperature: conversation.contact.temperature,
    withinServiceWindow: Boolean(
      conversation.customerServiceWindowEndsAt &&
        conversation.customerServiceWindowEndsAt.getTime() > now,
    ),
  }));
}

export async function getConversationDetail(conversationId: string) {
  const user = await requireCurrentUser();

  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, workspaceId: user.workspace.id },
    include: {
      contact: true,
      assignee: { select: { id: true, name: true } },
      channel: { select: { displayPhoneNumber: true, status: true } },
      messages: { orderBy: { createdAt: 'asc' }, take: 200 },
    },
  });

  if (!conversation) return null;

  // Abrir la conversacion en la bandeja la marca como leida.
  if (conversation.unreadCount > 0) {
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { unreadCount: 0 },
    });
  }

  // La ventana se calcula aqui y no en el render: leer el reloj durante el
  // render de un componente lo vuelve impuro.
  const withinServiceWindow = Boolean(
    conversation.customerServiceWindowEndsAt &&
      conversation.customerServiceWindowEndsAt.getTime() > Date.now(),
  );

  return { ...conversation, withinServiceWindow };
}

/**
 * Un humano toma la conversacion. Mientras este en HUMAN_ACTIVE la IA no
 * responde (lo aplica `queueOutboundMessage`).
 */
export async function takeOverConversation(conversationId: string) {
  const user = await requireCurrentUser();

  const updated = await prisma.conversation.updateMany({
    where: { id: conversationId, workspaceId: user.workspace.id },
    data: {
      mode: ConversationMode.HUMAN_ACTIVE,
      assignedUserId: user.id,
      status: ConversationStatus.OPEN,
    },
  });

  if (updated.count === 0) return null;

  await recordAudit({
    workspaceId: user.workspace.id,
    actorId: user.id,
    action: 'conversation.taken_over',
    entity: 'Conversation',
    entityId: conversationId,
  });

  return { mode: ConversationMode.HUMAN_ACTIVE, assignedUserId: user.id };
}

/** Devuelve la conversacion a la IA. */
export async function releaseConversationToAi(conversationId: string) {
  const user = await requireCurrentUser();

  const updated = await prisma.conversation.updateMany({
    where: { id: conversationId, workspaceId: user.workspace.id },
    data: { mode: ConversationMode.AI_ACTIVE, assignedUserId: null },
  });

  if (updated.count === 0) return null;

  await recordAudit({
    workspaceId: user.workspace.id,
    actorId: user.id,
    action: 'conversation.released_to_ai',
    entity: 'Conversation',
    entityId: conversationId,
  });

  return { mode: ConversationMode.AI_ACTIVE };
}

/** Asigna la conversacion a otro usuario del mismo workspace. */
export async function assignConversation(conversationId: string, assigneeId: string) {
  const user = await requireCurrentUser();

  // El destinatario debe pertenecer al workspace: un id de otro tenant no vale.
  const assignee = await prisma.user.findFirst({
    where: { id: assigneeId, workspaceId: user.workspace.id },
    select: { id: true, name: true },
  });

  if (!assignee) return null;

  const updated = await prisma.conversation.updateMany({
    where: { id: conversationId, workspaceId: user.workspace.id },
    data: { assignedUserId: assignee.id, mode: ConversationMode.HUMAN_ACTIVE },
  });

  if (updated.count === 0) return null;

  await recordAudit({
    workspaceId: user.workspace.id,
    actorId: user.id,
    action: 'conversation.assigned',
    entity: 'Conversation',
    entityId: conversationId,
    metadata: { assigneeId: assignee.id },
  });

  return { assignedUserId: assignee.id, assigneeName: assignee.name };
}

/** Solo OWNER y ADMIN administran la conexion del canal. */
export function canManageChannels(role: UserRole) {
  return role === UserRole.OWNER || role === UserRole.ADMIN;
}
