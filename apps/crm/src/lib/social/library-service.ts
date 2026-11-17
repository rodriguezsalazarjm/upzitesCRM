import { z } from 'zod';
import { prisma } from '../prisma';
import { getSessionSecret } from '../session-token';
import { resolveStorage } from '../storage';
import { LIBRARY_TYPES, assetFilePath, libraryKey, libraryMimeFor, signLibraryIntent, verifyLibraryFile, verifyLibraryIntent } from './library';

export class LibraryError extends Error {}

const tagList = z.array(z.string().trim().min(1).max(40)).max(20);
export const assetMetaSchema = z.object({
  name: z.string().trim().min(1).max(120),
  collection: z.string().trim().max(60).optional().nullable(),
  tags: tagList.default([]),
  caption: z.string().max(2200).default(''),
  hashtags: z.array(z.string().trim().regex(/^#?[\p{L}\p{N}_]{1,80}$/u, 'Hashtag inválido.')).max(30).default([]),
});
export const uploadIntentSchema = z.object({ fileName: z.string().min(1).max(200), type: z.string().max(100), size: z.number().int().positive() });
export const finalizeSchema = assetMetaSchema.extend({ intent: z.string().min(10).max(2000) });

const clean = (meta: z.infer<typeof assetMetaSchema>) => ({
  name: meta.name,
  collection: meta.collection?.trim() || null,
  tags: [...new Set(meta.tags.map((t) => t.toLowerCase()))],
  caption: meta.caption,
  hashtags: meta.hashtags.map((t) => t.replace(/^#+/, '')),
});

/** Paso 1: a dónde subir. En producción, directo al bucket (no pasa por la función). */
export async function createLibraryUpload(workspaceId: string, input: z.infer<typeof uploadIntentSchema>) {
  const mime = libraryMimeFor(input.type, input.fileName);
  if (!mime) throw new LibraryError('Solo se aceptan imágenes JPG y videos MP4 (los formatos que publica Instagram).');
  if (input.size > LIBRARY_TYPES[mime].maxBytes) throw new LibraryError(mime === 'video/mp4' ? 'El video supera 100 MB.' : 'La imagen supera 8 MB.');
  const key = libraryKey(workspaceId, mime);
  const intent = signLibraryIntent({ workspaceId, key, contentType: mime }, getSessionSecret());
  const storage = await resolveStorage();
  const uploadUrl = storage.signedUploadUrl ? await storage.signedUploadUrl(key) : `/api/content-assets/upload/local?intent=${encodeURIComponent(intent)}`;
  return { intent, uploadUrl, contentType: mime };
}

/** Disco local (desarrollo/QA): misma intención firmada que la subida real. */
export async function storeLocalLibraryUpload(workspaceId: string, token: string, bytes: Uint8Array) {
  const intent = verifyLibraryIntent(token, workspaceId, getSessionSecret());
  if (!intent) throw new LibraryError('La subida venció o no es válida. Vuelve a elegir el archivo.');
  const storage = await resolveStorage();
  if (storage.signedUploadUrl) throw new LibraryError('Subida no disponible en este entorno.');
  if (bytes.byteLength > LIBRARY_TYPES[intent.contentType].maxBytes) throw new LibraryError('El archivo supera el tamaño permitido.');
  await storage.put(intent.key, bytes, intent.contentType);
}

/** Paso 2: verifica los bytes YA subidos y crea la pieza. Si no son válidos, se borran. */
export async function finalizeLibraryUpload(workspaceId: string, userId: string, input: z.infer<typeof finalizeSchema>) {
  const intent = verifyLibraryIntent(input.intent, workspaceId, getSessionSecret());
  if (!intent) throw new LibraryError('La subida venció o no es válida. Vuelve a elegir el archivo.');
  const existing = await prisma.contentAsset.findFirst({ where: { workspaceId, storageKey: intent.key } });
  if (existing) return existing; // doble clic o reintento: una sola pieza
  const storage = await resolveStorage();
  const head = await storage.head(intent.key, 64);
  if (!head) throw new LibraryError('No encontramos el archivo subido. Vuelve a intentarlo.');
  const verdict = verifyLibraryFile(head.bytes, head.size, intent.contentType);
  if (!verdict.ok) {
    await storage.remove(intent.key).catch(() => undefined);
    throw new LibraryError(verdict.message);
  }
  return prisma.contentAsset.create({
    data: { workspaceId, createdById: userId, kind: LIBRARY_TYPES[intent.contentType].kind, storageKey: intent.key, mimeType: intent.contentType, sizeBytes: head.size, ...clean(input) },
  });
}

export async function updateLibraryAsset(workspaceId: string, id: string, meta: z.infer<typeof assetMetaSchema>) {
  const updated = await prisma.contentAsset.updateMany({ where: { id, workspaceId }, data: clean(meta) });
  if (updated.count === 0) throw new LibraryError('Pieza no encontrada.');
}

/** No se borra lo que una publicación pendiente todavía necesita descargar. */
export async function deleteLibraryAsset(workspaceId: string, id: string) {
  const asset = await prisma.contentAsset.findFirst({ where: { id, workspaceId }, include: { posts: { where: { status: { not: 'PUBLISHED' } }, select: { id: true } } } });
  if (!asset) throw new LibraryError('Pieza no encontrada.');
  if (asset.posts.length) throw new LibraryError(`La usan ${asset.posts.length} publicación(es) pendiente(s): quítala de ellas antes de borrarla.`);
  await prisma.contentAsset.delete({ where: { id: asset.id } });
  await (await resolveStorage()).remove(asset.storageKey).catch(() => undefined);
}

/** URL absoluta que Instagram descarga (firmada, sin sesión). */
export function assetPublicUrl(assetId: string) {
  return `${(process.env.NEXT_PUBLIC_CRM_BASE_URL ?? 'http://localhost:3001').replace(/\/+$/, '')}${assetFilePath(assetId, getSessionSecret())}`;
}
