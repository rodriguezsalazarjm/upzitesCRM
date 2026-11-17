import Link from 'next/link';
import { Compose } from '@/components/mail/compose';
import { Card } from '@/components/ui/card';
import { requireCurrentUser } from '@/lib/auth';
import { userMailboxes } from '@/lib/mail/service';
import { prisma } from '@/lib/prisma';
import { customerSchema, parseBrand } from '@/lib/quote-studio/schema';
import { getStudioSettings, publicQuoteUrl, publicToken } from '@/lib/quote-studio/service';

export const dynamic = 'force-dynamic';

/** Redactar. Con ?cotizacion= viene precargado desde Quote Studio (PDF adjunto + enlace). */
export default async function ComposePage({ searchParams }: { searchParams: Promise<{ cotizacion?: string; para?: string }> }) {
  const user = await requireCurrentUser();
  const { cotizacion, para } = await searchParams;
  const mailboxes = (await userMailboxes(user.workspace.id, user.id)).filter((m) => m.status === 'CONNECTED');
  const quote = cotizacion ? await prisma.salesQuote.findFirst({ where: { id: cotizacion, workspaceId: user.workspace.id }, select: { id: true, number: true, title: true, customer: true } }) : null;
  let initial: Parameters<typeof Compose>[0]['initial'] = { to: para ?? '' };
  if (quote) {
    const customer = customerSchema.parse(quote.customer);
    const brand = parseBrand((await getStudioSettings(user.workspace.id)).brand);
    const from = brand.companyName || user.workspace.name;
    initial = {
      to: customer.email,
      subject: `Cotización ${quote.number}${quote.title ? ` · ${quote.title}` : ''} – ${from}`,
      text: `Hola ${customer.name || ''},\n\nTe envío la cotización ${quote.number}${quote.title ? ` (${quote.title})` : ''} en PDF.\nTambién puedes verla y aceptarla aquí: ${publicQuoteUrl(publicToken(quote.id))}\n\nQuedo atento a tus comentarios.\n\n${user.name ?? ''}\n${from}`,
      quote: { id: quote.id, number: quote.number },
    };
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="max-w-2xl space-y-3 pb-6 pl-16 pr-4 pt-5 md:pl-5 md:pr-5">
        <Link href={quote ? `/cotizaciones/studio/${quote.id}` : '/inbox/email'} className="text-xs font-semibold text-electric hover:underline">← {quote ? 'Volver a la cotización' : 'Email'}</Link>
        <h1 className="type-display text-[32px] text-carbon">{quote ? 'Enviar cotización' : 'Redactar'}</h1>
        {quote && <p className="text-sm text-graphite">Al enviarlo, la cotización queda como enviada con esta versión, el correo queda en el hilo del cliente y se registra la actividad.</p>}
        <Card className="p-4">
          {mailboxes.length ? <Compose mailboxes={mailboxes.map((m) => ({ id: m.id, emailAddress: m.emailAddress }))} initial={initial} /> : <p className="text-sm text-graphite">Primero <Link href="/inbox/email" className="font-semibold text-electric underline">conecta tu correo</Link>.</p>}
        </Card>
      </div>
    </div>
  );
}
