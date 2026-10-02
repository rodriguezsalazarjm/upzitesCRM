import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { isActiveContent, safeFileName, sniffMime } from '../../media/policy';
import { DELIVERABLE_FORMATS, DELIVERABLE_MAX_BYTES, DELIVERABLE_MIME, LINK_FORMATS, type DeliverableFormat } from './constants';

/**
 * Digital Asset Manager (Punto 3) — reglas puras.
 *
 * Todo lo de este archivo decide sin tocar base, red ni almacenamiento: que
 * tipos de archivo se aceptan, como se verifica que un archivo es lo que dice
 * ser, que URL externa es aceptable, en que orden se entrega y como se firma
 * una subida. Es lo que prueban los tests de unidad.
 */

// --- Formatos -----------------------------------------------------------------

export {
  DELIVERABLE_ACCEPT,
  DELIVERABLE_FORMATS,
  DELIVERABLE_MAX_BYTES,
  DELIVERABLE_MIME,
  DELIVERABLE_MIME_TYPES,
  FORMAT_LABEL,
  LINK_FORMATS,
  type DeliverableFormat,
  type LinkFormat,
} from './constants';

const TYPE_ALIASES: Record<string, string> = {
  'application/x-zip-compressed': 'application/zip',
  'application/x-zip': 'application/zip',
  'multipart/x-zip': 'application/zip',
  'audio/mp3': 'audio/mpeg',
  'audio/x-mpeg': 'audio/mpeg',
  'audio/x-mp3': 'audio/mpeg',
  'audio/x-m4a': 'audio/mp4',
  'audio/m4a': 'audio/mp4',
  'audio/x-wav': 'audio/wav',
  'audio/wave': 'audio/wav',
  'audio/vnd.wave': 'audio/wav',
  'audio/x-aac': 'audio/aac',
  'application/ogg': 'audio/ogg',
  'video/x-m4v': 'video/mp4',
};

const EXTENSION_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  zip: 'application/zip',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  aac: 'audio/aac',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
};

const EXTENSION_FOR: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/zip': 'zip',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/wav': 'wav',
  'audio/ogg': 'ogg',
  'audio/aac': 'aac',
  'video/mp4': 'mp4',
};

export function extensionForDeliverable(mime: string) {
  return EXTENSION_FOR[mime] ?? 'bin';
}

/**
 * Tipo con el que se intenta subir, a partir de lo que declara el navegador y
 * de la extension. Es solo una expectativa: la decision final la toman los
 * bytes (`verifyDeliverable`). null = formato no admitido.
 */
