import { prisma } from '../prisma';

/**
 * Rate limiting con ventana fija, en la base de datos.
 *
 * Vive en la base y no en memoria porque el CRM corre en funciones sin estado:
 * un contador en memoria protege una instancia y deja pasar el ataque por la de
 * al lado. El precio es una escritura por peticion, y por eso solo se aplica
 * donde hace falta —login, captura publica, webhooks— y no al trafico normal.
 *
 * Ventana fija y no deslizante a proposito: la deslizante es mas justa en el
 * borde pero exige guardar cada peticion. Para frenar fuerza bruta y abuso, la
 * fija con ventanas cortas basta.
 */

export type RateLimitRule = {
  /** Peticiones permitidas por ventana. */
  limit: number;
  /** Duracion de la ventana en segundos. */
  windowSeconds: number;
};

/**
 * Limites por endpoint.
 *
 * Los de webhook son deliberadamente altos: un proveedor legitimo puede mandar
 * rafagas, y cortarle el webhook a Meta o a Mercado Pago pierde mensajes y
 * pagos. El limite existe para frenar un abuso evidente, no para moderar a un
 * proveedor que se porta bien.
 */
export const RATE_LIMITS = {
  login: { limit: 10, windowSeconds: 300 },
  register: { limit: 5, windowSeconds: 3600 },
  passwordReset: { limit: 5, windowSeconds: 3600 },
  capture: { limit: 30, windowSeconds: 60 },
  webhook: { limit: 600, windowSeconds: 60 },
  internal: { limit: 120, windowSeconds: 60 },
  publicToken: { limit: 60, windowSeconds: 60 },
} as const satisfies Record<string, RateLimitRule>;

export type RateLimitName = keyof typeof RATE_LIMITS;

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  limit: number;
  /** Cuando se libera la ventana. Sirve para el header `Retry-After`. */
  resetAt: Date;
};

function windowStartFor(now: Date, windowSeconds: number) {
  const ms = windowSeconds * 1000;
  return new Date(Math.floor(now.getTime() / ms) * ms);
}

/**
 * Consume una unidad del cupo y dice si la peticion puede seguir.
 *
 * Ante un fallo de base se PERMITE la peticion. Es una decision consciente: un
 * limitador que se cae no debe tumbar el login ni los webhooks. Protege contra
 * abuso, no es una barrera de seguridad —la autenticacion y las firmas siguen
 * ahi—, asi que fallar abierto es el menor de los dos males.
 */
export async function consume(
  name: RateLimitName,
  identifier: string,
  now = new Date(),
): Promise<RateLimitResult> {
  const rule = RATE_LIMITS[name];
  const windowStart = windowStartFor(now, rule.windowSeconds);
  const resetAt = new Date(windowStart.getTime() + rule.windowSeconds * 1000);
  const bucket = `${name}:${identifier}`;

  try {
    // El upsert con increment es atomico: dos peticiones simultaneas no
    // producen dos filas ni pierden una cuenta.
    const window = await prisma.rateLimitWindow.upsert({
      where: { bucket_windowStart: { bucket, windowStart } },
      create: { bucket, windowStart, count: 1 },
      update: { count: { increment: 1 } },
      select: { count: true },
    });

    return {
      allowed: window.count <= rule.limit,
      remaining: Math.max(0, rule.limit - window.count),
      limit: rule.limit,
      resetAt,
    };
  } catch (error) {
    console.error('rate_limit_failed_open', { bucket, error });
    return { allowed: true, remaining: rule.limit, limit: rule.limit, resetAt };
  }
}

/**
 * Identifica al peticionario.
 *
 * Detras de Vercel la IP real viene en `x-forwarded-for`, que puede traer una
 * cadena de proxies: el primero es el cliente. Sin cabecera se agrupa todo en
 * `desconocido`, que es conservador: en el peor caso se limita de mas.
 */
export function callerKey(request: Request) {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip')?.trim() || 'desconocido';
}

/** Respuesta 429 con `Retry-After`, para que un cliente educado espere. */
export function tooManyRequests(result: RateLimitResult) {
  const seconds = Math.max(1, Math.ceil((result.resetAt.getTime() - Date.now()) / 1000));

  return new Response(
    JSON.stringify({
      message: 'Demasiadas solicitudes. Intenta de nuevo en un momento.',
      code: 'RATE_LIMITED',
    }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(seconds),
        'X-RateLimit-Limit': String(result.limit),
        'X-RateLimit-Remaining': '0',
      },
    },
  );
}

/**
 * Atajo para una ruta: consume y devuelve la respuesta 429 si corresponde.
 *
 * Devuelve `null` cuando se puede seguir, para que la ruta escriba
 * `const limited = await enforce(...); if (limited) return limited;`.
 */
export async function enforce(
  name: RateLimitName,
  request: Request,
  identifier?: string,
): Promise<Response | null> {
  const result = await consume(name, identifier ?? callerKey(request));
  return result.allowed ? null : tooManyRequests(result);
}

/** Borra ventanas viejas. Lo llama el mantenimiento diario. */
export async function pruneRateLimitWindows(olderThanHours = 24) {
  const threshold = new Date(Date.now() - olderThanHours * 3_600_000);
  const result = await prisma.rateLimitWindow.deleteMany({
    where: { windowStart: { lt: threshold } },
  });

  return result.count;
}
