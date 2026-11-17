import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { formatMinor } from '@/lib/commerce/money';
import { layoutQuote } from '@/lib/quote-studio/layout';
import { resolvePublicQuote } from '@/lib/quote-studio/public';
import { PublicQuoteView } from './public-quote-view';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Cotización', robots: { index: false, follow: false } };

/** Lo que ve el cliente: el snapshot enviado (mismo diseño del PDF) y su respuesta. */
export default async function PublicQuotePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const quote = await resolvePublicQuote(token);
  if (!quote) notFound();
  const { doc, logo } = quote.snapshot;
  const pages = layoutQuote({ ...doc, logo: logo ? { width: logo.width, height: logo.height } : null });
  return (
    <main className="min-h-screen bg-ivory px-4 py-6 sm:py-10">
      <div className="mx-auto max-w-3xl space-y-4">
        <header className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-soft">{doc.brand.companyName || 'Cotización'}</p>
          <h1 className="text-xl font-bold text-carbon">{doc.title || `Cotización ${doc.number}`}</h1>
          <p className="text-sm text-graphite">{doc.number} · Total {formatMinor(doc.calc.totalMinor, doc.currency)}</p>
        </header>
        <PublicQuoteView token={token} status={quote.status} pages={pages} logoUrl={logo?.dataUrl ?? null} editingNewVersion={quote.editingNewVersion} comment={quote.responseComment} />
      </div>
    </main>
  );
}
