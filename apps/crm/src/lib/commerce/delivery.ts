import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  ActivityType,
  AlertKind,
  AlertSeverity,
  DeliveryStatus,
  DigitalAssetKind,
  FulfillmentStatus,
  FulfillmentType,
  OrderStatus,
  Prisma,
  ProductType,
} from '../../../generated/prisma/client';
import { prisma } from '../prisma';
import { recordAudit } from '../domain/audit';
import { raiseAlert } from '../billing/alerts';
import { notifyDigitalDelivery, type DeliveryLink, type NotifyResult } from './delivery-notify';
import { planDelivery, type PlanProduct } from './digital-assets/rules';
import { checkAccess, deriveDeliveryToken, isWellFormedToken, stateAfterAttempt, type DeliveryState } from './digital-assets/delivery-rules';

/**
 * Entrega digital (Punto 3).
 *
 * Una entrega por pedido, con un enlace seguro (`/d/<token>`) que da acceso a
 * TODOS los assets activos de los productos comprados (principal y adicional),
 * copiados al momento del pago en `DigitalDeliveryItem`.
 *
 *   - **Idempotente**: `bundleOrderId` es unico. Un pago reintentado, o dos
 *     webhooks a la vez, no generan una segunda entrega.
 *   - **Segura**: el token se guarda hasheado. Se deriva con HMAC (ver
 *     delivery-rules) para poder volver a mostrarlo al comprador en su pagina
 *     post-compra sin guardarlo en claro.
 *   - **Honesta**: AVAILABLE = el enlace existe; SENT = un canal existente lo
 *     envio de verdad; FAILED = el envio fallo. Ver `stateAfterAttempt`.
 *
 * Las entregas anteriores al Punto 3 (una fila por asset, token aleatorio)
 * siguen resolviendo: la migracion les creo su item.
 */
const DELIVERY_TTL_DAYS = 365;

function secret() {
  // Se reusa el secreto de sesion: el token de entrega tiene el mismo nivel de
  // criticidad que una sesion y ya esta validado como obligatorio en produccion.
  const value = process.env.CRM_SESSION_SECRET;
  if (!value || value.length < 16) {
    throw new Error('CRM_SESSION_SECRET es obligatorio para firmar entregas digitales.');
  }
  return value;
}

export function generateDeliveryToken() {
  return randomBytes(32).toString('base64url');
}

export function hashDeliveryToken(token: string) {
  return createHmac('sha256', secret()).update(token).digest('hex');
}

/** Token vigente de una entrega, o null si es heredado (aleatorio, no se puede reconstruir). */
export function currentDeliveryToken(delivery: { id: string; tokenVersion: number }) {
  return delivery.tokenVersion > 0 ? deriveDeliveryToken(delivery.id, delivery.tokenVersion, secret()) : null;
}

export function deliveryUrl(baseUrl: string, token: string) {
  return `${baseUrl.replace(/\/+$/, '')}/d/${token}`;
}

export function defaultBaseUrl() {
  return (process.env.NEXT_PUBLIC_CRM_BASE_URL ?? 'http://localhost:3001').replace(/\/+$/, '');
}

export type GrantResult = {
  deliveries: DeliveryLink[];
  alreadyDelivered: boolean;
  /** Entrega creada (o ya existente) del pedido. */
  deliveryId?: string;
  /** Se vendio un producto digital sin contenido entregable. */
  empty?: boolean;
  /** Contenidos incluidos en la entrega recien creada. */
  items?: number;
};

function metadataOf(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/**
 * Productos del pedido en orden de entrega: el principal primero, luego el
 * resto (el adicional) en el orden en que se agregaron.
 */
async function orderProducts(orderId: string) {
  const order = await prisma.customerOrder.findUnique({
    where: { id: orderId },
    include: {
      lines: {
        orderBy: { id: 'asc' },
        include: {
          variant: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  type: true,
                  workspaceId: true,
                  assets: { where: { archivedAt: null, isActive: true } },
                },
              },
            },
          },
        },
      },
      deliveries: { select: { id: true, bundleOrderId: true } },
    },
  });
  if (!order) return null;
  const mainVariantId = metadataOf(order.metadata).mainVariantId;
  const lines = [...order.lines].sort((a, b) => Number(b.variantId === mainVariantId) - Number(a.variantId === mainVariantId));
  // Un producto de otro workspace nunca aporta assets a este pedido.
  const products = lines
    .map((line) => line.variant?.product)
    .filter((product): product is NonNullable<typeof product> => Boolean(product && product.workspaceId === order.workspaceId));
  return { order, products };
}

