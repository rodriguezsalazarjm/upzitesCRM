import { WorkspaceRole, type KnowledgeSourceType } from '../../../generated/prisma/client';
import { recordAudit } from '../domain/audit';
import { prisma } from '../prisma';
import { canManageWorkspaceSettings } from '../workspace-roles';
import { resolveKnowledgeStorage } from '../storage';
import { extractPdfText } from './extract';
import { fetchKnowledgeSnapshot } from './ssrf';
import {
  chunkKnowledgeText, createManualSourceSchema, KNOWLEDGE_PROFILE_FIELDS, createUrlSourceSchema, inspectKnowledgeFile, knowledgeObjectKey,
  normalizeKnowledgeText, updateSourceSchema, workspaceKnowledgeProfileSchema,
} from './rules';

export type KnowledgeActor = { userId: string; workspaceId: string; role: WorkspaceRole };
export class KnowledgeError extends Error {
  constructor(readonly code: 'FORBIDDEN' | 'NOT_FOUND' | 'INVALID_INPUT' | 'PROCESSING_FAILED', message: string) {
    super(message); this.name = 'KnowledgeError';
  }
}

function requireManager(actor: KnowledgeActor) {
  if (!canManageWorkspaceSettings(actor.role)) throw new KnowledgeError('FORBIDDEN', 'Solo el owner o un admin puede administrar conocimiento.');
}

export async function getWorkspaceKnowledgeProfile(workspaceId: string) {
  return prisma.workspaceProfile.findUnique({
    where: { workspaceId },
    select: {
      tradeName: true, location: true, paymentMethods: true, serviceChannels: true, globalFaqs: true, brandTone: true,
      escalationRules: true, contactInfo: true, generalInstructions: true,
      // Solo lectura aquí: se editan en Configuración.
      about: true, policies: true, shippingInfo: true, returnsPolicy: true, businessDays: true, businessStartMinute: true, businessEndMinute: true,
    },
  });
}

export async function saveWorkspaceKnowledgeProfile(actor: KnowledgeActor, raw: unknown) {
  requireManager(actor);
  const parsed = workspaceKnowledgeProfileSchema.safeParse(raw);
  if (!parsed.success) throw new KnowledgeError('INVALID_INPUT', parsed.error.issues[0]?.message ?? 'Datos inválidos.');
  const input = parsed.data;
  // Texto vacío = sin dato (null), así el contexto no emite líneas en blanco.
  const data = {
    ...Object.fromEntries(KNOWLEDGE_PROFILE_FIELDS.map((key) => [key, input[key] || null])),
    globalFaqs: input.globalFaqs,
  };
  const profile = await prisma.workspaceProfile.upsert({ where: { workspaceId: actor.workspaceId }, create: { workspaceId: actor.workspaceId, ...data }, update: data });
  await recordAudit({ workspaceId: actor.workspaceId, actorId: actor.userId, action: 'knowledge.profile_updated', entity: 'WorkspaceProfile', entityId: profile.id, metadata: { faqCount: input.globalFaqs.length } });
  return profile;
}

/** Listado liviano: el contenido extraído puede pesar cientos de KB por fuente. */
export async function listKnowledgeSources(workspaceId: string) {
  const sources = await prisma.knowledgeSource.findMany({
    where: { workspaceId }, orderBy: { updatedAt: 'desc' },
    select: { id: true, type: true, title: true, url: true, originalName: true, mimeType: true, sizeBytes: true, status: true, processingError: true, isActive: true, ingestedAt: true, updatedAt: true, _count: { select: { chunks: true } } },
  });
  const excerpts = sources.length
    ? await prisma.$queryRaw<{ id: string; excerpt: string; length: number }[]>`
        SELECT id, left(content, 280) AS excerpt, length(content)::int AS length
          FROM knowledge_sources WHERE workspace_id = ${workspaceId}`
    : [];
  const byId = new Map(excerpts.map((row) => [row.id, row]));
  return sources.map(({ _count, ...source }) => ({
    ...source,
    chunkCount: _count.chunks,
    excerpt: byId.get(source.id)?.excerpt ?? '',
    contentLength: byId.get(source.id)?.length ?? 0,
  }));
}

export type KnowledgeSourceListItem = Awaited<ReturnType<typeof listKnowledgeSources>>[number];

async function sourceOrThrow(workspaceId: string, id: string) {
  const source = await prisma.knowledgeSource.findFirst({ where: { id, workspaceId }, include: { _count: { select: { chunks: true } } } });
  if (!source) throw new KnowledgeError('NOT_FOUND', 'Fuente no encontrada.');
  return source;
}

