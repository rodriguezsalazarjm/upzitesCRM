import { z } from 'zod';
import { Prisma, type MailboxAccount, type MailProvider } from '../../../generated/prisma/client';
import { decryptSecret, encryptSecret } from '../crypto';
import { recordAudit } from '../domain/audit';
import { crossTenantPrisma, prisma } from '../prisma';
import { queuePushSafely } from '../push/events';
import { snapshotPdf } from '../quote-studio/public';
import { sendSalesQuote } from '../quote-studio/service';
import { mailProvider, MAIL_PROVIDERS } from './providers';
import { MailProviderError, type MailAttachmentMeta, type MailTokens, type OutgoingAttachment, type RemoteMessage } from './types';

/**
 * P38: Email Client Lite. El buzón es PERSONAL: cada consulta filtra por
 * workspace Y por dueño. Es correo humano: no pasa por sendEmail (transaccional)
 * ni consume su cuota; nunca se guardan contraseñas, solo tokens OAuth cifrados.
 */
export class MailError extends Error {}

const FIRST_SYNC_DAYS = 14;
const SYNC_OVERLAP_MS = 10 * 60_000;
const SYNC_BATCH = 50;
export const MAX_ATTACHMENTS_BYTES = 15 * 1024 * 1024;

// --- Conexión -----------------------------------------------------------------

export async function connectMailbox(input: { workspaceId: string; userId: string; provider: MailProvider; emailAddress: string; tokens: MailTokens }) {
  const data = {
    accessTokenEncrypted: encryptSecret(input.tokens.accessToken),
    refreshTokenEncrypted: input.tokens.refreshToken ? encryptSecret(input.tokens.refreshToken) : null,
    accessTokenExpiresAt: input.tokens.expiresAt, scopes: input.tokens.scopes, status: 'CONNECTED' as const, lastError: null,
  };
  const key = { workspaceId: input.workspaceId, userId: input.userId, provider: input.provider, emailAddress: input.emailAddress.toLowerCase() };
  const account = await prisma.mailboxAccount.upsert({ where: { workspaceId_userId_provider_emailAddress: key }, create: { ...key, ...data }, update: data });
  await recordAudit({ workspaceId: input.workspaceId, actorId: input.userId, action: 'mailbox.connected', entity: 'MailboxAccount', entityId: account.id, metadata: { provider: input.provider } });
  return account;
}

export const userMailboxes = (workspaceId: string, userId: string) =>
  prisma.mailboxAccount.findMany({ where: { workspaceId, userId }, orderBy: { createdAt: 'asc' }, select: { id: true, provider: true, emailAddress: true, status: true, lastSyncedAt: true, lastError: true } });

async function ownMailbox(workspaceId: string, userId: string, mailboxId: string) {
  const account = await prisma.mailboxAccount.findFirst({ where: { id: mailboxId, workspaceId, userId } });
  if (!account) throw new MailError('Buzón no encontrado.');
  return account;
}

/** Desconectar = revocar (si el proveedor lo permite) y borrar tokens y correos importados. */
export async function disconnectMailbox(workspaceId: string, userId: string, mailboxId: string) {
  const account = await ownMailbox(workspaceId, userId, mailboxId);
  const client = mailProvider(account.provider);
  if (client && account.accessTokenEncrypted) await client.revoke(decryptSecret(account.accessTokenEncrypted)).catch(() => undefined);
  await prisma.mailboxAccount.deleteMany({ where: { id: account.id, workspaceId, userId } });
  await recordAudit({ workspaceId, actorId: userId, action: 'mailbox.disconnected', entity: 'MailboxAccount', entityId: account.id, metadata: { provider: account.provider } });
}