/**
 * Concede la entrega de un pedido pagado.
 *
 * Solo se invoca desde el procesamiento verificado del pago, nunca desde la IA
 * ni desde una afirmacion del cliente. Si ya se habia entregado devuelve
 * `alreadyDelivered` y no toca nada.
 */
export async function grantDigitalDelivery(input: {
  workspaceId: string;
  orderId: string;
  baseUrl: string;
}): Promise<GrantResult> {
  const loaded = await orderProducts(input.orderId);
  if (!loaded || loaded.order.workspaceId !== input.workspaceId) return { deliveries: [], alreadyDelivered: false };
  const { order, products } = loaded;

  if (order.deliveries.length > 0) {
    return { deliveries: [], alreadyDelivered: true, deliveryId: order.deliveries.find((d) => d.bundleOrderId)?.id ?? order.deliveries[0].id };
  }

  const plan = planDelivery(
    products.map<PlanProduct>((product) => ({
      productId: product.id,
      productName: product.name,
      assets: product.assets.map((asset) => ({ ...asset, kind: asset.kind, format: asset.format })),
    })),
  );

  if (plan.length === 0) {
    // Producto digital vendido sin nada que entregar: no se inventa una pagina
    // vacia para el comprador; se avisa al negocio (una sola vez por pedido).
    const digital = products.filter((product) => product.type === ProductType.DIGITAL);
    if (digital.length > 0) {
      const already = await prisma.auditLog.findFirst({ where: { workspaceId: order.workspaceId, action: 'order.digital_delivery_empty', entityId: order.id }, select: { id: true } });
      if (!already) {
        await recordAudit({ workspaceId: order.workspaceId, action: 'order.digital_delivery_empty', entity: 'CustomerOrder', entityId: order.id, metadata: { products: digital.map((product) => product.id) } });
        await raiseAlert({
          workspaceId: order.workspaceId,
          kind: AlertKind.INTEGRATION_DOWN,
          severity: AlertSeverity.CRITICAL,
          title: 'Se vendió un producto digital sin contenido entregable',
          detail: `Agrega archivos o enlaces en Productos → ${digital.map((product) => product.name).join(', ')} → Entrega digital y envía el acceso desde Pedidos.`,
          dedupeKey: `delivery-empty:${order.id}`,
        });
      }
      return { deliveries: [], alreadyDelivered: false, empty: true };
    }
    return { deliveries: [], alreadyDelivered: false };
  }

  let delivery: { id: string; tokenVersion: number };
  try {
    delivery = await prisma.$transaction(async (tx) => {
      const created = await tx.digitalDelivery.create({
        data: {
          workspaceId: order.workspaceId,
          orderId: order.id,
          bundleOrderId: order.id,
          contactId: order.contactId,
          // Provisorio: el token definitivo se deriva del id, que recien existe.
          tokenHash: hashDeliveryToken(generateDeliveryToken()),
          tokenVersion: 1,
          expiresAt: new Date(Date.now() + DELIVERY_TTL_DAYS * 24 * 3_600_000),
          items: {
            create: plan.map((item) => ({
              assetId: item.assetId,
              position: item.position,
              productName: item.productName,
              kind: item.kind,
              format: item.format,
              name: item.name,
              target: item.target,
              mimeType: item.mimeType,
              sizeBytes: item.sizeBytes,
              fileName: item.fileName,
            })),
          },
        },
        select: { id: true, tokenVersion: true },
      });
      await tx.digitalDelivery.update({
        where: { id: created.id },
        data: { tokenHash: hashDeliveryToken(deriveDeliveryToken(created.id, created.tokenVersion, secret())) },
      });
      return created;
    });
  } catch (error) {
    // Carrera con otro procesamiento del mismo pago: el unique gano en el otro.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const existing = await prisma.digitalDelivery.findUnique({ where: { bundleOrderId: order.id }, select: { id: true } });
      return { deliveries: [], alreadyDelivered: true, deliveryId: existing?.id };
    }
    throw error;
  }

  const existingFulfillment = await prisma.fulfillmentOrder.findFirst({ where: { orderId: order.id, type: FulfillmentType.DIGITAL }, select: { id: true } });
  if (!existingFulfillment) {
    await prisma.fulfillmentOrder.create({
      data: {
        orderId: order.id,
        type: FulfillmentType.DIGITAL,
        status: FulfillmentStatus.FULFILLED,
        deliveredAt: new Date(),
        metadata: { assets: plan.length, deliveryId: delivery.id },
      },
    });
  }

  await prisma.customerOrder.update({ where: { id: order.id }, data: { status: OrderStatus.FULFILLED } });

  await prisma.activity.create({
    data: {
      workspaceId: order.workspaceId,
      contactId: order.contactId,
      type: ActivityType.NOTE,
      title: 'Entrega digital disponible',
      description: `${plan.length} contenido(s) disponibles en el enlace de entrega del pedido.`,
    },
  });

  await recordAudit({
    workspaceId: order.workspaceId,
    action: 'order.digital_delivered',
    entity: 'CustomerOrder',
    entityId: order.id,
    metadata: { assets: plan.length, deliveryId: delivery.id },
  });
  await recordAudit({
    workspaceId: order.workspaceId,
    action: 'order.delivery_created',
    entity: 'DigitalDelivery',
    entityId: delivery.id,
    metadata: { orderId: order.id, items: plan.length, products: [...new Set(plan.map((item) => item.productName))].length },
  });

  const token = deriveDeliveryToken(delivery.id, delivery.tokenVersion, secret());
  const label = [...new Set(plan.map((item) => item.productName))].join(' + ');
  return {
    deliveries: [{ token, assetName: label, url: deliveryUrl(input.baseUrl, token) }],
    alreadyDelivered: false,
    deliveryId: delivery.id,
    items: plan.length,
  };
}

