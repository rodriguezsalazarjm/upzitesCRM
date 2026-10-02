import { randomUUID } from 'node:crypto';
import { DigitalAssetKind, ProductStatus, type Prisma } from '../../../../generated/prisma/client';
import { prisma } from '../../prisma';
import { recordAudit } from '../../domain/audit';
import { assertFeature } from '../../entitlements';
import { getSessionSecret } from '../../session-token';
import { resolveDeliveryStorage, type StorageDriver } from '../../storage';
import { ProductStudioError, type StudioActor } from '../product-studio/service';
import { canManageWorkspaceSettings } from '../../workspace-roles';
import {
  DELIVERABLE_MAX_BYTES,
  UPLOAD_INTENT_TTL_MS,
  assetPatchSchema,
  createAssetSchema,
  deliverableKeyBelongsTo,
  deliverableKeyPrefix,
  downloadName,
  expectedUploadType,
  extensionForDeliverable,
  formatOf,
  moveInOrder,
  signUploadIntent,
  uploadIntentSchema,
  verifyDeliverable,
  verifyUploadIntent,
  type DeliverableFormat,
} from './rules';

/**
 * Digital Asset Manager (Punto 3) — servicio de dominio.
 *
 * Administra lo que recibe el comprador de un producto (`DigitalAsset`), desde
 * la interfaz: archivos privados en el bucket de entregables y enlaces
 * externos, con orden, activo/inactivo y vista previa. Mismas reglas que el
 * Product Sales Studio: el actor sale de la sesion verificada, toda consulta va
 * acotada por `workspaceId` y un id ajeno responde NOT_FOUND igual que uno
 * inexistente.
 *
 * Lo ya entregado no se toca desde aqui: cada entrega guarda su propia copia de
 * los assets (`DigitalDeliveryItem`). Por eso eliminar un asset que ya se
 * entrego lo ARCHIVA (deja de entregarse, pero su fila y su archivo siguen
 * sirviendo a las entregas previas) y reemplazar un archivo sube un objeto
 * NUEVO en vez de sobrescribir el anterior.
 */

type Db = typeof prisma | Prisma.TransactionClient;

/** Cuanto se lee del archivo para verificar su firma. */
const SNIFF_BYTES = 4096;
/** Vida de una URL firmada de vista previa o descarga. */
export const SIGNED_URL_TTL_SECONDS = 60;

function assertCanManage(actor: StudioActor) {
  if (!canManageWorkspaceSettings(actor.role)) {
    throw new ProductStudioError('FORBIDDEN', 'Solo el propietario o un administrador del negocio pueden modificar la entrega digital.');
  }
}

async function loadProduct(db: Db, workspaceId: string, productId: string) {
  const product = await db.product.findFirst({
    where: { id: productId, workspaceId },
    select: { id: true, workspaceId: true, name: true, type: true, status: true, connectionId: true },
  });
  if (!product) throw new ProductStudioError('NOT_FOUND', 'Producto no encontrado.');
  return product;
}

function assertEditable(product: { status: ProductStatus; connectionId: string | null }) {
  if (product.connectionId) {
    throw new ProductStudioError('READ_ONLY', 'Este producto se sincroniza desde Shopify: su entrega no se administra aquí.');
  }
  if (product.status === ProductStatus.ARCHIVED) {
    throw new ProductStudioError('READ_ONLY', 'El producto está archivado. Restáuralo para editar su entrega.');
  }
}

async function mutable(actor: StudioActor, productId: string, db: Db = prisma) {
  assertCanManage(actor);
  await assertFeature(actor.workspaceId, 'commerce.products');
  const product = await loadProduct(db, actor.workspaceId, productId);
  assertEditable(product);
  return product;
}

async function lockProductAssets(tx: Prisma.TransactionClient, productId: string) {
  // Serializa altas, bajas y cambios de orden de un producto: dos pestanas
  // reordenando a la vez no dejan posiciones repetidas.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`digital-assets:${productId}`}, 0))`;
}