/** Token vigente (renueva si vence en menos de un minuto). Si el proveedor lo rechaza, el buzón queda en ERROR. */
async function accessToken(account: MailboxAccount, db = prisma) {
  const client = mailProvider(account.provider);
  if (!client) throw new MailError(`${MAIL_PROVIDERS[account.provider].label} no está configurado en este servidor.`);
  if (account.status === 'REVOKED' || !account.accessTokenEncrypted) throw new MailError('Vuelve a conectar tu correo.');
  if (!account.accessTokenExpiresAt || account.accessTokenExpiresAt.getTime() > Date.now() + 60_000) return { client, token: decryptSecret(account.accessTokenEncrypted) };
  if (!account.refreshTokenEncrypted) throw await markBroken(account, 'El acceso venció. Vuelve a conectar tu correo.', db);
  try {
    const fresh = await client.refresh(decryptSecret(account.refreshTokenEncrypted));
    await db.mailboxAccount.updateMany({
      where: { id: account.id, workspaceId: account.workspaceId },
      data: { accessTokenEncrypted: encryptSecret(fresh.accessToken), accessTokenExpiresAt: fresh.expiresAt, ...(fresh.refreshToken ? { refreshTokenEncrypted: encryptSecret(fresh.refreshToken) } : {}) },
    });
    return { client, token: fresh.accessToken };
  } catch (error) {
    if (error instanceof MailProviderError && error.authProblem) throw await markBroken(account, 'El proveedor revocó el acceso. Vuelve a conectar tu correo.', db);
    throw error;
  }
}

async function markBroken(account: MailboxAccount, message: string, db = prisma) {
  await db.mailboxAccount.updateMany({ where: { id: account.id, workspaceId: account.workspaceId }, data: { status: 'ERROR', lastError: message } });
  return new MailError(message);
}

/** Traduce errores del proveedor a algo que la persona entiende (y nunca expone tokens ni cuerpos). */
async function withProvider<T>(account: MailboxAccount, run: () => Promise<T>, db = prisma): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof MailProviderError) {
      if (error.authProblem) throw await markBroken(account, 'El proveedor rechazó el acceso. Vuelve a conectar tu correo.', db);
      throw new MailError(`${MAIL_PROVIDERS[account.provider].label} no respondió bien (${error.status || 'red'}). Inténtalo de nuevo.`);
    }
    throw error;
  }
}

// --- Sincronización -----------------------------------------------------------

/** Contacto conocido entre las direcciones (y su empresa; la oportunidad solo si tiene una abierta). */
async function crmMatch(workspaceId: string, addresses: string[], db: Prisma.TransactionClient | typeof prisma = prisma) {
  if (!addresses.length) return null;
  const contact = await db.contact.findFirst({ where: { workspaceId, email: { in: addresses, mode: 'insensitive' } }, select: { id: true, companyId: true } });
  if (!contact) return null;
  const open = await db.opportunity.findMany({ where: { workspaceId, contactId: contact.id, status: 'OPEN' }, select: { id: true }, take: 2 });
  return { contactId: contact.id, companyId: contact.companyId, opportunityId: open.length === 1 ? open[0].id : null };
}

const snippetOf = (text: string) => text.replace(/\s+/g, ' ').trim().slice(0, 160);

/**
 * Guarda lo que trae el proveedor. Idempotente: un mensaje ya importado no se
 * duplica (unique por buzón + id del proveedor), solo actualiza leído/archivado.
 * Mensaje entrante NUEVO de un contacto conocido → actividad, última actividad y aviso al dueño.
 */