// --- Envio, reenvio y revocacion ----------------------------------------------

export type Transport = (input: { workspaceId: string; orderId: string; contactId: string | null; links: DeliveryLink[] }) => Promise<NotifyResult>;

export type SendResult =
  | { ok: true; status: DeliveryState; url: string; notified: boolean; channels: { whatsapp: boolean; email: boolean }; emailSimulated: boolean; error: string | null }
  | { ok: false; reason: 'NOT_FOUND' | 'REVOKED' };

/**
 * Ejecuta un intento de envio de la entrega por los canales existentes
 * (WhatsApp / email operacional) y deja el resultado en la entrega y en la
 * auditoria. Lo usan el pago (intento inicial) y el boton "Reenviar entrega".
 *
 * No crea otra entrega ni cambia el enlace: el comprador recibe el mismo. Una
 * entrega heredada (token aleatorio irrecuperable) recibe aqui un token
 * derivado; el enlace anterior deja de funcionar, igual que antes del Punto 3.
 */
export async function sendDelivery(input: {
  workspaceId: string;
  deliveryId: string;
  baseUrl: string;
  reason: 'initial' | 'resend';
  actorId?: string | null;
  transport?: Transport;
}): Promise<SendResult> {
  const delivery = await prisma.digitalDelivery.findFirst({
    where: { id: input.deliveryId, workspaceId: input.workspaceId },
    include: { items: { orderBy: { position: 'asc' }, select: { productName: true } } },
  });
  if (!delivery) return { ok: false, reason: 'NOT_FOUND' };
  if (delivery.status === DeliveryStatus.REVOKED) return { ok: false, reason: 'REVOKED' };

  let version = delivery.tokenVersion;
  if (version === 0) {
    version = 1;
    await prisma.digitalDelivery.update({
      where: { id: delivery.id },
      data: { tokenVersion: version, tokenHash: hashDeliveryToken(deriveDeliveryToken(delivery.id, version, secret())) },
    });
  }
  const token = deriveDeliveryToken(delivery.id, version, secret());
  const url = deliveryUrl(input.baseUrl, token);
  const label = [...new Set(delivery.items.map((item) => item.productName))].join(' + ') || 'Tu compra';

  let outcome: NotifyResult | { error: string };
  try {
    outcome = await (input.transport ?? notifyDigitalDelivery)({
      workspaceId: input.workspaceId,
      orderId: delivery.orderId,
      contactId: delivery.contactId,
      links: [{ token, assetName: label, url }],
    });
  } catch (error) {
    console.error('digital_delivery_send_failed', { deliveryId: delivery.id, error: error instanceof Error ? error.message : String(error) });
    outcome = { error: 'Error inesperado al enviar. Intenta reenviar.' };
  }

  // Una entrega vencida que se reenvia vuelve a tener un ano de vigencia.
  const renewed = delivery.status === DeliveryStatus.EXPIRED || (delivery.expiresAt && delivery.expiresAt < new Date());
  const next = stateAfterAttempt(renewed ? 'AVAILABLE' : (delivery.status as DeliveryState), outcome);
  const now = new Date();
  await prisma.digitalDelivery.update({
    where: { id: delivery.id },
    data: {
      status: next.status as DeliveryStatus,
      attempts: { increment: 1 },
      lastAttemptAt: now,
      lastError: next.error,
      ...(next.status === 'SENT' ? { sentAt: now } : {}),
      ...(renewed ? { expiresAt: new Date(now.getTime() + DELIVERY_TTL_DAYS * 24 * 3_600_000) } : {}),
    },
  });

  const notified = 'error' in outcome ? false : outcome.whatsapp || outcome.email;
  const emailSimulated = 'error' in outcome ? false : Boolean(outcome.emailSimulated);
  const action = next.status === 'SENT' ? 'order.delivery_sent' : next.status === 'FAILED' ? 'order.delivery_failed' : 'order.delivery_not_sent';
  const channels = 'error' in outcome ? { whatsapp: false, email: false } : { whatsapp: outcome.whatsapp, email: outcome.email };
  if (input.reason === 'resend') {
    await recordAudit({
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      action: 'order.delivery_resent',
      entity: 'DigitalDelivery',
      entityId: delivery.id,
      metadata: { orderId: delivery.orderId, attempt: delivery.attempts + 1 },
    });
  }
  await recordAudit({
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    action,
    entity: 'DigitalDelivery',
    entityId: delivery.id,
    metadata: { orderId: delivery.orderId, attempt: delivery.attempts + 1, reason: input.reason, ...channels, emailSimulated, error: next.error },
  });

  return { ok: true, status: next.status, url, notified, channels, emailSimulated, error: next.error };
}

