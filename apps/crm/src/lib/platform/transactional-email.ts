import { createResendProvider } from '../email/resend';
import type { SendEmailInput, SendEmailResult } from '../email/provider';

/**
 * Email TRANSACCIONAL DE PLATAFORMA (P0-D): invitaciones, recuperacion de
 * contrasena y avisos de seguridad de cuenta.
 *
 * Es un canal distinto del email del tenant (campanas, journeys, avisos de
 * pedido): sale con el remitente de Upzites, NO pasa por `sendEmail` del
 * workspace y NO consume `emails.monthly` ni ningun contador de uso. Sin
 * proveedor configurado la operacion sigue siendo valida: quien la inicio
 * copia el enlace desde la interfaz.
 *
 * Config: RESEND_API_KEY + PLATFORM_EMAIL_FROM ("Upzites <no-reply@...>").
 */

export type PlatformEmail = { to: string; subject: string; html: string; text: string; idempotencyKey?: string };
export type PlatformEmailSender = (input: SendEmailInput) => Promise<SendEmailResult>;
export type PlatformEmailOutcome = { sent: true; providerMessageId: string } | { sent: false; reason: 'NOT_CONFIGURED' | 'PROVIDER_ERROR'; error?: string };

export function platformEmailConfigured() {
  return Boolean(process.env.RESEND_API_KEY?.trim() && process.env.PLATFORM_EMAIL_FROM?.trim());
}

function parseFrom(raw: string) {
  const match = raw.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  return match ? { fromName: match[1] || null, from: match[2] } : { fromName: 'Upzites', from: raw.trim() };
}

/** `sender` solo para tests: en produccion es el adaptador de Resend. */
export async function sendPlatformEmail(email: PlatformEmail, sender?: PlatformEmailSender): Promise<PlatformEmailOutcome> {
  if (!sender && !platformEmailConfigured()) return { sent: false, reason: 'NOT_CONFIGURED' };
  const send = sender ?? ((input: SendEmailInput) => createResendProvider().send(input));
  const { from, fromName } = parseFrom(process.env.PLATFORM_EMAIL_FROM ?? 'Upzites <no-reply@upzites.local>');
  const result = await send({ from, fromName, ...email, idempotencyKey: email.idempotencyKey ?? null });
  return result.ok ? { sent: true, providerMessageId: result.providerMessageId } : { sent: false, reason: 'PROVIDER_ERROR', error: result.error };
}