export async function storeRemoteMessages(account: MailboxAccount, remote: RemoteMessage[], db = prisma) {
  const own = account.emailAddress.toLowerCase();
  const created: string[] = [];
  for (const m of [...remote].sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime())) {
    const participants = [...new Set([m.from.address, ...m.to, ...m.cc].map((a) => a.toLowerCase()).filter((a) => a && a !== own))];
    const outbound = m.outbound || m.from.address.toLowerCase() === own;
    const existingThread = await db.mailThread.findUnique({ where: { mailboxId_providerThreadId: { mailboxId: account.id, providerThreadId: m.threadId } } });
    const match = existingThread?.contactId ? null : await crmMatch(account.workspaceId, participants, db);
    const thread = existingThread
      ? await db.mailThread.update({
          where: { id: existingThread.id },
          data: {
            participants: [...new Set([...existingThread.participants, ...participants])],
            ...(m.sentAt >= existingThread.lastMessageAt ? { lastMessageAt: m.sentAt, snippet: snippetOf(m.bodyText), unread: !outbound && m.unread, inInbox: m.inInbox || (existingThread.inInbox && outbound) } : {}),
            hasSent: existingThread.hasSent || outbound, hasAttachments: existingThread.hasAttachments || m.attachments.length > 0,
            ...(match ?? {}),
          },
        })
      : await db.mailThread.create({
          data: {
            workspaceId: account.workspaceId, mailboxId: account.id, providerThreadId: m.threadId, subject: m.subject.slice(0, 500), snippet: snippetOf(m.bodyText), participants,
            lastMessageAt: m.sentAt, unread: !outbound && m.unread, inInbox: m.inInbox, hasSent: outbound, hasAttachments: m.attachments.length > 0, ...(match ?? {}),
          },
        });
    const exists = await db.mailMessage.findUnique({ where: { mailboxId_providerMessageId: { mailboxId: account.id, providerMessageId: m.id } }, select: { id: true } });
    if (exists) {
      // Lo enviado desde aquí se guardó con adjuntos locales: al sincronizar toman el id real del proveedor.
      if (m.attachments.length) await db.mailMessage.updateMany({ where: { id: exists.id, workspaceId: account.workspaceId }, data: { attachments: m.attachments as unknown as Prisma.InputJsonValue } });
      continue;
    }
    const message = await db.mailMessage.create({
      data: {
        workspaceId: account.workspaceId, mailboxId: account.id, threadId: thread.id, providerMessageId: m.id, internetMessageId: m.internetMessageId, outbound,
        fromAddress: m.from.address.toLowerCase(), fromName: m.from.name.slice(0, 200), to: m.to, cc: m.cc, subject: m.subject.slice(0, 500), bodyText: m.bodyText,
        attachments: m.attachments as unknown as Prisma.InputJsonValue, sentAt: m.sentAt,
      },
    });
    created.push(message.id);
    if (!outbound && thread.contactId) {
      await db.activity.create({ data: { workspaceId: account.workspaceId, contactId: thread.contactId, opportunityId: thread.opportunityId, type: 'EMAIL', title: `Email recibido: ${m.subject || '(sin asunto)'}`.slice(0, 200), description: snippetOf(m.bodyText), completedAt: m.sentAt } });
      await db.contact.updateMany({ where: { id: thread.contactId, workspaceId: account.workspaceId }, data: { lastActivityAt: m.sentAt } });
      await queuePushSafely({ workspaceId: account.workspaceId, kind: 'INCOMING_MESSAGE', userId: account.userId, dedupeKey: `mail:${message.id}`, mailThreadId: thread.id });
    }
  }
  return created;
}

export async function syncMailbox(account: MailboxAccount, now = new Date(), db = prisma) {
  const { client, token } = await accessToken(account, db);
  const since = account.lastSyncedAt ? new Date(account.lastSyncedAt.getTime() - SYNC_OVERLAP_MS) : new Date(now.getTime() - FIRST_SYNC_DAYS * 86_400_000);
  const remote = await withProvider(account, () => client.listMessages(token, since, SYNC_BATCH), db);
  const created = await storeRemoteMessages(account, remote, db);
  await db.mailboxAccount.updateMany({ where: { id: account.id, workspaceId: account.workspaceId }, data: { lastSyncedAt: now, status: 'CONNECTED', lastError: null } });
  return { fetched: remote.length, created: created.length };
}

export async function syncUserMailboxes(workspaceId: string, userId: string, options: { onlyIfOlderThanMs?: number } = {}) {
  const accounts = await prisma.mailboxAccount.findMany({ where: { workspaceId, userId, status: 'CONNECTED' } });
  const errors: string[] = [];
  for (const account of accounts) {
    if (options.onlyIfOlderThanMs && account.lastSyncedAt && Date.now() - account.lastSyncedAt.getTime() < options.onlyIfOlderThanMs) continue;
    await syncMailbox(account).catch((error) => { errors.push(error instanceof MailError ? error.message : 'No se pudo actualizar el correo.'); });
  }
  return errors;
}

