const DEFAULT_GRAPH_VERSION = 'v26.0';
const GRAPH_ORIGIN = 'https://graph.facebook.com';

export function whatsappGraphVersion() {
  return process.env.WHATSAPP_GRAPH_API_VERSION ?? DEFAULT_GRAPH_VERSION;
}

function graphUrl(path: string) {
  return `${GRAPH_ORIGIN}/${whatsappGraphVersion()}/${path}`;
}

type MetaErrorBody = {
  error?: {
    code?: number;
    error_subcode?: number;
  };
};

export class MetaWhatsAppError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'INVALID_CREDENTIALS'
      | 'PHONE_NOT_IN_WABA'
      | 'SUBSCRIPTION_FAILED'
      | 'META_UNAVAILABLE',
    readonly httpStatus: number,
  ) {
    super(message);
    this.name = 'MetaWhatsAppError';
  }
}

async function metaRequest(
  url: string,
  token: string,
  init?: RequestInit,
  failureCode: MetaWhatsAppError['code'] = 'META_UNAVAILABLE',
) {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        ...init?.headers,
      },
      cache: 'no-store',
    });
  } catch {
    throw new MetaWhatsAppError(
      'No se pudo contactar a Meta. Intenta verificar nuevamente en unos minutos.',
      'META_UNAVAILABLE',
      502,
    );
  }

  const body = (await response.json().catch(() => ({}))) as MetaErrorBody & Record<string, unknown>;
  if (response.ok) return body;

  const providerCode = body.error?.code;
  if (response.status === 401 || response.status === 403 || providerCode === 190) {
    throw new MetaWhatsAppError(
      'El token de Meta es invalido, vencio o no tiene permisos para administrar esta cuenta de WhatsApp.',
      'INVALID_CREDENTIALS',
      400,
    );
  }

  throw new MetaWhatsAppError(
    failureCode === 'SUBSCRIPTION_FAILED'
      ? 'Meta valido el numero, pero no permitio suscribir la app a la WABA.'
      : 'Meta no pudo verificar la cuenta de WhatsApp en este momento.',
    failureCode,
    response.status >= 500 ? 502 : 400,
  );
}

type MetaPhoneNumber = {
  id?: string;
  display_phone_number?: string;
  verified_name?: string;
  quality_rating?: string;
};

export type VerifiedWhatsAppChannel = {
  phoneNumberId: string;
  displayPhoneNumber: string;
  verifiedName: string | null;
  qualityRating: string | null;
  verifiedAt: Date;
  subscribedAt: Date;
};

/**
 * Demuestra que el token puede leer la WABA, que el numero pertenece a ella y
 * que la app asociada al token quedo suscrita a sus webhooks.
 */
export async function verifyAndSubscribeWhatsAppChannel(input: {
  wabaId: string;
  phoneNumberId: string;
  accessToken: string;
}): Promise<VerifiedWhatsAppChannel> {
  const fields = 'id,display_phone_number,verified_name,quality_rating';
  const query = new URLSearchParams({ fields, limit: '100' });
  const body = await metaRequest(
    `${graphUrl(`${encodeURIComponent(input.wabaId)}/phone_numbers`)}?${query}`,
    input.accessToken,
  );
  const phoneNumbers = Array.isArray(body.data) ? (body.data as MetaPhoneNumber[]) : [];
  const phone = phoneNumbers.find((candidate) => String(candidate.id) === input.phoneNumberId);

  if (!phone?.id || !phone.display_phone_number) {
    throw new MetaWhatsAppError(
      'El Phone Number ID no pertenece a la WABA indicada o el token no puede verlo.',
      'PHONE_NOT_IN_WABA',
      400,
    );
  }

  const verifiedAt = new Date();
  const subscription = await metaRequest(
    graphUrl(`${encodeURIComponent(input.wabaId)}/subscribed_apps`),
    input.accessToken,
    { method: 'POST' },
    'SUBSCRIPTION_FAILED',
  );

  if (subscription.success !== true && subscription.success !== 'true') {
    throw new MetaWhatsAppError(
      'Meta no confirmo la suscripcion de la app a la WABA.',
      'SUBSCRIPTION_FAILED',
      400,
    );
  }

  return {
    phoneNumberId: String(phone.id),
    displayPhoneNumber: phone.display_phone_number,
    verifiedName: phone.verified_name ?? null,
    qualityRating: phone.quality_rating ?? null,
    verifiedAt,
    subscribedAt: new Date(),
  };
}