export function expectedUploadType(fileName: string, declaredType: string | null | undefined) {
  const declared = (declaredType ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
  if (declared && isActiveContent(declared)) return null;
  const fromDeclared = DELIVERABLE_MIME[declared] ? declared : TYPE_ALIASES[declared];
  if (fromDeclared) return fromDeclared;
  const extension = /\.([a-z0-9]{1,5})$/i.exec(fileName.trim())?.[1]?.toLowerCase();
  // Sin tipo declarado (o uno generico) se acepta la extension. Uno declarado y
  // distinto de todo lo admitido no se "corrige" con la extension.
  if (declared && declared !== 'application/octet-stream') return null;
  return extension ? (EXTENSION_TYPES[extension] ?? null) : null;
}

export type DeliverableVerdict =
  | { ok: true; mimeType: string; format: Exclude<DeliverableFormat, 'LINK'> }
  | { ok: false; code: 'EMPTY' | 'TOO_LARGE' | 'UNSUPPORTED' | 'MISMATCH'; message: string };

/**
 * Verifica un archivo por su FIRMA (los primeros bytes) y su tamano real.
 *
 * La extension, el nombre y el Content-Type del navegador no deciden nada: un
 * HTML renombrado a .pdf, un SVG, un ejecutable o un script no tienen la firma
 * de un formato admitido y se rechazan. Todos los formatos admitidos tienen
 * firma reconocible, asi que "sin firma" tambien es rechazo.
 */
export function verifyDeliverable(head: Uint8Array, size: number, expectedType: string): DeliverableVerdict {
  if (size <= 0 || head.byteLength === 0) return { ok: false, code: 'EMPTY', message: 'El archivo está vacío.' };
  if (size > DELIVERABLE_MAX_BYTES) {
    return { ok: false, code: 'TOO_LARGE', message: 'El archivo supera 50 MB. Para videos pesados agrega un enlace.' };
  }
  const sniffed = sniffMime(head);
  if (!sniffed || isActiveContent(sniffed) || !DELIVERABLE_MIME[sniffed]) {
    return { ok: false, code: 'UNSUPPORTED', message: 'El contenido del archivo no es un PDF, audio, ZIP o video MP4 válido.' };
  }
  // MP4 y M4A comparten contenedor: se acepta cualquiera de los dos y manda la firma.
  const mp4Pair = new Set(['audio/mp4', 'video/mp4']);
  if (sniffed !== expectedType && !(mp4Pair.has(sniffed) && mp4Pair.has(expectedType))) {
    return { ok: false, code: 'MISMATCH', message: 'El contenido del archivo no corresponde a su tipo.' };
  }
  return { ok: true, mimeType: sniffed, format: DELIVERABLE_MIME[sniffed] };
}

/** Nombre de descarga: algo reconocible para el comprador, sin rutas ni comillas. */
export function downloadName(displayName: string, mimeType: string) {
  const extension = extensionForDeliverable(mimeType);
  const clean = safeFileName(displayName, mimeType);
  return clean.toLowerCase().endsWith(`.${extension}`) ? clean : `${clean}.${extension}`;
}

// --- Entradas (Zod estricto: nada de workspaceId, claves ni estados) ----------

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

export const assetNameSchema = z
  .string({ required_error: 'Escribe un nombre.' })
  .trim()
  .min(1, 'Escribe un nombre.')
  .max(120, 'El nombre admite hasta 120 caracteres.')
  .refine((value) => !CONTROL_CHARS.test(value), 'El nombre tiene caracteres no válidos.');

/**
 * URL externa: solo https, sin credenciales embebidas. Se valida la forma, no
 * se descarga: el servidor nunca hace requests a URLs que escribe un usuario
 * (sin SSRF). javascript:, data:, file: y cualquier otro esquema se rechazan.
 */
export const externalUrlSchema = z
  .string({ required_error: 'Escribe la URL.' })
  .trim()
  .min(1, 'Escribe la URL.')
  .max(2048, 'La URL es demasiado larga.')
  .superRefine((value, context) => {
    const problem = externalUrlProblem(value);
    if (problem) context.addIssue({ code: z.ZodIssueCode.custom, message: problem });
  });

export function externalUrlProblem(value: string): string | null {
  if (CONTROL_CHARS.test(value) || /\s/.test(value)) return 'La URL no puede tener espacios.';
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return 'Escribe una URL completa, que empiece con https://';
  }
  if (url.protocol !== 'https:') return 'Solo se admiten enlaces https://';
  if (url.username || url.password) return 'La URL no puede incluir usuario ni contraseña.';
  if (!url.hostname || !url.hostname.includes('.')) return 'La URL no tiene un dominio válido.';
  return null;
}

export const linkAssetSchema = z
  .object({
    source: z.literal('link'),
    name: assetNameSchema,
    url: externalUrlSchema,
    format: z.enum(LINK_FORMATS).default('LINK'),
  })
  .strict();

export const uploadIntentSchema = z
  .object({
    fileName: z.string().trim().min(1, 'Elige un archivo.').max(255),
    size: z.number().int().positive('El archivo está vacío.'),
    type: z.string().max(255).optional().default(''),
  })
  .strict();

export const finalizeUploadSchema = z
  .object({
    source: z.literal('upload'),
    intent: z.string().min(10).max(2048),
    name: assetNameSchema,
    /** Reemplazo: el archivo nuevo ocupa el lugar del anterior. */
    replaceAssetId: z.string().min(1).max(64).optional(),
  })
  .strict();

export const createAssetSchema = z.discriminatedUnion('source', [linkAssetSchema, finalizeUploadSchema]);

export const assetPatchSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('update'),
      name: assetNameSchema,
      url: externalUrlSchema.optional(),
      format: z.enum(LINK_FORMATS).optional(),
    })
    .strict(),
  z.object({ action: z.literal('activate') }).strict(),
  z.object({ action: z.literal('deactivate') }).strict(),
  z.object({ action: z.literal('move'), direction: z.enum(['up', 'down']) }).strict(),
]);

export type AssetPatch = z.infer<typeof assetPatchSchema>;

// --- Orden --------------------------------------------------------------------

/** Nuevo orden tras subir/bajar un asset. Devuelve null si no se puede mover. */
export function moveInOrder(ids: string[], id: string, direction: 'up' | 'down') {
  const index = ids.indexOf(id);
  const target = direction === 'up' ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= ids.length) return null;
  const next = [...ids];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

// --- Plan de entrega ------------------------------------------------------------

export type PlanAsset = {
  id: string;
  kind: 'FILE' | 'LINK' | 'CODE';
  format: DeliverableFormat | null;
  name: string;
  target: string;
  mimeType: string | null;
  sizeBytes: number | null;
  fileName: string | null;
  position: number;
  isActive: boolean;
  archivedAt: Date | null;
  createdAt: Date;
};

