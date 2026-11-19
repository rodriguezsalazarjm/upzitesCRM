import type { PaymentIncidentKind, PaymentIncidentStatus } from '../../../generated/prisma/client';

/** P31: qué es cada incidencia y qué tiene que hacer una persona. Puro: se prueba sin base. */
export const INCIDENT_KIND: Record<PaymentIncidentKind, { label: string; action: string }> = {
  AMOUNT_MISMATCH: {
    label: 'Monto distinto al pedido',
    action: 'El pedido NO se confirmó ni se entregó. Compara el monto cobrado con el pedido: si el cobro es correcto, ajusta el pedido y entrega a mano; si no, devuelve el pago en Mercado Pago.',
  },
  CURRENCY_MISMATCH: {
    label: 'Moneda distinta al pedido',
    action: 'El pedido NO se confirmó. Revisa en Mercado Pago en qué moneda se cobró; devuelve el pago o cobra de nuevo en la moneda del pedido.',
  },
  STALE_PREFERENCE: {
    label: 'Pago de un enlace anterior',
    action: 'El cliente pagó un enlace de pago que ya no era el vigente (el pedido cambió después). Confirma con el cliente qué compró y entrega a mano o devuelve el pago.',
  },
  ORPHAN_PAYMENT: {
    label: 'Pago sin pedido',
    action: 'Llegó un pago que no se pudo asociar a un pedido de este negocio. Búscalo en Mercado Pago por su id, identifica al cliente y crea o asocia el pedido a mano, o devuelve el pago.',
  },
  DUPLICATE_PAYMENT: {
    label: 'Pago duplicado',
    action: 'El pedido ya estaba pagado y llegó otro pago aprobado. No se entregó nada nuevo. Devuelve el pago sobrante en Mercado Pago y avisa al cliente.',
  },
  REFUND: {
    label: 'Reembolso',
    action: 'Mercado Pago informó un reembolso: el pedido quedó reembolsado y sus accesos se revocaron. Confirma que corresponde y avisa al cliente.',
  },
  CHARGEBACK: {
    label: 'Contracargo',
    action: 'El cliente desconoció el cobro con su banco: los accesos se revocaron. Responde la disputa en Mercado Pago con la evidencia de entrega antes del plazo.',
  },
};

export const INCIDENT_STATUS_LABEL: Record<PaymentIncidentStatus, string> = {
  OPEN: 'Abierta',
  RESOLVED: 'Resuelta',
  DISMISSED: 'Descartada',
};

const EVIDENCE_LABEL: Record<string, string> = {
  expectedAmount: 'Monto del pedido',
  receivedAmount: 'Monto cobrado',
  expectedCurrency: 'Moneda del pedido',
  receivedCurrency: 'Moneda cobrada',
  preferenceId: 'Preferencia pagada',
  currentPreferenceId: 'Preferencia vigente',
  externalReference: 'Referencia externa',
  reason: 'Motivo',
  referencedOrderId: 'Pedido indicado en el pago',
  previousPaymentId: 'Pago anterior del pedido',
  rawStatus: 'Estado en Mercado Pago',
  revoked: 'Accesos revocados',
};

const MONEY_KEYS = new Set(['expectedAmount', 'receivedAmount']);

/** Evidencia legible: solo claves conocidas y con valor, en un orden estable. */
export function evidenceRows(evidence: unknown, money: (minor: number, currency: string) => string) {
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) return [];
  const e = evidence as Record<string, unknown>;
  return Object.keys(EVIDENCE_LABEL)
    .filter((key) => e[key] !== null && e[key] !== undefined && e[key] !== '')
    .map((key) => {
      const value = e[key];
      const currency = String((key === 'expectedAmount' ? e.expectedCurrency : e.receivedCurrency) ?? '');
      return {
        key,
        label: EVIDENCE_LABEL[key],
        value: MONEY_KEYS.has(key) && typeof value === 'number' && currency ? money(value, currency) : String(value),
      };
    });
}
