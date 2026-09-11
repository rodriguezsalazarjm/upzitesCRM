import { EmailEventType, EmailProviderKind } from '../../../generated/prisma/client';

/**
 * Interfaz del proveedor de email.
 *
 * Existe para que cambiar de proveedor sea cambiar un adaptador y no reescribir
 * campanas y journeys. La spec pide justamente eso: "crear interfaz
 * EmailProvider" y usar Resend como primera implementacion.
 *
 * Todo lo que el resto del CRM necesita saber de un proveedor esta aca: mandar,
 * verificar un dominio, validar la firma de su webhook y traducir sus eventos a
 * los del CRM. Nada de lo de afuera conoce el formato de nadie.
 */

export type SendEmailInput = {
  from: string;
  fromName?: string | null;
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Encabezado de baja con un clic. Obligatorio en todo envio promocional. */
  listUnsubscribeUrl?: string | null;
  /** Idempotencia del lado del proveedor cuando lo soporta. */
  idempotencyKey?: string | null;
};

export type SendEmailResult =
  | { ok: true; providerMessageId: string }
  | { ok: false; error: string; retryable: boolean };

export type DomainVerification = {
  status: 'PENDING' | 'VERIFIED' | 'FAILED';
  providerDomainId?: string | null;
  /** Registros que el cliente debe publicar en su DNS. */
  dnsRecords?: { type: string; name: string; value: string; priority?: number }[];
  error?: string;
};

/** Evento del proveedor ya traducido al vocabulario del CRM. */
export type NormalizedEmailEvent = {
  type: EmailEventType;
  providerMessageId: string | null;
  recipient: string | null;
  /** Clave estable del hecho. Es lo que hace idempotente el webhook. */
  dedupeKey: string;
  occurredAt: Date;
  /** Un rebote duro suprime la direccion; uno blando, no. */
  permanent?: boolean;
  payload?: unknown;
};

export type SignatureCheck = { valid: true } | { valid: false; reason: string };

export type EmailProvider = {
  kind: EmailProviderKind;
  /** false cuando falta configuracion: la integracion queda inactiva, no rota. */
  configured: boolean;
  send(input: SendEmailInput): Promise<SendEmailResult>;
  verifyDomain(domain: string): Promise<DomainVerification>;
  verifySignature(rawBody: string, headers: Headers): SignatureCheck;
  parseEvents(rawBody: string): NormalizedEmailEvent[];
};
