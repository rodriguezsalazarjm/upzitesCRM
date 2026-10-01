import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { ProductPurchase } from '@/components/products/product-purchase';
import { OrderBumpForm } from '@/app/checkout/[id]/order-bump-form';
import { requireCurrentUser } from '@/lib/auth';
import { loadProductForPreview } from '@/lib/commerce/product-checkout';
import { describeBump } from '@/lib/commerce/product-studio/service';
import { BUMP_ISSUE_TEXT, STATUS_LABEL, type StudioProductStatus } from '@/lib/commerce/product-studio/rules';

export const dynamic = 'force-dynamic';

/**
 * Vista previa administrativa: los MISMOS componentes que ve el comprador (paso
 * 1 en /comprar y paso 2 en /checkout), sin poder pagar. Funciona tambien con
 * el producto en borrador.
 */
export default async function ProductPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireCurrentUser();
  const { id } = await params;
  const loaded = await loadProductForPreview(user.workspace.id, id);
  if (!loaded) notFound();
  const { product, view } = loaded;
  const bump = await describeBump(user.workspace.id, product);
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
      <main className="mx-auto grid max-w-4xl gap-6 p-4 sm:p-6 md:grid-cols-2 md:items-start">
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
          {bump?.issue && bump.issue !== 'NOT_PUBLISHED' ? (
            <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">No se mostrará el producto adicional: {BUMP_ISSUE_TEXT[bump.issue]}</p>
          ) : null}
          {bump?.issue === 'NOT_PUBLISHED' ? <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{BUMP_ISSUE_TEXT.NOT_PUBLISHED}</p> : null}
          <OrderBumpForm
            orderId="vista-previa"
            token=""
            baseTotal={firstPrice}
            currency={view.currency}
            bump={bump && (bump.issue === null || bump.issue === 'NOT_PUBLISHED') ? { name: bump.label, unitPrice: bump.price, selected: false } : null}
            preview
          />
          {view.needsChoice ? <p className="mt-3 text-xs text-slate-500">El total se calcula con la opción que elija el comprador (aquí: la primera).</p> : null}
        </section>
      </main>
    </div>
  );
}
