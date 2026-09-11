import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  ActivityType,
  DeliveryStatus,
  DigitalAssetKind,
  FulfillmentStatus,
  FulfillmentType,
  OrderStatus,
  ProductType,
} from '../../../generated/prisma/client';
import { prisma } from '../prisma';
import { recordAudit } from '../domain/audit';
import { notifyDigitalDelivery } from './delivery-notify';

/**
 * Entrega digital.
 *
 * Dos propiedades que la spec exige y que estan resueltas por el esquema, no
 * por cuidado del codigo que llama:
 *
 *   - **Idempotente**: el unique `(orderId, assetId)` hace que un pago
 *     reintentado no genere un segundo acceso.
 *   - **Segura**: el token se guarda hasheado. Quien lea la base no obtiene
 *     accesos utilizables, igual que con las contrasenas.
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

export type GrantResult = {
  deliveries: { token: string | null; assetName: string; url: string | null }[];
  alreadyDelivered: boolean;
};

/**
 * Concede acceso a los assets digitales de un pedido pagado.
 *
 * Solo se invoca desde el webhook verificado, nunca desde la IA ni desde una
 * afirmacion del cliente. Si ya se habia entregado, devuelve `alreadyDelivered`
 * y NO genera tokens nuevos: los anteriores siguen siendo los validos.
 */
export async function grantDigitalDelivery(input: {
  workspaceId: string;
  orderId: string;
  baseUrl: string;
}): Promise<GrantResult> {
  const order = await prisma.customerOrder.findFirst({
    where: { id: input.orderId, workspaceId: input.workspaceId },
    include: {
      lines: { include: { variant: { include: { product: { include: { assets: true } } } } } },
      deliveries: true,
    },
  });

  if (!order) return { deliveries: [], alreadyDelivered: false };

  const assets = order.lines
    .flatMap((line) => line.variant?.product?.assets ?? [])
    .filter((asset, index, all) => all.findIndex((a) => a.id === asset.id) === index);

  if (assets.length === 0) return { deliveries: [], alreadyDelivered: false };

  const existing = new Map(order.deliveries.map((delivery) => [delivery.assetId, delivery]));
  const result: GrantResult['deliveries'] = [];
  let created = 0;

  for (const asset of assets) {
    if (existing.has(asset.id)) {
      // Ya entregado: no se regenera el token. Reenviar el acceso es otra
      // operacion, explicita y auditada (`resendDelivery`).
      result.push({ token: null, assetName: asset.name, url: null });
      continue;
    }

    const token = generateDeliveryToken();

    try {
      await prisma.digitalDelivery.create({
        data: {
          workspaceId: input.workspaceId,
          orderId: order.id,
          assetId: asset.id,
          contactId: order.contactId,
          tokenHash: hashDeliveryToken(token),
          expiresAt: new Date(Date.now() + DELIVERY_TTL_DAYS * 24 * 3_600_000),
        },
      });
      created += 1;
      result.push({
        token,
        assetName: asset.name,
        url: `${input.baseUrl}/d/${token}`,
      });
    } catch {
      // Carrera con otra entrega del mismo pago: el unique gano en la otra.
      result.push({ token: null, assetName: asset.name, url: null });
    }
  }

  if (created > 0) {
    await prisma.fulfillmentOrder.create({
      data: {
        orderId: order.id,
        type: FulfillmentType.DIGITAL,
        status: FulfillmentStatus.FULFILLED,
        deliveredAt: new Date(),
        metadata: { assets: created },
      },
    });

    await prisma.customerOrder.update({
      where: { id: order.id },
      data: { status: OrderStatus.FULFILLED },
    });

    await prisma.activity.create({
      data: {
        workspaceId: input.workspaceId,
        contactId: order.contactId,
        type: ActivityType.NOTE,
        title: 'Entrega digital enviada',
        description: `${created} acceso(s) generados para el pedido.`,
      },
    });

    await recordAudit({
      workspaceId: input.workspaceId,
      action: 'order.digital_delivered',
      entity: 'CustomerOrder',
      entityId: order.id,
      metadata: { assets: created },
    });
  }

  return { deliveries: result, alreadyDelivered: created === 0 && assets.length > 0 };
}