/** Cron: buzones conectados que no se sincronizan hace más de 4 minutos (todos los negocios; cada uno con su workspaceId). */
export async function syncDueMailboxes(now = new Date()) {
  const due = await crossTenantPrisma.mailboxAccount.findMany({
    where: { status: 'CONNECTED', OR: [{ lastSyncedAt: null }, { lastSyncedAt: { lt: new Date(now.getTime() - 4 * 60_000) } }] },
    orderBy: { lastSyncedAt: { sort: 'asc', nulls: 'first' } },
    take: 20,
  });
  let synced = 0;
  for (const account of due) {
    await syncMailbox(account, now).then(() => { synced += 1; }).catch((error) => console.warn('mail_sync_failed', { mailboxId: account.id, error: error instanceof Error ? error.message : 'unknown' }));
  }
  return { due: due.length, synced };
}

// --- Bandeja ------------------------------------------------------------------

export type Folder = 'inbox' | 'sent' | 'archived';

export async function listThreads(workspaceId: string, userId: string, options: { folder: Folder; q?: string; unread?: boolean }) {
  const q = options.q?.trim().slice(0, 100);
  return prisma.mailThread.findMany({
    where: {
      workspaceId, mailbox: { userId },
      ...(options.folder === 'inbox' ? { inInbox: true } : options.folder === 'sent' ? { hasSent: true } : { inInbox: false }),
      ...(options.unread ? { unread: true } : {}),
      ...(q ? { OR: [
        { subject: { contains: q, mode: 'insensitive' } },
        { participants: { has: q.toLowerCase() } },
        { contact: { OR: [{ firstName: { contains: q, mode: 'insensitive' } }, { lastName: { contains: q, mode: 'insensitive' } }] } },
        { messages: { some: { OR: [{ fromName: { contains: q, mode: 'insensitive' } }, { fromAddress: { contains: q.toLowerCase() } }] } } },
      ] } : {}),
    },
    orderBy: { lastMessageAt: 'desc' },
    take: 100,
    include: {
      mailbox: { select: { provider: true, emailAddress: true } },
      contact: { select: { firstName: true, lastName: true } },
      messages: { orderBy: { sentAt: 'desc' }, take: 1, select: { fromAddress: true, fromName: true, outbound: true, to: true } },
    },
  });
}

async function ownThread(workspaceId: string, userId: string, threadId: string) {
  const thread = await prisma.mailThread.findFirst({ where: { id: threadId, workspaceId, mailbox: { userId } }, include: { mailbox: true } });
  if (!thread) throw new MailError('Conversación no encontrada.');
  return thread;
}

export async function getThread(workspaceId: string, userId: string, threadId: string) {
  const thread = await ownThread(workspaceId, userId, threadId);
  const messages = await prisma.mailMessage.findMany({ where: { threadId: thread.id, workspaceId }, orderBy: { sentAt: 'asc' } });
  return { thread, messages };
}

/** Leído/no leído y archivar: primero en el proveedor (si falla, aquí no cambia nada). */
export async function setThreadState(workspaceId: string, userId: string, threadId: string, change: { read?: boolean; archive?: boolean }) {
  const thread = await ownThread(workspaceId, userId, threadId);
  const ids = (await prisma.mailMessage.findMany({ where: { threadId: thread.id, workspaceId, ...(change.read !== undefined ? { outbound: false } : {}) }, select: { providerMessageId: true } })).map((m) => m.providerMessageId);
  const { client, token } = await accessToken(thread.mailbox);
  await withProvider(thread.mailbox, () => client.modify(token, ids, change));
  await prisma.mailThread.updateMany({
    where: { id: thread.id, workspaceId },
    data: { ...(change.read !== undefined ? { unread: !change.read } : {}), ...(change.archive !== undefined ? { inInbox: !change.archive } : {}) },
  });
}

