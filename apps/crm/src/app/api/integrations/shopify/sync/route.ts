import { NextResponse } from 'next/server';
import { JobType } from '../../../../../../generated/prisma/client';
import { requireCurrentUser } from '@/lib/auth';
import { canManageChannels } from '@/lib/conversations';
import { enqueue } from '@/lib/jobs/queue';
import { getShopifyConnection } from '@/lib/shopify/sync';

/**
 * Dispara la sincronizacion del catalogo.
 *
 * Encola en vez de sincronizar en linea: una tienda con cientos de productos
 * tarda mas de lo que un request debe durar.
 */
export async function POST() {
  const user = await requireCurrentUser();

  if (!canManageChannels(user.role)) {
    return NextResponse.json({ message: 'Solo el owner o un admin puede sincronizar.' }, { status: 403 });
  }

  const connection = await getShopifyConnection(user.workspace.id);
  if (!connection || connection.status !== 'CONNECTED') {
    return NextResponse.json({ message: 'No hay una tienda Shopify conectada.' }, { status: 404 });
  }

  const minute = new Date().toISOString().slice(0, 16);
  await enqueue({
    type: JobType.SYNC_SHOPIFY_CATALOG,
    workspaceId: user.workspace.id,
    payload: {},
    // Una sincronizacion por minuto y workspace: pulsar el boton varias veces
    // no encola varias corridas.
    dedupeKey: `shopify-sync:${user.workspace.id}:${minute}`,
    priority: 60,
  });

  return NextResponse.json({ data: { queued: true } }, { status: 202 });
}
