'use client';

import { useId, useState } from 'react';
import { formatMinor } from '@/lib/commerce/product-studio/rules';

export type PurchaseView = {
  productId: string;
  workspaceName: string;
  name: string;
  description: string;
  currency: string;
  coverUrl: string | null;
  needsChoice: boolean;
  options: { id: string; label: string; price: number }[];
};

/**
 * Primer paso de la compra: producto, opcion y datos del comprador. Lo usan la
 * pagina publica `/comprar/[id]` y la vista previa del Studio (`preview`: mismo
 * dibujo, sin enviar). El formulario solo manda la opcion elegida y los datos
 * del comprador; el precio lo pone el servidor.
 */
export function ProductPurchase({
  view,
  productKey,
  errorText,
  initialVariantId,
  preview = false,
}: {
  view: PurchaseView;
  productKey?: string;
  errorText?: string | null;
  initialVariantId?: string | null;
  preview?: boolean;
}) {
  const uid = useId();
  const initial = view.options.find((option) => option.id === initialVariantId)?.id ?? (view.needsChoice ? null : view.options[0]?.id ?? null);
  const [selected, setSelected] = useState<string | null>(initial);
  const current = view.options.find((option) => option.id === selected) ?? null;
  const minPrice = view.options.length ? Math.min(...view.options.map((option) => option.price)) : 0;
  const differentPrices = new Set(view.options.map((option) => option.price)).size > 1;

  return (
    <div>
      {view.coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- portada servida por la API con firma
        <img src={view.coverUrl} alt={`Portada de ${view.name}`} className="mb-5 aspect-[4/3] w-full rounded-xl bg-slate-100 object-cover" />
      ) : null}
      <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">{view.workspaceName}</p>
      <h1 className="mt-1 break-words text-xl font-bold text-slate-900">{view.name}</h1>
      <p className="mt-2 text-lg font-semibold text-slate-900" aria-live="polite">
        {current ? formatMinor(current.price, view.currency) : differentPrices ? `Desde ${formatMinor(minPrice, view.currency)}` : formatMinor(minPrice, view.currency)}
      </p>
      {view.description ? <p className="mt-3 whitespace-pre-line break-words text-sm leading-6 text-slate-600">{view.description}</p> : null}

      <form method="post" action={preview ? undefined : `/api/comprar/${encodeURIComponent(view.productId)}`} onSubmit={preview ? (event) => event.preventDefault() : undefined} className="mt-6 space-y-5">
        {productKey ? <input type="hidden" name="k" value={productKey} /> : null}
        {view.needsChoice ? (
          <fieldset>
            <legend className="text-sm font-semibold text-slate-900">Elige una opción</legend>
            <div className="mt-2 space-y-2">
              {view.options.map((option) => {
                const id = `${uid}-option-${option.id}`;
                return (
                  <div key={option.id} className={`flex items-center gap-3 rounded-xl border p-3 ${selected === option.id ? 'border-blue-500 bg-blue-50' : 'border-slate-200'}`}>
                    <input id={id} type="radio" name="variantId" value={option.id} checked={selected === option.id} onChange={() => setSelected(option.id)} required className="h-4 w-4 accent-blue-600" />
                    <label htmlFor={id} className="flex min-w-0 flex-1 cursor-pointer items-baseline justify-between gap-3 text-sm">
                      <span className="break-words font-medium text-slate-900">{option.label}</span>
                      <span className="shrink-0 text-slate-600">{formatMinor(option.price, view.currency)}</span>
                    </label>
                  </div>
                );
              })}
            </div>
          </fieldset>
        ) : null}

        <div className="space-y-3">
          <div>
            <label htmlFor={`${uid}-name`} className="block text-sm font-semibold text-slate-900">
              Tu nombre
            </label>
            <input id={`${uid}-name`} name="name" required maxLength={120} autoComplete="name" disabled={preview} className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:bg-slate-50" />
          </div>
          <div>
            <label htmlFor={`${uid}-email`} className="block text-sm font-semibold text-slate-900">
              Tu email
            </label>
            <input id={`${uid}-email`} name="email" type="email" required maxLength={254} autoComplete="email" disabled={preview} aria-describedby={`${uid}-email-help`} className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:bg-slate-50" />
            <p id={`${uid}-email-help`} className="mt-1 text-xs text-slate-500">
              Ahí recibirás la confirmación de tu compra.
            </p>
          </div>
        </div>

        {errorText ? (
          <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">
            {errorText}
          </p>
        ) : null}

        <button type="submit" disabled={preview} className="w-full rounded-lg bg-blue-600 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60">
          Continuar al pago
        </button>
        <p className="text-center text-[11px] text-slate-400">
          {preview ? 'Vista previa: la compra está desactivada.' : 'En el siguiente paso confirmas el total y pagas de forma segura.'}
        </p>
      </form>
    </div>
  );
}
