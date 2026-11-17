/**
 * P37: motor de cálculo de Quote Studio. Puro y en enteros (unidades menores),
 * lo usan el servidor (fuente de verdad: nunca se confía en totales del cliente)
 * y el editor (vista previa instantánea). Sin fórmulas ejecutables.
 *
 * Por línea:  bruto = round(cantidad × precio) − descuento de línea
 *             neto  = bruto (o bruto / (1 + tasa) si los precios incluyen impuesto)
 * Global:     descuento global repartido entre las líneas (resto mayor, cuadra exacto)
 *             impuesto = round((neto − parte del descuento global) × tasa) por línea
 *             total = base + impuestos + cargos (+ su impuesto si son gravados)
 */

export type QuoteLineInput = {
  id: string;
  catalogItemId?: string | null;
  name: string;
  description: string;
  quantity: number;
  unit: string;
  unitPriceMinor: number;
  /** 0..10000 (puntos básicos). */
  discountBp: number;
  /** null = tasa por defecto. */
  taxRateBp: number | null;
};
export type QuoteChargeInput = { id: string; label: string; amountMinor: number; taxable: boolean };

export type CalcInput = {
  lines: QuoteLineInput[];
  charges: QuoteChargeInput[];
  globalDiscountBp: number;
  defaultTaxRateBp: number;
  pricesIncludeTax: boolean;
};

export type LineResult = { id: string; grossMinor: number; lineDiscountMinor: number; netMinor: number; taxRateBp: number; totalMinor: number };
export type CalcResult = {
  lines: LineResult[];
  /** Suma de netos antes del descuento global. */
  subtotalMinor: number;
  lineDiscountMinor: number;
  globalDiscountMinor: number;
  /** Descuento total (líneas + global), para reportes. */
  discountMinor: number;
  taxMinor: number;
  /** Impuesto agrupado por tasa, para el bloque "Impuestos". */
  taxes: { rateBp: number; baseMinor: number; taxMinor: number }[];
  chargesMinor: number;
  totalMinor: number;
};

const round = (n: number) => Math.round(n);

/** Reparte `amount` según pesos con resto mayor: la suma es exacta. */
export function allocate(amount: number, weights: number[]) {
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0 || amount === 0) return weights.map(() => 0);
  const raw = weights.map((w) => (amount * w) / total);
  const out = raw.map(Math.floor);
  let rest = amount - out.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, f: r - Math.floor(r) })).sort((a, b) => b.f - a.f || a.i - b.i);
  for (let k = 0; rest > 0; k = (k + 1) % order.length, rest -= 1) out[order[k].i] += 1;
  return out;
}

export function calculateQuote(input: CalcInput): CalcResult {
  const rates = input.lines.map((l) => l.taxRateBp ?? input.defaultTaxRateBp);
  const partial = input.lines.map((line, i) => {
    const grossMinor = round(line.quantity * line.unitPriceMinor);
    const lineDiscountMinor = round((grossMinor * line.discountBp) / 10_000);
    const afterDiscount = grossMinor - lineDiscountMinor;
    const netMinor = input.pricesIncludeTax ? round((afterDiscount * 10_000) / (10_000 + rates[i])) : afterDiscount;
    return { id: line.id, grossMinor, lineDiscountMinor, netMinor, taxRateBp: rates[i] };
  });
  const subtotalMinor = partial.reduce((a, l) => a + l.netMinor, 0);
  const globalDiscountMinor = round((subtotalMinor * input.globalDiscountBp) / 10_000);
  const shares = allocate(globalDiscountMinor, partial.map((l) => Math.max(0, l.netMinor)));

  const byRate = new Map<number, { baseMinor: number; taxMinor: number }>();
  const addTax = (rateBp: number, baseMinor: number) => {
    const taxMinor = round((baseMinor * rateBp) / 10_000);
    const entry = byRate.get(rateBp) ?? { baseMinor: 0, taxMinor: 0 };
    byRate.set(rateBp, { baseMinor: entry.baseMinor + baseMinor, taxMinor: entry.taxMinor + taxMinor });
    return taxMinor;
  };
  const lines = partial.map((l, i) => {
    const base = l.netMinor - shares[i];
    return { ...l, totalMinor: base + addTax(l.taxRateBp, base) };
  });
  const chargesMinor = input.charges.reduce((a, c) => a + c.amountMinor, 0);
  for (const charge of input.charges) if (charge.taxable) addTax(input.defaultTaxRateBp, charge.amountMinor);

  const taxes = [...byRate.entries()].sort((a, b) => a[0] - b[0]).map(([rateBp, v]) => ({ rateBp, ...v }));
  const taxMinor = taxes.reduce((a, t) => a + t.taxMinor, 0);
  const lineDiscountMinor = partial.reduce((a, l) => a + l.lineDiscountMinor, 0);
  return {
    lines,
    subtotalMinor,
    lineDiscountMinor,
    globalDiscountMinor,
    discountMinor: lineDiscountMinor + globalDiscountMinor,
    taxMinor,
    taxes,
    chargesMinor,
    totalMinor: subtotalMinor - globalDiscountMinor + taxMinor + chargesMinor,
  };
}

/** "19 %" / "10,5 %" */
export const percentLabel = (bp: number) => `${(bp / 100).toLocaleString('es-CL', { maximumFractionDigits: 2 })} %`;

/** Entrada de la persona en unidades mayores ("19.990", "19,99") → menores. null si no es un número. */
export function toMinor(text: string, exponent: number) {
  const clean = text.trim().replace(/\s/g, '');
  if (!clean) return 0;
  // Con decimales (USD) la coma o el punto final es el separador decimal; en CLP los puntos son miles.
  const normalized = exponent ? clean.replace(/[.,](?=\d{1,2}$)/, '#').replace(/[.,]/g, '').replace('#', '.') : clean.replace(/[.,]/g, '');
  const value = Number(normalized);
  return Number.isFinite(value) && value >= 0 ? Math.round(value * 10 ** exponent) : null;
}
export const fromMinor = (minor: number, exponent: number) => (exponent ? (minor / 10 ** exponent).toFixed(exponent) : String(minor));
/** "10,5" → 1050 (puntos básicos). */
export function percentToBp(text: string) {
  const value = Number(text.trim().replace(',', '.') || '0');
  return Number.isFinite(value) && value >= 0 && value <= 100 ? Math.round(value * 100) : null;
}
export const bpToPercent = (bp: number) => String(bp / 100).replace('.', ',');
