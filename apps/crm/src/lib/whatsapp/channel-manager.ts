import { createHash } from 'node:crypto';
import {
  AgentVersionStatus,
  IntegrationProvider,
  IntegrationStatus,
  MembershipStatus,
  WhatsAppChannelStatus,
  type Prisma,
  type WorkspaceRole,
} from '../../../generated/prisma/client';
import { canManageChannels } from '../conversations';
import { decryptSecret, encryptSecret } from '../crypto';
import { recordAudit } from '../domain/audit';
import { assertFeature } from '../entitlements';
import { assertChannelConnectAllowed } from '../entitlements/channels';
import { withEntitlementLock } from '../entitlements/lock';
import { sendChannelMessage } from '../channels/outbound';
import { prisma } from '../prisma';
import { recordChannelError, usableFlows } from './channel-runtime';
import { channelDisplayStatus, webhookDisplayStatus, type ChannelSettingsInput } from './channel-settings';
import { MetaWhatsAppError, checkWebhookSubscription, verifyAndSubscribeWhatsAppChannel, type VerifiedWhatsAppChannel } from './meta';
import { assertWhatsAppChannelOwnership } from './ownership';

/**
 * Punto 8 — WhatsApp Channel Manager.
 *
 * Administra los numeros que YA existen como WhatsAppChannel: no hay otro
 * modelo de canal, otra bandeja ni otro pipeline de mensajes. Todo lo que un
 * cliente puede hacer sobre un numero pasa por aqui con su workspace y su rol,
 * y queda en la auditoria con la entidad `WhatsAppChannel`.
 */

export class ChannelManagerError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code = 'CHANNEL_ERROR',
  ) {
    super(message);
    this.name = 'ChannelManagerError';
  }
}

export type ChannelActor = { id: string; workspaceId: string; role: WorkspaceRole };

function assertManager(actor: ChannelActor) {
  if (!canManageChannels(actor.role)) {
    throw new ChannelManagerError('Solo el owner o un admin puede administrar los números de WhatsApp.', 403, 'FORBIDDEN');
  }
}

/** Un canal ajeno responde igual que uno inexistente: no se confirma que exista. */
async function ownChannel(workspaceId: string, id: string) {
  const channel = await prisma.whatsAppChannel.findFirst({ where: { id, workspaceId } });
  if (!channel) throw new ChannelManagerError('Número no encontrado.', 404, 'NOT_FOUND');
  return channel;
}

function hasToken(channel: { accessTokenEncrypted: string | null }) {
  return Boolean(channel.accessTokenEncrypted || process.env.WHATSAPP_SYSTEM_ACCESS_TOKEN);
}

// --- Lectura ------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

const listSelect = {
  id: true,
  label: true,
  usage: true,
  wabaId: true,
  phoneNumberId: true,
  displayPhoneNumber: true,
  businessName: true,
  status: true,
  connectionMethod: true,
  qualityRating: true,
  messagingLimit: true,
  aiEnabled: true,
  aiSchedule: true,
  attentionTimezone: true,
  attentionStartMinute: true,
  attentionEndMinute: true,
  attentionDays: true,
  noProductBehavior: true,
  defaultAgentId: true,
  defaultProductId: true,
  defaultFlowId: true,
  fallbackUserId: true,
  accessTokenEncrypted: true,
  webhookSubscribedAt: true,
  lastHealthCheckAt: true,
  lastWebhookAt: true,
  lastInboundAt: true,
  lastErrorCode: true,
  lastErrorMessage: true,
  lastErrorAt: true,
  planLimitedAt: true,
  createdAt: true,
  defaultAgent: { select: { id: true, name: true, key: true } },
  defaultProduct: { select: { id: true, name: true, status: true } },
  defaultFlow: { select: { id: true, name: true, status: true } },
  fallbackUser: { select: { id: true, name: true } },
} satisfies Prisma.WhatsAppChannelSelect;

type ChannelRow = Prisma.WhatsAppChannelGetPayload<{ select: typeof listSelect }>;

