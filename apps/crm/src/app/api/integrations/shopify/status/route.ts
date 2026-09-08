import { NextResponse } from 'next/server';
import { CommerceProvider } from '../../../../../../generated/prisma/client';
import { requireCurrentUser } from '@/lib/auth';
import { isEncryptionConfigured } from '@/lib/crypto';
import { prisma } from '@/lib/prisma';
import { getShopifyConfig } from '@/lib/shopify/oauth';

export const dynamic = 'force-dynamic';

/** Salud de la integracion. NUNCA devuelve el token, ni cifrado. */
export async function GET() {
  const user = await requireCurrentUser();

  const connection = await prisma.commerceConnection.findFirst({
    where: { workspaceId: user.workspace.id, provider: CommerceProvider.SHOPIFY },
    select: {
      id: true,
      shopDomain: true,
      scopes: true,
      status: true,
      lastSyncAt: true,
      accessTokenEncrypted: true,
    },
  });

  const [products, orders] = connection
    ? await Promise.all([
        prisma.product.count({ where: { connectionId: connection.id, status: 'ACTIVE' } }),
        prisma.customerOrder.count({
          where: { workspaceId: user.workspace.id, provider: CommerceProvider.SHOPIFY },
        }),
      ])
    : [0, 0];

  return NextResponse.json({
    data: connection
      ? {
          shopDomain: connection.shopDomain,
          scopes: connection.scopes,
          status: connection.status,
          lastSyncAt: connection.lastSyncAt,
          hasToken: Boolean(connection.accessTokenEncrypted),
          products,
          orders,
        }
      : null,
    config: {
      appConfigured: getShopifyConfig() !== null,
      encryptionConfigured: isEncryptionConfigured(),
    },
  });
}
