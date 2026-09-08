const REQUIRED_IN_PRODUCTION = [
  'DATABASE_URL',
  'DIRECT_URL',
  'CRM_SESSION_SECRET',
  'NEXT_PUBLIC_CRM_BASE_URL',
] as const;

const MIN_SESSION_SECRET_LENGTH = 16;

/**
 * Variables que habilitan una integracion pero NO bloquean el arranque.
 *
 * Regla de la spec (seccion 19): una integracion sin configurar debe aparecer
 * inactiva, no tumbar el CRM. Solo los secretos nucleares —base de datos y
 * firma de sesion— son obligatorios para arrancar.
 */
const OPTIONAL_INTEGRATIONS = [
  {
    name: 'Mercado Pago',
    vars: ['MERCADO_PAGO_ACCESS_TOKEN', 'MERCADO_PAGO_WEBHOOK_SECRET'],
    effect: 'el checkout devolvera 503',
  },
  {
    name: 'WhatsApp Cloud API',
    vars: ['META_APP_SECRET', 'WHATSAPP_VERIFY_TOKEN'],
    effect: 'el webhook rechazara todas las entregas de Meta',
  },
  {
    name: 'Cifrado de integraciones',
    vars: ['INTEGRATION_ENCRYPTION_KEY'],
    effect: 'no se podran guardar tokens de WhatsApp ni Shopify',
  },
  {
    name: 'Worker interno',
    vars: ['INTERNAL_WORKER_SECRET'],
    effect: '/api/internal/* respondera 401 y el outbox no se procesara en background',
  },
] as const;

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

  for (const integration of OPTIONAL_INTEGRATIONS) {
    const pending = integration.vars.filter((key) => !process.env[key]?.trim());
    if (pending.length > 0) {
      console.warn(
        `[env] ${integration.name} sin configurar (falta ${pending.join(', ')}): ${integration.effect}.`,
      );
    }
  }
}
