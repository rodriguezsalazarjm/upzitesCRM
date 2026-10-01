import { randomUUID } from 'node:crypto';
import { extensionFor, sniffMime } from '../../media/policy';
import { resolveStorage } from '../../storage';

/**
 * Portada de producto. Reutiliza la capa de almacenamiento de medios
 * (Supabase en produccion, disco en desarrollo) y la politica de tipos: el
 * tipo lo deciden los BYTES, no lo que declara el navegador. SVG, HTML y
 * cualquier otro contenido activo quedan fuera: solo JPEG, PNG y WebP.
 *
 * No es una biblioteca de archivos: una imagen por producto, guardada bajo la
 * carpeta del workspace, y su referencia en `Product.metadata.cover`.
 */

export const COVER_MAX_BYTES = 5 * 1024 * 1024;
export const COVER_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export type CoverRef = { key: string; mimeType: string; size: number; uploadedAt: string };

export class CoverError extends Error {
  constructor(
    message: string,
    readonly code: 'TOO_LARGE' | 'EMPTY' | 'UNSUPPORTED',
  ) {
    super(message);
    this.name = 'CoverError';
  }
}

/** Valida los bytes y devuelve el tipo real. */
export function inspectCover(bytes: Uint8Array) {
  if (bytes.byteLength === 0) throw new CoverError('El archivo está vacío.', 'EMPTY');
  if (bytes.byteLength > COVER_MAX_BYTES) throw new CoverError('La imagen supera 5 MB.', 'TOO_LARGE');
  const mime = sniffMime(bytes);
  if (!mime || !(COVER_MIME_TYPES as readonly string[]).includes(mime)) {
    throw new CoverError('Sube una imagen JPG, PNG o WebP.', 'UNSUPPORTED');
  }
  return mime;
}

/** La clave la arma el servidor: nunca usa el nombre del archivo recibido. */
export function coverKey(workspaceId: string, productId: string, mime: string) {
  return `products/${workspaceId}/${productId}/${randomUUID()}.${extensionFor(mime)}`;
}

export function readCover(metadata: unknown): CoverRef | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const cover = (metadata as { cover?: unknown }).cover;
  if (!cover || typeof cover !== 'object' || Array.isArray(cover)) return null;
  const { key, mimeType, size, uploadedAt } = cover as Record<string, unknown>;
  if (typeof key !== 'string' || typeof mimeType !== 'string' || !(COVER_MIME_TYPES as readonly string[]).includes(mimeType)) return null;
  return { key, mimeType, size: typeof size === 'number' ? size : 0, uploadedAt: typeof uploadedAt === 'string' ? uploadedAt : '' };
}

/** La clave tiene que estar dentro de la carpeta del workspace y del producto. */
export function coverBelongsTo(cover: CoverRef, workspaceId: string, productId: string) {
  return cover.key.startsWith(`products/${workspaceId}/${productId}/`);
}

export async function storeCover(workspaceId: string, productId: string, bytes: Uint8Array): Promise<CoverRef> {
  const mimeType = inspectCover(bytes);
  const key = coverKey(workspaceId, productId, mimeType);
  await (await resolveStorage()).put(key, bytes, mimeType);
  return { key, mimeType, size: bytes.byteLength, uploadedAt: new Date().toISOString() };
}

export async function readCoverBytes(cover: CoverRef) {
  return (await resolveStorage()).get(cover.key);
}

/** Borrado de una portada reemplazada. Si falla, solo se registra. */
export async function removeCoverObject(key: string) {
  try {
    await (await resolveStorage()).remove(key);
  } catch (error) {
    console.error('product_cover_remove_failed', { error: error instanceof Error ? error.message : String(error) });
  }
}

/** Copia para un producto duplicado: cada producto es dueno de su archivo. */
export async function copyCover(cover: CoverRef, workspaceId: string, productId: string): Promise<CoverRef | null> {
  const stored = await readCoverBytes(cover);
  if (!stored) return null;
  return storeCover(workspaceId, productId, stored.bytes);
}
