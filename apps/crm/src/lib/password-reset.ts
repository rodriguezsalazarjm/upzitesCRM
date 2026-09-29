import { generateResetToken, hashResetToken } from './auth';
import { findUserByEmail } from './identity';
import { hashPassword } from './password';
import { prisma } from './prisma';
import { revokeAllSessions } from './session-revocation';
import { sendPlatformEmail, type PlatformEmailOutcome, type PlatformEmailSender } from './platform/transactional-email';

/**
 * Recuperacion de contrasena (P0-D). Es IDENTIDAD GLOBAL: no depende de ningun
 * workspace, no pasa por el email del tenant y no consume `emails.monthly`.
 *
 *  - Solicitud: respuesta identica exista o no el email (sin enumeracion). Si
 *    existe se emite un token de 32 bytes aleatorios; en la base SOLO su HMAC.
 *    Un token nuevo invalida los pendientes anteriores de la misma cuenta.
 *  - TTL de 60 minutos, un solo uso.
 *  - Confirmacion: la fila del token se bloquea (FOR UPDATE), se cambia el
 *    passwordHash, se sube `sessionVersion` (todas las sesiones abiertas dejan
 *    de valer), se consume el token y se invalidan TODOS los pendientes del
 *    usuario, en la misma transaccion. No inicia sesion.
 *  - Envio: despues de responder, con el `schedule` que da la ruta (`after()`
 *    de Next: en Vercel extiende la invocacion con waitUntil hasta que el envio
 *    termina; nunca una promesa suelta). Los reintentos reusan el MISMO token
 *    e idempotencyKey: no se emiten tokens nuevos.
 *  - `usedAt` marca tanto "usado" como "invalidado": en ambos casos el enlace
 *    ya no sirve.
 */

export const PASSWORD_RESET_TTL_MINUTES = 60;
export const MIN_PASSWORD_LENGTH = 8;

export type PasswordResetErrorCode = 'INVALID_TOKEN' | 'EXPIRED' | 'USED' | 'INVALID_INPUT';

export class PasswordResetError extends Error {
  constructor(
    readonly code: PasswordResetErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'PasswordResetError';
  }
}

export function passwordResetUrl(token: string) {
  const base = (process.env.NEXT_PUBLIC_CRM_BASE_URL ?? 'http://localhost:3001').replace(/\/+$/, '');
  return `${base}/reset-password/${token}`;
}

export type IssuedPasswordReset = { userId: string; email: string; name: string; token: string; url: string; expiresAt: Date };

/**
 * Emite un token si el email tiene cuenta; `null` si no. Quien llama NUNCA
 * debe exponer la diferencia: la ruta responde lo mismo en ambos casos.
 */
export async function issuePasswordReset(rawEmail: string, now = new Date()): Promise<IssuedPasswordReset | null> {
  const user = await findUserByEmail(rawEmail, { id: true, email: true, name: true });
  if (!user) return null;

  const token = generateResetToken();
  const expiresAt = new Date(now.getTime() + PASSWORD_RESET_TTL_MINUTES * 60_000);
  await prisma.$transaction([
    prisma.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: now } }),
    prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash: hashResetToken(token), expiresAt } }),
  ]);
  return { userId: user.id, email: user.email, name: user.name, token, url: passwordResetUrl(token), expiresAt };
}

/** Respuesta publica unica de la solicitud: identica exista o no la cuenta. */
export const PASSWORD_RESET_PUBLIC_RESPONSE = Object.freeze({
  ok: true,
  message: 'Si el email tiene una cuenta, te enviamos un enlace para restablecer la contraseña.',
});

/** Programa trabajo para DESPUES de la respuesta. En la ruta es `after` de Next. */
export type ScheduleAfterResponse = (task: () => Promise<unknown>) => void;

/**
 * Solicitud completa: emite el token (si hay cuenta) y programa el envio.
 * Devuelve SIEMPRE la misma respuesta publica; el envio no puede cambiarla
 * porque corre despues de responder y nunca lanza.
 */
export async function requestPasswordReset(
  rawEmail: string,
  options: { schedule: ScheduleAfterResponse; sender?: PlatformEmailSender; now?: Date },
) {
  const issued = await issuePasswordReset(rawEmail, options.now);
  if (issued) options.schedule(() => deliverPasswordResetEmail(issued, { sender: options.sender }));
  return PASSWORD_RESET_PUBLIC_RESPONSE;
}

export const PASSWORD_RESET_EMAIL_ATTEMPTS = 3;

/**
 * Envia el enlace ya emitido. Reintenta fallos del proveedor con el mismo
 * token e idempotencyKey (sin tokens nuevos). Nunca lanza: corre despues de la
 * respuesta y no tiene a quien avisar mas que al log.
 */
export async function deliverPasswordResetEmail(
  issued: IssuedPasswordReset,
  options: { sender?: PlatformEmailSender; attempts?: number } = {},
): Promise<PlatformEmailOutcome> {
  const attempts = options.attempts ?? PASSWORD_RESET_EMAIL_ATTEMPTS;
  let outcome: PlatformEmailOutcome = { sent: false, reason: 'PROVIDER_ERROR' };
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      outcome = await sendPasswordResetEmail(issued, options.sender);
    } catch (error) {
      outcome = { sent: false, reason: 'PROVIDER_ERROR', error: error instanceof Error ? error.message : String(error) };
    }
    if (outcome.sent || outcome.reason === 'NOT_CONFIGURED') break;
  }
  if (outcome.sent) return outcome;
  if (outcome.reason === 'NOT_CONFIGURED' && canRevealResetLinkForQa()) {
    // QA local sin proveedor: el enlace SOLO al log del servidor, nunca en produccion.
    console.info(`[password-reset:qa] ${issued.email} → ${issued.url}`);
  } else {
    console.error('password_reset_email_failed', { userId: issued.userId, reason: outcome.reason, error: outcome.error });
  }
  return outcome;
}

