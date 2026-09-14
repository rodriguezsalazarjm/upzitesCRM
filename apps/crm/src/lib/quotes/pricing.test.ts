import assert from 'node:assert/strict';
import { test } from 'node:test';
import { UserRole } from '../../../generated/prisma/client';
import { calculateQuote } from './engine';
import { isRuleSetUsable, type IntakeSchema, type PricingRules } from './schema';
import { canApproveQuotes } from './roles';

const intake: IntakeSchema = {
  fields: [
    { key: 'detalle', label: '¿Qué necesita?', type: 'text', required: true },
    { key: 'cantidad', label: 'Cantidad', type: 'number', required: true, unit: 'hora' },
  ],
};

test('el cotizador usa precio base, unidad y adicional guardados', () => {
  const rules: PricingRules = {
    components: [
      { type: 'FIXED', key: 'base', label: 'Precio base', amountClp: 10_000 },
      {
        type: 'PER_UNIT',
        key: 'unidad',
        label: 'Horas',
        unitPriceClp: 5_000,
        quantityFrom: 'cantidad',
      },
      { type: 'SURCHARGE', key: 'adicional', label: 'Adicional autorizado', amountClp: 2_000 },
    ],
  };

  const quote = calculateQuote(rules, { detalle: 'Instalación', cantidad: 3 });
  assert.equal(quote.total, 27_000);
  assert.deepEqual(
    quote.lines.map((line) => line.amount),
    [10_000, 15_000, 2_000],
  );
});

test('el mínimo guardado se aplica al total calculado', () => {
  const rules: PricingRules = {
    components: [{ type: 'FIXED', key: 'base', label: 'Precio base', amountClp: 1_000 }],
    minimumClp: 8_000,
  };
  assert.equal(calculateQuote(rules, { detalle: 'Visita' }).total, 8_000);
});

test('onboarding exige una configuración interpretable y con precio', () => {
  assert.equal(
    isRuleSetUsable(intake, {
      components: [
        {
          type: 'PER_UNIT',
          key: 'unidad',
          label: 'Horas',
          unitPriceClp: 5_000,
          quantityFrom: 'cantidad',
        },
      ],
    }),
    true,
  );
  assert.equal(
    isRuleSetUsable(intake, {
      components: [
        {
          type: 'PER_UNIT',
          key: 'unidad',
          label: 'Metros',
          unitPriceClp: 5_000,
          quantityFrom: 'campo_inexistente',
        },
      ],
    }),
    false,
  );
  assert.equal(
    isRuleSetUsable(intake, {
      components: [{ type: 'FIXED', key: 'base', label: 'Precio base', amountClp: 0 }],
    }),
    false,
  );
});

test('la aprobación humana sigue limitada a owner y admin', () => {
  assert.equal(canApproveQuotes(UserRole.OWNER), true);
  assert.equal(canApproveQuotes(UserRole.ADMIN), true);
  assert.equal(canApproveQuotes(UserRole.SALES), false);
});
