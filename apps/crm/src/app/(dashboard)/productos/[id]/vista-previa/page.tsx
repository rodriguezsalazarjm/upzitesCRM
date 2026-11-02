import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { ProductPurchase } from '@/components/products/product-purchase';
import { OrderBumpForm } from '@/app/checkout/[id]/order-bump-form';
import { UpsellOffer } from '@/app/checkout/[id]/upsell-offer';
import { requireCurrentUser } from '@/lib/auth';
import { loadProductForPreview } from '@/lib/commerce/product-checkout';
import { listProductOffers, type AdminOffer } from '@/lib/commerce/offers/service';
import type { OfferKind } from '@/lib/commerce/offers/rules';
import { BUMP_ISSUE_TEXT, STATUS_LABEL, type StudioProductStatus } from '@/lib/commerce/product-studio/rules';

export const dynamic = 'force-dynamic';

/**
 * Vista previa administrativa: los MISMOS componentes que ve el comprador (paso
 * 1 en /comprar, paso 2 en /checkout y paso 3, el upsell con el pago ya
 * confirmado), sin poder pagar. Funciona tambien con el producto en borrador.
 */
export default async function ProductPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireCurrentUser();
  const { id } = await params;
  const loaded = await loadProductForPreview(user.workspace.id, id);
  if (!loaded) notFound();
  const { product, view } = loaded;
  const offers = await listProductOffers(user.workspace.id, product.id);
  // Lo que veria el comprador; si la oferta solo falla por estar en borrador, se
  // muestra igual con el aviso (es lo que aparecera al publicarla).
  const pick = (kind: OfferKind): AdminOffer | null => {
    const active = offers.offers.filter((offer) => offer.kind === kind && offer.isActive);
    return active.find((offer) => offer.id === offers.winner[kind]) ?? active.find((offer) => offer.issue === 'NOT_PUBLISHED') ?? null;
  };
  const bump = pick('ORDER_BUMP');
  const upsell = pick('UPSELL');
  const offerCard = (offer: AdminOffer) => ({ headline: offer.headline, description: offer.description, imageUrl: offer.imageUrl, unitPrice: offer.effectivePrice });
  const firstPrice = view.options[0]?.price ?? 0;
  const status = product.status as StudioProductStatus;

  return (
    <div className="h-full overflow-y-auto bg-slate-50">
      <div className="sticky top-0 z-10 border-b border-line bg-paper/95 px-4 py-3 pl-16 backdrop-blur sm:px-8 md:pl-8">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link href={`/productos/${encodeURIComponent(product.id)}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-carbon hover:text-electric">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Volver al editor
          </Link>
          <p className="text-xs text-soft">
            Vista previa · {STATUS_LABEL[status]}
            {status !== 'ACTIVE' ? ' · nadie puede comprarlo todavía' : ''}
          </p>
        </div>
      </div>
      <main className="mx-auto grid max-w-6xl gap-6 p-4 sm:p-6 md:grid-cols-2 md:items-start xl:grid-cols-3">
        <section aria-labelledby="preview-step-1" className="rounded-2xl bg-white p-6 shadow-sm sm:p-8">
          <h2 id="preview-step-1" className="mb-4 text-[11px] font-semibold uppercase tracking-widest text-blue-600">
            Paso 1 · Producto
          </h2>
          {view.options.length > 0 ? (
            <ProductPurchase view={view} preview />
          ) : (
            <p className="text-sm text-slate-600">Este producto aún no tiene nada vendible: define un precio o activa una variante.</p>
          )}
        </section>
        <section aria-labelledby="preview-step-2" className="rounded-2xl bg-white p-6 shadow-sm sm:p-8">
          <h2 id="preview-step-2" className="mb-4 text-[11px] font-semibold uppercase tracking-widest text-blue-600">
            Paso 2 · Checkout
          </h2>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">{view.workspaceName}</p>
          <p className="mt-1 break-words text-lg font-bold text-slate-900">{view.needsChoice ? `${view.name} — ${view.options[0]?.label ?? ''}` : view.name}</p>
          {bump?.issue ? <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{BUMP_ISSUE_TEXT[bump.issue]}</p> : null}
          <OrderBumpForm orderId="vista-previa" token="" baseTotal={firstPrice} currency={view.currency} bump={bump ? { ...offerCard(bump), selected: false } : null} preview />
          {view.needsChoice ? <p className="mt-3 text-xs text-slate-500">El total se calcula con la opción que elija el comprador (aquí: la primera).</p> : null}
        </section>
        <section aria-labelledby="preview-step-3" className="rounded-2xl bg-white p-6 shadow-sm sm:p-8">
          <h2 id="preview-step-3" className="mb-4 text-[11px] font-semibold uppercase tracking-widest text-blue-600">
            Paso 3 · Después del pago
          </h2>
          <div className="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800">
            <p className="font-semibold">Pago confirmado</p>
            <p className="mt-1">Gracias por tu compra.</p>
          </div>
          {upsell ? (
            <div className="mt-4">
              {upsell.issue ? <p className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{BUMP_ISSUE_TEXT[upsell.issue]}</p> : null}
              <UpsellOffer orderId="vista-previa" token="" offer={offerCard(upsell)} currency={view.currency} preview />
            </div>
          ) : (
            <p className="mt-4 text-sm text-slate-500">Sin upsell configurado: el comprador ve solo la confirmación y su acceso.</p>
          )}
        </section>
      </main>
    </div>
  );
}
