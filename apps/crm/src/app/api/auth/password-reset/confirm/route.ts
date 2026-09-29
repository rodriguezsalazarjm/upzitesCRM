import { NextResponse } from 'next/server';
import { z } from 'zod';
import { parseBody } from '@/lib/http';
import { enforce } from '@/lib/ops/rate-limit';
import { confirmPasswordReset, PasswordResetError } from '@/lib/password-reset';

const confirmSchema = z.object({
  token: z.string().min(1).max(200),
  password: z.string().max(200),
  confirmPassword: z.string().max(200),
});

/** Cambia la contrasena con un token vigente. No inicia sesion: se entra por /login. */
export async function POST(request: Request) {
  const limited = await enforce('passwordResetConfirm', request);
  if (limited) return limited;

  const parsed = await parseBody(request, confirmSchema);
  if (!parsed.ok) return parsed.response;

  try {
    await confirmPasswordReset(parsed.data);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof PasswordResetError) {
      return NextResponse.json({ message: error.message, code: error.code }, { status: error.code === 'INVALID_INPUT' ? 400 : 410 });
    }
    throw error;
  }
}
