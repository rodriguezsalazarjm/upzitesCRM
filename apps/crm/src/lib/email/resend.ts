import { createHmac, timingSafeEqual } from 'node:crypto';
import { EmailEventType, EmailProviderKind } from '../../../generated/prisma/client';
import {
  PROVIDER_UNAVAILABLE,
  type DomainVerification,
  type EmailProvider,
  type NormalizedEmailEvent,
  type SendEmailInput,
  type SendEmailResult,
  type SignatureCheck,
} from './provider';

/**
 * Adaptador de Resend.
 *
 * Se habla HTTP directo en lugar de sumar el SDK: son tres endpoints y el SDK
 * arrastraria dependencias para algo que cabe en este archivo. El mismo criterio
 * que se uso con Shopify en la Fase 6.
 *
 * Sin RESEND_API_KEY el adaptador queda `configured: false`: la integracion
 * aparece inactiva y el CRM sigue funcionando, que es lo que pide la spec.
 */

const API = 'https://api.resend.com';

type ResendError = { message?: string; name?: string };

async function call(path: string, apiKey: string, init: RequestInit = {}) {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });

  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return { response, body };
}

/** Errores por los que vale la pena reintentar: cuota y fallas del proveedor. */
function isRetryable(status: number) {
  return status === 429 || status >= 500;
}

/**
 * Verificacion de la firma del webhook.
 *
 * Resend usa Svix: se firma `id.timestamp.body` con HMAC-SHA256 y el secreto
 * llega en base64 tras el prefijo `whsec_`. El header puede traer varias firmas
 * separadas por espacio (rotacion de secreto), y basta que una calce.
 *
 * Se rechaza lo viejo: sin ventana de tiempo, una captura de un webhook valido
 * sirve para siempre.
 */
const TOLERANCE_SECONDS = 5 * 60;

