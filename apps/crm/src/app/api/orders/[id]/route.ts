import { NextResponse } from 'next/server';
import { requireCurrentUser } from '@/lib/auth';
import { getOrder } from '@/lib/commerce/orders';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireCurrentUser();

  const order = await getOrder(user.workspace.id, id);
  if (!order) return NextResponse.json({ message: 'Pedido no encontrado' }, { status: 404 });

  // Los tokens de entrega nunca salen por la API: solo el estado del acceso.
  const { deliveries, ...rest } = order;
  return NextResponse.json({
    data: {
      ...rest,
      deliveries: deliveries.map((d) => ({
        id: d.id,
        assetName: d.items.map((item) => item.name).join(', '),
        items: d.items.map((item) => ({ name: item.name, productName: item.productName, format: item.format, downloadCount: item.downloadCount })),
        status: d.status,
        attempts: d.attempts,
        lastAttemptAt: d.lastAttemptAt,
        revokedAt: d.revokedAt,
        downloadCount: d.downloadCount,
        maxDownloads: d.maxDownloads,
        lastAccessAt: d.lastAccessAt,
      })),
    },
  });
}
