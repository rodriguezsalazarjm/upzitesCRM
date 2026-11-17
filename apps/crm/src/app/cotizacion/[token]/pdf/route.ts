import { resolvePublicQuote, snapshotPdf } from '@/lib/quote-studio/public';

export const dynamic = 'force-dynamic';

/** PDF de lo que se envió (snapshot): no cambia aunque luego cambien marca, plantilla o precios. */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const quote = await resolvePublicQuote(token);
  if (!quote) return new Response('Cotización no disponible.', { status: 404 });
  return new Response(snapshotPdf(quote.snapshot) as unknown as BodyInit, {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${quote.snapshot.doc.number}.pdf"`, 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' },
  });
}
