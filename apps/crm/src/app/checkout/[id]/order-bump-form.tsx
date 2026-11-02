'use client';

import { useState } from 'react';
import { formatMinor as formatMoney } from '@/lib/commerce/product-studio/rules';

export type BumpCardOffer = { headline: string; description: string | null; imageUrl: string | null; unitPrice: number };

/**
 * Casilla del order bump tal como la ve el comprador. La usan el checkout, la
 * vista previa del producto y el editor de ofertas (misma pieza, sin copias).
 */
export function BumpOfferCard({
  bump,
  currency,
  selected,
  onChange,
  form,
}: {
  bump: BumpCardOffer;
  currency: string;
  selected: boolean;
  onChange?: (selected: boolean) => void;
  /** id del formulario de pago al que pertenece la casilla (vacio en vista previa). */
  form?: string;
}) {
  return (
    <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border-2 border-dashed border-blue-300 bg-blue-50/50 p-4 transition-colors hover:border-blue-500">
      <input
        type="checkbox"
        name="includeBump"
        form={form}
        checked={selected}
        onChange={(event) => onChange?.(event.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 accent-blue-600"
      />
      {bump.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- portada servida por la ruta firmada del producto
        <img src={bump.imageUrl} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="block break-words text-sm font-semibold text-slate-900">{bump.headline}</span>
        {bump.description ? <span className="mt-1 block whitespace-pre-line break-words text-sm text-slate-600">{bump.description}</span> : null}
        <span className="mt-1 block text-sm font-semibold text-blue-700">+ {formatMoney(bump.unitPrice, currency)}</span>
        <span className="mt-1 block text-xs text-slate-500">Opcional. Puedes continuar sin agregarlo.</span>
      </span>
    </label>
  );
}

export function OrderBumpForm({
  orderId,
  token,
  baseTotal,
  currency,
  bump,
  errorText,
  preview = false,
}: {
  orderId: string;
  token: string;
  baseTotal: number;
  currency: string;
  bump: (BumpCardOffer & { selected: boolean }) | null;
  errorText?: string | null;
  /** Vista previa del Studio: mismo dibujo, sin poder pagar. */
  preview?: boolean;
}) {
  const [selected, setSelected] = useState(Boolean(bump?.selected));
  const total = baseTotal + (selected && bump ? bump.unitPrice : 0);

  return (
    <>
      {bump ? <BumpOfferCard bump={bump} currency={currency} selected={selected} onChange={setSelected} form={preview ? undefined : 'checkout-payment'} /> : null}

      <div className="mt-5 flex items-baseline justify-between border-t border-slate-100 pt-4" aria-live="polite">
        <span className="text-sm text-slate-500">Total</span>
        <span className="text-xl font-bold text-slate-900">{formatMoney(total, currency)}</span>
      </div>

      {errorText ? <p className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{errorText}</p> : null}
      {preview ? (
        <>
          <button type="button" disabled className="mt-6 w-full cursor-not-allowed rounded-lg bg-blue-600 py-3 text-sm font-semibold text-white opacity-60">
            Pagar con Mercado Pago
          </button>
          <p className="mt-3 text-center text-[11px] text-slate-500">Vista previa: el pago está desactivado.</p>
        </>
      ) : (
        <>
          <form id="checkout-payment" method="post" action={`/api/checkout/${encodeURIComponent(orderId)}/pay`} className="mt-6">
            <input type="hidden" name="t" value={token} />
            <button type="submit" className="w-full rounded-lg bg-blue-600 py-3 text-sm font-semibold text-white hover:bg-blue-700">
              Pagar con Mercado Pago
            </button>
          </form>
          <p className="mt-3 text-center text-[11px] text-slate-400">Serás redirigido a Mercado Pago para completar el pago de forma segura.</p>
        </>
      )}
    </>
  );
}
