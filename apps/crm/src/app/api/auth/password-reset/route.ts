import { createHash } from 'node:crypto';
import { after, NextResponse } from 'next/server';
import { z } from 'zod';
import { parseBody } from '@/lib/http';
import { normalizeEmail } from '@/lib/identity';
import { consume, enforce } from '@/lib/ops/rate-limit';
import { PASSWORD_RESET_PUBLIC_RESPONSE, requestPasswordReset } from '@/lib/password-reset';

const requestResetSchema = z.object({
  email: z.string().trim().email(),
});

/**
 * Solicitud de recuperacion. Misma respuesta exista o no la cuenta.
 *
 * El email sale con `after()` de Next: se ejecuta despues de enviar la
 * respuesta (su latencia no delata si la cuenta existe) y, en Vercel, la
 * plataforma mantiene viva la invocacion (waitUntil) hasta que termina. Sin
 * fallback a una promesa suelta: fuera de un request de Next, `after` lanza.
 */
export async function POST(request: Request) {
  // Fase 10: Reseteo de contrasena: frena el envio masivo de correos de recuperacion.
  const limited = await enforce('passwordReset', request);
  if (limited) return limited;

  const parsed = await parseBody(request, requestResetSchema);
  if (!parsed.ok) return parsed.response;
  const email = normalizeEmail(parsed.data.email);

  // Cupo por destinatario (exista o no): al superarlo se responde igual.
  const perEmail = await consume('passwordResetEmail', createHash('sha256').update(email).digest('hex'));
  if (!perEmail.allowed) return NextResponse.json(PASSWORD_RESET_PUBLIC_RESPONSE);

  return NextResponse.json(await requestPasswordReset(email, { schedule: after }));
}
