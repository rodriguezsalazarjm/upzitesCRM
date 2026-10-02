import { CURRENCY_EXPONENT } from '../billing/money';

/**
 * Dinero de Commerce (catalogo, pedidos, pagos). Misma convencion que
 * lib/billing/money: ENTEROS en unidades menores ISO 4217 de la moneda que
 * acompaña al monto (`Product.currency`, `CustomerOrder.currency`,
 * `Payment.currency`). CLP exponente 0 (19990 = $19.990), USD exponente 2
 * (1999 = US$19,99).
 *
 * Reglas para codigo nuevo:
 *  - Un monto NUNCA viaja sin su moneda (`priceView`).
 *  - Formatear con `formatMinor`, nunca con un formateador CLP fijo.
 *  - No sumar montos de monedas distintas.
 *  - Convertir a unidades mayores solo en el borde con un proveedor
 *    (`toMajorUnits` / `providerAmountToMinor` de lib/billing/money).
 */

export function exponentOf(currency: string) {
  const exponent = CURRENCY_EXPONENT[currency.toUpperCase()];
  return exponent === undefined ? 0 : exponent;
}

export function formatMinor(amountMinor: number, currency: string) {
  const exponent = exponentOf(currency);
  try {
    return new Intl.NumberFormat(currency === 'CLP' ? 'es-CL' : 'en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: exponent,
      maximumFractionDigits: exponent,
    }).format(amountMinor / 10 ** exponent);
  } catch {
    return `${amountMinor} ${currency}`;
  }
}

/** Monto en unidades mayores como texto plano: CLP 19990 → "19990", USD 1999 → "19.99". */
export function majorText(amountMinor: number, currency: string) {
  const exponent = exponentOf(currency);
  if (exponent === 0) return String(amountMinor);
  return `${Math.floor(amountMinor / 10 ** exponent)}.${String(amountMinor % 10 ** exponent).padStart(exponent, '0')}`;
}

export type PriceView = { amountMinor: number; currency: string; display: string };

/** Precio con su moneda, listo para mostrar o entregar a un agente. */
export function priceView(amountMinor: number, currency: string): PriceView {
  return { amountMinor, currency, display: formatMinor(amountMinor, currency) };
}

/**
 * ¿El texto menciona este precio? Acepta el formato visible ("$5.990",
 * "$19.99") o las unidades mayores ("5990", "19.99"). Nunca el entero en
 * unidades menores de una moneda con decimales: "1999" no es US$19,99.
 */
export function textMentionsPrice(text: string, amountMinor: number, currency: string) {
  const normalized = text.replace(/\s+/g, ' ');
  return [formatMinor(amountMinor, currency), majorText(amountMinor, currency)].some((candidate) => normalized.includes(candidate));
}
