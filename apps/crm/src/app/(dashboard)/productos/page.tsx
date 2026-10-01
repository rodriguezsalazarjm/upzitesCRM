import Link from 'next/link';
import { Package, PackageOpen, Plus } from 'lucide-react';
import { TutorialHint } from '@/components/tutorials/tutorial-hint';
import { Header } from '@/components/layout/header';
import { PlanLockedNotice } from '@/components/billing/plan-locked-notice';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge } from '@/components/ui/status-badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs } from '@/components/ui/tabs';
import { ProductRowMenu } from '@/components/products/product-actions';
import { requireCurrentUser } from '@/lib/auth';
import { canManageWorkspaceSettings } from '@/lib/workspace-roles';
import { listStudioProducts, type StudioFilter } from '@/lib/commerce/product-studio/service';
import { STATUS_LABEL, TYPE_LABEL, formatMinor, type StudioProductStatus, type StudioProductType } from '@/lib/commerce/product-studio/rules';

export const dynamic = 'force-dynamic';

const FILTERS: { value: StudioFilter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'DRAFT', label: 'Borradores' },
  { value: 'ACTIVE', label: 'Publicados' },
  { value: 'ARCHIVED', label: 'Archivados' },
];

const STATUS_TONE: Record<StudioProductStatus, 'success' | 'draft' | 'neutral'> = { ACTIVE: 'success', DRAFT: 'draft', ARCHIVED: 'neutral' };

const dateFormat = new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'short', year: 'numeric' });

function Thumb({ id, coverVersion }: { id: string; coverVersion: string | null }) {
  return (
    <span className="hidden h-11 w-11 shrink-0 sm:flex items-center justify-center overflow-hidden rounded-lg bg-ivory text-graphite">
      {coverVersion ? (
        // eslint-disable-next-line @next/next/no-img-element -- miniatura privada servida por la API
        <img src={`/api/products/${encodeURIComponent(id)}/cover?v=${encodeURIComponent(coverVersion)}`} alt="" className="h-full w-full object-cover" />
      ) : (
        <Package className="h-4 w-4" aria-hidden />
      )}
    </span>
  );
}

/** Product Sales Studio: listado del catalogo del workspace activo. */
export default async function ProductosPage({ searchParams }: { searchParams: Promise<{ estado?: string }> }) {
  const user = await requireCurrentUser();
  const { estado } = await searchParams;
  const filter: StudioFilter = FILTERS.some((item) => item.value === estado) ? (estado as StudioFilter) : 'all';
  const { products, counts } = await listStudioProducts(user.workspace.id, filter);
  const canEdit = canManageWorkspaceSettings(user.role);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Header title="Productos" subtitle="Crea, publica y vende desde tu catálogo" action={canEdit ? { label: 'Crear producto', href: '/productos/nuevo' } : undefined} />
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-8 pt-2 sm:px-8">
        <TutorialHint tutorialKey="products.first_visit" />
        <PlanLockedNotice workspaceId={user.workspace.id} feature="commerce.products" />

        {counts.all === 0 ? (
          <EmptyState
            icon={PackageOpen}
            title="Aún no tienes productos"
            description="Crea tu primer producto con su precio, publícalo y comparte su enlace de compra. Mientras el catálogo esté vacío, el sistema deriva las consultas de precio a una persona."
            action={
              canEdit ? (
                <Button asChild>
                  <Link href="/productos/nuevo">
                    <Plus aria-hidden />
                    Crear producto
                  </Link>
                </Button>
              ) : (
                <p className="text-sm text-soft">Una persona administradora puede crear productos.</p>
              )
            }
          />
        ) : (
          <>
            <Tabs
              semantics="filter"
              ariaLabel="Filtrar productos por estado"
              value={filter}
              items={FILTERS.map((item) => ({ value: item.value, label: item.label, count: counts[item.value], href: item.value === 'all' ? '/productos' : `/productos?estado=${item.value}` }))}
            />
            {products.length === 0 ? (
              <Card className="px-6 py-10 text-center text-sm text-soft">No hay productos en este filtro.</Card>
            ) : (
              <Card className="overflow-hidden">
                <Table density="compact" aria-label="Productos">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Producto</TableHead>
                      <TableHead className="hidden sm:table-cell">Estado</TableHead>
                      <TableHead className="hidden lg:table-cell" align="right">
                        Precio
                      </TableHead>
                      <TableHead className="hidden xl:table-cell" align="right">
                        Vendidos
                      </TableHead>
                      <TableHead className="hidden xl:table-cell">Modificado</TableHead>
                      <TableHead align="right">
                        <span className="sr-only">Acciones</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {products.map((product) => {
                      const price = product.priceFrom === null ? '—' : `${product.optionCount > 1 ? 'Desde ' : ''}${formatMinor(product.priceFrom, product.currency)}`;
                      return (
                        <TableRow key={product.id}>
                          <TableCell>
                            <div className="flex min-w-0 items-center gap-3">
                              <Thumb id={product.id} coverVersion={product.coverVersion} />
                              <div className="min-w-0">
                                <Link href={`/productos/${encodeURIComponent(product.id)}`} className="line-clamp-2 break-words font-semibold text-carbon [overflow-wrap:anywhere] hover:text-electric sm:max-w-[22rem]">
                                  {product.name}
                                </Link>
                                <p className="text-xs text-soft">
                                  {TYPE_LABEL[product.type as StudioProductType]} · {product.currency}
                                  {product.syncedFromShopify ? ' · Shopify' : ''}
                                  <span className="lg:hidden"> · {price}</span>
                                  {product.unitsSold > 0 && <span className="xl:hidden"> · {product.unitsSold} vendido{product.unitsSold === 1 ? '' : 's'}</span>}
                                </p>
                                <StatusBadge tone={STATUS_TONE[product.status]} className="mt-1 sm:hidden">
                                  {STATUS_LABEL[product.status]}
                                </StatusBadge>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="hidden sm:table-cell">
                            <StatusBadge tone={STATUS_TONE[product.status]}>{STATUS_LABEL[product.status]}</StatusBadge>
                          </TableCell>
                          <TableCell className="hidden lg:table-cell" numeric>
                            {price}
                          </TableCell>
                          <TableCell className="hidden xl:table-cell" numeric>
                            {product.unitsSold}
                          </TableCell>
                          <TableCell className="hidden xl:table-cell" muted>
                            {dateFormat.format(product.updatedAt)}
                          </TableCell>
                          <TableCell align="right">
                            {canEdit ? (
                              <ProductRowMenu productId={product.id} productName={product.name} status={product.status} canPublish={product.canPublish} />
                            ) : (
                              <Link href={`/productos/${encodeURIComponent(product.id)}`} className="text-sm font-semibold text-electric">
                                Ver<span className="sr-only"> {product.name}</span>
                              </Link>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}