/** Reenvio manual (OWNER/ADMIN). Misma entrega, mismo enlace, nuevo intento. */
export async function resendDelivery(input: { workspaceId: string; deliveryId: string; baseUrl: string; actorId?: string; transport?: Transport }) {
  const result = await sendDelivery({ ...input, reason: 'resend' });
  if (!result.ok) return result.reason === 'NOT_FOUND' ? null : { revoked: true as const, url: null, notified: false, status: 'REVOKED' as const };
  return { url: result.url, notified: result.notified, status: result.status, emailSimulated: result.emailSimulated, error: result.error };
}

/**
 * Revoca el acceso de una entrega (OWNER/ADMIN). El enlace deja de mostrar
 * contenido y no se firman descargas nuevas. Lo ya descargado no se puede
 * "des-descargar": la interfaz lo dice.
 */
export async function revokeDigitalDelivery(input: { workspaceId: string; deliveryId: string; actorId?: string | null }) {
  const delivery = await prisma.digitalDelivery.findFirst({ where: { id: input.deliveryId, workspaceId: input.workspaceId }, select: { id: true, orderId: true, status: true } });
  if (!delivery) return null;
  if (delivery.status === DeliveryStatus.REVOKED) return { revoked: true, already: true };
  await prisma.digitalDelivery.update({ where: { id: delivery.id }, data: { status: DeliveryStatus.REVOKED, revokedAt: new Date() } });
  await recordAudit({
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    action: 'order.delivery_revoked',
    entity: 'DigitalDelivery',
    entityId: delivery.id,
    metadata: { orderId: delivery.orderId, previousStatus: delivery.status },
  });
  return { revoked: true, already: false };
}

// --- Acceso del comprador -----------------------------------------------------

