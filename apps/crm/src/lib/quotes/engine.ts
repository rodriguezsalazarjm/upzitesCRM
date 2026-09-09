import { QuoteLineKind } from '../../../generated/prisma/client';
import { evaluateGroup } from '../automation/conditions';
import type { PricingComponent, PricingRules } from './schema';

/**
 * Motor de calculo determinista.
 *
 * Es una funcion **pura**: mismos datos de entrada y mismas reglas dan siempre
 * el mismo total. No toca la base, no llama a nadie y no depende del reloj.
 *
 * Esto es lo que hace verificable la regla de la spec de que "el LLM no realiza
 * la aritmetica final": el modelo recolecta datos y llama a `calculate_quote`,
 * pero el numero sale de aqui.
 */
export type QuoteLineResult = {
  kind: QuoteLineKind;
  label: string;
  detail?: string;
  amount: number;
};

export type QuoteCalculation = {
  lines: QuoteLineResult[];
  subtotal: number;
  surcharges: number;
  discounts: number;
  total: number;
};

function num(values: Record<string, unknown>, key: string) {
  const value = values[key];
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Un componente sin `when` siempre aplica; con `when`, solo si se cumple. */
function applies(component: PricingComponent, values: Record<string, unknown>) {
  if (!component.when) return true;
  return evaluateGroup(component.when, values);
}

/** Precio unitario del tramo que corresponde a `quantity`. */
function tierPrice(tiers: { upTo: number | null; unitPriceClp: number }[], quantity: number) {
  for (const tier of tiers) {
    if (tier.upTo === null || quantity <= tier.upTo) return tier.unitPriceClp;
  }
  return tiers[tiers.length - 1].unitPriceClp;
}

export function calculateQuote(
  rules: PricingRules,
  values: Record<string, unknown>,
): QuoteCalculation {
  const lines: QuoteLineResult[] = [];
  let subtotal = 0;
  let surcharges = 0;
  let discounts = 0;

  for (const component of rules.components) {
    if (!applies(component, values)) continue;

    switch (component.type) {
      case 'FIXED': {
        subtotal += component.amountClp;
        lines.push({ kind: QuoteLineKind.BASE, label: component.label, amount: component.amountClp });
        break;
      }

      case 'PER_UNIT': {
        const quantity = num(values, component.quantityFrom);
        if (quantity <= 0) break;
        const amount = Math.round(component.unitPriceClp * quantity);
        subtotal += amount;
        lines.push({
          kind: QuoteLineKind.BASE,
          label: component.label,
          detail: `${quantity} × ${component.unitPriceClp}`,
          amount,
        });
        break;
      }

      case 'PER_AREA': {
        const width = num(values, component.widthFrom);
        const height = num(values, component.heightFrom);
        const area = width * height;
        if (area <= 0) break;
        const amount = Math.round(component.unitPriceClp * area);
        subtotal += amount;
        lines.push({
          kind: QuoteLineKind.BASE,
          label: component.label,
          detail: `${width} × ${height} = ${Number(area.toFixed(2))} × ${component.unitPriceClp}`,
          amount,
        });
        break;
      }

      case 'TIERED': {
        const quantity = num(values, component.quantityFrom);
        if (quantity <= 0) break;
        const unitPrice = tierPrice(component.tiers, quantity);
        const amount = Math.round(unitPrice * quantity);
        subtotal += amount;
        lines.push({
          kind: QuoteLineKind.BASE,
          label: component.label,
          detail: `${quantity} × ${unitPrice} (tramo)`,
          amount,
        });
        break;
      }

      case 'SURCHARGE': {
        // El porcentaje se aplica sobre el subtotal ACUMULADO hasta aqui, no
        // sobre el total final: el orden de los componentes importa y queda
        // documentado en el desglose.
        const amount = component.percent
          ? Math.round((subtotal * component.percent) / 100)
          : (component.amountClp ?? 0);
        if (amount === 0) break;
        surcharges += amount;
        lines.push({
          kind: QuoteLineKind.SURCHARGE,
          label: component.label,
          detail: component.percent ? `${component.percent}% sobre ${subtotal}` : undefined,
          amount,
        });
        break;
      }

      case 'DISCOUNT': {
        const amount = component.percent
          ? Math.round(((subtotal + surcharges) * component.percent) / 100)
          : (component.amountClp ?? 0);
        if (amount === 0) break;
        discounts += amount;
        lines.push({
          kind: QuoteLineKind.DISCOUNT,
          label: component.label,
          detail: component.percent ? `${component.percent}%` : undefined,
          amount: -amount,
        });
        break;
      }
    }
  }

  let total = subtotal + surcharges - discounts;

  // El minimo se aplica antes del redondeo: si no, redondear hacia abajo podria
  // dejar el total por debajo del piso.
  if (rules.minimumClp !== undefined && total < rules.minimumClp) {
    const adjustment = rules.minimumClp - total;
    lines.push({
      kind: QuoteLineKind.MINIMUM_ADJUSTMENT,
      label: 'Ajuste por minimo',
      detail: `Minimo ${rules.minimumClp}`,
      amount: adjustment,
    });
    total = rules.minimumClp;
  }

  if (rules.roundToClp && rules.roundToClp > 1) {
    const rounded = Math.round(total / rules.roundToClp) * rules.roundToClp;
    if (rounded !== total) {
      lines.push({
        kind: QuoteLineKind.ROUNDING,
        label: 'Redondeo',
        amount: rounded - total,
      });
      total = rounded;
    }
  }

  return { lines, subtotal, surcharges, discounts, total };
}