export type PlanProduct = { productId: string; productName: string; assets: PlanAsset[] };

export type PlannedItem = Omit<PlanAsset, 'isActive' | 'archivedAt' | 'createdAt' | 'position'> & {
  assetId: string;
  productName: string;
  position: number;
};

/**
 * Que entra en una entrega y en que orden: producto por producto (el
 * principal primero, luego el adicional), y dentro de cada uno sus assets
 * ACTIVOS y no eliminados por su orden configurado. Un mismo asset nunca
 * aparece dos veces, aunque el producto este en dos lineas.
 */
export function planDelivery(products: PlanProduct[]): PlannedItem[] {
  const seenProducts = new Set<string>();
  const seenAssets = new Set<string>();
  const items: PlannedItem[] = [];
  for (const product of products) {
    if (seenProducts.has(product.productId)) continue;
    seenProducts.add(product.productId);
    const ordered = product.assets
      .filter((asset) => asset.isActive && !asset.archivedAt)
      .sort((a, b) => a.position - b.position || a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
    for (const asset of ordered) {
      if (seenAssets.has(asset.id)) continue;
      seenAssets.add(asset.id);
      items.push({
        assetId: asset.id,
        productName: product.productName,
        kind: asset.kind,
        format: asset.format ?? formatOf(asset),
        name: asset.name,
        target: asset.target,
        mimeType: asset.mimeType,
        sizeBytes: asset.sizeBytes,
        fileName: asset.fileName,
        id: asset.id,
        position: items.length,
      });
    }
  }
  return items;
}

/** Formato de un asset (los anteriores al Punto 3 no lo guardaban). */
export function formatOf(asset: { kind: string; format?: string | null; mimeType?: string | null }): DeliverableFormat | null {
  if (asset.format && (DELIVERABLE_FORMATS as readonly string[]).includes(asset.format)) return asset.format as DeliverableFormat;
  if (asset.kind === 'LINK') return 'LINK';
  if (asset.kind === 'FILE' && asset.mimeType) return DELIVERABLE_MIME[asset.mimeType] ?? null;
  return null;
}

// --- Intencion de subida firmada ------------------------------------------------

/**
 * La subida va directo del navegador al almacenamiento (los archivos superan el
 * tope de cuerpo de una funcion). Para que el navegador no pueda elegir la
 * clave ni el producto, el servidor firma una "intencion" con todo eso y solo
 * la acepta de vuelta intacta, para el mismo workspace y producto, y vigente.
 */
export type UploadIntent = {
  workspaceId: string;
  productId: string;
  key: string;
  contentType: string;
  expiresAt: number;
};

export const UPLOAD_INTENT_TTL_MS = 2 * 3_600_000;

function intentSignature(payload: string, secret: string) {
  return createHmac('sha256', secret).update(`digital-asset-upload:v1:${payload}`).digest('base64url');
}

export function signUploadIntent(intent: UploadIntent, secret: string) {
  const payload = Buffer.from(JSON.stringify(intent), 'utf8').toString('base64url');
  return `${payload}.${intentSignature(payload, secret)}`;
}

export function verifyUploadIntent(
  token: string,
  expected: { workspaceId: string; productId: string },
  secret: string,
  now = Date.now(),
): UploadIntent | null {
  const [payload, signature, ...rest] = token.split('.');
  if (!payload || !signature || rest.length > 0) return null;
  const wanted = Buffer.from(intentSignature(payload, secret), 'utf8');
  const given = Buffer.from(signature, 'utf8');
  if (wanted.length !== given.length || !timingSafeEqual(wanted, given)) return null;
  let intent: UploadIntent;
  try {
    intent = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as UploadIntent;
  } catch {
    return null;
  }
  if (intent.workspaceId !== expected.workspaceId || intent.productId !== expected.productId) return null;
  if (typeof intent.expiresAt !== 'number' || intent.expiresAt < now) return null;
  if (!deliverableKeyBelongsTo(intent.key, expected.workspaceId, expected.productId)) return null;
  if (!DELIVERABLE_MIME[intent.contentType]) return null;
  return intent;
}

/** Prefijo de las claves de entregables: workspace y producto, siempre. */
export function deliverableKeyPrefix(workspaceId: string, productId: string) {
  return `deliverables/${workspaceId}/${productId}/`;
}

const DELIVERABLE_KEY = /^deliverables\/[A-Za-z0-9_-]{1,64}\/[A-Za-z0-9_-]{1,64}\/[a-f0-9-]{36}\.[a-z0-9]{2,4}$/;

export function deliverableKeyBelongsTo(key: string, workspaceId: string, productId: string) {
  return DELIVERABLE_KEY.test(key) && key.startsWith(deliverableKeyPrefix(workspaceId, productId));
}
