import { Package, PackageOpen } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge } from '@/components/ui/status-badge';
import { requireCurrentUser } from '@/lib/auth';
import { formatCurrency } from '@/lib/mock-data';
import { prisma } from '@/lib/prisma';
import { BusinessType } from '../../../../generated/prisma/client';
import { canManageChannels } from '@/lib/conversations';
import { NewProductForm } from './new-product-form';

export const dynamic = 'force-dynamic';

const TYPE_LABEL: Record<string, string> = {
  DIGITAL: 'Digital',
  PHYSICAL: 'Fisico',
  SERVICE: 'Servicio',
};

const STATUS_TONE: Record<string, 'success' | 'draft' | 'neutral'> = {
  ACTIVE: 'success',
  DRAFT: 'draft',
  ARCHIVED: 'neutral',
};

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Activo',
  DRAFT: 'Borrador',
  ARCHIVED: 'Archivado',
};

export default async function ProductosPage() {
  const user = await requireCurrentUser();

  const [products, profile] = await Promise.all([
    prisma.product.findMany({
      where: { workspaceId: user.workspace.id },
      include: { variants: { orderBy: { priceClp: 'asc' } }, assets: true },
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
    }),
    prisma.workspaceProfile.findUnique({
      where: { workspaceId: user.workspace.id },
      select: { businessType: true },
    }),
  ]);
  const preferredType = profile?.businessType === BusinessType.INFOPRODUCT ? 'DIGITAL' : 'PHYSICAL';

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Header title="Productos" subtitle="Catalogo interno: lo que el agente puede vender" />
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-8 pt-2 sm:px-8">
        <Card className="p-5">
          <p className="text-sm font-bold text-carbon">Catálogo manual</p>
          <p className="mt-1 text-xs leading-5 text-soft">
            Puedes vender desde este catálogo sin conectar Shopify. Los precios guardados aquí son
            los que utiliza el sistema.
          </p>
          <div className="mt-4">
            <NewProductForm preferredType={preferredType} canEdit={canManageChannels(user.role)} />
          </div>
        </Card>

        {products.length === 0 && (
          <EmptyState
            icon={PackageOpen}
            title="Catalogo vacio"
            description="Agrega tu primer producto con su precio y disponibilidad. Mientras el catálogo esté vacío, el sistema deriva la consulta a una persona en vez de inventar precios."
          />
        )}

        <div className="space-y-3">
          {products.map((product) => (
            <Card key={product.id} className="p-4">
              <div className="flex items-start gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-ivory text-graphite">
                  <Package className="h-4 w-4" aria-hidden />
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-carbon">{product.name}</p>
                    <StatusBadge tone={STATUS_TONE[product.status] ?? 'neutral'}>
                      {STATUS_LABEL[product.status] ?? product.status}
                    </StatusBadge>
                    <span className="rounded-md bg-ivory px-2 py-0.5 text-[11px] font-medium text-graphite">
                      {TYPE_LABEL[product.type]}
                    </span>
                  </div>

                  {product.description && <p className="mt-0.5 truncate text-xs text-soft">{product.description}</p>}

                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-soft">
                    {product.variants.map((variant) => (
                      <span key={variant.id}>
                        {variant.name}: <strong className="font-semibold text-carbon">{formatCurrency(variant.priceClp)}</strong>
                        {variant.inventory !== null && ` · stock ${variant.inventory}`}
                      </span>
                    ))}
                  </div>

                  {product.assets.length > 0 && (
                    <p className="mt-1 text-xs text-soft">{product.assets.length} entregable(s) digital(es) configurado(s)</p>
                  )}
                  {product.type === 'DIGITAL' && product.assets.length === 0 && (
                    <p className="mt-1 text-xs text-warning-ink">Sin entregable: al pagarse, este producto no envia nada.</p>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
