import { z } from 'zod';
import { WhatsAppTemplateCategory } from '../../../generated/prisma/client';
import { recordAudit } from '../domain/audit';
import { decryptSecret } from '../crypto';
import { canManageChannels } from '../conversations';
import { MESSAGE_VARIABLES, type MessageVariable } from '../followups/rules';
import { mapMetaStatus, placeholderCount, toMetaBody } from './template-rules';

export * from './template-rules';
import { prisma } from '../prisma';
import { ChannelManagerError, type ChannelActor } from './channel-manager';
import { whatsappGraphVersion } from './meta';

/**
 * P26: plantillas de WhatsApp. Fuera de la ventana de 24 horas Meta solo acepta
 * plantillas aprobadas para la WABA del numero. Aqui se registran (se envian a
 * Meta para revision), se sincroniza su estado y se decide si una plantilla
 * sirve para un envio concreto. Ningun texto de error de Meta se reenvia crudo.
 */

// --- Meta Graph ------------------------------------------------------------------

type MetaTemplate = { id?: string; name?: string; language?: string; status?: string; category?: string; rejected_reason?: string; components?: { type?: string; text?: string }[] };

function mapCategory(raw: string | undefined) {
  const value = (raw ?? '').toUpperCase();
  return value in WhatsAppTemplateCategory ? (value as WhatsAppTemplateCategory) : WhatsAppTemplateCategory.MARKETING;
}