export const linkSchema = z.object({ contactId: z.string().max(40).nullable(), companyId: z.string().max(40).nullable(), opportunityId: z.string().max(40).nullable() }).partial();

export async function linkThread(workspaceId: string, userId: string, threadId: string, raw: unknown) {
  const input = linkSchema.parse(raw);
  const thread = await ownThread(workspaceId, userId, threadId);
  const owned = async (model: 'contact' | 'company' | 'opportunity', id: string | null | undefined) => {
    if (!id) return;
    const delegate = prisma[model] as unknown as { findFirst: (a: unknown) => Promise<unknown> };
    if (!(await delegate.findFirst({ where: { id, workspaceId }, select: { id: true } }))) throw new MailError('Ese registro no es de este negocio.');
  };
  await owned('contact', input.contactId);
  await owned('company', input.companyId);
  await owned('opportunity', input.opportunityId);
  await prisma.mailThread.updateMany({ where: { id: thread.id, workspaceId }, data: input });
}

export async function attachmentBytes(workspaceId: string, userId: string, messageId: string, attachmentId: string) {
  const message = await prisma.mailMessage.findFirst({ where: { id: messageId, workspaceId, mailbox: { userId } }, include: { mailbox: true } });
  const meta = (message?.attachments as MailAttachmentMeta[] | undefined)?.find((a) => a.id === attachmentId);
  if (!message || !meta) throw new MailError('Adjunto no encontrado.');
  const { client, token } = await accessToken(message.mailbox);
  return { meta, bytes: await withProvider(message.mailbox, () => client.getAttachment(token, message.providerMessageId, attachmentId)) };
}

// --- Enviar ---------------------------------------------------------------------

const address = z.string().trim().toLowerCase().email('Hay una dirección de email inválida.').max(200);
export const sendSchema = z.object({
  mailboxId: z.string().min(1).max(40),
  to: z.array(address).min(1, 'Agrega al menos un destinatario.').max(20),
  cc: z.array(address).max(20).default([]),
  subject: z.string().trim().max(300).default(''),
  text: z.string().max(50_000).default(''),
  replyToMessageId: z.string().max(40).nullish(),
  forwardMessageId: z.string().max(40).nullish(),
  quoteId: z.string().max(40).nullish(),
});
export type SendInput = z.input<typeof sendSchema>;

const prefixed = (subject: string, prefix: 'Re' | 'Fwd') => (new RegExp(`^${prefix}:`, 'i').test(subject.trim()) ? subject : `${prefix}: ${subject}`);