/** Por el email de PLATAFORMA (remitente Upzites), nunca por el del tenant. */
export function sendPasswordResetEmail(issued: IssuedPasswordReset, sender?: PlatformEmailSender): Promise<PlatformEmailOutcome> {
  return sendPlatformEmail(
    {
      to: issued.email,
      subject: 'Restablece tu contraseña de Upzites Flow',
      text: `Hola ${issued.name}:\n\nPediste restablecer tu contraseña. Usa este enlace (vence en ${PASSWORD_RESET_TTL_MINUTES} minutos y sirve una sola vez):\n${issued.url}\n\nSi no fuiste tú, ignora este correo: tu contraseña no cambia.\n`,
      html: `<p>Hola ${escapeHtml(issued.name)}:</p><p>Pediste restablecer tu contraseña.</p><p><a href="${escapeHtml(issued.url)}">Elegir una contraseña nueva</a> (vence en ${PASSWORD_RESET_TTL_MINUTES} minutos y sirve una sola vez).</p><p>Si no fuiste tú, ignora este correo: tu contraseña no cambia.</p>`,
      idempotencyKey: `password-reset:${hashResetToken(issued.token).slice(0, 24)}`,
    },
    sender,
  );
}

/**
 * Mecanismo de QA sin proveedor de email: el enlace va SOLO al log del
 * servidor y solo fuera de produccion. Nunca viaja en la respuesta HTTP (eso
 * permitiria enumerar cuentas y, en produccion, tomar cualquiera).
 */
export function canRevealResetLinkForQa(env: Record<string, string | undefined> = process.env) {
  return env.NODE_ENV !== 'production' && env.VERCEL_ENV !== 'production';
}

export type PasswordResetTokenState = 'VALID' | 'INVALID' | 'EXPIRED' | 'USED';

/** Para la pagina: no revela a que cuenta pertenece el token. */
export async function inspectPasswordResetToken(token: string, now = new Date()): Promise<PasswordResetTokenState> {
  if (!token) return 'INVALID';
  const row = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashResetToken(token) }, select: { expiresAt: true, usedAt: true } });
  return tokenState(row, now);
}

function tokenState(row: { expiresAt: Date; usedAt: Date | null } | null, now: Date): PasswordResetTokenState {
  if (!row) return 'INVALID';
  if (row.usedAt) return 'USED';
  if (row.expiresAt <= now) return 'EXPIRED';
  return 'VALID';
}

function stateError(state: Exclude<PasswordResetTokenState, 'VALID'>) {
  if (state === 'EXPIRED') return new PasswordResetError('EXPIRED', 'El enlace venció. Pide uno nuevo.');
  if (state === 'USED') return new PasswordResetError('USED', 'Este enlace ya se usó o fue reemplazado por uno más reciente.');
  return new PasswordResetError('INVALID_TOKEN', 'El enlace no es válido. Pide uno nuevo.');
}

export function validateNewPassword(password: string, confirmPassword: string) {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new PasswordResetError('INVALID_INPUT', `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`);
  }
  if (password !== confirmPassword) throw new PasswordResetError('INVALID_INPUT', 'Las contraseñas no coinciden.');
}

/** Cambia la contrasena y consume el token. Lanza PasswordResetError. */
export async function confirmPasswordReset(input: { token: string; password: string; confirmPassword: string; now?: Date }) {
  const now = input.now ?? new Date();
  validateNewPassword(input.password, input.confirmPassword);
  const tokenHash = hashResetToken(input.token);
  // El hash se calcula fuera de la transaccion: pbkdf2 es lento a proposito.
  const passwordHash = hashPassword(input.password);

  return prisma.$transaction(async (tx) => {
    const [locked] = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM password_reset_tokens WHERE token_hash = ${tokenHash} FOR UPDATE`;
    const row = locked
      ? await tx.passwordResetToken.findUniqueOrThrow({ where: { id: locked.id }, select: { id: true, userId: true, expiresAt: true, usedAt: true } })
      : null;
    const state = tokenState(row, now);
    if (state !== 'VALID') throw stateError(state);

    await tx.user.update({ where: { id: row!.userId }, data: { passwordHash } });
    // Misma transaccion: toda cookie emitida antes del cambio deja de valer.
    const sessionVersion = await revokeAllSessions(row!.userId, tx);
    await tx.passwordResetToken.update({ where: { id: row!.id }, data: { usedAt: now } });
    await tx.passwordResetToken.updateMany({ where: { userId: row!.userId, usedAt: null }, data: { usedAt: now } });
    await tx.platformAuditLog.create({
      data: { actorUserId: row!.userId, targetUserId: row!.userId, action: 'account.password_reset', metadata: { sessionVersion } },
    });
    return { userId: row!.userId, sessionVersion };
  });
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