async function loadAsset(db: Db, workspaceId: string, productId: string, assetId: string) {
  const asset = await db.digitalAsset.findFirst({ where: { id: assetId, workspaceId, productId, archivedAt: null } });
  if (!asset) throw new ProductStudioError('NOT_FOUND', 'Contenido no encontrado.');
  return asset;
}

/** Assets visibles del producto (sin los archivados), en orden. */
async function orderedAssets(db: Db, workspaceId: string, productId: string) {
  return db.digitalAsset.findMany({
    where: { workspaceId, productId, archivedAt: null },
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
  });
}

/** Reescribe posiciones 0..n-1 en el orden dado. */
async function writeOrder(tx: Prisma.TransactionClient, ids: string[]) {
  for (const [position, id] of ids.entries()) {
    await tx.digitalAsset.update({ where: { id }, data: { position } });
  }
}

function invalid(message: string, field?: string): never {
  throw new ProductStudioError('INVALID', message, field);
}

function parse<T>(schema: { safeParse(raw: unknown): { success: true; data: T } | { success: false; error: { issues: { message: string; path: (string | number)[] }[] } } }, raw: unknown): T {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    invalid(issue?.message ?? 'Datos inválidos.', issue?.path.join('.') || undefined);
  }
  return parsed.data;
}

// --- Lectura ----------------------------------------------------------------

export type AssetView = {
  id: string;
  name: string;
  source: 'FILE' | 'LINK' | 'CODE';
  format: DeliverableFormat | null;
  url: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  isActive: boolean;
  position: number;
  updatedAt: Date;
};

export async function listProductAssets(workspaceId: string, productId: string) {
  const product = await loadProduct(prisma, workspaceId, productId);
  const assets = await orderedAssets(prisma, workspaceId, product.id);
  const views: AssetView[] = assets.map((asset, index) => ({
    id: asset.id,
    name: asset.name,
    source: asset.kind,
    format: formatOf(asset),
    // La clave del almacenamiento nunca sale del servidor; la URL de un enlace si.
    url: asset.kind === DigitalAssetKind.LINK ? asset.target : null,
    mimeType: asset.mimeType,
    sizeBytes: asset.sizeBytes,
    isActive: asset.isActive,
    position: index + 1,
    updatedAt: asset.updatedAt,
  }));
  return { product, assets: views };
}

/** Resumen para la ficha del producto: cuantos activos hay y si falta contenido. */
export async function deliverySummary(workspaceId: string, productId: string) {
  const [active, total] = await Promise.all([
    prisma.digitalAsset.count({ where: { workspaceId, productId, archivedAt: null, isActive: true } }),
    prisma.digitalAsset.count({ where: { workspaceId, productId, archivedAt: null } }),
  ]);
  return { active, total };
}

// --- Enlaces ------------------------------------------------------------------

async function audit(actor: StudioActor, action: string, assetId: string, metadata: Prisma.InputJsonValue) {
  await recordAudit({ workspaceId: actor.workspaceId, actorId: actor.userId, action, entity: 'DigitalAsset', entityId: assetId, metadata });
}

export async function createAsset(actor: StudioActor, productId: string, raw: unknown) {
  const input = parse(createAssetSchema, raw);
  if (input.source === 'upload') return finalizeUpload(actor, productId, input);

  const product = await mutable(actor, productId);
  const asset = await prisma.$transaction(async (tx) => {
    await lockProductAssets(tx, product.id);
    const count = await tx.digitalAsset.count({ where: { productId: product.id, archivedAt: null } });
    return tx.digitalAsset.create({
      data: {
        workspaceId: actor.workspaceId,
        productId: product.id,
        kind: DigitalAssetKind.LINK,
        format: input.format,
        name: input.name,
        target: input.url,
        position: count,
      },
    });
  });
  // La URL no va a la auditoria: puede ser un enlace privado del negocio.
  await audit(actor, 'product.asset_added', asset.id, { productId: product.id, source: 'LINK', format: input.format });
  return { id: asset.id };
}

// --- Subidas ------------------------------------------------------------------

export type UploadTicket = {
  intent: string;
  /** PUT con el cuerpo crudo del archivo y este Content-Type. */
  uploadUrl: string;
  contentType: string;
};

