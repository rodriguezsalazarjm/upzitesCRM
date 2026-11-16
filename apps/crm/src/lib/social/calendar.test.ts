import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dayKey, monthWeeks, moveToDay, weekDays } from './calendar';

test('P20: semana de lunes a domingo y mes en semanas completas', () => {
  const week = weekDays(new Date(2026, 10, 19)); // jueves 19 nov 2026
  assert.deepEqual(week.map(dayKey), ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22']);
  assert.equal(dayKey(weekDays(new Date(2026, 10, 22))[0]), '2026-11-16', 'el domingo cierra la semana, no la abre');
  const november = monthWeeks(2026, 10);
  assert.equal(dayKey(november[0][0]), '2026-10-26');
  assert.equal(dayKey(november.at(-1)!.at(-1)!), '2026-12-06', 'el 30 (lunes) abre la última semana');
  const all = monthWeeks(2026, 10).flat().filter((d) => d.getMonth() === 10).length;
  assert.equal(all, 30, 'todos los días del mes están en la grilla');
});

test('P20: arrastrar cambia el día y conserva la hora', () => {
  const moved = moveToDay(new Date(2026, 10, 16, 18, 45), new Date(2026, 10, 20));
  assert.equal(dayKey(moved), '2026-11-20');
  assert.deepEqual([moved.getHours(), moved.getMinutes()], [18, 45]);
  assert.deepEqual([moveToDay(null, new Date(2026, 10, 20)).getHours()], [10], 'sin hora previa: 10:00');
});
