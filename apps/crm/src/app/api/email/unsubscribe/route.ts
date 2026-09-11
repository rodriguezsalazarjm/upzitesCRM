import { NextResponse } from 'next/server';
import { z } from 'zod';
import { parseBody } from '@/lib/http';
import { applyUnsubscribe, resolveUnsubscribeToken } from '@/lib/email/unsubscribe';

export const dynamic = 'force-dynamic';

const schema = z.object({ token: z.string().min(16) });

/**
 * Baja publica. No lleva sesion: quien se da de baja normalmente no tiene
 * cuenta en el CRM.
 *
 * La respuesta es la misma exista o no el token. Decir "ese token no existe"
 * convertiria este endpoint en una forma de averiguar a quien se le escribio.
 */
export async function POST(request: Request) {
  const parsed = await parseBody(request, schema);
  if (!parsed.ok) return parsed.response;

  const result = await applyUnsubscribe({ token: parsed.data.token, source: 'formulario de baja' });

  return NextResponse.json({
    data: { ok: true, alreadyUnsubscribed: result?.alreadyUnsubscribed ?? false },
  });
}

/**
 * Consulta previa para la pagina de baja: dice si el enlace sigue vigente sin
 * dar de baja a nadie. Un cliente de correo que prefetchea el GET no debe
 * ejecutar la baja por su cuenta.
 */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token') ?? '';
  const target = await resolveUnsubscribeToken(token);

  if (!target) return NextResponse.json({ data: { valid: false } });

  return NextResponse.json({
    data: { valid: true, alreadyUnsubscribed: target.alreadyUnsubscribed },
  });
}
