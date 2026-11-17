import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Eyebrow } from '@/components/ui/eyebrow';
import { StatCard } from '@/components/ui/stat-card';
import { formatMinor } from '@/lib/commerce/money';
import { prisma } from '@/lib/prisma';
import { customerSchema } from '@/lib/quote-studio/schema';
import { getStudioSettings, quoteMetrics } from '@/lib/quote-studio/service';
import { QUOTE_STATUS } from '@/lib/quote-studio/status';

/** P37: cotizaciones armadas a mano (Quote Studio), con métricas. */
export async function StudioSection({ workspaceId, canManage }: { workspaceId: string; canManage: boolean }) {
  const settings = await getStudioSettings(workspaceId);
  const [quotes, metrics] = await Promise.all([
    prisma.salesQuote.findMany({ where: { workspaceId }, orderBy: { updatedAt: 'desc' }, take: 30, select: { id: true, number: true, version: true, status: true, title: true, customer: true, currency: true, totalMinor: true, updatedAt: true } }),
    quoteMetrics(workspaceId, settings.currency),
  ]);
  const money = (n: number) => formatMinor(n, settings.currency);
  return (
    <section className="space-y-3" data-studio-section>
      <div className="flex flex-wrap items-center gap-2">
        <Eyebrow>Quote Studio</Eyebrow>
        <div className="ml-auto flex flex-wrap gap-2">
          {canManage && <Link href="/cotizaciones/studio/plantillas" className={buttonVariants({ variant: 'outline', size: 'sm' })}>Plantillas y marca</Link>}
          {canManage && <Link href="/cotizaciones/studio/catalogo" className={buttonVariants({ variant: 'outline', size: 'sm' })}>Catálogo</Link>}
          <Link href="/cotizaciones/studio/nueva" className={buttonVariants({ size: 'sm' })} data-new-quote>Nueva cotización</Link>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard size="sm" label="Enviadas" value={metrics.sent} hint={`${metrics.created} creadas · ${metrics.viewed} vistas`} />
        <StatCard size="sm" label="Aceptadas" value={metrics.accepted} hint={metrics.acceptanceRate === null ? 'Sin respuestas aún' : `${Math.round(metrics.acceptanceRate * 100)} % de las respondidas`} />
        <StatCard size="sm" label="Monto cotizado" value={money(metrics.quotedMinor)} hint={`Aceptado ${money(metrics.acceptedMinor)}`} />
        <StatCard size="sm" label="Tiempo a aceptar" value={metrics.avgHoursToAccept === null ? '—' : `${Math.round(metrics.avgHoursToAccept)} h`} hint={`${metrics.rejected} rechazadas · ${metrics.expired} vencidas`} />
      </div>
      {quotes.length === 0 ? (
        <p className="text-sm text-soft">Todavía no hay cotizaciones del Studio. Crea una desde aquí o con “Cotizar” en una oportunidad.</p>
      ) : (
        <Card className="divide-y divide-line">
          {quotes.map((q) => {
            const customer = customerSchema.safeParse(q.customer);
            const name = customer.success ? customer.data.company || customer.data.name : '';
            return (
              <Link key={q.id} href={`/cotizaciones/studio/${q.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3 text-sm hover:bg-ivory" data-studio-quote={q.number}>
                <span className="font-semibold text-carbon">{q.number}{q.version > 1 ? ` v${q.version}` : ''}</span>
                <span className="min-w-0 flex-1 truncate text-graphite">{q.title || 'Sin título'}{name ? ` · ${name}` : ''}</span>
                <span className="font-semibold">{formatMinor(q.totalMinor, q.currency)}</span>
                <Badge variant={QUOTE_STATUS[q.status]?.variant ?? 'outline'}>{QUOTE_STATUS[q.status]?.label ?? q.status}</Badge>
              </Link>
            );
          })}
        </Card>
      )}
    </section>
  );
}
