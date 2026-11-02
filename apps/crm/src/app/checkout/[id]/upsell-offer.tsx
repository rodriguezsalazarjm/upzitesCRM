import { formatMinor as formatMoney } from '@/lib/commerce/product-studio/rules';

export type UpsellCardOffer = { headline: string; description: string | null; imageUrl: string | null; unitPrice: number };

/**
 * Oferta postcompra (upsell) tal como la ve el comprador, con el pedido ya
 * pagado. Aceptar lleva a un pago NUEVO y aparte en Mercado Pago (Checkout Pro
 * no permite volver a cobrar sin que el comprador autorice). El formulario
 * solo envia el token y la decision.
 */
export function UpsellOffer({
  orderId,
  token,
  offer,
  currency,
  preview = false,
}: {
  orderId: string;
  token: string;
  offer: UpsellCardOffer;
  currency: string;
  /** Vista previa del Studio: mismo dibujo, sin poder decidir. */
  preview?: boolean;
}) {
  const price = formatMoney(offer.unitPrice, currency);
  const buttons = (
    <>
      <button
        type={preview ? 'button' : 'submit'}
        name="decision"
        value="accept"
        disabled={preview}
        className="flex min-h-11 w-full items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
      >
        Sí, lo quiero por {price}
      </button>
      <button
        type={preview ? 'button' : 'submit'}
        name="decision"
        value="decline"
        disabled={preview}
        className="mt-2 flex min-h-11 w-full items-center justify-center rounded-lg px-4 text-sm font-medium text-slate-500 underline-offset-4 hover:text-slate-800 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed"
      >
        No, gracias
      </button>
    </>
  );

  return (
    <section aria-labelledby="upsell-title" className="rounded-xl border border-blue-200 bg-blue-50/60 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-blue-700">Oferta para ti</p>
      <div className="mt-2 flex items-start gap-3">
        {offer.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- portada servida por la ruta firmada del producto
          <img src={offer.imageUrl} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" />
        ) : null}
        <div className="min-w-0 flex-1">
          <h2 id="upsell-title" className="break-words text-base font-bold text-slate-900">
            {offer.headline}
          </h2>
          {offer.description ? <p className="mt-1 whitespace-pre-line break-words text-sm text-slate-600">{offer.description}</p> : null}
          <p className="mt-2 text-lg font-bold text-slate-900">{price}</p>
        </div>
      </div>
      <div className="mt-4">
        {preview ? (
          buttons
        ) : (
          <form method="post" action={`/api/checkout/${encodeURIComponent(orderId)}/upsell`}>
            <input type="hidden" name="t" value={token} />
            {buttons}
          </form>
        )}
      </div>
      <p className="mt-2 text-center text-[11px] text-slate-500">
        {preview ? 'Vista previa: los botones están desactivados.' : 'Se paga aparte, con Mercado Pago. Tu compra anterior ya está confirmada.'}
      </p>
    </section>
  );
}
