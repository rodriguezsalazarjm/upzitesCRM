const REQUIRED_IN_PRODUCTION = [
  'DATABASE_URL',
  'DIRECT_URL',
  'CRM_SESSION_SECRET',
  'NEXT_PUBLIC_CRM_BASE_URL',
] as const;

const MIN_SESSION_SECRET_LENGTH = 16;

/**
 * Valida que existan las variables de entorno criticas en produccion.
 * Se ejecuta una sola vez al arrancar el server (via instrumentation.ts) para
 * fallar rapido con un mensaje claro en vez de romper en la primera request.
 */
export function assertProductionEnv() {
  if (process.env.NODE_ENV !== 'production') return;

  const missing = REQUIRED_IN_PRODUCTION.filter((key) => !process.env[key]?.trim());
  if (missing.length > 0) {
    throw new Error(
      `[env] Faltan variables de entorno requeridas en produccion: ${missing.join(', ')}. ` +
        'Configuralas en el proyecto de Vercel antes de desplegar.',
    );
  }

  if ((process.env.CRM_SESSION_SECRET ?? '').length < MIN_SESSION_SECRET_LENGTH) {
    throw new Error(
      `[env] CRM_SESSION_SECRET debe tener al menos ${MIN_SESSION_SECRET_LENGTH} caracteres en produccion.`,
    );
  }

  // Mercado Pago no bloquea el arranque (el checkout devuelve 503 si falta),
  // pero avisamos para no desplegar el billing a medias.
  if (!process.env.MERCADO_PAGO_ACCESS_TOKEN || !process.env.MERCADO_PAGO_WEBHOOK_SECRET) {
    console.warn(
      '[env] Mercado Pago sin configurar: el checkout devolvera 503 hasta setear ' +
        'MERCADO_PAGO_ACCESS_TOKEN y MERCADO_PAGO_WEBHOOK_SECRET.',
    );
  }
}
