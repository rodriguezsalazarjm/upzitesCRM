import { NextResponse } from 'next/server';
import { z } from 'zod';
import { generateResetToken, hashResetToken } from '@/lib/auth';
import { parseBody } from '@/lib/http';
import { enforce } from '@/lib/ops/rate-limit';
import { prisma } from '@/lib/prisma';

const requestResetSchema = z.object({
  email: z.string().email(),
});

export async function POST(request: Request) {
  // Fase 10: Reseteo de contrasena: frena el envio masivo de correos de recuperacion.
  const limited = await enforce('passwordReset', request);
  if (limited) return limited;

  const parsed = await parseBody(request, requestResetSchema);
  if (!parsed.ok) return parsed.response;
  const input = parsed.data;
  const user = await prisma.user.findFirst({
    where: { email: input.email.toLowerCase() },
  });

  if (!user) {
    return NextResponse.json({ ok: true });
  }

  const token = generateResetToken();
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: hashResetToken(token),
      expiresAt: new Date(Date.now() + 1000 * 60 * 30),
    },
  });

  return NextResponse.json({
    ok: true,
    devToken: process.env.NODE_ENV === 'production' ? undefined : token,
  });
}

