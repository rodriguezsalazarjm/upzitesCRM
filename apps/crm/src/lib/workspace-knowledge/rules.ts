import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { sniffMime } from '../media/policy';
import { KNOWLEDGE_LIMITS } from './limits';

export { KNOWLEDGE_LIMITS };

const optionalText = z.string().trim().max(KNOWLEDGE_LIMITS.profileText).default('');
export const globalFaqSchema = z.object({
  question: z.string().trim().min(1).max(KNOWLEDGE_LIMITS.faqItem),
  answer: z.string().trim().min(1).max(KNOWLEDGE_LIMITS.faqItem),
}).strict();

/**
 * Solo los campos propios del Punto 5. Horario, "sobre el negocio" y políticas
 * de venta/entrega/devolución se editan en Configuración (`/api/onboarding/profile`):
 * si este formulario también los escribiera, dos pantallas se pisarían.
 * El contexto del agente lee ambos grupos.
 */
export const workspaceKnowledgeProfileSchema = z.object({
  tradeName: optionalText,
  location: optionalText,
  paymentMethods: optionalText,
  serviceChannels: optionalText,
  globalFaqs: z.array(globalFaqSchema).max(KNOWLEDGE_LIMITS.faqCount),
  brandTone: optionalText,
  escalationRules: optionalText,
  contactInfo: optionalText,
  generalInstructions: optionalText,
}).strict();

export type WorkspaceKnowledgeProfileInput = z.infer<typeof workspaceKnowledgeProfileSchema>;
export const KNOWLEDGE_PROFILE_FIELDS = ['tradeName', 'location', 'paymentMethods', 'serviceChannels', 'brandTone', 'escalationRules', 'contactInfo', 'generalInstructions'] as const;

export const createManualSourceSchema = z.object({
  kind: z.literal('MANUAL'),
  title: z.string().trim().min(1).max(KNOWLEDGE_LIMITS.sourceTitle),
  content: z.string().trim().min(1).max(KNOWLEDGE_LIMITS.manualText),
}).strict();

export const createUrlSourceSchema = z.object({
  kind: z.literal('URL'),
  title: z.string().trim().min(1).max(KNOWLEDGE_LIMITS.sourceTitle),
  url: z.string().trim().url().max(2_000),
}).strict();

export const updateSourceSchema = z.object({
  title: z.string().trim().min(1).max(KNOWLEDGE_LIMITS.sourceTitle).optional(),
  content: z.string().trim().min(1).max(KNOWLEDGE_LIMITS.manualText).optional(),
  url: z.string().trim().url().max(2_000).optional(),
  isActive: z.boolean().optional(),
  reprocess: z.boolean().optional(),
}).strict();

export const KNOWLEDGE_MIME_TYPES = ['application/pdf', 'text/plain', 'text/markdown'] as const;
export type KnowledgeMime = (typeof KNOWLEDGE_MIME_TYPES)[number];

export function inspectKnowledgeFile(bytes: Uint8Array, declared: string, fileName: string): KnowledgeMime {
  if (!bytes.byteLength || bytes.byteLength > KNOWLEDGE_LIMITS.fileBytes) throw new Error('El archivo debe pesar entre 1 byte y 4 MB.');
  const lower = fileName.toLowerCase();
  const sniffed = sniffMime(bytes.slice(0, 4_096));
  if (declared === 'application/pdf' || lower.endsWith('.pdf')) {
    if (sniffed !== 'application/pdf') throw new Error('El archivo no es un PDF válido.');
    return 'application/pdf';
  }
  if (!['text/plain', 'text/markdown', 'application/octet-stream'].includes(declared) || (!lower.endsWith('.txt') && !lower.endsWith('.md') && declared === 'application/octet-stream')) {
    throw new Error('Solo se admiten PDF, TXT y Markdown.');
  }
  if (sniffed && sniffed !== 'text/plain') throw new Error('El contenido no coincide con un documento de texto seguro.');
  // NUL es UTF-8 válido pero ningún texto lo usa: delata un binario renombrado.
  if (bytes.includes(0)) throw new Error('El contenido no coincide con un documento de texto seguro.');
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error('El documento de texto debe estar codificado en UTF-8.');
  }
  return lower.endsWith('.md') || declared === 'text/markdown' ? 'text/markdown' : 'text/plain';
}

export function knowledgeObjectKey(workspaceId: string, mime: KnowledgeMime) {
  const ext = mime === 'application/pdf' ? 'pdf' : mime === 'text/markdown' ? 'md' : 'txt';
  return `knowledge/${workspaceId}/${randomUUID()}.${ext}`;
}

export function normalizeKnowledgeText(value: string) {
  return value.replace(/\r\n?/g, '\n').replace(/[\t\f\v]+/g, ' ').replace(/ {2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

export function chunkKnowledgeText(raw: string) {
  const text = normalizeKnowledgeText(raw).slice(0, KNOWLEDGE_LIMITS.extractedText);
  const chunks: string[] = [];
  let cursor = 0;
  while (cursor < text.length && chunks.length < KNOWLEDGE_LIMITS.maxChunksPerSource) {
    let end = Math.min(text.length, cursor + KNOWLEDGE_LIMITS.chunkChars);
    if (end < text.length) {
      const boundary = Math.max(text.lastIndexOf('\n\n', end), text.lastIndexOf('. ', end));
      if (boundary > cursor + Math.floor(KNOWLEDGE_LIMITS.chunkChars * 0.55)) end = boundary + 1;
    }
    const chunk = text.slice(cursor, end).trim();
    if (chunk && chunks[chunks.length - 1] !== chunk) chunks.push(chunk);
    if (end >= text.length) break;
    cursor = Math.max(cursor + 1, end - KNOWLEDGE_LIMITS.chunkOverlap);
  }
  return chunks;
}
