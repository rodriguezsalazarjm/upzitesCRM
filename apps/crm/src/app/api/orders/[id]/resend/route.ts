import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireCurrentUser } from '@/lib/auth';
import { canManageChannels } from '@/lib/conversations';
import { parseBody } from '@/lib/http';
import { prisma } from '@/lib/prisma';
import { defaultBaseUrl, resendDelivery } from '@/lib/commerce/delivery';

const resendSchema = z.object({ deliveryId: z.string().min(1).max(64) }).strict();

/**
 * Reenvia una entrega digital: mismo enlace, un intento nuevo por los canales
 * existentes. No crea otra entrega. Si no hay canal real, lo dice (no finge un
 * email enviado).
 *
 * Es una accion humana y acotada a owner/admin. El agente NO la tiene entre sus
 * herramientas: regenerar accesos es exactamente el tipo de cosa que no debe
 * poder hacer una IA a pedido del cliente.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireCurrentUser();

  if (!canManageChannels(user.role)) {
    return NextResponse.json({ message: 'Solo el owner o un admin puede reenviar accesos.' }, { status: 403 });
  }

  const parsed = await parseBody(request, resendSchema);
  if (!parsed.ok) return parsed.response;

  // La entrega tiene que ser de ESTE pedido y de ESTE workspace.
  const owned = await prisma.digitalDelivery.findFirst({ where: { id: parsed.data.deliveryId, orderId: id, workspaceId: user.workspace.id }, select: { id: true } });
  if (!owned) return NextResponse.json({ message: 'Acceso no encontrado' }, { status: 404 });

  const result = await resendDelivery({
    workspaceId: user.workspace.id,
    deliveryId: owned.id,
    baseUrl: defaultBaseUrl(),
    actorId: user.id,
  });

  if (!result) return NextResponse.json({ message: 'Acceso no encontrado' }, { status: 404 });
  if ('revoked' in result) {
    return NextResponse.json({ message: 'Este acceso fue revocado: no se puede reenviar.' }, { status: 409 });
  }

  return NextResponse.json({ data: { ...result, orderId: id } });
}
