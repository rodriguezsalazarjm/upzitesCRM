import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * `state` firmado, compartido entre el OAuth de Instagram y de Messenger.
 *
 * Mismo diseno que src/lib/shopify/oauth.ts y
 * src/lib/commerce/mercado-pago-oauth-state.ts (HMAC + nonce + vencimiento,
 * nonce ademas en cookie httpOnly), pero a diferencia de esos dos, aqui SI se
 * comparte un solo helper entre canales: Instagram y Messenger son productos
 * de la MISMA app de Meta, pueden compartir primitivas de seguridad OAuth
 * (spec Fase D1, seccion 3), y el payload es identico salvo por el campo
 * `channel`, que ademas evita que un state emitido para un canal se reuse en
 * el callback del otro.
 */
const STATE_TTL_MS = 10 * 60_000;

export type MetaOAuthChannel = 'INSTAGRAM' | 'MESSENGER';

export type MetaOAuthStatePayload = {
  workspaceId: string;
  userId: string;
  channel: MetaOAuthChannel;
  nonce: string;
  exp: number;
};

function sign(payload: string, secret: string) {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function createMetaOAuthState(
  input: { workspaceId: string; userId: string; channel: MetaOAuthChannel },
  secret: string,
) {
  const payload: MetaOAuthStatePayload = {
    workspaceId: input.workspaceId,
    userId: input.userId,
    channel: input.channel,
    nonce: randomBytes(16).toString('base64url'),
    exp: Date.now() + STATE_TTL_MS,
  };

  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return { state: `${body}.${sign(body, secret)}`, nonce: payload.nonce };
}

export type MetaOAuthStateVerification =
  | { valid: true; payload: MetaOAuthStatePayload }
  | { valid: false; reason: string };

export function verifyMetaOAuthState(
  state: string,
  secret: string,
  expectedChannel: MetaOAuthChannel,
): MetaOAuthStateVerification {
  const [body, signature] = state.split('.');
  if (!body || !signature) return { valid: false, reason: 'formato de state invalido' };

  const expected = sign(body, secret);
  const received = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (received.length !== expectedBuffer.length || !timingSafeEqual(received, expectedBuffer)) {
    return { valid: false, reason: 'firma del state invalida' };
  }

  let payload: MetaOAuthStatePayload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return { valid: false, reason: 'state ilegible' };
  }

  if (!payload.exp || payload.exp < Date.now()) {
    return { valid: false, reason: 'state vencido' };
  }
  if (payload.channel !== expectedChannel) {
    return { valid: false, reason: 'state emitido para otro canal' };
  }

  return { valid: true, payload };
}
