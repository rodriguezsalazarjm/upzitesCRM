/** Marca que llevan las preferencias de suscripcion SaaS creadas desde P0-FOUNDATION. */
export const SAAS_SUBSCRIPTION_KIND = 'saas_subscription';

export type PaymentClass = 'order' | 'saas_subscription' | 'unknown';

/**
 * Decide a que libro pertenece un pago. FAIL-CLOSED (P0-FOUNDATION):
 *
 *  - `kind: 'order'`             → Commerce del workspace (CustomerOrder/Payment).
 *  - `kind: 'saas_subscription'` → Billing SaaS (WorkspaceSubscription).
 *  - cualquier otra cosa          → 'unknown', salvo que el webhook haya
 *    comprobado que la preferencia es un checkout SaaS legacy conocido.
 *
 * Antes, todo lo que no decia 'order' se trataba como suscripcion. Si la misma
 * cuenta legal de Mercado Pago cobra el SaaS y vende en un workspace propio
 * (p. ej. 5 Minutos con Dios), cualquier pago de esa cuenta sin marca habria
 * activado una suscripcion. Lo desconocido ahora no toca ningun libro.
 */
export function classifyPayment(
  metadata: Record<string, unknown> | null | undefined,
  options: { knownLegacySaasPreference?: boolean } = {},
): PaymentClass {
  const kind = metadata && typeof metadata.kind === 'string' ? metadata.kind : null;
  if (kind === 'order') return 'order';
  if (kind === SAAS_SUBSCRIPTION_KIND) return 'saas_subscription';
  if (options.knownLegacySaasPreference) return 'saas_subscription';
  return 'unknown';
}
