import assert from 'node:assert/strict';
import { test } from 'node:test';
import { matchesSchedule, planAssignments, scheduleOrder } from './feed';

const at = (day: number) => new Date(Date.UTC(2026, 10, day, 12)).toISOString();
const pieces = [
  { id: 'a', scheduledAt: at(23) },
  { id: 'b', scheduledAt: at(24) },
  { id: 'c', scheduledAt: at(25) },
  { id: 'undated', scheduledAt: null },
];

test('P21: la grilla muestra arriba lo que sale último; sin fecha no se ubica', () => {
  assert.deepEqual(scheduleOrder(pieces), ['c', 'b', 'a']);
  assert.equal(matchesSchedule(['c', 'b', 'a'], pieces), true);
  assert.equal(matchesSchedule(['a', 'b', 'c'], pieces), false, 'advierte cuando el diseño no coincide');
});

test('P21: guardar reparte las mismas fechas para que el orden real sea el de la grilla', () => {
  const plan = planAssignments(['a', 'c', 'b'], pieces);
  assert.deepEqual(plan.map((p) => [p.id, p.scheduledAt.toISOString()]), [['a', at(25)], ['c', at(24)], ['b', at(23)]]);
  const after = plan.map((p) => ({ id: p.id, scheduledAt: p.scheduledAt }));
  assert.equal(matchesSchedule(['a', 'c', 'b'], after), true);
  assert.deepEqual(plan.map((p) => p.scheduledAt.getTime()).sort(), pieces.slice(0, 3).map((p) => new Date(p.scheduledAt!).getTime()).sort(), 'no inventa fechas');
  assert.throws(() => planAssignments(['a', 'undated'], pieces), /fecha/);
  assert.throws(() => planAssignments(['a', 'a'], pieces), /repite/);
});
