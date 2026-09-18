import { ChannelAccountStatus } from '../../../generated/prisma/client';
import { prisma } from '../prisma';

export class InstagramApiError extends Error {}

type ChannelAccountUpdater = {
  update(args: {
    where: { id: string };
    data: { status?: ChannelAccountStatus; lastErrorCode?: string | null; lastError?: string | null; lastVerifiedAt?: Date };
  }): Promise<unknown>;
};

/**
 * Suscribe la cuenta profesional a los campos de webhook que usamos
 * (`messages`, `comments`) via `POST /{ig-user-id}/subscribed_apps`.
 *
 * Idempotente por diseno de la propia API de Meta: llamarlo de nuevo con la
 * misma cuenta no duplica nada, solo confirma/renueva la suscripcion — por
 * eso es seguro invocarlo tanto al conectar como desde "Verificar conexion".
 */
export async function ensureInstagramWebhookSubscription(input: {
  instagramAccountId: string;
  accessToken: string;
  fetchImpl?: typeof fetch;
}): Promise<{ subscribed: boolean }> {
  const doFetch = input.fetchImpl ?? fetch;
  const params = new URLSearchParams({
    subscribed_fields: 'messages,comments',
    access_token: input.accessToken,
  });
  let response: Response;
  try {
    response = await doFetch(`https://graph.instagram.com/v21.0/${input.instagramAccountId}/subscribed_apps?${params.toString()}`, {
      method: 'POST',
    });
  } catch (error) {
    throw new InstagramApiError(error instanceof Error ? error.message : 'error de red');
  }
  const payload = (await response.json().catch(() => ({}))) as { success?: boolean; error?: { message?: string } };
  if (!response.ok || !payload.success) {
    throw new InstagramApiError(payload.error?.message ?? `HTTP ${response.status}`);
  }
  return { subscribed: true };
}

/**
 * Lectura de solo-consulta de `GET /{ig-user-id}/subscribed_apps`: devuelve
 * los `subscribed_fields` que Meta tiene registrados para esta cuenta, para
 * poder confirmar (no solo asumir) que `messages`/`comments` quedaron activos.
 */
export async function getInstagramSubscribedFields(input: {
  instagramAccountId: string;
  accessToken: string;
  fetchImpl?: typeof fetch;
}): Promise<string[]> {
  const doFetch = input.fetchImpl ?? fetch;
  const params = new URLSearchParams({ access_token: input.accessToken });
  let response: Response;
  try {
    response = await doFetch(
      `https://graph.instagram.com/v21.0/${input.instagramAccountId}/subscribed_apps?${params.toString()}`,
    );
  } catch (error) {
    throw new InstagramApiError(error instanceof Error ? error.message : 'error de red');
  }
  const payload = (await response.json().catch(() => ({}))) as {
    data?: Array<{ subscribed_fields?: string[] }>;
    error?: { message?: string };
  };
  if (!response.ok) {
    throw new InstagramApiError(payload.error?.message ?? `HTTP ${response.status}`);
  }
  return payload.data?.[0]?.subscribed_fields ?? [];
}

const REQUIRED_SUBSCRIBED_FIELDS = ['messages', 'comments'];

/**
 * Suscribe y despues CONFIRMA con una lectura de solo-consulta que
 * `messages`/`comments` quedaron activos — el punto ciego que causaba que
 * cuentas "CONNECTED" nunca recibieran webhooks: `subscribed_apps` puede
 * fallar en silencio o quedar incompleto sin que la app se entere.
 */
async function ensureAndConfirmWebhookSubscription(input: {
  channelAccountId: string;
  instagramAccountId: string;
  accessToken: string;
  fetchImpl?: typeof fetch;
  prismaChannelAccount?: ChannelAccountUpdater;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const channelAccount = input.prismaChannelAccount ?? prisma.channelAccount;
  try {
    await ensureInstagramWebhookSubscription({
      instagramAccountId: input.instagramAccountId,
      accessToken: input.accessToken,
      fetchImpl: input.fetchImpl,
    });
    const subscribedFields = await getInstagramSubscribedFields({
      instagramAccountId: input.instagramAccountId,
      accessToken: input.accessToken,
      fetchImpl: input.fetchImpl,
    });
    const missing = REQUIRED_SUBSCRIBED_FIELDS.filter((field) => !subscribedFields.includes(field));
    if (missing.length > 0) {
      const reason = `la cuenta no quedo suscrita a: ${missing.join(', ')}`;
      await channelAccount.update({
        where: { id: input.channelAccountId },
        data: { status: ChannelAccountStatus.NEEDS_ATTENTION, lastErrorCode: 'SUBSCRIPTION_INCOMPLETE', lastError: reason },
      });
      return { ok: false, reason };
    }
    return { ok: true };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'error de red';
    await channelAccount.update({
      where: { id: input.channelAccountId },
      data: { status: ChannelAccountStatus.NEEDS_ATTENTION, lastErrorCode: 'SUBSCRIBE_FAILED', lastError: reason },
    });
    return { ok: false, reason };
  }
}

/**
 * Verificacion de identidad + salud de la suscripcion de webhooks — nunca
 * devuelve el token, solo actualiza `lastVerifiedAt`/`status` a partir de la
 * respuesta. Ademas de `/me`, ahora tambien re-suscribe y confirma
 * `subscribed_apps` para que "Verificar conexion" detecte cuentas que quedaron
 * CONNECTED pero sin recibir webhooks de verdad.
 */
export async function verifyInstagramConnection(input: {
  channelAccountId: string;
  accessToken: string;
  fetchImpl?: typeof fetch;
  prismaChannelAccount?: ChannelAccountUpdater;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const doFetch = input.fetchImpl ?? fetch;
  const channelAccount = input.prismaChannelAccount ?? prisma.channelAccount;
  const params = new URLSearchParams({ fields: 'user_id', access_token: input.accessToken });
  try {
    const response = await doFetch(`https://graph.instagram.com/v21.0/me?${params.toString()}`);
    const payload = (await response.json().catch(() => ({}))) as { user_id?: string; error?: { message?: string } };
    if (!response.ok || !payload.user_id) {
      const reason = payload.error?.message ?? `HTTP ${response.status}`;
      await channelAccount.update({
        where: { id: input.channelAccountId },
        data: { status: ChannelAccountStatus.REAUTH_REQUIRED, lastErrorCode: 'VERIFY_FAILED', lastError: reason },
      });
      return { ok: false, reason };
    }

    const subscription = await ensureAndConfirmWebhookSubscription({
      channelAccountId: input.channelAccountId,
      instagramAccountId: payload.user_id,
      accessToken: input.accessToken,
      fetchImpl: input.fetchImpl,
      prismaChannelAccount: input.prismaChannelAccount,
    });
    if (!subscription.ok) return subscription;

    await channelAccount.update({
      where: { id: input.channelAccountId },
      data: { lastVerifiedAt: new Date(), status: ChannelAccountStatus.CONNECTED, lastErrorCode: null, lastError: null },
    });
    return { ok: true };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'error de red';
    return { ok: false, reason };
  }
}
