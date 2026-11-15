import test from 'node:test';
import assert from 'node:assert/strict';
import { HUMAN_REASON, isWithinAttentionHours, resolveChannelContext, type ChannelContextInput } from './channel-context';

const base: ChannelContextInput = {
  aiEnabled: true,
  aiSchedule: 'ALWAYS',
  hours: { timezone: 'America/Santiago', startMinute: 9 * 60, endMinute: 19 * 60, days: [1, 2, 3, 4, 5] },
  noProductBehavior: 'AI_GENERAL',
  defaultAgent: null,
  defaultProduct: null,
  defaultFlow: null,
  conversationProductId: null,
};
// Martes 10-nov-2026 12:00 en Santiago (UTC-3).
const tuesdayNoon = new Date('2026-11-10T15:00:00Z');
const tuesdayNight = new Date('2026-11-11T01:00:00Z'); // martes 22:00
const saturdayNoon = new Date('2026-11-14T15:00:00Z');

test('sin configuracion: la IA atiende con el agente de ventas y sin producto', () => {
  const ctx = resolveChannelContext(base, tuesdayNoon);
  assert.equal(ctx.aiAllowed, true);
  assert.equal(ctx.agentId, null);
  assert.equal(ctx.productId, null);
  assert.equal(ctx.productSource, 'NONE');
  assert.equal(ctx.humanReason, null);
});

test('producto: la conversacion manda sobre el predeterminado del numero', () => {
  const withDefault = { ...base, defaultProduct: { id: 'p-default', usable: true } };
  assert.deepEqual(
    [resolveChannelContext(withDefault, tuesdayNoon).productId, resolveChannelContext(withDefault, tuesdayNoon).productSource],
    ['p-default', 'CHANNEL_DEFAULT'],
  );
  const attributed = resolveChannelContext({ ...withDefault, conversationProductId: 'p-conv' }, tuesdayNoon);
  assert.equal(attributed.productId, 'p-conv');
  assert.equal(attributed.productSource, 'CONVERSATION');
});

test('producto inactivo no se inventa: queda sin producto y con aviso', () => {
  const ctx = resolveChannelContext({ ...base, defaultProduct: { id: 'p', usable: false } }, tuesdayNoon);
  assert.equal(ctx.productId, null);
  assert.equal(ctx.warnings.length, 1);
});

test('IA desactivada: humano con motivo', () => {
  const ctx = resolveChannelContext({ ...base, aiEnabled: false }, tuesdayNoon);
  assert.equal(ctx.aiAllowed, false);
  assert.equal(ctx.humanReason, HUMAN_REASON.AI_DISABLED);
});

test('horario: IN_HOURS atiende de dia y deja la noche y el sabado para personas', () => {
  const inHours = { ...base, aiSchedule: 'IN_HOURS' as const };
  assert.equal(resolveChannelContext(inHours, tuesdayNoon).aiAllowed, true);
  assert.equal(resolveChannelContext(inHours, tuesdayNight).humanReason, HUMAN_REASON.OUT_OF_SCHEDULE);
  assert.equal(resolveChannelContext(inHours, saturdayNoon).humanReason, HUMAN_REASON.OUT_OF_SCHEDULE);
  const outOfHours = { ...base, aiSchedule: 'OUT_OF_HOURS' as const };
  assert.equal(resolveChannelContext(outOfHours, tuesdayNoon).aiAllowed, false);
  assert.equal(resolveChannelContext(outOfHours, tuesdayNight).aiAllowed, true);
});

test('agente predeterminado no disponible: humano, nunca otro agente', () => {
  const ctx = resolveChannelContext({ ...base, defaultAgent: { id: 'a', usable: false } }, tuesdayNoon);
  assert.equal(ctx.aiAllowed, false);
  assert.equal(ctx.agentId, null);
  assert.equal(ctx.humanReason, HUMAN_REASON.AGENT_UNAVAILABLE);
  assert.equal(resolveChannelContext({ ...base, defaultAgent: { id: 'a', usable: true } }, tuesdayNoon).agentId, 'a');
});

test('sin producto con politica HUMAN: humano; con producto, la IA atiende', () => {
  const humanIfNoProduct = { ...base, noProductBehavior: 'HUMAN' as const };
  assert.equal(resolveChannelContext(humanIfNoProduct, tuesdayNoon).humanReason, HUMAN_REASON.NO_PRODUCT);
  assert.equal(resolveChannelContext({ ...humanIfNoProduct, defaultProduct: { id: 'p', usable: true } }, tuesdayNoon).aiAllowed, true);
});

test('automatizacion: solo se usa si es valida', () => {
  assert.equal(resolveChannelContext({ ...base, defaultFlow: { id: 'f', usable: true } }, tuesdayNoon).flowId, 'f');
  const invalid = resolveChannelContext({ ...base, defaultFlow: { id: 'f', usable: false } }, tuesdayNoon);
  assert.equal(invalid.flowId, null);
  assert.equal(invalid.warnings.length, 1);
});

test('horario nocturno cruza la medianoche y respeta el dia en que empezo', () => {
  const night = { timezone: 'America/Santiago', startMinute: 22 * 60, endMinute: 6 * 60, days: [5] }; // viernes 22-06
  assert.equal(isWithinAttentionHours(new Date('2026-11-14T04:00:00Z'), night), true); // sabado 01:00, ventana del viernes
  assert.equal(isWithinAttentionHours(new Date('2026-11-15T04:00:00Z'), night), false); // domingo 01:00, ventana del sabado
  assert.equal(isWithinAttentionHours(new Date('2026-11-13T15:00:00Z'), night), false); // viernes mediodia
});

test('horario respeta el cambio de hora (Chile, abril 2026)', () => {
  const hours = { timezone: 'America/Santiago', startMinute: 9 * 60, endMinute: 10 * 60, days: [] };
  // 4-abr-2026 (UTC-3): 09:30 local = 12:30Z. 6-abr-2026 (UTC-4): 09:30 local = 13:30Z.
  assert.equal(isWithinAttentionHours(new Date('2026-04-04T12:30:00Z'), hours), true);
  assert.equal(isWithinAttentionHours(new Date('2026-04-06T13:30:00Z'), hours), true);
  assert.equal(isWithinAttentionHours(new Date('2026-04-06T12:30:00Z'), hours), false);
});
