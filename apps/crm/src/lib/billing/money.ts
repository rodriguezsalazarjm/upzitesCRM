import { BillingInterval } from '../../../generated/prisma/enums';

/**
 * Dinero y periodos (puro, sin base de datos). Convencion unica: montos ENTEROS
 * en unidades menores ISO 4217 — CLP exponente 0 (19990 = $19.990), USD
 * exponente 2 (1900 = US$19). Sin conversion entre monedas.
 */

export const CURRENCY_EXPONENT: Record<string, number> = { CLP: 0, USD: 2 };

export function currencyExponent(currency: string) {
  const exponent = CURRENCY_EXPONENT[currency.toUpperCase()];
  if (exponent === undefined) throw new Error(`Moneda no soportada: ${currency}`);
  return exponent;
}

/** Monto en unidades mayores (lo que espera, p. ej., Mercado Pago). */
export function toMajorUnits(amountMinor: number, currency: string) {
  return amountMinor / 10 ** currencyExponent(currency);
}

/**
 * Monto informado por un proveedor (unidades mayores, p. ej. 19.99) → unidades
 * menores enteras. Con una moneda desconocida devuelve el entero redondeado:
 * la comparacion contra el pedido fallara igual por moneda.
 */
export function providerAmountToMinor(amountMajor: number, currency: string) {
  const exponent = CURRENCY_EXPONENT[currency.toUpperCase()] ?? 0;
  return Math.round(amountMajor * 10 ** exponent);
}

export function formatMoney(amountMinor: number, currency: string) {
  const exponent = currencyExponent(currency);
  return new Intl.NumberFormat(currency === 'CLP' ? 'es-CL' : 'en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: exponent,
    maximumFractionDigits: exponent,
  }).format(toMajorUnits(amountMinor, currency));
}

/**
 * Suma un intervalo de facturacion (meses calendario; un ano = 12 meses). Si el
 * dia no existe en el mes destino se usa el ultimo: 31-ene + 1 mes = 28/29-feb,
 * no 3 de marzo.
 */
export function addInterval(from: Date, interval: BillingInterval = BillingInterval.MONTH, count = 1) {
  const months = (interval === BillingInterval.YEAR ? 12 : 1) * count;
  const next = new Date(from);
  const day = next.getUTCDate();
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  next.setUTCDate(Math.min(day, lastDay));
  return next;
}
