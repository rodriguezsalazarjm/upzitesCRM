import { PlatformEmailKind } from '../../../generated/prisma/enums';
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
 * P25: cada intento ante el proveedor queda en PlatformEmailMessage (sin cuerpo:
 * lleva tokens) para que el webhook registre entrega, rebote o queja.
 *
 * Config: RESEND_API_KEY + PLATFORM_EMAIL_FROM ("Upzites <no-reply@...>").
 */

export type PlatformEmail = { kind: PlatformEmailKind; to: string; subject: string; html: string; text: string; idempotencyKey?: string };
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
  const { kind, ...content } = email;
  const result = await send({ from, fromName, ...content, idempotencyKey: email.idempotencyKey ?? null });
  await recordPlatformEmail(kind, email, result);
  return result.ok ? { sent: true, providerMessageId: result.providerMessageId } : { sent: false, reason: 'PROVIDER_ERROR', error: result.error };
}

async function recordPlatformEmail(kind: PlatformEmailKind, email: PlatformEmail, result: SendEmailResult) {
  // Import diferido: el modulo sigue usable en tests unitarios sin base de datos.
  const { prisma } = await import('../prisma');
  const base = { kind, toEmail: email.to.toLowerCase(), subject: email.subject.slice(0, 300) };
  // El registro nunca debe tumbar un envio que ya salio: solo se pierde el seguimiento.
  await (result.ok
    // upsert: la misma Idempotency-Key en Resend devuelve el mismo id.
    ? prisma.platformEmailMessage.upsert({ where: { providerMessageId: result.providerMessageId }, create: { ...base, providerMessageId: result.providerMessageId }, update: {} })
    : prisma.platformEmailMessage.create({ data: { ...base, status: 'FAILED', failedAt: new Date(), lastError: result.error.slice(0, 500) } })
  ).catch((error) => console.error('platform_email_record_failed', { kind, error: error instanceof Error ? error.message : String(error) }));
}

/** Lo que falta para que el email de plataforma y del tenant salga por Resend. Sin valores, solo presencia. */
export function emailReadiness(env: Record<string, string | undefined> = process.env) {
  const from = env.PLATFORM_EMAIL_FROM?.trim() ?? '';
  return [
    { key: 'RESEND_API_KEY', ok: Boolean(env.RESEND_API_KEY?.trim()), help: 'API key de Resend (resend.com → API Keys).' },
    { key: 'PLATFORM_EMAIL_FROM', ok: /@[^@\s>]+\.[^@\s>]+>?$/.test(from), help: 'Remitente de plataforma, p. ej. "Upzites <no-reply@mail.upzites.com>", en un dominio verificado en Resend.' },
    { key: 'EMAIL_PROVIDER', ok: (env.EMAIL_PROVIDER ?? '').trim().toUpperCase() === 'RESEND', help: 'Debe ser RESEND para que el email de los negocios (entregas, recibos) use Resend.' },
    { key: 'EMAIL_WEBHOOK_SECRET', ok: /^whsec_/.test(env.EMAIL_WEBHOOK_SECRET?.trim() ?? ''), help: 'Signing secret del webhook de Resend (empieza con whsec_).' },
  ];
}
