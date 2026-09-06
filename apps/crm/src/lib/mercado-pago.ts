import {
  MercadoPagoConfig,
  Preference,
  Payment,
  WebhookSignatureValidator,
  InvalidWebhookSignatureError,
} from 'mercadopago';

let config: MercadoPagoConfig | null = null;

function getConfig() {
  const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  if (!accessToken) return null;
  if (!config) config = new MercadoPagoConfig({ accessToken });
  return config;
}

export function getPreferenceClient() {
  const cfg = getConfig();
  return cfg ? new Preference(cfg) : null;
}

export function getPaymentClient() {
  const cfg = getConfig();
  return cfg ? new Payment(cfg) : null;
}

export type WebhookVerification = { valid: true } | { valid: false; reason: string };

/**
 * Valida la firma x-signature de una notificacion de Mercado Pago usando el
 * validador oficial del SDK (HMAC-SHA256, comparacion en tiempo constante).
 * toleranceSeconds mitiga ataques de repeticion (replay).
 */
export function verifyWebhookSignature(input: {
  xSignature: string | null;
  xRequestId: string | null;
  dataId: string | null;
}): WebhookVerification {
  const secret = process.env.MERCADO_PAGO_WEBHOOK_SECRET;
  if (!secret) return { valid: false, reason: 'MERCADO_PAGO_WEBHOOK_SECRET not configured' };

  try {
    WebhookSignatureValidator.validate({
      xSignature: input.xSignature,
      xRequestId: input.xRequestId,
      dataId: input.dataId,
      secret,
      toleranceSeconds: 300,
    });
    return { valid: true };
  } catch (error) {
    if (error instanceof InvalidWebhookSignatureError) {
      return { valid: false, reason: error.reason };
    }
    throw error;
  }
}