/** Nunca devuelve el token, ni cifrado: solo si existe. */
function present(row: ChannelRow, stats: { received7d: number; failed7d: number }, now: Date) {
  const { accessTokenEncrypted, ...rest } = row;
  return {
    ...rest,
    hasToken: hasToken({ accessTokenEncrypted }),
    displayStatus: channelDisplayStatus({ status: row.status, lastHealthCheckAt: row.lastHealthCheckAt, lastErrorCode: row.lastErrorCode, hasToken: hasToken({ accessTokenEncrypted }) }),
    webhookStatus: webhookDisplayStatus(row, now),
    stats,
  };
}

async function channelStats(workspaceId: string, channelIds: string[], now: Date) {
  if (channelIds.length === 0) return new Map<string, { received7d: number; failed7d: number }>();
  const since = new Date(now.getTime() - 7 * DAY_MS);
  const rows = await prisma.$queryRaw<{ channel_id: string; received: bigint; failed: bigint }[]>`
    SELECT c.channel_id,
           COUNT(*) FILTER (WHERE m.direction = 'INBOUND') AS received,
           COUNT(*) FILTER (WHERE m.direction = 'OUTBOUND' AND m.status = 'FAILED') AS failed
      FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
     WHERE m.workspace_id = ${workspaceId}
       AND c.workspace_id = ${workspaceId}
       AND c.channel_id = ANY(${channelIds})
       AND m.created_at >= ${since}
     GROUP BY c.channel_id`;
  return new Map(rows.map((row) => [row.channel_id, { received7d: Number(row.received), failed7d: Number(row.failed) }]));
}

export async function listChannels(workspaceId: string, now = new Date()) {
  const rows = await prisma.whatsAppChannel.findMany({ where: { workspaceId }, orderBy: { createdAt: 'asc' }, select: listSelect });
  const stats = await channelStats(workspaceId, rows.map((row) => row.id), now);
  return rows.map((row) => present(row, stats.get(row.id) ?? { received7d: 0, failed7d: 0 }, now));
}

export type ManagedChannel = Awaited<ReturnType<typeof listChannels>>[number];

export async function getChannel(workspaceId: string, id: string, now = new Date()) {
  const row = await prisma.whatsAppChannel.findFirst({ where: { id, workspaceId }, select: listSelect });
  if (!row) throw new ChannelManagerError('Número no encontrado.', 404, 'NOT_FOUND');
  const [stats, activity] = await Promise.all([
    channelStats(workspaceId, [row.id], now),
    prisma.auditLog.findMany({
      where: { workspaceId, entity: 'WhatsAppChannel', entityId: row.id },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: { id: true, action: true, metadata: true, createdAt: true, actorId: true },
    }),
  ]);
  return { ...present(row, stats.get(row.id) ?? { received7d: 0, failed7d: 0 }, now), activity };
}

