import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ProductStatus, ProductType } from '../../../../generated/prisma/client';
import { requireCurrentUser } from '@/lib/auth';
import { canManageChannels } from '@/lib/conversations';
import { recordAudit } from '@/lib/domain/audit';
import { parseBody } from '@/lib/http';
import { prisma } from '@/lib/prisma';
import { listCatalog } from '@/lib/commerce/orders';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  type: z.nativeEnum(ProductType).default(ProductType.DIGITAL),
  priceClp: z.number().int().min(0),
  sku: z.string().optional(),
  status: z.nativeEnum(ProductStatus).default(ProductStatus.DRAFT),
  asset: z
    .object({
      kind: z.enum(['FILE', 'LINK', 'CODE']),
      name: z.string().min(1),
      target: z.string().min(1),
    })
    .optional(),
});

export async function GET(request: Request) {
  const user = await requireCurrentUser();
  const { searchParams } = new URL(request.url);
  return NextResponse.json({ data: await listCatalog(user.workspace.id, searchParams.get('q') ?? undefined) });
}

export async function POST(request: Request) {
  const user = await requireCurrentUser();

  if (!canManageChannels(user.role)) {
    return NextResponse.json({ message: 'Solo el owner o un admin puede editar el catalogo.' }, { status: 403 });
  }

  const parsed = await parseBody(request, createSchema);
  if (!parsed.ok) return parsed.response;
  const input = parsed.data;

  const product = await prisma.product.create({
    data: {
      workspaceId: user.workspace.id,
      name: input.name,
      description: input.description,
      type: input.type,
      status: input.status,
      variants: {
        create: {
          name: 'Estandar',
          sku: input.sku,
          priceClp: input.priceClp,
          isDefault: true,
          // Un digital no lleva control de stock.
          inventory: input.type === ProductType.DIGITAL ? null : 0,
        },
      },
      ...(input.asset
        ? {
            assets: {
              create: {
                workspaceId: user.workspace.id,
                kind: input.asset.kind,
                name: input.asset.name,
                target: input.asset.target,
              },
            },
          }
        : {}),
    },
    include: { variants: true, assets: true },
  });

  await recordAudit({
    workspaceId: user.workspace.id,
    actorId: user.id,
    action: 'product.created',
    entity: 'Product',
    entityId: product.id,
    metadata: { name: product.name, type: product.type },
  });

  return NextResponse.json({ data: product }, { status: 201 });
}
