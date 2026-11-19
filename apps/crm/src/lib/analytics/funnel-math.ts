/**
 * P30: cuentas puras del embudo (sin base de datos, se testean solas).
 * Las cifras de dinero vienen en unidades menores y en UNA moneda: la del negocio.
 */
export type FunnelCounts = {
  adConversations: number;
  leads: number;
  conversations: number;
  conversationsWithCheckout: number;
  checkouts: number;
  sales: number;
  revenue: number;
  bumpShown: number;
  bumpAccepted: number;
  bumpRevenue: number;
  upsellAccepted: number;
  upsellRevenue: number;
  recoveredSales: number;
  recoveryRevenue: number;
};

/** Tasa en % con un decimal; null si no hay base (no es 0 %: es "sin datos"). */
export function rate(part: number, whole: number) {
  return whole > 0 ? Math.round((part / whole) * 1000) / 10 : null;
}

export function funnelRates(c: FunnelCounts) {
  return {
    conversationToCheckout: rate(c.conversationsWithCheckout, c.conversations),
    checkoutToSale: rate(c.sales, c.checkouts),
    bumpTakeRate: rate(c.bumpAccepted, c.bumpShown),
    averageOrder: c.sales > 0 ? Math.round(c.revenue / c.sales) : null,
  };
}

/** Etapas en el orden del plan (Ad → Lead → Conversación → Checkout → Pago → Bump → Recuperación → Revenue). */
export function funnelStages(c: FunnelCounts) {
  return [
    { key: 'ad', label: 'Desde anuncio', value: c.adConversations, hint: 'Conversaciones con campaña o anuncio de Meta' },
    { key: 'lead', label: 'Leads', value: c.leads, hint: 'Contactos nuevos' },
    { key: 'conversation', label: 'Conversaciones', value: c.conversations, hint: 'Conversaciones nuevas' },
    { key: 'checkout', label: 'Checkouts', value: c.checkouts, hint: 'Pedidos creados (sin borradores ni upsells)' },
    { key: 'payment', label: 'Ventas pagadas', value: c.sales, hint: 'Pagados o en curso' },
    { key: 'bump', label: 'Bumps aceptados', value: c.bumpAccepted, hint: `de ${c.bumpShown} mostrados` },
    { key: 'recovery', label: 'Recuperadas', value: c.recoveredSales, hint: 'Ventas que cortaron un seguimiento' },
  ];
}

export type BreakdownRow = { key: string; label: string; sales: number; revenue: number };

/** Agrupa ventas por una clave; ordena por ingresos y luego por cantidad. */
export function groupSales<T>(rows: T[], keyOf: (row: T) => { key: string; label: string }, amountOf: (row: T) => number): BreakdownRow[] {
  const map = new Map<string, BreakdownRow>();
  for (const row of rows) {
    const { key, label } = keyOf(row);
    const entry = map.get(key) ?? { key, label, sales: 0, revenue: 0 };
    entry.sales += 1;
    entry.revenue += amountOf(row);
    map.set(key, entry);
  }
  return [...map.values()].sort((a, b) => b.revenue - a.revenue || b.sales - a.sales);
}
