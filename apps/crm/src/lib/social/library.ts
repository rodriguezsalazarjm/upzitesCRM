import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { sniffMime } from '../media/policy';

/**
 * P22 Content Library: reglas puras (sin base ni storage).
 *
 * Solo JPG y MP4: son los formatos que Instagram publica. El tipo lo deciden
 * los BYTES ya subidos, no lo que declara el navegador.
 */
export const LIBRARY_TYPES = {
  'image/jpeg': { kind: 'IMAGE', maxBytes: 8 * 1024 * 1024, ext: 'jpg' },
  'video/mp4': { kind: 'VIDEO', maxBytes: 100 * 1024 * 1024, ext: 'mp4' },
} as const;
export type LibraryMime = keyof typeof LIBRARY_TYPES;
const INTENT_TTL_MS = 15 * 60_000;

export function libraryMimeFor(declared: string, fileName: string): LibraryMime | null {
  const type = declared.toLowerCase().split(';')[0].trim();
  if (type in LIBRARY_TYPES) return type as LibraryMime;
  if (/\.jpe?g$/i.test(fileName)) return 'image/jpeg';
  if (/\.mp4$/i.test(fileName)) return 'video/mp4';
  return null;
}

/** La clave la arma el servidor y siempre cae dentro de la carpeta del workspace. */
export function libraryKey(workspaceId: string, mime: LibraryMime) {
  return `content/${workspaceId}/${randomUUID()}.${LIBRARY_TYPES[mime].ext}`;
}

/** Veredicto sobre los primeros bytes del objeto subido. */
export function verifyLibraryFile(head: Uint8Array, size: number, expected: LibraryMime): { ok: true } | { ok: false; message: string } {
  if (size === 0) return { ok: false, message: 'El archivo está vacío.' };
  if (sniffMime(head) !== expected) return { ok: false, message: 'Solo se aceptan imágenes JPG y videos MP4 (los formatos que publica Instagram).' };
  if (size > LIBRARY_TYPES[expected].maxBytes) return { ok: false, message: expected === 'video/mp4' ? 'El video supera 100 MB.' : 'La imagen supera 8 MB.' };
  return { ok: true };
}

type Intent = { workspaceId: string; key: string; contentType: LibraryMime; expiresAt: number };

const sign = (payload: string, secret: string) => createHmac('sha256', secret).update(`content-upload:v1:${payload}`).digest('base64url');

export function signLibraryIntent(input: Omit<Intent, 'expiresAt'>, secret: string, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ ...input, expiresAt: now + INTENT_TTL_MS }), 'utf8').toString('base64url');
  return `${payload}.${sign(payload, secret)}`;
}

export function verifyLibraryIntent(token: string, workspaceId: string, secret: string, now = Date.now()): Intent | null {
  const [payload, signature, ...rest] = token.split('.');
  if (!payload || !signature || rest.length) return null;
  const wanted = Buffer.from(sign(payload, secret));
  const given = Buffer.from(signature);
  if (wanted.length !== given.length || !timingSafeEqual(wanted, given)) return null;
  let intent: Intent;
  try {
    intent = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Intent;
  } catch {
    return null;
  }
  if (intent.workspaceId !== workspaceId || intent.expiresAt < now) return null;
  if (!intent.key.startsWith(`content/${workspaceId}/`) || !(intent.contentType in LIBRARY_TYPES)) return null;
  return intent;
}

/**
 * Firma determinística por pieza: Instagram descarga el archivo sin sesión,
 * así que la URL pública lleva esta firma (no se pueden enumerar piezas ajenas).
 */
export function signAssetKey(assetId: string, secret: string) {
  return createHmac('sha256', secret).update(`content-asset:v1:${assetId}`).digest('base64url').slice(0, 32);
}

export function verifyAssetKey(assetId: string, key: string | null, secret: string) {
  if (!key || !/^[A-Za-z0-9_-]{32}$/.test(key)) return false;
  const wanted = Buffer.from(signAssetKey(assetId, secret));
  return timingSafeEqual(wanted, Buffer.from(key));
}

export function assetFilePath(assetId: string, secret: string) {
  return `/api/content-assets/${encodeURIComponent(assetId)}/file?k=${signAssetKey(assetId, secret)}`;
}