export function verifySvixSignature(
  rawBody: string,
  headers: Headers,
  secret: string | undefined,
  now = new Date(),
): SignatureCheck {
  if (!secret) return { valid: false, reason: 'EMAIL_WEBHOOK_SECRET no configurado' };

  const id = headers.get('svix-id');
  const timestamp = headers.get('svix-timestamp');
  const signatureHeader = headers.get('svix-signature');

  if (!id || !timestamp || !signatureHeader) {
    return { valid: false, reason: 'faltan los headers svix-id, svix-timestamp o svix-signature' };
  }

  const sentAt = Number(timestamp);
  if (!Number.isFinite(sentAt)) return { valid: false, reason: 'svix-timestamp invalido' };

  if (Math.abs(Math.floor(now.getTime() / 1000) - sentAt) > TOLERANCE_SECONDS) {
    return { valid: false, reason: 'webhook fuera de la ventana de tiempo aceptada' };
  }

  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${rawBody}`).digest('base64');
  const expectedBuffer = Buffer.from(expected, 'utf8');

  // El header trae entradas "v1,<firma>" separadas por espacio.
  const candidates = signatureHeader
    .split(' ')
    .map((entry) => entry.split(',').slice(1).join(','))
    .filter(Boolean);

  const matches = candidates.some((candidate) => {
    const received = Buffer.from(candidate, 'utf8');
    return received.length === expectedBuffer.length && timingSafeEqual(received, expectedBuffer);
  });

  return matches ? { valid: true } : { valid: false, reason: 'firma invalida' };
}

/** Traduce el vocabulario de Resend al del CRM. */
const EVENT_MAP: Record<string, EmailEventType> = {
  'email.delivered': EmailEventType.DELIVERED,
  'email.opened': EmailEventType.OPENED,
  'email.clicked': EmailEventType.CLICKED,
  'email.bounced': EmailEventType.BOUNCED,
  'email.complained': EmailEventType.COMPLAINED,
  // delivery_delayed es transitorio (Resend reintenta): no se mapea, porque FAILED
  // pesa mas que DELIVERED y el mensaje quedaria fallido aunque luego llegue.
  'email.failed': EmailEventType.FAILED,
};

/** Estado de Resend: not_started | pending | temporary_failure → PENDING; failed → FAILED. */
export function domainResult(body: Record<string, unknown>): DomainVerification {
  const records = Array.isArray(body.records) ? body.records : [];
  return {
    status: body.status === 'verified' ? 'VERIFIED' : body.status === 'failed' ? 'FAILED' : 'PENDING',
    providerDomainId: typeof body.id === 'string' ? body.id : null,
    ...(body.status === 'failed' ? { error: 'Resend no encontró los registros DNS. Revísalos y vuelve a verificar.' } : {}),
    dnsRecords: records.map((record) => {
      const item = record as Record<string, unknown>;
      return {
        type: String(item.type ?? 'TXT'),
        name: String(item.name ?? ''),
        value: String(item.value ?? ''),
        ...(typeof item.priority === 'number' ? { priority: item.priority } : {}),
      };
    }),
  };
}

export function createResendProvider(apiKey = process.env.RESEND_API_KEY): EmailProvider {
  const configured = Boolean(apiKey?.trim());

  return {
    kind: EmailProviderKind.RESEND,
    configured,

    async send(input: SendEmailInput): Promise<SendEmailResult> {
      if (!apiKey) {
        // Igual que el guionado en produccion: falla reintentable, nunca SENT.
        console.error('email_provider_unavailable', { provider: 'RESEND', reason: 'RESEND_API_KEY no configurada' });
        return { ok: false, error: PROVIDER_UNAVAILABLE, retryable: true };
      }

      const headers: Record<string, string> = {};
      // Resend respeta esta cabecera: un reintento del worker no duplica el envio.
      if (input.idempotencyKey) headers['Idempotency-Key'] = input.idempotencyKey;

      const { response, body } = await call('/emails', apiKey, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          from: input.fromName ? `${input.fromName} <${input.from}>` : input.from,
          to: [input.to],
          subject: input.subject,
          html: input.html,
          text: input.text,
          ...(input.listUnsubscribeUrl
            ? {
                headers: {
                  'List-Unsubscribe': `<${input.listUnsubscribeUrl}>`,
                  'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
                },
              }
            : {}),
        }),
      });

      if (!response.ok) {
        const error = body as ResendError;
        return {
          ok: false,
          error: error.message ?? `Resend respondio ${response.status}`,
          retryable: isRetryable(response.status),
        };
      }

      const id = typeof body.id === 'string' ? body.id : null;
      if (!id) return { ok: false, error: 'Resend no devolvio un id de mensaje', retryable: true };

      return { ok: true, providerMessageId: id };
    },

    async verifyDomain(domain: string, providerDomainId?: string | null): Promise<DomainVerification> {
      if (!apiKey) return { status: 'FAILED', error: 'RESEND_API_KEY no configurada' };

      // Ya creado: se pide re-verificar y se lee el estado. Volver a crearlo
      // falla en Resend ("ya registrado") y dejaria el dominio en FAILED.
      let id = providerDomainId ?? null;
      if (!id) {
        const created = await call('/domains', apiKey, { method: 'POST', body: JSON.stringify({ name: domain }) });
        if (created.response.ok && typeof created.body.id === 'string') return domainResult(created.body);
        const list = await call('/domains', apiKey);
        const found = Array.isArray(list.body.data) ? (list.body.data as Record<string, unknown>[]).find((d) => d.name === domain) : undefined;
        if (!found || typeof found.id !== 'string') {
          const error = created.body as ResendError;
          return { status: 'FAILED', error: error.message ?? `Resend respondio ${created.response.status}` };
        }
        id = found.id;
      }
      await call(`/domains/${encodeURIComponent(id)}/verify`, apiKey, { method: 'POST' });
      const { response, body } = await call(`/domains/${encodeURIComponent(id)}`, apiKey);
      if (!response.ok) {
        const error = body as ResendError;
        return { status: 'FAILED', providerDomainId: id, error: error.message ?? `Resend respondio ${response.status}` };
      }
      return domainResult(body);
    },

    verifySignature(rawBody: string, headers: Headers): SignatureCheck {
      return verifySvixSignature(rawBody, headers, process.env.EMAIL_WEBHOOK_SECRET);
    },

    parseEvents(rawBody: string): NormalizedEmailEvent[] {
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(rawBody) as Record<string, unknown>;
      } catch {
        return [];
      }

      const type = EVENT_MAP[String(parsed.type ?? '')];
      if (!type) return [];

      const data = (parsed.data ?? {}) as Record<string, unknown>;
      const providerMessageId = typeof data.email_id === 'string' ? data.email_id : null;
      const to = Array.isArray(data.to) ? String(data.to[0]) : null;
      const occurredAt = parsed.created_at ? new Date(String(parsed.created_at)) : new Date();

      // Resend distingue rebote duro de blando en bounce.type.
      const bounce = (data.bounce ?? {}) as Record<string, unknown>;
      const permanent =
        type === EmailEventType.BOUNCED
          ? String(bounce.type ?? '').toLowerCase() !== 'transient'
          : type === EmailEventType.COMPLAINED;

      return [
        {
          type,
          providerMessageId,
          recipient: to,
          dedupeKey: `${parsed.type}:${providerMessageId}:${occurredAt.toISOString()}`,
          occurredAt,
          permanent,
          payload: parsed,
        },
      ];
    },
  };
}
