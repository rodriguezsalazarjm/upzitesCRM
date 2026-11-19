import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireCurrentUser } from '@/lib/auth';
import { resolvePaymentIncident } from '@/lib/commerce/payment-incidents';
import { canManageChannels } from '@/lib/conversations';
import { parseBody } from '@/lib/http';

const schema = z.object({
  status: z.enum(['RESOLVED', 'DISMISSED']),
  note: z.string().trim().min(3, 'Escribe qué se hizo (mínimo 3 caracteres).').max(2000),
}).strict();

/** P31: un operador (OWNER/ADMIN) cierra una incidencia de pago con una nota. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireCurrentUser();
  if (!canManageChannels(user.role)) {
    return NextResponse.json({ message: 'Solo el owner o un admin puede resolver incidencias de pago.' }, { status: 403 });
  }
  const parsed = await parseBody(request, schema);
  if (!parsed.ok) return parsed.response;

  const result = await resolvePaymentIncident({ workspaceId: user.workspace.id, id, actorId: user.id, ...parsed.data });
  if (!result) return NextResponse.json({ message: 'La incidencia no existe o ya estaba cerrada.' }, { status: 404 });
  return NextResponse.json({ data: result });
}
