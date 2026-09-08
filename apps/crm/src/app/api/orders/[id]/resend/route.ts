import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireCurrentUser } from '@/lib/auth';
import { canManageChannels } from '@/lib/conversations';
import { parseBody } from '@/lib/http';
import { resendDelivery } from '@/lib/commerce/delivery';

const resendSchema = z.object({ deliveryId: z.string().min(1) });

/**
 * Reenvia un acceso digital: genera un token nuevo e invalida el anterior.
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

  const baseUrl = (process.env.NEXT_PUBLIC_CRM_BASE_URL ?? 'http://localhost:3001').replace(/\/+$/, '');

  const result = await resendDelivery({
    workspaceId: user.workspace.id,
    deliveryId: parsed.data.deliveryId,
    baseUrl,
    actorId: user.id,
  });

  if (!result) return NextResponse.json({ message: 'Acceso no encontrado' }, { status: 404 });

  return NextResponse.json({ data: { ...result, orderId: id } });
}