/**
 * Prepara una subida: valida tipo esperado y tamano declarado, elige la clave
 * (el servidor, nunca el nombre del archivo) y devuelve a donde subir.
 */
export async function createUploadIntent(actor: StudioActor, productId: string, raw: unknown): Promise<UploadTicket> {
  const input = parse(uploadIntentSchema, raw);
  const product = await mutable(actor, productId);
  const contentType = expectedUploadType(input.fileName, input.type);
  if (!contentType) invalid('Formato no permitido. Sube un PDF, audio (MP3, M4A, WAV, OGG, AAC), ZIP o video MP4.', 'file');
  if (input.size > DELIVERABLE_MAX_BYTES) invalid('El archivo supera 50 MB. Para videos pesados agrega un enlace.', 'file');

  const key = `${deliverableKeyPrefix(actor.workspaceId, product.id)}${randomUUID()}.${extensionForDeliverable(contentType)}`;
  const intent = signUploadIntent(
    { workspaceId: actor.workspaceId, productId: product.id, key, contentType, expiresAt: Date.now() + UPLOAD_INTENT_TTL_MS },
    getSessionSecret(),
  );
  const storage = await resolveDeliveryStorage();
  const uploadUrl = storage.signedUploadUrl
    ? await storage.signedUploadUrl(key)
    : // Disco local (desarrollo y pruebas): la subida pasa por una ruta propia
      // que exige la misma intencion firmada.
      `/api/products/${encodeURIComponent(product.id)}/assets/upload/local?intent=${encodeURIComponent(intent)}`;
  return { intent, uploadUrl, contentType };
}

/** Subida al disco local (solo driver filesystem): misma verificacion que la real. */
export async function storeLocalUpload(actor: StudioActor, productId: string, intentToken: string, bytes: Uint8Array) {
  const product = await mutable(actor, productId);
  const intent = verifyUploadIntent(intentToken, { workspaceId: actor.workspaceId, productId: product.id }, getSessionSecret());
  if (!intent) invalid('La subida venció o no es válida. Vuelve a elegir el archivo.', 'file');
  const storage = await resolveDeliveryStorage();
  if (storage.signedUploadUrl) throw new ProductStudioError('FORBIDDEN', 'Subida no disponible en este entorno.');
  if (bytes.byteLength > DELIVERABLE_MAX_BYTES) invalid('El archivo supera 50 MB.', 'file');
  await storage.put(intent.key, bytes, intent.contentType);
}

async function discard(storage: StorageDriver, key: string) {
  try {
    await storage.remove(key);
  } catch (error) {
    console.error('digital_asset_discard_failed', { error: error instanceof Error ? error.message : String(error) });
  }
}

/**
 * Confirma una subida: verifica la intencion firmada, lee los primeros bytes
 * del objeto YA subido y decide por su firma. Si no es un formato admitido, el
 * objeto se borra y no queda ningun asset.
 */
