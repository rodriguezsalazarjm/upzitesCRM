import { Package, PackageOpen } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { requireCurrentUser } from '@/lib/auth';
import { formatCurrency } from '@/lib/mock-data';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const TYPE_LABEL: Record<string, string> = {
  DIGITAL: 'Digital',
  PHYSICAL: 'Fisico',
  SERVICE: 'Servicio',
};

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Activo',
  DRAFT: 'Borrador',
  ARCHIVED: 'Archivado',
};

export default async function ProductosPage() {
  const user = await requireCurrentUser();

  const products = await prisma.product.findMany({
    where: { workspaceId: user.workspace.id },
    include: { variants: { orderBy: { priceClp: 'asc' } }, assets: true },
    orderBy: [{ status: 'asc' }, { name: 'asc' }],
  });

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Header title="Productos" subtitle="Catalogo interno: lo que el agente puede vender" />
      <div className="flex-1 space-y-3 overflow-y-auto p-6">
        {products.length === 0 && (
          <Card className="border-0 shadow-sm">
            <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
              <PackageOpen className="h-8 w-8 text-slate-300" />
              <p className="text-sm font-medium text-slate-700">Catalogo vacio</p>
              <p className="max-w-sm text-xs text-slate-500">
                Sin productos, el agente reconoce que no tiene catalogo y deriva a una persona en
                vez de inventar precios.
              </p>
            </CardContent>
          </Card>
        )}

        {products.map((product) => (
          <Card key={product.id} className="border-0 shadow-sm">
            <CardContent className="flex items-start gap-4 p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                <Package className="h-4 w-4" />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-slate-900">{product.name}</p>
                  <Badge variant={product.status === 'ACTIVE' ? 'success' : 'outline'}>
                    {STATUS_LABEL[product.status] ?? product.status}
                  </Badge>
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                    {TYPE_LABEL[product.type]}
                  </span>
                </div>

                {product.description && (
                  <p className="mt-0.5 truncate text-xs text-slate-500">{product.description}</p>
                )}

                <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-slate-500">
                  {product.variants.map((variant) => (
                    <span key={variant.id}>
                      {variant.name}:{' '}
                      <strong className="text-slate-800">{formatCurrency(variant.priceClp)}</strong>
                      {variant.inventory !== null && ` · stock ${variant.inventory}`}
                    </span>
                  ))}
                </div>

                {product.assets.length > 0 && (
                  <p className="mt-1 text-[10px] text-slate-400">
                    {product.assets.length} entregable(s) digital(es) configurado(s)
                  </p>
                )}
                {product.type === 'DIGITAL' && product.assets.length === 0 && (
                  <p className="mt-1 text-[10px] text-amber-600">
                    Sin entregable: al pagarse, este producto no envia nada.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
