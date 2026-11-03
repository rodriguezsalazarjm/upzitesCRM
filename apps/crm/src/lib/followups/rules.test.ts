import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isQuietHour, nextAllowedInstant, policyFrom, wallTimeIn, type ContactPolicy } from '../marketing/quiet-hours';
import {
  EXIT_REASON,
  aiMessageViolation,
  cleanAiText,
  formatDelay,
  isOptOutText,
  renderMessage,
  stepScheduleLabel,
  strategyInputSchema,
  summarizeFollowUps,
  unknownVariables,
} from './rules';

const step = (overrides: Record<string, unknown> = {}) => ({ label: 'Paso', action: 'SEND_WHATSAPP', delayHours: 1, messageMode: 'FIXED', body: 'Hola {{nombre}}', aiGoal: '', ...overrides });
const strategy = (overrides: Record<string, unknown> = {}) => ({ name: 'Consultó y no compró', trigger: 'INQUIRY_NO_PURCHASE', productId: null, maxMessages: 3, minGapHours: 12, simulate: true, steps: [step()], ...overrides });
const issues = (value: unknown) => {
  const parsed = strategyInputSchema.safeParse(value);
  return parsed.success ? [] : parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
};

test('esquema: una estrategia valida pasa y rellena valores por defecto', () => {
  const parsed = strategyInputSchema.parse(strategy());
  assert.equal(parsed.description, '');
  assert.equal(parsed.steps[0].aiGoal, '');
});

test('esquema: estricto, limites y pasos', () => {
  assert.ok(issues({ ...strategy(), workspaceId: 'otro' }).length > 0, 'mass assignment rechazado');
  assert.ok(issues(strategy({ maxMessages: 0 })).some((i) => i.startsWith('maxMessages')));
  assert.ok(issues(strategy({ maxMessages: 11 })).some((i) => i.startsWith('maxMessages')));
  assert.ok(issues(strategy({ minGapHours: 721 })).some((i) => i.startsWith('minGapHours')));
  assert.ok(issues(strategy({ steps: [] })).some((i) => i.startsWith('steps')));
  assert.ok(issues(strategy({ steps: Array.from({ length: 9 }, () => step()) })).some((i) => i.startsWith('steps')));
  assert.ok(issues(strategy({ steps: [step({ delayHours: 721 })] })).some((i) => i.startsWith('steps.0.delayHours')));
  assert.ok(issues(strategy({ steps: [step({ delayHours: 0.1 })] })).some((i) => i.includes('15 minutos')), 'primer paso >= 15 min');
  assert.ok(issues(strategy({ steps: [step({ action: 'SEND_EMAIL' })] })).length > 0, 'email no se configura aqui');
  assert.ok(issues(strategy({ trigger: 'ORDER_PAID' })).length > 0, 'postventa no es un disparador comercial');
});

test('esquema: mensajes fijos, IA, variables y producto', () => {
  assert.ok(issues(strategy({ steps: [step({ body: '' })] })).some((i) => i.includes('Escribe el mensaje')));
  assert.ok(issues(strategy({ steps: [step({ messageMode: 'AI', body: '', aiGoal: '' })] })).some((i) => i.includes('IA')));
  assert.deepEqual(issues(strategy({ steps: [step({ messageMode: 'AI', body: '', aiGoal: 'recordar beneficio' })] })), []);
  assert.ok(issues(strategy({ steps: [step({ body: 'Precio {{precio}}' })] })).some((i) => i.includes('{{precio}}')));
  assert.ok(issues(strategy({ steps: [step({ body: 'Sobre {{producto}}' })] })).some((i) => i.includes('producto')));
  assert.deepEqual(issues(strategy({ productId: 'cmabcdefghij1234', steps: [step({ body: 'Sobre {{producto}}' })] })), []);
  assert.ok(issues(strategy({ trigger: 'OPPORTUNITY_STALLED', productId: 'cmabcdefghij1234' })).some((i) => i.startsWith('productId')));
  assert.ok(issues(strategy({ steps: [step({ action: 'CREATE_TASK', body: 'Llamar' })] })).some((i) => i.includes('al menos un paso que envíe')));
  assert.ok(issues(strategy({ steps: [step(), step({ action: 'CREATE_TASK', messageMode: 'AI' })] })).some((i) => i.includes('tarea no usa IA')));
});