export type BuyerItem = {
  id: string;
  name: string;
  productName: string;
  kind: DigitalAssetKind;
  format: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  /** Solo CODE: se muestra en pantalla. Archivos y enlaces van por la ruta del item. */
  code: string | null;
  exhausted: boolean;
};

type ResolveFailure = { ok: false; reason: 'NOT_FOUND' | 'REVOKED' | 'EXPIRED' | 'LIMIT_REACHED' };

async function findByToken(token: string) {
  if (!isWellFormedToken(token)) return null;
  return prisma.digitalDelivery.findUnique({
    where: { tokenHash: hashDeliveryToken(token) },
    include: { items: { orderBy: { position: 'asc' } } },
  });
}

async function accessFailure(delivery: NonNullable<Awaited<ReturnType<typeof findByToken>>>): Promise<ResolveFailure | null> {
  const check = checkAccess({ ...delivery, status: delivery.status as DeliveryState, itemCount: delivery.items.length });
  if (check.ok) return null;
  if (check.reason === 'EXPIRED' && delivery.status !== DeliveryStatus.EXPIRED) {
    await prisma.digitalDelivery.update({ where: { id: delivery.id }, data: { status: DeliveryStatus.EXPIRED } });
  }
  return { ok: false, reason: check.reason };
}

/**
 * Resuelve el enlace de entrega para la pagina del comprador. Solo expone lo
 * de ESA entrega: nombres, tipos y acciones. Nada de ids internos del negocio,
 * claves de almacenamiento ni otros pedidos.
 */
export async function resolveDelivery(token: string): Promise<ResolveFailure | { ok: true; items: BuyerItem[]; expiresAt: Date | null }> {
  const delivery = await findByToken(token);
  if (!delivery) return { ok: false, reason: 'NOT_FOUND' };
  const failure = await accessFailure(delivery);
  if (failure) return failure;

  await prisma.digitalDelivery.update({ where: { id: delivery.id }, data: { lastAccessAt: new Date() } });

  return {
    ok: true,
    expiresAt: delivery.expiresAt,
    items: delivery.items.map((item) => ({
      id: item.id,
      name: item.name,
      productName: item.productName,
      kind: item.kind,
      format: item.format,
      mimeType: item.mimeType,
      sizeBytes: item.sizeBytes,
      code: item.kind === DigitalAssetKind.CODE ? item.target : null,
      exhausted: item.downloadCount >= delivery.maxDownloads,
    })),
  };
}

/**
 * Acceso a UN item de la entrega (descarga o enlace). Valida el token, que el
 * item sea de esa entrega y el tope de descargas, y cuenta el acceso.
 */
export async function resolveDeliveryItem(token: string, itemId: string): Promise<ResolveFailure | {
  ok: true;
  item: { kind: DigitalAssetKind; target: string; mimeType: string | null; fileName: string | null; name: string };
}> {
  const delivery = await findByToken(token);
  if (!delivery) return { ok: false, reason: 'NOT_FOUND' };
  const failure = await accessFailure(delivery);
  if (failure) return failure;

  const item = delivery.items.find((candidate) => candidate.id === itemId);
  if (!item || item.kind === DigitalAssetKind.CODE) return { ok: false, reason: 'NOT_FOUND' };

  // Incremento condicionado: dos clics simultaneos no pasan el tope.
  const counted = await prisma.digitalDeliveryItem.updateMany({
    where: { id: item.id, deliveryId: delivery.id, downloadCount: { lt: delivery.maxDownloads } },
    data: { downloadCount: { increment: 1 }, lastAccessAt: new Date() },
  });
  if (counted.count === 0) return { ok: false, reason: 'LIMIT_REACHED' };
  await prisma.digitalDelivery.update({ where: { id: delivery.id }, data: { downloadCount: { increment: 1 }, lastAccessAt: new Date() } });

  return { ok: true, item: { kind: item.kind, target: item.target, mimeType: item.mimeType, fileName: item.fileName, name: item.name } };
}

/** Compara dos tokens en tiempo constante. Se usa donde no hay hash de por medio. */
export function safeEqual(a: string, b: string) {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  return bufferA.length === bufferB.length && timingSafeEqual(bufferA, bufferB);
}

export { DigitalAssetKind, ProductType };
