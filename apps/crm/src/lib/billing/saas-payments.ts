import { getMerchantOrderClient } from '../mercado-pago';
import { prisma } from '../prisma';

/**
 * Compatibilidad con checkouts SaaS creados ANTES de marcar las preferencias
 * con `kind: 'saas_subscription'`. Un pago sin esa marca solo se acepta como
 * suscripcion si su preferencia es EXPLICITAMENTE un checkout SaaS que este
 * sistema creo para ese mismo workspace.
 */

/**
 * Preferencia de un pago de la cuenta de Upzites, via su merchant order.
 * Lanza ante un fallo de red: el webhook responde 503 para que Mercado Pago
 * reintente, en vez de descartar un pago legitimo por un error transitorio.
 */
export async function resolvePaymentPreferenceId(payment: { order?: { id?: number | string } | null }) {
  const merchantOrderId = payment.order?.id;
  if (merchantOrderId === undefined || merchantOrderId === null) return null;
  const client = getMerchantOrderClient();
  if (!client) return null;
  const merchantOrder = await client.get({ merchantOrderId: String(merchantOrderId) });
  return typeof merchantOrder.preference_id === 'string' && merchantOrder.preference_id ? merchantOrder.preference_id : null;
}

/** La preferencia es un checkout SaaS conocido de ESE workspace? */
export async function isKnownLegacySaasPreference(preferenceId: string, workspaceId: string) {
  const [subscription, checkout] = await Promise.all([
    prisma.workspaceSubscription.findFirst({
      where: { workspaceId, mpPreferenceId: preferenceId },
      select: { id: true },
    }),
    prisma.auditLog.findFirst({
      where: {
        workspaceId,
        action: 'billing.checkout_started',
        metadata: { path: ['preferenceId'], equals: preferenceId },
      },
      select: { id: true },
    }),
  ]);
  return Boolean(subscription || checkout);
}