/**
 * Resuelve un token de entrega.
 *
 * Comprueba vencimiento, revocacion y limite de descargas. Devuelve el destino
 * solo si todo cuadra; en cualquier otro caso, un motivo generico.
 */
export async function resolveDelivery(token: string) {
  const tokenHash = hashDeliveryToken(token);

  const delivery = await prisma.digitalDelivery.findUnique({
    where: { tokenHash },
    include: { asset: true },
  });

  if (!delivery) return { ok: false as const, reason: 'NOT_FOUND' as const };
  if (delivery.status === DeliveryStatus.REVOKED) return { ok: false as const, reason: 'REVOKED' as const };

  if (delivery.expiresAt && delivery.expiresAt < new Date()) {
    await prisma.digitalDelivery.update({
      where: { id: delivery.id },
      data: { status: DeliveryStatus.EXPIRED },
    });
    return { ok: false as const, reason: 'EXPIRED' as const };
  }

  if (delivery.downloadCount >= delivery.maxDownloads) {
    return { ok: false as const, reason: 'LIMIT_REACHED' as const };
  }

  await prisma.digitalDelivery.update({
    where: { id: delivery.id },
    data: {
      status: DeliveryStatus.ACCESSED,
      downloadCount: { increment: 1 },
      lastAccessAt: new Date(),
    },
  });

  return {
    ok: true as const,
    asset: { kind: delivery.asset.kind, name: delivery.asset.name, target: delivery.asset.target },
    remaining: delivery.maxDownloads - delivery.downloadCount - 1,
  };
}

/**
 * Reenvia el acceso generando un token nuevo y revocando el anterior.
 *
 * Es una accion humana y auditada (spec: "reenvio manual de acceso
 * controlado"). El agente no la tiene entre sus herramientas.
 */
export async function resendDelivery(input: {
  workspaceId: string;
  deliveryId: string;
  baseUrl: string;
  actorId?: string;
}) {
  const delivery = await prisma.digitalDelivery.findFirst({
    where: { id: input.deliveryId, workspaceId: input.workspaceId },
    include: { asset: true },
  });

  if (!delivery) return null;

  const token = generateDeliveryToken();

  await prisma.digitalDelivery.update({
    where: { id: delivery.id },
    data: {
      tokenHash: hashDeliveryToken(token),
      status: DeliveryStatus.GRANTED,
      downloadCount: 0,
      sentAt: new Date(),
      expiresAt: new Date(Date.now() + DELIVERY_TTL_DAYS * 24 * 3_600_000),
    },
  });

  await recordAudit({
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    action: 'order.delivery_resent',
    entity: 'DigitalDelivery',
    entityId: delivery.id,
    metadata: { assetId: delivery.assetId },
  });

  // D29: reenviar tiene que enviar. Antes solo devolvia el enlace a quien
  // apretara el boton, que despues tenia que copiarlo y pegarlo a mano.
  const notified = await notifyDigitalDelivery({
    workspaceId: input.workspaceId,
    orderId: delivery.orderId,
    contactId: delivery.contactId,
    links: [{ token, assetName: delivery.asset.name, url: `${input.baseUrl}/d/${token}` }],
  });

  return {
    url: `${input.baseUrl}/d/${token}`,
    assetName: delivery.asset.name,
    /** Si salio solo. Si no, quien reenvia tiene el enlace para mandarlo a mano. */
    notified: notified.whatsapp || notified.email,
  };
}

/** Compara dos tokens en tiempo constante. Se usa donde no hay hash de por medio. */
export function safeEqual(a: string, b: string) {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  return bufferA.length === bufferB.length && timingSafeEqual(bufferA, bufferB);
}

export { DigitalAssetKind, ProductType };