async function extractedFor(source: Awaited<ReturnType<typeof sourceOrThrow>>, override?: { bytes?: Uint8Array; content?: string }) {
  if (source.type === 'URL') {
    if (!source.url) throw new Error('La fuente no tiene URL.');
    const snapshot = await fetchKnowledgeSnapshot(source.url);
    return { text: snapshot.text, metadata: { finalUrl: snapshot.finalUrl, contentType: snapshot.contentType } };
  }
  if (source.type === 'PDF' || source.type === 'TEXT_FILE') {
    const bytes = override?.bytes ?? (source.storageKey ? (await (await resolveKnowledgeStorage()).get(source.storageKey))?.bytes : null);
    if (!bytes) throw new Error('El archivo de la fuente no está disponible.');
    if (source.type === 'PDF') return extractPdfText(bytes);
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), metadata: { encoding: 'utf-8' } };
  }
  return { text: override?.content ?? source.content, metadata: { mode: 'manual' } };
}

export async function processKnowledgeSource(actor: KnowledgeActor, id: string, override?: { bytes?: Uint8Array; content?: string }) {
  requireManager(actor);
  const source = await sourceOrThrow(actor.workspaceId, id);
  const preserved = source.status === 'READY' && source._count.chunks > 0;
  await prisma.knowledgeSource.updateMany({ where: { id, workspaceId: actor.workspaceId }, data: { status: 'PROCESSING', processingError: null } });
  try {
    const extracted = await extractedFor(source, override);
    const text = normalizeKnowledgeText(extracted.text);
    if (text.length < 10) throw new Error('No se detectó texto útil para indexar.');
    const chunks = chunkKnowledgeText(text);
    if (!chunks.length) throw new Error('No se pudieron generar fragmentos de conocimiento.');
    await prisma.$transaction(async (tx) => {
      await tx.knowledgeChunk.deleteMany({ where: { sourceId: id, workspaceId: actor.workspaceId } });
      await tx.knowledgeChunk.createMany({ data: chunks.map((content, position) => ({ workspaceId: actor.workspaceId, sourceId: id, position, content, metadata: { title: source.title, type: source.type } })) });
      await tx.knowledgeSource.updateMany({ where: { id, workspaceId: actor.workspaceId }, data: { content: text, status: 'READY', processingError: null, ingestedAt: new Date(), metadata: extracted.metadata } });
    });
    await recordAudit({ workspaceId: actor.workspaceId, actorId: actor.userId, action: 'knowledge.source_processed', entity: 'KnowledgeSource', entityId: id, metadata: { chunks: chunks.length, type: source.type } });
    return sourceOrThrow(actor.workspaceId, id);
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : 'No se pudo procesar la fuente.';
    await prisma.knowledgeSource.updateMany({ where: { id, workspaceId: actor.workspaceId }, data: { status: preserved ? 'READY' : 'FAILED', processingError: message } });
    await recordAudit({ workspaceId: actor.workspaceId, actorId: actor.userId, action: 'knowledge.source_failed', entity: 'KnowledgeSource', entityId: id, metadata: { type: source.type, preserved } });
    throw new KnowledgeError('PROCESSING_FAILED', message);
  }
}

/**
 * Una fuente recién creada que falla al procesarse queda guardada como FAILED
 * con su motivo: se devuelve igual para que la UI la muestre y permita
 * reintentar o eliminarla, en vez de un error sin rastro.
 */
async function processAfterCreate(actor: KnowledgeActor, id: string, override?: { bytes?: Uint8Array; content?: string }) {
  try {
    return await processKnowledgeSource(actor, id, override);
  } catch (error) {
    if (error instanceof KnowledgeError && error.code === 'PROCESSING_FAILED') return sourceOrThrow(actor.workspaceId, id);
    throw error;
  }
}

export async function createManualSource(actor: KnowledgeActor, raw: unknown) {
  requireManager(actor);
  const parsed = createManualSourceSchema.safeParse(raw);
  if (!parsed.success) throw new KnowledgeError('INVALID_INPUT', parsed.error.issues[0]?.message ?? 'Fuente inválida.');
  const source = await prisma.knowledgeSource.create({ data: { workspaceId: actor.workspaceId, type: 'MANUAL', title: parsed.data.title, content: parsed.data.content, status: 'PENDING' } });
  await recordAudit({ workspaceId: actor.workspaceId, actorId: actor.userId, action: 'knowledge.source_created', entity: 'KnowledgeSource', entityId: source.id, metadata: { type: source.type } });
  return processAfterCreate(actor, source.id, { content: parsed.data.content });
}

