'use client';

import { useState } from 'react';

function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat('es-CL', { style: 'currency', currency }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

export function OrderBumpForm({
  orderId,
  token,
  baseTotal,
  currency,
  bump,
  errorText,
}: {
  orderId: string;
  token: string;
  baseTotal: number;
  currency: string;
  bump: { name: string; unitPrice: number; selected: boolean } | null;
  errorText?: string | null;
}) {
  const [selected, setSelected] = useState(Boolean(bump?.selected));
  const total = baseTotal + (selected && bump ? bump.unitPrice : 0);

  return (
    <>
      {bump ? (
        <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 transition-colors hover:border-blue-300">
          <input
            type="checkbox"
            name="includeBump"
            form="checkout-payment"
            checked={selected}
            onChange={(event) => setSelected(event.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-blue-600"
          />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-slate-900">Agregar también {bump.name}</span>
            <span className="mt-1 block text-sm text-slate-600">+ {formatMoney(bump.unitPrice, currency)}</span>
            <span className="mt-1 block text-xs text-slate-500">Opcional. Puedes continuar sin agregarlo.</span>
          </span>
        </label>
      ) : null}

      <div className="mt-5 flex items-baseline justify-between border-t border-slate-100 pt-4" aria-live="polite">
        <span className="text-sm text-slate-500">Total</span>
        <span className="text-xl font-bold text-slate-900">{formatMoney(total, currency)}</span>
      </div>

      {errorText ? <p className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{errorText}</p> : null}
      <form id="checkout-payment" method="post" action={`/api/checkout/${encodeURIComponent(orderId)}/pay`} className="mt-6">
        <input type="hidden" name="t" value={token} />
        <button type="submit" className="w-full rounded-lg bg-blue-600 py-3 text-sm font-semibold text-white hover:bg-blue-700">
          Pagar con Mercado Pago
        </button>
      </form>
      <p className="mt-3 text-center text-[11px] text-slate-400">Serás redirigido a Mercado Pago para completar el pago de forma segura.</p>
    </>
  );
}
