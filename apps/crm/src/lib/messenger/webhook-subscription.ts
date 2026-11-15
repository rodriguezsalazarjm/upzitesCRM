import { ChannelAccountStatus } from '../../../generated/prisma/client';
import { prisma } from '../prisma';

export class MessengerApiError extends Error {}

/**
 * Suscribe la Page a los campos de webhook que usamos (`messages`,
 * `messaging_postbacks`, `feed`) via `POST /{page-id}/subscribed_apps`.
 * Idempotente por diseno de la propia API — segura de llamar de nuevo desde
 * "Verificar conexion".
 */
export async function ensureMessengerWebhookSubscription(input: {
  pageId: string;
  pageAccessToken: string;
  fetchImpl?: typeof fetch;
}): Promise<{ subscribed: boolean }> {
  const doFetch = input.fetchImpl ?? fetch;
  const params = new URLSearchParams({
    subscribed_fields: 'messages,messaging_postbacks,feed',
    access_token: input.pageAccessToken,
  });
  let response: Response;
  try {
    response = await doFetch(`https://graph.facebook.com/v21.0/${input.pageId}/subscribed_apps?${params.toString()}`, { method: 'POST' });
  } catch (error) {
    throw new MessengerApiError(error instanceof Error ? error.message : 'error de red');
  }
  const payload = (await response.json().catch(() => ({}))) as { success?: boolean; error?: { message?: string } };
  if (!response.ok || !payload.success) {
    throw new MessengerApiError(payload.error?.message ?? `HTTP ${response.status}`);
  }
  return { subscribed: true };
}

/** Verificacion minima de identidad/salud de la Page. Nunca devuelve el token. */
export async function verifyMessengerConnection(input: {
  channelAccountId: string;
  pageAccessToken: string;
  fetchImpl?: typeof fetch;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const doFetch = input.fetchImpl ?? fetch;
  const params = new URLSearchParams({ fields: 'id', access_token: input.pageAccessToken });
  try {
    const response = await doFetch(`https://graph.facebook.com/v21.0/me?${params.toString()}`);
    const payload = (await response.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
    if (!response.ok || !payload.id) {
      const reason = payload.error?.message ?? `HTTP ${response.status}`;
      await prisma.channelAccount.update({
        where: { id: input.channelAccountId },
        data: { status: ChannelAccountStatus.REAUTH_REQUIRED, lastErrorCode: 'VERIFY_FAILED', lastError: reason },
      });
      return { ok: false, reason };
    }
    await prisma.channelAccount.update({
      where: { id: input.channelAccountId },
      data: { lastVerifiedAt: new Date(), status: ChannelAccountStatus.CONNECTED, lastErrorCode: null, lastError: null },
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : 'error de red' };
  }
}