test('render: variables seguras, sin reinterpretar valores y sin espacios colgados', () => {
  assert.equal(renderMessage('Hola {{nombre}}, sobre {{ producto }} de {{negocio}}.', { nombre: 'María', producto: 'Malla', negocio: 'Upz' }), 'Hola María, sobre Malla de Upz.');
  assert.equal(renderMessage('Hola {{nombre}}, ¿seguimos?', {}), 'Hola, ¿seguimos?');
  assert.equal(renderMessage('Hola {{nombre}}', { nombre: '{{negocio}}', negocio: 'X' }), 'Hola {{negocio}}');
  assert.deepEqual(unknownVariables('{{nombre}} {{precio}} {{}}'), ['precio', '(vacía)']);
});

test('etiquetas de intervalos: desde que evento se cuenta cada espera', () => {
  assert.equal(formatDelay(1), '1 hora');
  assert.equal(formatDelay(24), '24 horas');
  assert.equal(formatDelay(72), '3 días');
  assert.equal(formatDelay(0.5), '30 minutos');
  assert.equal(stepScheduleLabel(0, 1, 'INQUIRY_NO_PURCHASE'), '1 hora después de su última consulta');
  assert.equal(stepScheduleLabel(1, 24, 'INQUIRY_NO_PURCHASE'), '24 horas después del paso anterior');
  assert.equal(stepScheduleLabel(0, 72, 'NO_REPLY'), '3 días después de tu último mensaje sin respuesta');
  assert.equal(stepScheduleLabel(0, 1, 'OPPORTUNITY_STALLED'), '1 hora después del último movimiento de la oportunidad');
});

const santiago: ContactPolicy = { ...policyFrom(null), timezone: 'America/Santiago', quietStartMinute: 20 * 60, quietEndMinute: 9 * 60, sendDays: [1, 2, 3, 4, 5], outOfHoursBehavior: 'POSTPONE' };

test('horario: dentro y fuera, dias habiles y DST', () => {
  // Martes 3-nov-2026 12:00 en Santiago (UTC-3, horario de verano).
  const tuesdayNoon = new Date('2026-11-03T15:00:00Z');
  assert.equal(isQuietHour(tuesdayNoon, santiago), false);
  // Martes 22:00 -> silencio; el proximo permitido es miercoles 09:00 local.
  const tuesdayNight = new Date('2026-11-04T01:00:00Z');
  assert.equal(isQuietHour(tuesdayNight, santiago), true);
  assert.equal(nextAllowedInstant(tuesdayNight, santiago).toISOString(), '2026-11-04T12:00:00.000Z');
  // Viernes 21:00 -> salta sabado y domingo -> lunes 09:00.
  const fridayNight = new Date('2026-11-07T00:00:00Z');
  assert.equal(nextAllowedInstant(fridayNight, santiago).toISOString(), '2026-11-09T12:00:00.000Z');
  // Sabado 12:00 (dentro de la hora, fuera de dia) -> lunes 09:00.
  const saturdayNoon = new Date('2026-11-07T15:00:00Z');
  assert.equal(isQuietHour(saturdayNoon, santiago), true);
  assert.equal(nextAllowedInstant(saturdayNoon, santiago).toISOString(), '2026-11-09T12:00:00.000Z');
  // Madrugada antes de abrir el mismo dia habil -> ese mismo dia a las 09:00.
  const wednesdayDawn = new Date('2026-11-04T09:00:00Z');
  assert.equal(nextAllowedInstant(wednesdayDawn, santiago).toISOString(), '2026-11-04T12:00:00.000Z');
  // Cambio de hora de Chile (abril 2026: UTC-3 -> UTC-4). Sabado 4-abr 23:00
  // local; el lunes 6-abr 09:00 ya es UTC-4 => 13:00Z, no 12:00Z.
  const beforeDst = new Date('2026-04-05T02:00:00Z');
  const next = nextAllowedInstant(beforeDst, santiago);
  assert.equal(next.toISOString(), '2026-04-06T13:00:00.000Z');
  const wall = wallTimeIn(next, 'America/Santiago');
  assert.equal(wall.hour, 9);
});

