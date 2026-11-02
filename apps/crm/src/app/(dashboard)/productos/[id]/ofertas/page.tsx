import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BarChart3 } from 'lucide-react';
import { PlanLockedNotice } from '@/components/billing/plan-locked-notice';
import { OffersManager } from '@/components/products/offers-manager';
import { StudioPageHeader } from '@/components/products/studio-page-header';
import { SettingsCard } from '@/components/ui/settings-card';
import { requireCurrentUser } from '@/lib/auth';
import { canManageWorkspaceSettings } from '@/lib/workspace-roles';
import { listProductOffers, type ProductOffersView } from '@/lib/commerce/offers/service';
import { OFFER_KIND_LABEL, formatRate } from '@/lib/commerce/offers/rules';
import { listBumpOptions, ProductStudioError } from '@/lib/commerce/product-studio/service';
import { formatMinor } from '@/lib/commerce/product-studio/rules';

export const dynamic = 'force-dynamic';

/** Resultados por oferta, incluidas las eliminadas que ya tenian medicion. */
function OfferResults({ view }: { view: ProductOffersView }) {
  const rows = [
    ...view.offers.map((offer) => ({ id: offer.id, kind: offer.kind, headline: offer.headline, currency: offer.currency, stats: offer.stats, archived: false })),
    ...view.archived.map((offer) => ({ ...offer, archived: true })),
  ].filter((row) => row.stats.shown > 0 || !row.archived);
  const simulated = rows.reduce((sum, row) => sum + row.stats.simulated, 0);
  return (
    <SettingsCard
      icon={BarChart3}
      title="Resultados"
      description="Bump: de los pedidos pagados en que se mostró, cuántos lo incluyeron. Upsell: de las veces que se mostró tras un pago, cuántas terminaron en un pago adicional."
    >
      {rows.length === 0 ? (
        <p className="text-sm text-soft">Todavía no hay ofertas que medir.</p>
      ) : (
        <div className="-mx-1 overflow-x-auto px-1">
          <table className="w-full min-w-[560px] text-left text-sm">
            <caption className="sr-only">Resultados de las ofertas de este producto</caption>
            <thead className="text-xs text-soft">
              <tr className="border-b border-line">
                <th scope="col" className="py-2 pr-3 font-semibold">Oferta</th>
                <th scope="col" className="py-2 pr-3 text-right font-semibold">Mostrada</th>
                <th scope="col" className="py-2 pr-3 text-right font-semibold">Aceptada</th>
                <th scope="col" className="py-2 pr-3 text-right font-semibold">Pagada</th>
                <th scope="col" className="py-2 pr-3 text-right font-semibold">Take rate</th>
                <th scope="col" className="py-2 text-right font-semibold">Ingresos</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-line last:border-0">
                  <td className="py-2 pr-3">
                    <span className="block break-words font-semibold text-carbon">{row.headline}</span>
                    <span className="text-xs text-soft">
                      {OFFER_KIND_LABEL[row.kind]}
                      {row.archived ? ' · eliminada' : ''}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-right">{row.stats.shown}</td>
                  <td className="py-2 pr-3 text-right">{row.stats.accepted}</td>
                  <td className="py-2 pr-3 text-right">{row.stats.paid}</td>
                  <td className="py-2 pr-3 text-right font-semibold text-carbon">{formatRate(row.stats.takeRate)}</td>
                  <td className="py-2 text-right">{row.stats.revenue > 0 ? formatMinor(row.stats.revenue, row.currency) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {simulated > 0 && (
        <p className="mt-3 text-xs leading-5 text-soft">
          Incluye {simulated} pago{simulated === 1 ? '' : 's'} simulado{simulated === 1 ? '' : 's'} del modo demostración (sin cobro real).
        </p>
      )}
    </SettingsCard>
  );
}

/**
 * Productos → [Producto] → Ofertas (Punto 6): order bump con prioridad y upsell
 * postcompra, con copy, imagen, precio especial, activacion, vista previa y
 * resultados. Todo desde aqui, sin tocar metadata ni base a mano.
 */
export default async function ProductOffersPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireCurrentUser();
  const { id } = await params;
  const view = await listProductOffers(user.workspace.id, id).catch((error) => {
    if (error instanceof ProductStudioError && error.code === 'NOT_FOUND') notFound();
    throw error;
  });
  const options = await listBumpOptions(user.workspace.id, view.product.id);
  const readOnlyReason = view.product.connectionId
    ? 'Este producto se sincroniza desde Shopify: sus ofertas no se administran aquí.'
    : view.product.status === 'ARCHIVED'
      ? 'El producto está archivado. Restáuralo para editar sus ofertas.'
      : null;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <StudioPageHeader eyebrow="Ofertas" title={view.product.name} back={{ href: `/productos/${encodeURIComponent(view.product.id)}`, label: 'Volver al producto' }} />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-10 pt-2 sm:px-8">
        <div className="space-y-4">
          <PlanLockedNotice workspaceId={user.workspace.id} feature="commerce.products" />
          {view.product.status !== 'ACTIVE' && !readOnlyReason && (
            <p className="rounded-lg bg-solar/25 px-3 py-2 text-sm text-warning-ink">
              El producto aún no está publicado: puedes preparar sus ofertas, pero nadie las verá hasta que lo publiques.
            </p>
          )}
          <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
            <OffersManager
              productId={view.product.id}
              currency={view.product.currency}
              offers={view.offers}
              winner={view.winner}
              options={options}
              editable={canManageWorkspaceSettings(user.role) && !readOnlyReason}
              readOnlyReason={readOnlyReason}
            />
            <div className="space-y-4">
              <OfferResults view={view} />
              <Link
                href={`/productos/${encodeURIComponent(view.product.id)}/vista-previa`}
                className="inline-flex h-10 w-full items-center justify-center rounded-lg border border-mist bg-paper px-4 text-sm font-semibold text-carbon hover:border-carbon focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-electric"
              >
                Ver el recorrido completo del comprador
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
