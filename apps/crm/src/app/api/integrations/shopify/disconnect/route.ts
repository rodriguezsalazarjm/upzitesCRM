import { NextResponse } from 'next/server';
import {
  CommerceProvider,
  IntegrationProvider,
  IntegrationStatus,
  ProductStatus,
} from '../../../../../../generated/prisma/client';
import { requireCurrentUser } from '@/lib/auth';
import { canManageChannels } from '@/lib/conversations';
import { recordAudit } from '@/lib/domain/audit';
import { prisma } from '@/lib/prisma';

/**
 * Desconecta la tienda: borra el token y archiva sus productos.
 *
 * El historial de pedidos se conserva. Desconectar no es borrar los datos del
 * cliente, y los pedidos ya cobrados tienen que seguir siendo consultables.
 */
export async function POST() {
  const user = await requireCurrentUser();

  if (!canManageChannels(user.role)) {
    return NextResponse.json(
      { message: 'Solo el owner o un admin puede desconectar Shopify.' },
      { status: 403 },
    );
  }

  const connection = await prisma.commerceConnection.findFirst({
    where: { workspaceId: user.workspace.id, provider: CommerceProvider.SHOPIFY },
    select: { id: true },
  });

  if (!connection) {
    return NextResponse.json({ message: 'No hay tienda conectada.' }, { status: 404 });
  }

  await prisma.$transaction([
    prisma.commerceConnection.update({
      where: { id: connection.id },
      data: { status: 'DISCONNECTED', accessTokenEncrypted: null },
    }),
    prisma.product.updateMany({
      where: { connectionId: connection.id },
      data: { status: ProductStatus.ARCHIVED },
    }),
    prisma.integration.updateMany({
      where: { workspaceId: user.workspace.id, provider: IntegrationProvider.SHOPIFY },
      data: { status: IntegrationStatus.DISCONNECTED },
    }),
  ]);

  await recordAudit({
    workspaceId: user.workspace.id,
    actorId: user.id,
    action: 'shopify.disconnected',
    entity: 'CommerceConnection',
    entityId: connection.id,
  });

  return NextResponse.json({ ok: true });
}