/** Opciones elegibles para un numero: solo del workspace y en estado usable. */
export async function channelOptions(workspaceId: string) {
  const [agents, products, flows, members] = await Promise.all([
    prisma.agentDefinition.findMany({
      where: { workspaceId, isActive: true, planLimitedAt: null, versions: { some: { status: AgentVersionStatus.PUBLISHED } } },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, key: true },
    }),
    prisma.product.findMany({ where: { workspaceId, status: 'ACTIVE' }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    usableFlows(workspaceId),
    prisma.workspaceMembership.findMany({
      where: { workspaceId, status: MembershipStatus.ACTIVE },
      orderBy: { createdAt: 'asc' },
      select: { user: { select: { id: true, name: true } } },
    }),
  ]);
  return { agents, products, flows, members: members.map((member) => member.user) };
}

// --- Configuracion ------------------------------------------------------------

/**
 * Guarda la configuracion de un numero. Cada referencia se comprueba contra el
 * workspace del actor: un id de otro tenant responde como inexistente.
 */
export async function updateChannelSettings(actor: ChannelActor, id: string, input: ChannelSettingsInput) {
  assertManager(actor);
  const channel = await ownChannel(actor.workspaceId, id);
  const workspaceId = actor.workspaceId;

  if (input.defaultAgentId) {
    await assertFeature(workspaceId, 'agents');
    const agent = await prisma.agentDefinition.findFirst({
      where: { id: input.defaultAgentId, workspaceId, isActive: true, planLimitedAt: null, versions: { some: { status: AgentVersionStatus.PUBLISHED } } },
      select: { id: true },
    });
    if (!agent) throw new ChannelManagerError('Ese agente no existe en este workspace o no tiene una versión publicada.', 400, 'INVALID_AGENT');
  }
  if (input.defaultProductId) {
    const product = await prisma.product.findFirst({ where: { id: input.defaultProductId, workspaceId, status: 'ACTIVE' }, select: { id: true } });
    if (!product) throw new ChannelManagerError('Ese producto no existe en este workspace o no está activo.', 400, 'INVALID_PRODUCT');
  }
  if (input.defaultFlowId) {
    const [flow] = await usableFlows(workspaceId, input.defaultFlowId);
    if (!flow) {
      throw new ChannelManagerError('Esa automatización no existe en este workspace o no está publicada para mensajes de WhatsApp.', 400, 'INVALID_FLOW');
    }
  }
  if (input.fallbackUserId) {
    const member = await prisma.workspaceMembership.findFirst({
      where: { workspaceId, userId: input.fallbackUserId, status: MembershipStatus.ACTIVE },
      select: { id: true },
    });
    if (!member) throw new ChannelManagerError('Esa persona no es parte activa de este workspace.', 400, 'INVALID_USER');
  }

  const changed = Object.entries(input)
    .filter(([key, value]) => JSON.stringify((channel as Record<string, unknown>)[key]) !== JSON.stringify(value))
    .map(([key]) => key);

  const data: Prisma.WhatsAppChannelUncheckedUpdateInput = { ...input };
  if (input.label !== undefined) data.label = input.label?.trim() || null;

  await prisma.$transaction(async (tx) => {
    await tx.whatsAppChannel.update({ where: { id: channel.id, workspaceId }, data });
    await recordAudit(
      { workspaceId, actorId: actor.id, action: 'whatsapp.settings_updated', entity: 'WhatsAppChannel', entityId: channel.id, metadata: { changed } },
      tx,
    );
  });
  return getChannel(workspaceId, channel.id);
}

// --- Conexion -----------------------------------------------------------------

export type ConnectionMethod = 'EMBEDDED_SIGNUP' | 'MANUAL';

/**
 * Persiste un numero que Meta YA verifico (verifyAndSubscribe). Comun a la
 * conexion manual y a Embedded Signup.
 *
 * Bajo el lock de `channels.max`: dos conexiones simultaneas no superan el
 * plan. El unique global de phone_number_id impide que dos workspaces se
 * queden con el mismo numero; reconectar un numero propio lo actualiza.
 */
export async function saveVerifiedChannel(
  actor: ChannelActor,
  input: { wabaId: string; accessToken: string; businessName?: string | null; method: ConnectionMethod; verified: VerifiedWhatsAppChannel },
) {
  assertManager(actor);
  const workspaceId = actor.workspaceId;
  const { verified } = input;
  const accessTokenEncrypted = encryptSecret(input.accessToken);

  return withEntitlementLock(workspaceId, 'channels.max', async (tx, guard) => {
    const taken = await tx.whatsAppChannel.findUnique({
      where: { phoneNumberId: verified.phoneNumberId },
      select: { id: true, workspaceId: true, status: true },
    });
    assertWhatsAppChannelOwnership(taken?.workspaceId, workspaceId);
    if (!(taken && taken.status !== WhatsAppChannelStatus.DISCONNECTED)) await guard.assertCanGrow();

    const integration = await tx.integration.upsert({
      where: { workspaceId_provider: { workspaceId, provider: IntegrationProvider.WHATSAPP } },
      create: { workspaceId, provider: IntegrationProvider.WHATSAPP, name: 'WhatsApp Business', status: IntegrationStatus.CONNECTED, lastSyncAt: verified.verifiedAt },
      update: { status: IntegrationStatus.CONNECTED, lastSyncAt: verified.verifiedAt },
    });

    const data = {
      integrationId: integration.id,
      wabaId: input.wabaId,
      displayPhoneNumber: verified.displayPhoneNumber,
      businessName: verified.verifiedName ?? (input.businessName?.trim() || null),
      accessTokenEncrypted,
      status: WhatsAppChannelStatus.CONNECTED,
      connectionMethod: input.method,
      qualityRating: verified.qualityRating,
      lastHealthCheckAt: verified.verifiedAt,
      webhookSubscribedAt: verified.subscribedAt,
      lastErrorCode: null,
      lastErrorMessage: null,
      lastErrorAt: null,
      metadata: { graphVersion: process.env.WHATSAPP_GRAPH_API_VERSION ?? 'v26.0' },
    } as const;

    const select = { id: true, displayPhoneNumber: true, businessName: true, status: true } as const;
    const saved = taken
      ? await tx.whatsAppChannel.update({ where: { id: taken.id, workspaceId }, data, select })
      : await tx.whatsAppChannel.create({ data: { ...data, workspaceId, phoneNumberId: verified.phoneNumberId }, select });

    const action = !taken
      ? 'whatsapp.channel_connected'
      : taken.status === WhatsAppChannelStatus.DISCONNECTED
        ? 'whatsapp.channel_reconnected'
        : 'whatsapp.credentials_updated';
    await recordAudit(
      { workspaceId, actorId: actor.id, action, entity: 'WhatsAppChannel', entityId: saved.id, metadata: { phoneNumberId: verified.phoneNumberId, wabaId: input.wabaId, method: input.method } },
      tx,
    );
    return { ...saved, reconnected: action === 'whatsapp.channel_reconnected', created: !taken };
  });
}

/**
 * Un intento de conexion fallido queda registrado: en la auditoria siempre y,
 * si el numero ya existe en este workspace, como su ultimo error. Un numero
 * conectado no se degrada por un intento fallido de cambiar su credencial.
 */
export async function recordChannelConnectFailure(actor: ChannelActor, phoneNumberId: string, error: unknown) {
  const code = error instanceof MetaWhatsAppError ? error.code : 'CONNECT_FAILED';
  const message = error instanceof Error ? error.message : 'No se pudo conectar el número.';
  const existing = await prisma.whatsAppChannel.findFirst({ where: { phoneNumberId, workspaceId: actor.workspaceId }, select: { id: true, workspaceId: true, status: true } });
  if (existing) {
    await recordChannelError(existing, { code, message }, { actorId: actor.id, action: 'whatsapp.connect_failed' });
    return;
  }
  await recordAudit({ workspaceId: actor.workspaceId, actorId: actor.id, action: 'whatsapp.connect_failed', entity: 'WhatsAppChannel', metadata: { phoneNumberId, code } });
}

/** Comprobacion previa al lock (no habla con Meta si el plan no admite otro canal). */
export async function assertCanConnect(actor: ChannelActor, phoneNumberId: string) {
  assertManager(actor);
  await assertChannelConnectAllowed(actor.workspaceId, { channel: 'WHATSAPP', phoneNumberId });
  const taken = await prisma.whatsAppChannel.findUnique({ where: { phoneNumberId }, select: { workspaceId: true } });
  assertWhatsAppChannelOwnership(taken?.workspaceId, actor.workspaceId);
}

function openToken(channel: { accessTokenEncrypted: string | null }) {
  if (!channel.accessTokenEncrypted) {
    throw new ChannelManagerError('Este número no tiene credenciales guardadas: vuelve a conectarlo.', 409, 'NO_TOKEN');
  }
  try {
    return decryptSecret(channel.accessTokenEncrypted);
  } catch {
    throw new ChannelManagerError('No se pudo abrir la credencial guardada. Vuelve a conectar el número.', 503, 'TOKEN_UNREADABLE');
  }
}

/** Vuelve a comprobar contra Meta (reconectar con la credencial guardada). */
export async function verifyChannel(actor: ChannelActor, id: string) {
  assertManager(actor);
  const channel = await ownChannel(actor.workspaceId, id);
  const accessToken = openToken(channel);

  if (channel.status === WhatsAppChannelStatus.DISCONNECTED) {
    // Reactivar suma un canal: el plan decide antes de hablar con Meta.
    await assertChannelConnectAllowed(actor.workspaceId, { channel: 'WHATSAPP', phoneNumberId: channel.phoneNumberId });
  }

  let verified: VerifiedWhatsAppChannel;
  try {
    verified = await verifyAndSubscribeWhatsAppChannel({ wabaId: channel.wabaId, phoneNumberId: channel.phoneNumberId, accessToken });
  } catch (error) {
    if (error instanceof MetaWhatsAppError) {
      // Una caida de Meta no es culpa del canal: no se marca en error.
      if (error.code !== 'META_UNAVAILABLE') {
        await recordChannelError(channel, { code: error.code, message: error.message }, { status: WhatsAppChannelStatus.NEEDS_ATTENTION, actorId: actor.id, action: 'whatsapp.verification_failed' });
      }
      throw new ChannelManagerError(error.message, error.httpStatus, error.code);
    }
    throw error;
  }

  return saveVerifiedChannel(actor, { wabaId: channel.wabaId, accessToken, method: (channel.connectionMethod as ConnectionMethod) ?? 'MANUAL', verified });
}

/**
 * Desconecta: borra el token cifrado y deja de procesar entrantes del numero.
 * El historial y la configuracion se conservan: reconectar devuelve el numero
 * tal como estaba. Los envios encolados del numero ya no salen (sin token).
 */
export async function disconnectChannel(actor: ChannelActor, id: string) {
  assertManager(actor);
  const channel = await ownChannel(actor.workspaceId, id);
  const workspaceId = actor.workspaceId;
  await prisma.$transaction(async (tx) => {
    await tx.whatsAppChannel.update({
      where: { id: channel.id, workspaceId },
      data: { status: WhatsAppChannelStatus.DISCONNECTED, accessTokenEncrypted: null, webhookSubscribedAt: null, lastHealthCheckAt: null },
    });
    const otherConnected = await tx.whatsAppChannel.count({ where: { workspaceId, id: { not: channel.id }, status: WhatsAppChannelStatus.CONNECTED } });
    await tx.integration.updateMany({
      where: { workspaceId, provider: IntegrationProvider.WHATSAPP },
      data: { status: otherConnected > 0 ? IntegrationStatus.CONNECTED : IntegrationStatus.DISCONNECTED },
    });
    await recordAudit({ workspaceId, actorId: actor.id, action: 'whatsapp.channel_disconnected', entity: 'WhatsAppChannel', entityId: channel.id }, tx);
  });
  return { ok: true };
}

// --- Pruebas ------------------------------------------------------------------

/**
 * "Probar webhook": pregunta a META si la WABA tiene la app suscrita y junta
 * lo que realmente llego (ultimo evento). No fabrica un evento propio: un
 * evento simulado probaria nuestro codigo, no la conexion con Meta.
 */
export async function testWebhook(actor: ChannelActor, id: string) {
  assertManager(actor);
  const channel = await ownChannel(actor.workspaceId, id);
  const accessToken = openToken(channel);
  const config = {
    verifyTokenConfigured: Boolean(process.env.WHATSAPP_VERIFY_TOKEN),
    appSecretConfigured: Boolean(process.env.META_APP_SECRET),
  };

  let subscription: Awaited<ReturnType<typeof checkWebhookSubscription>>;
  try {
    subscription = await checkWebhookSubscription({ wabaId: channel.wabaId, accessToken });
  } catch (error) {
    if (error instanceof MetaWhatsAppError) {
      if (error.code !== 'META_UNAVAILABLE') {
        await recordChannelError(channel, { code: error.code, message: error.message }, { actorId: actor.id, action: 'whatsapp.webhook_test_failed' });
      }
      throw new ChannelManagerError(error.message, error.httpStatus, error.code);
    }
    throw error;
  }

  await prisma.$transaction(async (tx) => {
    await tx.whatsAppChannel.update({
      where: { id: channel.id, workspaceId: actor.workspaceId },
      data: { webhookSubscribedAt: subscription.subscribed ? channel.webhookSubscribedAt ?? subscription.checkedAt : null },
    });
    await recordAudit(
      { workspaceId: actor.workspaceId, actorId: actor.id, action: 'whatsapp.webhook_tested', entity: 'WhatsAppChannel', entityId: channel.id, metadata: { subscribed: subscription.subscribed, appCount: subscription.appCount, ...config } },
      tx,
    );
  });

  return {
    subscribed: subscription.subscribed,
    lastWebhookAt: channel.lastWebhookAt,
    lastInboundAt: channel.lastInboundAt,
    ...config,
  };
}

/**
 * "Probar envio autorizado": solo a un contacto que escribio a ESTE numero y
 * cuya ventana de 24 h sigue abierta (es el unico envio libre que permite
 * WhatsApp sin plantilla). Pasa por el outbox normal, con una clave de
 * idempotencia: un doble clic no manda dos mensajes.
 */
export async function testSend(actor: ChannelActor, id: string, input: { conversationId: string; text: string }, now = new Date()) {
  assertManager(actor);
  const channel = await ownChannel(actor.workspaceId, id);
  if (channelDisplayStatus({ status: channel.status, lastHealthCheckAt: channel.lastHealthCheckAt, lastErrorCode: channel.lastErrorCode, hasToken: hasToken(channel) }) !== 'CONNECTED') {
    throw new ChannelManagerError('El número no está conectado y verificado con Meta.', 409, 'NOT_CONNECTED');
  }
  const conversation = await prisma.conversation.findFirst({
    where: { id: input.conversationId, workspaceId: actor.workspaceId, channelId: channel.id },
    select: { id: true, customerServiceWindowEndsAt: true },
  });
  if (!conversation) throw new ChannelManagerError('Esa conversación no es de este número.', 404, 'NOT_FOUND');
  if (!conversation.customerServiceWindowEndsAt || conversation.customerServiceWindowEndsAt <= now) {
    throw new ChannelManagerError('La ventana de 24 h de ese contacto está cerrada: debe escribir primero al número.', 409, 'WINDOW_CLOSED');
  }

  const minute = Math.floor(now.getTime() / 60_000);
  const digest = createHash('sha256').update(input.text).digest('hex').slice(0, 16);
  const message = await sendChannelMessage({
    workspaceId: actor.workspaceId,
    conversationId: conversation.id,
    text: input.text,
    senderType: 'USER',
    senderUserId: actor.id,
    origin: 'HUMAN',
    idempotencyKey: `channel-test:${channel.id}:${conversation.id}:${digest}:${minute}`,
  });
  await recordAudit({
    workspaceId: actor.workspaceId,
    actorId: actor.id,
    action: 'whatsapp.test_send_queued',
    entity: 'WhatsAppChannel',
    entityId: channel.id,
    metadata: { conversationId: conversation.id },
  });
  return message;
}

/** Conversaciones de este numero con ventana abierta: destinatarios validos de la prueba. */
export async function testRecipients(workspaceId: string, channelId: string, now = new Date()) {
  const rows = await prisma.conversation.findMany({
    where: { workspaceId, channelId, customerServiceWindowEndsAt: { gt: now } },
    orderBy: { lastInboundAt: 'desc' },
    take: 20,
    select: { id: true, customerServiceWindowEndsAt: true, contact: { select: { firstName: true, lastName: true, phone: true } } },
  });
  return rows.map((row) => ({
    conversationId: row.id,
    name: `${row.contact.firstName} ${row.contact.lastName}`.trim(),
    phone: row.contact.phone,
    windowEndsAt: row.customerServiceWindowEndsAt,
  }));
}

