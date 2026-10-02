import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireCurrentUser } from '@/lib/auth';
import { canManageChannels } from '@/lib/conversations';
import { parseBody } from '@/lib/http';
import { prisma } from '@/lib/prisma';
import { revokeDigitalDelivery } from '@/lib/commerce/delivery';

const revokeSchema = z.object({ deliveryId: z.string().min(1).max(64) }).strict();

/**
 * Revoca el acceso de una entrega (OWNER/ADMIN). Desde ese momento el enlace
 * no muestra contenido y no se firman descargas nuevas. Lo que el comprador ya
 * descargo no se puede borrar de su equipo.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireCurrentUser();

  if (!canManageChannels(user.role)) {
    return NextResponse.json({ message: 'Solo el owner o un admin puede revocar accesos.' }, { status: 403 });
  }

  const parsed = await parseBody(request, revokeSchema);
  if (!parsed.ok) return parsed.response;

  const owned = await prisma.digitalDelivery.findFirst({ where: { id: parsed.data.deliveryId, orderId: id, workspaceId: user.workspace.id }, select: { id: true } });
  if (!owned) return NextResponse.json({ message: 'Acceso no encontrado' }, { status: 404 });

  const result = await revokeDigitalDelivery({ workspaceId: user.workspace.id, deliveryId: owned.id, actorId: user.id });
  if (!result) return NextResponse.json({ message: 'Acceso no encontrado' }, { status: 404 });
  return NextResponse.json({ data: result });
}
