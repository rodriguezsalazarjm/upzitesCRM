import { NextResponse } from 'next/server';
import { z } from 'zod';
import { parseBody } from '@/lib/http';
import { readSessionCookie } from '@/lib/session';
import { elevateSupportSession } from '@/lib/workspace-switch';

const elevateSchema = z.object({ reason: z.string().trim().min(5).max(500) });

/** Eleva la sesion de soporte en curso a READ_WRITE. Exige motivo y queda auditado. */
export async function POST(request: Request) {
  const session = await readSessionCookie();
  if (!session?.supportSessionId) return NextResponse.json({ message: 'No hay sesion de soporte activa.' }, { status: 404 });

  const parsed = await parseBody(request, elevateSchema);
  if (!parsed.ok) return parsed.response;

  const result = await elevateSupportSession({
    actorUserId: session.userId,
    supportSessionId: session.supportSessionId,
    reason: parsed.data.reason,
  });
  if (!result.ok) return NextResponse.json({ code: result.error, message: 'No hay sesion de soporte vigente.' }, { status: 404 });
  return NextResponse.json({ data: { mode: 'READ_WRITE' } });
}