async function finalizeUpload(
  actor: StudioActor,
  productId: string,
  input: { intent: string; name: string; replaceAssetId?: string },
) {
  const product = await mutable(actor, productId);
  const intent = verifyUploadIntent(input.intent, { workspaceId: actor.workspaceId, productId: product.id }, getSessionSecret());
  if (!intent) invalid('La subida venció o no es válida. Vuelve a elegir el archivo.', 'file');

  const storage = await resolveDeliveryStorage();
  const head = await storage.head(intent.key, SNIFF_BYTES);
  if (!head) throw new ProductStudioError('NOT_FOUND', 'No encontramos el archivo subido. Vuelve a intentarlo.', 'file');

  const verdict = verifyDeliverable(head.bytes, head.size, intent.contentType);
  if (!verdict.ok) {
    await discard(storage, intent.key);
    invalid(verdict.message, 'file');
  }

  const fileName = downloadName(input.name, verdict.mimeType);
  const { asset, replaced } = await prisma.$transaction(async (tx) => {
    await lockProductAssets(tx, product.id);
    // Una misma intencion no crea dos assets (doble clic, reintento del navegador).
    if (await tx.digitalAsset.findFirst({ where: { workspaceId: actor.workspaceId, target: intent.key }, select: { id: true } })) {
      throw new ProductStudioError('CONFLICT', 'Este archivo ya fue agregado.');
    }
    const previous = input.replaceAssetId ? await loadAsset(tx, actor.workspaceId, product.id, input.replaceAssetId) : null;
    if (previous && previous.kind !== DigitalAssetKind.FILE) invalid('Solo se puede reemplazar un archivo.', 'replaceAssetId');
    const position = previous ? previous.position : await tx.digitalAsset.count({ where: { productId: product.id, archivedAt: null } });
    const created = await tx.digitalAsset.create({
      data: {
        workspaceId: actor.workspaceId,
        productId: product.id,
        kind: DigitalAssetKind.FILE,
        format: verdict.format,
        name: input.name,
        target: intent.key,
        mimeType: verdict.mimeType,
        sizeBytes: head.size,
        fileName,
        position,
        isActive: previous ? previous.isActive : true,
      },
    });
    const retired = previous ? { id: previous.id, target: previous.target, archived: await retireAsset(tx, previous) } : null;
    return { asset: created, replaced: retired };
  });

  if (replaced) {
    // El objeto anterior NO se sobrescribe: si alguna entrega lo incluyo, sigue
    // ahi para ella; si nadie lo uso, se borra.
    if (!replaced.archived && deliverableKeyBelongsTo(replaced.target, actor.workspaceId, product.id)) {
      await removeUnreferencedObject(storage, actor.workspaceId, replaced.target, replaced.id);
    }
    await audit(actor, 'product.asset_replaced', asset.id, { productId: product.id, replaces: replaced.id, previousKept: replaced.archived, format: verdict.format, size: head.size });
  } else {
    await audit(actor, 'product.asset_added', asset.id, { productId: product.id, source: 'FILE', format: verdict.format, size: head.size });
  }
  return { id: asset.id };
}

// --- Cambios ------------------------------------------------------------------

export async function updateAsset(actor: StudioActor, productId: string, assetId: string, raw: unknown) {
  const patch = parse(assetPatchSchema, raw);
  const product = await mutable(actor, productId);

  return prisma.$transaction(async (tx) => {
    await lockProductAssets(tx, product.id);
    const asset = await loadAsset(tx, actor.workspaceId, product.id, assetId);

    if (patch.action === 'move') {
      const ids = (await orderedAssets(tx, actor.workspaceId, product.id)).map((item) => item.id);
      const next = moveInOrder(ids, asset.id, patch.direction);
      if (!next) return { moved: false };
      await writeOrder(tx, next);
      await recordAudit({ workspaceId: actor.workspaceId, actorId: actor.userId, action: 'product.assets_reordered', entity: 'Product', entityId: product.id, metadata: { assetId: asset.id, direction: patch.direction } }, tx);
      return { moved: true };
    }

    if (patch.action === 'activate' || patch.action === 'deactivate') {
      const isActive = patch.action === 'activate';
      if (asset.isActive !== isActive) {
        await tx.digitalAsset.update({ where: { id: asset.id }, data: { isActive } });
        await recordAudit({ workspaceId: actor.workspaceId, actorId: actor.userId, action: isActive ? 'product.asset_activated' : 'product.asset_deactivated', entity: 'DigitalAsset', entityId: asset.id, metadata: { productId: product.id } }, tx);
      }
      return { isActive };
    }

    if (asset.kind !== DigitalAssetKind.LINK && (patch.url !== undefined || patch.format !== undefined)) {
      invalid('Un archivo no tiene URL: para cambiarlo, reemplázalo.', 'url');
    }
    const data: Prisma.DigitalAssetUpdateInput = { name: patch.name };
    if (asset.kind === DigitalAssetKind.LINK) {
      if (patch.url !== undefined) data.target = patch.url;
      if (patch.format !== undefined) data.format = patch.format;
    } else if (asset.kind === DigitalAssetKind.FILE && asset.mimeType) {
      data.fileName = downloadName(patch.name, asset.mimeType);
    }
    await tx.digitalAsset.update({ where: { id: asset.id }, data });
    await recordAudit({ workspaceId: actor.workspaceId, actorId: actor.userId, action: 'product.asset_updated', entity: 'DigitalAsset', entityId: asset.id, metadata: { productId: product.id, urlChanged: patch.url !== undefined && patch.url !== asset.target } }, tx);
    return { updated: true };
  });
}

