import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * `state` firmado del OAuth de Mercado Pago. Mismo diseno que
 * src/lib/shopify/oauth.ts (createState/verifyState): nonce + vencimiento
 * firmados con HMAC, y el nonce ademas viaja por una cookie httpOnly para
 * que el callback exija que ambos canales coincidan (ver la ruta de
 * connect/callback). No se reutiliza el helper de Shopify tal cual porque
 * el payload es distinto (lleva userId, no `shop`) y porque tocar codigo de
 * Shopify ya probado no aporta nada aqui.
 */
const STATE_TTL_MS = 10 * 60_000;

function sign(payload: string, secret: string) {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export type MercadoPagoOAuthStatePayload = {
  workspaceId: string;
  userId: string;
  nonce: string;
  exp: number;
};

export function createMercadoPagoOAuthState(
  input: { workspaceId: string; userId: string },
  secret: string,
) {
  const payload: MercadoPagoOAuthStatePayload = {
    workspaceId: input.workspaceId,
    userId: input.userId,
    nonce: randomBytes(16).toString('base64url'),
    exp: Date.now() + STATE_TTL_MS,
  };

  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return { state: `${body}.${sign(body, secret)}`, nonce: payload.nonce };
}

export type MercadoPagoOAuthStateVerification =
  | { valid: true; payload: MercadoPagoOAuthStatePayload }
  | { valid: false; reason: string };

export function verifyMercadoPagoOAuthState(
  state: string,
  secret: string,
): MercadoPagoOAuthStateVerification {
  const [body, signature] = state.split('.');
  if (!body || !signature) return { valid: false, reason: 'formato de state invalido' };

  const expected = sign(body, secret);
  const received = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (received.length !== expectedBuffer.length || !timingSafeEqual(received, expectedBuffer)) {
    return { valid: false, reason: 'firma del state invalida' };
  }

  let payload: MercadoPagoOAuthStatePayload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return { valid: false, reason: 'state ilegible' };
  }

  if (!payload.exp || payload.exp < Date.now()) {
    return { valid: false, reason: 'state vencido' };
  }

  return { valid: true, payload };
}
