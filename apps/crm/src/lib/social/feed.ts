/**
 * P21 Feed Planner. Instagram muestra lo más nuevo arriba a la izquierda, así
 * que en la grilla las piezas futuras van primero, de la que sale ÚLTIMA a la
 * que sale primero, y debajo lo ya publicado (que no se toca).
 *
 * Guardar el plan no inventa fechas: reparte las MISMAS fechas ya
 * planificadas entre las piezas según el orden de la grilla.
 */
type Piece = { id: string; scheduledAt: string | Date | null };

const time = (value: string | Date) => new Date(value).getTime();

/** Orden de la grilla según la programación actual (más tardía primero). */
export function scheduleOrder(pieces: Piece[]) {
  return pieces
    .filter((p) => p.scheduledAt)
    .sort((a, b) => time(b.scheduledAt!) - time(a.scheduledAt!) || a.id.localeCompare(b.id))
    .map((p) => p.id);
}

/** ¿El orden real de publicación coincide con el diseño? */
export function matchesSchedule(order: string[], pieces: Piece[]) {
  const byId = new Map(pieces.map((p) => [p.id, p]));
  for (let i = 1; i < order.length; i += 1) {
    const prev = byId.get(order[i - 1])?.scheduledAt;
    const next = byId.get(order[i])?.scheduledAt;
    if (!prev || !next || time(prev) < time(next)) return false;
  }
  return true;
}

/** Fecha que le toca a cada pieza para que publicar en orden reproduzca la grilla. */
export function planAssignments(order: string[], pieces: Piece[]) {
  const byId = new Map(pieces.map((p) => [p.id, p]));
  if (order.length !== new Set(order).size) throw new Error('La grilla repite una pieza.');
  const times = order.map((id) => {
    const at = byId.get(id)?.scheduledAt;
    if (!at) throw new Error('Cada pieza necesita una fecha para ubicarla en la grilla.');
    return time(at);
  });
  times.sort((a, b) => b - a);
  return order.map((id, i) => ({ id, scheduledAt: new Date(times[i]) }));
}
