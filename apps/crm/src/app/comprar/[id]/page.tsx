import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { loadPublicProduct } from '@/lib/commerce/product-checkout';
import { ProductPurchase } from '@/components/products/product-purchase';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Comprar', robots: { index: false, follow: false }, referrer: 'no-referrer' };

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

const ERROR_TEXT: Record<string, string> = {
  CHOOSE_VARIANT: 'Elige una opción para continuar.',
  INVALID_VARIANT: 'La opción elegida ya no está disponible. Elige otra.',
  INVALID_BUYER: 'Revisa tu nombre y tu email.',
  RATE_LIMITED: 'Demasiados intentos seguidos. Espera un momento y vuelve a intentarlo.',
  UNAVAILABLE: 'Este producto no está disponible en este momento.',
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-start justify-center bg-slate-50 p-4 sm:items-center sm:p-6">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-sm sm:p-8">{children}</div>
    </main>
  );
}

/**
 * Pagina publica de compra de un producto. Solo muestra productos PUBLICADOS;
 * despues del envio el comprador sigue en el checkout canonico del pedido.
 */
export default async function ProductBuyPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const { id } = await params;
  const query = await searchParams;
  const key = first(query.k) ?? null;
  const view = await loadPublicProduct(id, key);

  if (!view.ok) {
    if (view.reason === 'NOT_FOUND') notFound();
    return (
      <Shell>
        <p className="text-sm font-semibold text-slate-900">Este producto no está disponible</p>
        <p className="mt-2 text-sm text-slate-500">Puede que ya no se venda o que el enlace haya cambiado. Consulta a quien te lo compartió.</p>
      </Shell>
    );
  }

  const error = first(query.e);
  return (
    <Shell>
      <ProductPurchase view={view} productKey={key ?? ''} errorText={error ? (ERROR_TEXT[error] ?? null) : null} initialVariantId={first(query.v) ?? null} />
    </Shell>
  );
}