export async function createUrlSource(actor: KnowledgeActor, raw: unknown) {
  requireManager(actor);
  const parsed = createUrlSourceSchema.safeParse(raw);
  if (!parsed.success) throw new KnowledgeError('INVALID_INPUT', parsed.error.issues[0]?.message ?? 'URL inválida.');
  const source = await prisma.knowledgeSource.create({ data: { workspaceId: actor.workspaceId, type: 'URL', title: parsed.data.title, url: parsed.data.url, status: 'PENDING' } });
  await recordAudit({ workspaceId: actor.workspaceId, actorId: actor.userId, action: 'knowledge.source_created', entity: 'KnowledgeSource', entityId: source.id, metadata: { type: source.type } });
  return processAfterCreate(actor, source.id);
}

export async function createFileSource(actor: KnowledgeActor, input: { title: string; fileName: string; declaredType: string; bytes: Uint8Array }) {
  requireManager(actor);
  const title = input.title.trim();
  if (!title || title.length > 200) throw new KnowledgeError('INVALID_INPUT', 'Título inválido.');
  const mime = inspectKnowledgeFile(input.bytes, input.declaredType, input.fileName);
  const type: KnowledgeSourceType = mime === 'application/pdf' ? 'PDF' : 'TEXT_FILE';
  const key = knowledgeObjectKey(actor.workspaceId, mime);
  const storage = await resolveKnowledgeStorage();
  await storage.put(key, input.bytes, mime);
  const source = await prisma.knowledgeSource.create({ data: { workspaceId: actor.workspaceId, type, title, storageKey: key, originalName: input.fileName.slice(0, 255), mimeType: mime, sizeBytes: input.bytes.byteLength, status: 'PENDING' } });
  await recordAudit({ workspaceId: actor.workspaceId, actorId: actor.userId, action: 'knowledge.source_created', entity: 'KnowledgeSource', entityId: source.id, metadata: { type, mimeType: mime, sizeBytes: input.bytes.byteLength } });
  return processAfterCreate(actor, source.id, { bytes: input.bytes });
}

export async function updateKnowledgeSource(actor: KnowledgeActor, id: string, raw: unknown) {
  requireManager(actor);
  const parsed = updateSourceSchema.safeParse(raw);
  if (!parsed.success) throw new KnowledgeError('INVALID_INPUT', parsed.error.issues[0]?.message ?? 'Cambio inválido.');
  const source = await sourceOrThrow(actor.workspaceId, id);
  const { reprocess, ...patch } = parsed.data;
  if (patch.content !== undefined && !['MANUAL', 'TEXT', 'FAQ', 'POLICY'].includes(source.type)) throw new KnowledgeError('INVALID_INPUT', 'Esta fuente no admite edición de texto.');
  if (patch.url !== undefined && source.type !== 'URL') throw new KnowledgeError('INVALID_INPUT', 'Esta fuente no admite URL.');
  await prisma.knowledgeSource.updateMany({ where: { id, workspaceId: actor.workspaceId }, data: patch });
  await recordAudit({ workspaceId: actor.workspaceId, actorId: actor.userId, action: patch.isActive === undefined ? 'knowledge.source_updated' : 'knowledge.source_toggled', entity: 'KnowledgeSource', entityId: id, metadata: { isActive: patch.isActive ?? source.isActive } });
  if (reprocess || patch.content !== undefined || patch.url !== undefined) return processKnowledgeSource(actor, id, patch.content ? { content: patch.content } : undefined);
  return sourceOrThrow(actor.workspaceId, id);
}

export async function deleteKnowledgeSource(actor: KnowledgeActor, id: string) {
  requireManager(actor);
  const source = await sourceOrThrow(actor.workspaceId, id);
  if (source.storageKey) await (await resolveKnowledgeStorage()).remove(source.storageKey);
  await prisma.knowledgeSource.deleteMany({ where: { id, workspaceId: actor.workspaceId } });
  await recordAudit({ workspaceId: actor.workspaceId, actorId: actor.userId, action: 'knowledge.source_deleted', entity: 'KnowledgeSource', entityId: id, metadata: { type: source.type } });
}

export async function getKnowledgeSourcePreview(workspaceId: string, id: string) {
  const source = await sourceOrThrow(workspaceId, id);
  // storageKey nunca sale del servidor.
  return {
    id: source.id, type: source.type, title: source.title, url: source.url, originalName: source.originalName,
    status: source.status, processingError: source.processingError, isActive: source.isActive, chunkCount: source._count.chunks,
    content: source.content.slice(0, 12_000), truncated: source.content.length > 12_000,
  };
}