test('horario: sin dias configurados o con los 7 no restringe', () => {
  const everyDay = { ...santiago, sendDays: [0, 1, 2, 3, 4, 5, 6] };
  assert.equal(isQuietHour(new Date('2026-11-07T15:00:00Z'), everyDay), false);
  const legacy = { ...santiago, sendDays: undefined };
  assert.equal(isQuietHour(new Date('2026-11-07T15:00:00Z'), legacy), false);
});

test('opt-out: frases explicitas, no respuestas comunes', () => {
  for (const text of ['STOP', 'baja', 'No me escriban más', 'no quiero recibir mensajes', 'dejen de escribirme', 'no me interesa, gracias']) {
    assert.equal(isOptOutText(text), true, text);
  }
  for (const text of ['hola, ¿precio?', 'no puedo hoy, mañana sí', 'me interesa', null]) {
    assert.equal(isOptOutText(text), false, String(text));
  }
});

test('guardas de IA: descuentos, plazos, urgencia, garantias y montos', () => {
  const opts = { allowedPrices: ['$5.990'], guaranteeConfigured: false };
  assert.equal(aiMessageViolation('Hola María, ¿te quedó alguna duda?', opts), null);
  assert.equal(aiMessageViolation('El precio es $5.990.', opts), null);
  assert.match(aiMessageViolation('Te dejo un 20% de descuento', opts) ?? '', /descuento/);
  assert.match(aiMessageViolation('Tengo un cupón para ti', opts) ?? '', /beneficio/);
  assert.match(aiMessageViolation('Si compras hoy, llega el viernes', opts) ?? '', /plazo/);
  assert.match(aiMessageViolation('Solo por hoy!', opts) ?? '', /urgencia/);
  assert.match(aiMessageViolation('Tiene garantía de por vida', opts) ?? '', /garantía/);
  assert.equal(aiMessageViolation('Tiene garantía de 30 días', { ...opts, guaranteeConfigured: true }), null);
  assert.match(aiMessageViolation('Ahora a solo $3.990', opts) ?? '', /monto/);
  assert.match(aiMessageViolation('Tu pago fue confirmado', opts) ?? '', /pago/);
  assert.equal(cleanAiText('  "Hola"  '), 'Hola');
  assert.equal(cleanAiText(''), null);
  assert.equal(cleanAiText('x'.repeat(700))?.length, 600);
});

test('metricas: lo simulado aparte y compras solo con atribucion demostrable', () => {
  const row = (overrides: Record<string, unknown>) => ({ status: 'ACTIVE', exitReason: null, simulated: false, messagesSent: 0, purchaseOrderId: null, nextRunAt: null, ...overrides }) as Parameters<typeof summarizeFollowUps>[0][number];
  const stats = summarizeFollowUps(
    [
      row({ nextRunAt: new Date() }),
      row({ status: 'EXITED', exitReason: EXIT_REASON.PURCHASED, purchaseOrderId: 'o1', messagesSent: 2 }),
      row({ status: 'EXITED', exitReason: EXIT_REASON.PURCHASED, purchaseOrderId: 'o2', messagesSent: 0 }),
      row({ status: 'EXITED', exitReason: EXIT_REASON.REPLIED, messagesSent: 1 }),
      row({ status: 'CANCELED', exitReason: EXIT_REASON.OPTED_OUT }),
      row({ status: 'COMPLETED', messagesSent: 3 }),
      row({ simulated: true, status: 'EXITED', exitReason: EXIT_REASON.PURCHASED, purchaseOrderId: 'o3', messagesSent: 2 }),
    ],
    [
      { status: 'SENT', simulated: false },
      { status: 'SENT', simulated: false },
      { status: 'FAILED', simulated: false },
      { status: 'BLOCKED', simulated: false },
      { status: 'SIMULATED', simulated: true },
      { status: 'SIMULATED', simulated: true },
    ],
  );
  assert.equal(stats.started, 6);
  assert.equal(stats.scheduled, 1);
  assert.equal(stats.completed, 1);
  assert.equal(stats.replied, 2);
  assert.equal(stats.optedOut, 1);
  assert.equal(stats.purchases, 1, 'la compra sin mensaje previo no se atribuye; la simulada tampoco');
  assert.equal(stats.sent, 2);
  assert.equal(stats.errors, 2);
  assert.equal(stats.simulatedStarted, 1);
  assert.equal(stats.simulatedMessages, 2);
});
