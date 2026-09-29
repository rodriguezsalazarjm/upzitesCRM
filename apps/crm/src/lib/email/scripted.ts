import { createHmac, timingSafeEqual } from 'node:crypto';
import { EmailEventType, EmailProviderKind } from '../../../generated/prisma/client';
import { isLocalDemo } from '../testing/local-mode';
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
 * Proveedor determinista.
 *
 * Cumple dos funciones:
 *
 *  1. Es el proveedor de las pruebas de aceptacion (dev/test y demo local).
 *     Como el mismo mensaje produce siempre el mismo id, se puede afirmar que
 *     un email salio sin depender de la red ni de la cuota de nadie.
 *  2. En PRODUCCION es lo que queda cuando no hay proveedor real, y ahi NO
 *     finge: `send` falla con PROVIDER_UNAVAILABLE (reintentable), el dominio
 *     no se verifica y ningun webhook se acepta. Un email "SENT" que nunca
 *     salio es peor que uno FAILED: el negocio cree que el cliente recibio su
 *     acceso y nadie lo reenvia.
 *
 * Mismo enfoque que el proveedor guionado de agentes de la Fase 4.
 */

/**
 * Si el proveedor guionado puede "enviar". Se evalua en cada llamada (no al
 * crear el proveedor): solo fuera de produccion o en la demo local con su
 * guardia de red instalada.
 */
export function scriptedEmailAllowed(env: Record<string, string | undefined> = process.env) {
  return env.NODE_ENV !== 'production' || isLocalDemo();
}

export type ScriptedSend = SendEmailInput & { providerMessageId: string; at: Date };

const outbox: ScriptedSend[] = [];

/** Todo lo "enviado" en este proceso. Las pruebas leen de aca. */
export function scriptedOutbox() {
  return [...outbox];
}

export function clearScriptedOutbox() {
  outbox.length = 0;
}

/** Un id estable a partir del destinatario y el asunto: nada de aleatorio. */
function messageIdFor(input: SendEmailInput) {
  const seed = `${input.to}|${input.subject}|${input.idempotencyKey ?? ''}`;
  return `scripted-${createHmac('sha256', 'scripted-email').update(seed).digest('hex').slice(0, 24)}`;
}

/** Direccion reservada para probar el camino de fallo sin tocar la red. */
const FAILURE_ADDRESS = /@fallo\.test$/i;

export function createScriptedProvider(): EmailProvider {
  return {
    kind: EmailProviderKind.SCRIPTED,
    get configured() {
      return scriptedEmailAllowed();
    },

    async send(input: SendEmailInput): Promise<SendEmailResult> {
      if (!scriptedEmailAllowed()) {
        // Reintentable: en cuanto se configure el proveedor real, el reintento
        // del journey/worker sale de verdad.
        console.error('email_provider_unavailable', { to: input.to, idempotencyKey: input.idempotencyKey ?? null });
        return { ok: false, error: PROVIDER_UNAVAILABLE, retryable: true };
      }

      if (FAILURE_ADDRESS.test(input.to)) {
        return { ok: false, error: 'destinatario de prueba con fallo forzado', retryable: false };
      }

      const providerMessageId = messageIdFor(input);
      outbox.push({ ...input, providerMessageId, at: new Date() });
      return { ok: true, providerMessageId };
    },

    async verifyDomain(domain: string): Promise<DomainVerification> {
      if (!scriptedEmailAllowed()) return { status: 'FAILED', error: PROVIDER_UNAVAILABLE };
      return {
        status: 'VERIFIED',
        providerDomainId: `scripted-${domain}`,
        dnsRecords: [
          { type: 'TXT', name: `_crm.${domain}`, value: 'crm-verificacion=scripted' },
        ],
      };
    },

    /**
     * HMAC-SHA256 sobre el cuerpo crudo, igual que Meta. Sin secreto no se
     * acepta nada: un webhook sin firma verificable es una puerta abierta.
     */
    verifySignature(rawBody: string, headers: Headers): SignatureCheck {
      if (!scriptedEmailAllowed()) return { valid: false, reason: PROVIDER_UNAVAILABLE };
      const secret = process.env.EMAIL_WEBHOOK_SECRET;
      if (!secret) return { valid: false, reason: 'EMAIL_WEBHOOK_SECRET no configurado' };

      const received = headers.get('x-email-signature');
      if (!received) return { valid: false, reason: 'falta el header x-email-signature' };

      const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
      const a = Buffer.from(received, 'utf8');
      const b = Buffer.from(expected, 'utf8');

      if (a.length !== b.length) return { valid: false, reason: 'firma invalida' };
      return timingSafeEqual(a, b) ? { valid: true } : { valid: false, reason: 'firma invalida' };
    },

    parseEvents(rawBody: string): NormalizedEmailEvent[] {
      let parsed: unknown;
      try {
        parsed = JSON.parse(rawBody);
      } catch {
        return [];
      }

      const items = Array.isArray(parsed) ? parsed : [parsed];

      return items.flatMap((item): NormalizedEmailEvent[] => {
        const raw = item as Record<string, unknown>;
        const type = String(raw.type ?? '').toUpperCase();
        if (!(type in EmailEventType)) return [];

        const providerMessageId = raw.messageId ? String(raw.messageId) : null;
        const occurredAt = raw.occurredAt ? new Date(String(raw.occurredAt)) : new Date();

        return [
          {
            type: type as EmailEventType,
            providerMessageId,
            recipient: raw.recipient ? String(raw.recipient) : null,
            dedupeKey: String(raw.id ?? `${type}:${providerMessageId}:${occurredAt.toISOString()}`),
            occurredAt,
            permanent: raw.permanent === true,
            payload: raw,
          },
        ];
      });
    },
  };
}

/** Firma un cuerpo como lo haria el proveedor. Solo la usan las pruebas. */
export function signScriptedPayload(rawBody: string, secret: string) {
  return createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
}
