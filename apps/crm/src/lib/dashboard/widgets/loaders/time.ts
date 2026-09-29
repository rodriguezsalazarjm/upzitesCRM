/** Inicio del dia calendario de `now` en la zona horaria del negocio. */
export function startOfDayInTimeZone(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  // Hora local transcurrida desde medianoche, restada al instante actual.
  const elapsedMs = ((get('hour') * 60 + get('minute')) * 60 + get('second')) * 1000 + now.getMilliseconds();
  return new Date(now.getTime() - elapsedMs);
}

export function daysAgo(now: Date, days: number) {
  return new Date(now.getTime() - days * 86_400_000);
}

export function startOfMonthInTimeZone(now: Date, timeZone: string) {
  const day = Number(new Intl.DateTimeFormat('en-US', { timeZone, day: 'numeric' }).format(now));
  return new Date(startOfDayInTimeZone(now, timeZone).getTime() - (day - 1) * 86_400_000);
}
