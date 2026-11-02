import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { loadPublicCheckout } from '@/lib/commerce/public-checkout';
import { formatMinor as formatMoney } from '@/lib/commerce/product-studio/rules';
import { OrderBumpForm } from './order-bump-form';
import { UpsellOffer } from './upsell-offer';

export const dynamic = 'force-dynamic';

// El enlace lleva un token: no se indexa ni se filtra por Referer.
export const metadata: Metadata = { title: 'Checkout', robots: { index: false, follow: false }, referrer: 'no-referrer' };

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

const UNAVAILABLE_TEXT = {
  EXPIRED: { title: 'Este enlace de pago expiró', body: 'Pide un enlace nuevo a quien te lo envió.' },
  UNAVAILABLE: { title: 'Este pedido ya no está disponible para pago', body: 'Si crees que es un error, responde el mensaje por el que recibiste este enlace.' },
} as const;

const ERROR_TEXT: Record<string, string> = {
  PAYMENTS_UNAVAILABLE: 'El pago no está disponible en este momento. Intenta de nuevo más tarde.',
  RATE_LIMITED: 'Demasiados intentos seguidos. Espera un momento y vuelve a intentarlo.',
  PENDING: 'Ya hay un pago en proceso para este pedido.',
  UPSELL_UNAVAILABLE: 'Esta oferta ya no está disponible.',
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4 sm:p-6">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-sm sm:p-8">{children}</div>
    </main>
  );
}

/**
 * Checkout publico de un pedido (cualquier workspace). Todo lo que se muestra
 * sale del pedido guardado; el estado, de la base. Ver lib/commerce/public-checkout.
 */
export default async function PublicCheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const token = first(query.t) ?? null;
  const returned = first(query.r);
  const error = first(query.e);

  const view = await loadPublicCheckout(id, token);

  if (!view.ok) {
    if (view.reason === 'NOT_FOUND') notFound();
    const text = UNAVAILABLE_TEXT[view.reason];
    return (
      <Shell>
        <p className="text-sm font-semibold text-slate-900">{text.title}</p>
        <p className="mt-2 text-sm text-slate-500">{text.body}</p>
      </Shell>
    );
  }

  // Mercado Pago dijo "success"/"pending" pero el webhook aun no confirma: se
  // espera sin ofrecer pagar de nuevo (evita cobros dobles).
  const waiting = view.state === 'PENDING' || (view.state === 'PAYABLE' && (returned === 'success' || returned === 'pending'));

  return (
    <Shell>
      {waiting ? <meta httpEquiv="refresh" content="8" /> : null}
      <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
        {view.workspaceName}
        {view.isUpsell ? ' · Oferta adicional' : ''}
      </p>
      <h1 className="mt-1 text-lg font-bold text-slate-900">{view.item.name}</h1>
      {view.item.quantity > 1 ? (
        <p className="mt-1 text-sm text-slate-500">
          {view.item.quantity} × {formatMoney(view.item.unitPrice, view.currency)}
        </p>
      ) : null}

      {view.buyer.name || view.buyer.email ? (
        <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Comprador</p>
          {view.buyer.name ? <p className="mt-1 text-slate-900">{view.buyer.name}</p> : null}
          {view.buyer.email ? <p className="text-slate-500">{view.buyer.email}</p> : null}
        </div>
      ) : null}

      {view.state === 'PAID' || waiting ? (
        <div className="mt-5 flex items-baseline justify-between border-t border-slate-100 pt-4">
          <span className="text-sm text-slate-500">Total</span>
          <span className="text-xl font-bold text-slate-900">{formatMoney(view.total, view.currency)}</span>
        </div>
      ) : null}

      <div className="mt-6" role="status">
        {view.state === 'PAID' ? (
          <div className="space-y-3">
            <div className="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800">
              <p className="font-semibold">Pago confirmado</p>
              <p className="mt-1">Gracias por tu compra. Recibirás la confirmación de {view.workspaceName} por los medios que dejaste.</p>
            </div>
            {view.delivery?.kind === 'READY' ? (
              <a
                href={view.delivery.path}
                rel="noreferrer"
                className="flex min-h-11 w-full items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
              >
                Acceder a mi compra
              </a>
            ) : view.delivery?.kind === 'REVOKED' ? (
              <p className="text-sm text-slate-500">El acceso a esta compra fue revocado por el vendedor.</p>
            ) : view.delivery?.kind === 'PENDING' ? (
              <p className="text-sm text-slate-500">Si compraste contenido digital, {view.workspaceName} te enviará el acceso.</p>
            ) : null}
            {error && ERROR_TEXT[error] ? <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{ERROR_TEXT[error]}</p> : null}
            {view.upsell?.status === 'OPEN' ? (
              <div className="pt-2">
                <UpsellOffer orderId={view.orderId} token={token ?? ''} offer={view.upsell} currency={view.currency} />
              </div>
            ) : view.upsell?.status === 'ACCEPTED' ? (
              <div className="rounded-lg border border-slate-200 p-4 text-sm">
                <p className="font-semibold text-slate-900">Agregaste {view.upsell.name}</p>
                <p className="mt-1 text-slate-500">Falta completar su pago ({formatMoney(view.upsell.unitPrice, view.currency)}).</p>
                <a href={view.upsell.checkoutPath} className="mt-3 flex min-h-11 w-full items-center justify-center rounded-lg border border-blue-600 px-4 text-sm font-semibold text-blue-700 hover:bg-blue-50">
                  Completar el pago de la oferta
                </a>
              </div>
            ) : view.upsell?.status === 'PAID' ? (
              <div className="rounded-lg border border-slate-200 p-4 text-sm">
                <p className="font-semibold text-slate-900">También compraste {view.upsell.name}</p>
                <a href={view.upsell.checkoutPath} className="mt-2 inline-block font-semibold text-blue-700 underline underline-offset-4">
                  Ver esa compra
                </a>
              </div>
            ) : null}
          </div>
        ) : waiting ? (
          <div className="rounded-lg bg-amber-50 p-4 text-sm text-amber-800">
            <p className="font-semibold">{view.state === 'PENDING' || returned === 'pending' ? 'Pago pendiente' : 'Estamos confirmando tu pago'}</p>
            <p className="mt-1">Esta página se actualiza sola. No hace falta pagar de nuevo.</p>
          </div>
        ) : (
          <>
            {returned === 'failure' ? (
              <p className="mb-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">El pago no se completó. Puedes intentarlo de nuevo.</p>
            ) : null}
            <OrderBumpForm
              orderId={view.orderId}
              token={token ?? ''}
              baseTotal={view.total - (view.bump?.selected ? view.bump.unitPrice : 0)}
              currency={view.currency}
              bump={view.bump ? { headline: view.bump.headline, description: view.bump.description, imageUrl: view.bump.imageUrl, unitPrice: view.bump.unitPrice, selected: view.bump.selected } : null}
              errorText={error ? ERROR_TEXT[error] : null}
            />
          </>
        )}
      </div>
    </Shell>
  );
}