export async function sendMail(workspaceId: string, userId: string, raw: SendInput, files: OutgoingAttachment[] = []) {
  const input = sendSchema.parse(raw);
  if (input.replyToMessageId && input.forwardMessageId) throw new MailError('Elige responder o reenviar, no ambos.');
  const account = await ownMailbox(workspaceId, userId, input.mailboxId);
  const original = input.replyToMessageId || input.forwardMessageId
    ? await prisma.mailMessage.findFirst({ where: { id: (input.replyToMessageId ?? input.forwardMessageId)!, workspaceId, mailboxId: account.id }, include: { thread: true } })
    : null;
  if ((input.replyToMessageId || input.forwardMessageId) && !original) throw new MailError('El correo original no está en este buzón.');

  const attachments = [...files];
  let text = input.text;
  let subject = input.subject;
  if (original && input.forwardMessageId) {
    // Reenviar incluye los adjuntos originales (se piden al proveedor) y el texto citado.
    const { client, token } = await accessToken(account);
    for (const a of original.attachments as MailAttachmentMeta[]) {
      attachments.push({ filename: a.filename, mimeType: a.mimeType, content: await withProvider(account, () => client.getAttachment(token, original.providerMessageId, a.id)) });
    }
    text = `${text}\n\n---------- Mensaje reenviado ----------\nDe: ${original.fromName ? `${original.fromName} <${original.fromAddress}>` : original.fromAddress}\nFecha: ${original.sentAt.toLocaleString('es-CL')}\nAsunto: ${original.subject}\n\n${original.bodyText}`;
    subject = prefixed(subject || original.subject, 'Fwd');
  }
  if (original && input.replyToMessageId) subject = prefixed(subject || original.subject, 'Re');

  const quote = input.quoteId ? await prisma.salesQuote.findFirst({ where: { id: input.quoteId, workspaceId }, select: { id: true, contactId: true, opportunityId: true } }) : null;
  if (input.quoteId && !quote) throw new MailError('Cotización no encontrada.');
  let extraSent: OutgoingAttachment[] = [];
  const deliver = async (extra: OutgoingAttachment[]) => {
    extraSent = extra;
    const total = [...attachments, ...extra].reduce((sum, a) => sum + a.content.byteLength, 0);
    if (total > MAX_ATTACHMENTS_BYTES) throw new MailError('Los adjuntos superan 15 MB en total.');
    const { client, token } = await accessToken(account);
    return withProvider(account, () => client.send(token, {
      from: account.emailAddress, to: input.to, cc: input.cc, subject, text, attachments: [...attachments, ...extra],
      inReplyTo: input.replyToMessageId ? original!.internetMessageId : null, references: null,
      threadId: input.replyToMessageId ? original!.thread.providerThreadId : null,
    }));
  };

  let sent: { id: string; threadId: string } | null = null;
  if (quote) {
    // La cotización se congela y pasa a enviada solo si el correo salió (mismo snapshot que el PDF adjunto).
    await sendSalesQuote(workspaceId, quote.id, 'mailbox', userId, async ({ snapshot, number }) => {
      sent = await deliver([{ filename: `${number}.pdf`, mimeType: 'application/pdf', content: snapshotPdf(snapshot) }]);
      return input.to.join(', ');
    });
  } else {
    sent = await deliver([]);
  }

  const result = sent as { id: string; threadId: string } | null;
  if (!result) {
    // Microsoft no devuelve el id: el enviado aparece al sincronizar.
    await syncMailbox(await prisma.mailboxAccount.findUniqueOrThrow({ where: { id: account.id } })).catch(() => undefined);
    return { threadId: original?.threadId ?? null };
  }
  const now = new Date();
  await storeRemoteMessages(account, [{
    id: result.id, threadId: result.threadId, internetMessageId: null, references: null, from: { address: account.emailAddress, name: '' }, to: input.to, cc: input.cc,
    subject, bodyText: text, sentAt: now, unread: false, inInbox: Boolean(input.replyToMessageId && original?.thread.inInbox), outbound: true,
    attachments: [...attachments, ...extraSent].map((a, i) => ({ id: `local-${i}`, filename: a.filename, mimeType: a.mimeType, size: a.content.byteLength })),
  }]);
  const thread = await prisma.mailThread.findUniqueOrThrow({ where: { mailboxId_providerThreadId: { mailboxId: account.id, providerThreadId: result.threadId } } });
  if (quote) {
    await prisma.mailThread.updateMany({ where: { id: thread.id, workspaceId }, data: { contactId: thread.contactId ?? quote.contactId, opportunityId: thread.opportunityId ?? quote.opportunityId } });
    await prisma.mailMessage.updateMany({ where: { mailboxId: account.id, providerMessageId: result.id }, data: { salesQuoteId: quote.id } });
  }
  const contactId = thread.contactId ?? quote?.contactId ?? null;
  if (contactId) {
    await prisma.activity.create({ data: { workspaceId, contactId, opportunityId: thread.opportunityId ?? quote?.opportunityId ?? null, createdById: userId, type: 'EMAIL', title: `Email enviado: ${subject || '(sin asunto)'}`.slice(0, 200), description: snippetOf(text), completedAt: now } });
    await prisma.contact.updateMany({ where: { id: contactId, workspaceId }, data: { lastActivityAt: now } });
  }
  return { threadId: thread.id };
}