/**
 * Saca un asset de las entregas futuras. Si alguna entrega ya lo incluyo, se
 * archiva (la fila y el archivo siguen para esas entregas); si no, se borra.
 * Devuelve si quedo archivado.
 */
async function retireAsset(tx: Prisma.TransactionClient, asset: { id: string; productId: string; workspaceId: string }) {
  const delivered = await tx.digitalDeliveryItem.count({ where: { assetId: asset.id } });
  if (delivered > 0) {
    await tx.digitalAsset.update({ where: { id: asset.id }, data: { archivedAt: new Date(), isActive: false } });
  } else {
    await tx.digitalAsset.delete({ where: { id: asset.id } });
  }
  const remaining = await orderedAssets(tx, asset.workspaceId, asset.productId);
  await writeOrder(tx, remaining.map((item) => item.id));
  return delivered > 0;
}

/** Borra un objeto del bucket solo si ninguna entrega lo referencia. */
async function removeUnreferencedObject(storage: StorageDriver, workspaceId: string, key: string | null, assetId: string) {
  if (!key) return;
  const referenced = await prisma.digitalDeliveryItem.count({ where: { target: key } });
  const stillUsed = await prisma.digitalAsset.count({ where: { workspaceId, target: key, id: { not: assetId } } });
  if (referenced === 0 && stillUsed === 0) await discard(storage, key);
}

export async function removeAsset(actor: StudioActor, productId: string, assetId: string) {
  const product = await mutable(actor, productId);
  const { asset, archived } = await prisma.$transaction(async (tx) => {
    await lockProductAssets(tx, product.id);
    const found = await loadAsset(tx, actor.workspaceId, product.id, assetId);
    return { asset: found, archived: await retireAsset(tx, found) };
  });

  if (!archived && asset.kind === DigitalAssetKind.FILE && deliverableKeyBelongsTo(asset.target, actor.workspaceId, product.id)) {
    await removeUnreferencedObject(await resolveDeliveryStorage(), actor.workspaceId, asset.target, asset.id);
  }
  await audit(actor, archived ? 'product.asset_archived' : 'product.asset_removed', asset.id, { productId: product.id, source: asset.kind, keptForPastDeliveries: archived });
  return { archived };
}

// --- Vista previa ---------------------------------------------------------------

export type AssetPreview =
  | { type: 'redirect'; url: string }
  | { type: 'bytes'; bytes: Uint8Array; mimeType: string; fileName: string };

/**
 * Vista previa para el equipo: sesion + workspace + rol, sin token de
 * comprador, sin venta y sin tocar ninguna entrega. Un archivo privado se abre
 * con una URL firmada de un minuto (o servido por la API con el disco local).
 */
export async function previewAsset(actor: StudioActor, productId: string, assetId: string): Promise<AssetPreview> {
  assertCanManage(actor);
  const product = await loadProduct(prisma, actor.workspaceId, productId);
  const asset = await loadAsset(prisma, actor.workspaceId, product.id, assetId);

  if (asset.kind === DigitalAssetKind.LINK) return { type: 'redirect', url: asset.target };
  if (asset.kind !== DigitalAssetKind.FILE || !asset.mimeType || !deliverableKeyBelongsTo(asset.target, actor.workspaceId, product.id)) {
    throw new ProductStudioError('NOT_FOUND', 'Contenido no encontrado.');
  }
  const storage = await resolveDeliveryStorage();
  const fileName = asset.fileName ?? downloadName(asset.name, asset.mimeType);
  if (storage.signedDownloadUrl) {
    return { type: 'redirect', url: await storage.signedDownloadUrl(asset.target, { expiresInSeconds: SIGNED_URL_TTL_SECONDS }) };
  }
  const stored = await storage.get(asset.target);
  if (!stored) throw new ProductStudioError('NOT_FOUND', 'El archivo ya no está en el almacenamiento.');
  return { type: 'bytes', bytes: stored.bytes, mimeType: asset.mimeType, fileName };
}