async function graph(path: string, token: string, init?: RequestInit) {
  let response: Response;
  try {
    response = await fetch(`https://graph.facebook.com/${whatsappGraphVersion()}/${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init?.headers },
      cache: 'no-store',
    });
  } catch {
    throw new ChannelManagerError('No se pudo contactar a Meta. Intenta de nuevo en unos minutos.', 502, 'META_UNAVAILABLE');
  }
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown> & { error?: { code?: number; error_subcode?: number } };
  if (response.ok) return body;
  const code = body.error?.code;
  if (response.status === 401 || code === 190) throw new ChannelManagerError('El token de este número venció o es inválido: vuelve a conectarlo.', 400, 'INVALID_CREDENTIALS');
  if (code === 10 || (code !== undefined && code >= 200 && code < 300)) {
    throw new ChannelManagerError('El token no tiene el permiso whatsapp_business_management para administrar plantillas.', 400, 'PERMISSION_DENIED');
  }
  // 100/2388xxx: nombre repetido o formato invalido al crear.
  if (code === 100 || body.error?.error_subcode === 2388023 || body.error?.error_subcode === 2388024) {
    throw new ChannelManagerError('Meta rechazó la plantilla: revisa que el nombre no exista ya en ese idioma y que el texto cumpla sus reglas.', 400, 'TEMPLATE_INVALID');
  }
  throw new ChannelManagerError(`Meta no aceptó la operación (código ${code ?? response.status}).`, response.status >= 500 ? 502 : 400, 'META_ERROR');
}

async function managedChannel(actor: ChannelActor, channelId: string) {
  if (!canManageChannels(actor.role)) throw new ChannelManagerError('Solo el owner o un admin puede administrar plantillas.', 403, 'FORBIDDEN');
  const channel = await prisma.whatsAppChannel.findFirst({ where: { id: channelId, workspaceId: actor.workspaceId } });
  if (!channel) throw new ChannelManagerError('Número no encontrado.', 404, 'NOT_FOUND');
  const token = channel.accessTokenEncrypted ? decryptSecret(channel.accessTokenEncrypted) : process.env.WHATSAPP_SYSTEM_ACCESS_TOKEN;
  if (!token) throw new ChannelManagerError('Este número no tiene credenciales guardadas: vuelve a conectarlo.', 409, 'NO_TOKEN');
  return { channel, token };
}

/** Trae las plantillas de la WABA y actualiza estado y cuerpo. Conserva la asignacion de variables si el cuerpo no cambio. */
export async function syncTemplates(actor: ChannelActor, channelId: string) {
  const { channel, token } = await managedChannel(actor, channelId);
  const list: MetaTemplate[] = [];
  let path: string | null = `${channel.wabaId}/message_templates?fields=id,name,language,status,category,rejected_reason,components&limit=100`;
  for (let page = 0; path && page < 10; page += 1) {
    const body = await graph(path, token);
    list.push(...((body.data as MetaTemplate[] | undefined) ?? []));
    const next = (body.paging as { next?: string } | undefined)?.next;
    path = next ? next.replace(/^https:\/\/graph\.facebook\.com\/v[\d.]+\//, '') : null;
  }

  const now = new Date();
  let synced = 0;
  for (const meta of list) {
    if (!meta.name || !meta.language) continue;
    const body = meta.components?.find((c) => c.type?.toUpperCase() === 'BODY')?.text ?? '';
    const existing = await prisma.whatsAppTemplate.findUnique({ where: { channelId_name_language: { channelId: channel.id, name: meta.name, language: meta.language } } });
    const data = {
      externalId: meta.id ?? null,
      category: mapCategory(meta.category),
      status: mapMetaStatus(meta.status),
      body,
      rejectedReason: meta.rejected_reason && meta.rejected_reason !== 'NONE' ? meta.rejected_reason : null,
      lastSyncedAt: now,
      // Cuerpo nuevo = numeracion nueva: la asignacion anterior ya no aplica.
      variables: existing && existing.body === body ? existing.variables : [],
    };
    if (existing) await prisma.whatsAppTemplate.update({ where: { id: existing.id }, data });
    else await prisma.whatsAppTemplate.create({ data: { ...data, workspaceId: actor.workspaceId, channelId: channel.id, name: meta.name, language: meta.language } });
    synced += 1;
  }
  await recordAudit({ workspaceId: actor.workspaceId, actorId: actor.id, action: 'whatsapp.templates_synced', entity: 'WhatsAppChannel', entityId: channel.id, metadata: { synced } });
  return { synced };
}

export const templateInputSchema = z
  .object({
    channelId: z.string().min(1, 'Elige el número.'),
    name: z.string().trim().regex(/^[a-z0-9_]{1,512}$/, 'Usa solo minúsculas, números y guion bajo (p. ej. recordatorio_pago).'),
    language: z.string().trim().regex(/^[a-z]{2}(_[A-Z]{2})?$/, 'Idioma inválido (p. ej. es, es_CL, en_US).'),
    category: z.enum(['MARKETING', 'UTILITY'], { errorMap: () => ({ message: 'Elige la categoría.' }) }),
    text: z.string().trim().min(1, 'Escribe el texto.').max(1024, 'Meta admite hasta 1024 caracteres.'),
    examples: z.record(z.string().trim().max(60)).default({}),
  })
  .strict();

/** Registra una plantilla nueva en Meta (queda En revision) con variables con nombre del CRM. */
export async function submitTemplate(actor: ChannelActor, raw: unknown) {
  const parsed = templateInputSchema.safeParse(raw);
  if (!parsed.success) throw new ChannelManagerError(parsed.error.issues[0]?.message ?? 'Datos inválidos.', 400, 'INVALID');
  const input = parsed.data;
  const { body, variables, unknown } = toMetaBody(input.text);
  if (unknown.length) throw new ChannelManagerError(`Variable desconocida: ${unknown.map((n) => `{{${n}}}`).join(', ')}.`, 400, 'INVALID');
  if (/^\s*\{\{\d+\}\}|\{\{\d+\}\}\s*$/.test(body)) throw new ChannelManagerError('Meta no acepta una variable al inicio ni al final del texto.', 400, 'INVALID');
  const examples = variables.map((name) => input.examples[name]?.trim() || '');
  if (examples.some((e) => !e)) throw new ChannelManagerError('Escribe un ejemplo para cada variable: Meta lo pide para revisar.', 400, 'INVALID');

  const { channel, token } = await managedChannel(actor, input.channelId);
  const exists = await prisma.whatsAppTemplate.findUnique({ where: { channelId_name_language: { channelId: channel.id, name: input.name, language: input.language } }, select: { id: true } });
  if (exists) throw new ChannelManagerError('Ya existe una plantilla con ese nombre e idioma en este número.', 409, 'DUPLICATE');

  const component: Record<string, unknown> = { type: 'BODY', text: body };
  if (examples.length) component.example = { body_text: [examples] };
  const created = await graph(`${channel.wabaId}/message_templates`, token, {
    method: 'POST',
    body: JSON.stringify({ name: input.name, language: input.language, category: input.category, components: [component] }),
  });
  const template = await prisma.whatsAppTemplate.create({
    data: {
      workspaceId: actor.workspaceId,
      channelId: channel.id,
      externalId: created.id ? String(created.id) : null,
      name: input.name,
      language: input.language,
      category: mapCategory(String(created.category ?? input.category)),
      status: mapMetaStatus(created.status as string | undefined),
      body,
      variables,
      lastSyncedAt: new Date(),
    },
  });
  await recordAudit({ workspaceId: actor.workspaceId, actorId: actor.id, action: 'whatsapp.template_submitted', entity: 'WhatsAppTemplate', entityId: template.id, metadata: { name: input.name, language: input.language } });
  return template;
}

/** Asigna un dato del CRM a cada {{n}} de una plantilla sincronizada (creada fuera del CRM). */
export async function setTemplateVariables(actor: ChannelActor, id: string, raw: unknown) {
  if (!canManageChannels(actor.role)) throw new ChannelManagerError('Solo el owner o un admin puede administrar plantillas.', 403, 'FORBIDDEN');
  const parsed = z.object({ variables: z.array(z.enum(Object.keys(MESSAGE_VARIABLES) as [MessageVariable, ...MessageVariable[]])).max(10) }).strict().safeParse(raw);
  if (!parsed.success) throw new ChannelManagerError('Elige un dato para cada variable.', 400, 'INVALID');
  const template = await prisma.whatsAppTemplate.findFirst({ where: { id, workspaceId: actor.workspaceId } });
  if (!template) throw new ChannelManagerError('Plantilla no encontrada.', 404, 'NOT_FOUND');
  const count = placeholderCount(template.body);
  if (typeof count !== 'number') throw new ChannelManagerError(count.error, 400, 'INVALID');
  if (parsed.data.variables.length !== count) throw new ChannelManagerError(`La plantilla tiene ${count} variable(s): asigna un dato a cada una.`, 400, 'INVALID');
  return prisma.whatsAppTemplate.update({ where: { id }, data: { variables: parsed.data.variables } });
}

/**
 * Webhook `message_template_status_update`. El workspace sale del numero ya
 * registrado (la WABA de `entry.id` debe coincidir), nunca del payload.
 */
export async function applyTemplateStatusUpdate(event: { wabaId: string; externalId: string; event: string; reason: string | null }) {
  const template = await prisma.whatsAppTemplate.findUnique({ where: { externalId: event.externalId }, include: { channel: { select: { wabaId: true } } } });
  if (!template || template.channel.wabaId !== event.wabaId) return false;
  const status = mapMetaStatus(event.event);
  await prisma.whatsAppTemplate.update({
    where: { id: template.id },
    data: { status, rejectedReason: status === 'REJECTED' && event.reason && event.reason !== 'NONE' ? event.reason : status === 'REJECTED' ? template.rejectedReason : null, lastSyncedAt: new Date() },
  });
  return true;
}

export async function listTemplates(workspaceId: string) {
  return prisma.whatsAppTemplate.findMany({
    where: { workspaceId },
    orderBy: [{ status: 'asc' }, { name: 'asc' }],
    include: { channel: { select: { id: true, label: true, displayPhoneNumber: true } } },
  });
}
