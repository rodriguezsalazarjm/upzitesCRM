import { timingSafeEqual } from 'node:crypto';

/**
 * Autenticacion de los endpoints internos (`/api/internal/*`).
 *
 * Acepta el header `x-internal-secret` o el `Authorization: Bearer` que manda
 * Vercel Cron. Comparacion en tiempo constante para no filtrar el secreto por
 * diferencias de tiempo.
 */
export function isInternalRequest(request: Request) {
  const secret = process.env.INTERNAL_WORKER_SECRET;
  if (!secret) return false;

  const header =
    request.headers.get('x-internal-secret') ??
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    '';

  const received = Buffer.from(header);
  const expected = Buffer.from(secret);

  return received.length === expected.length && timingSafeEqual(received, expected);
}
