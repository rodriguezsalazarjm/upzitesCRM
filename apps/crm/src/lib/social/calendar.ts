/**
 * P20 Calendario editorial: aritmética de fechas pura, en la hora LOCAL del
 * navegador (la persona planifica en su hora). Semanas de lunes a domingo.
 */

export function dayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function startOfWeek(date: Date) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return start;
}

export function weekDays(date: Date) {
  const start = startOfWeek(date);
  return Array.from({ length: 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
}

/** Semanas completas que cubren el mes (incluye días del mes vecino para cerrar la grilla). */
export function monthWeeks(year: number, month: number) {
  const weeks: Date[][] = [];
  let cursor = startOfWeek(new Date(year, month, 1));
  while (weeks.length === 0 || cursor.getMonth() === month) {
    weeks.push(weekDays(cursor));
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 7);
  }
  return weeks;
}

/** Arrastrar a otro día cambia la fecha y conserva la hora; sin hora previa, 10:00. */
export function moveToDay(original: Date | null, day: Date) {
  const target = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 10, 0);
  if (original) target.setHours(original.getHours(), original.getMinutes(), 0, 0);
  return target;
}
