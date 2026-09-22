import { Header } from '@/components/layout/header';
import { Eyebrow } from '@/components/ui/eyebrow';
import { requireCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { canApproveQuotes, pendingApprovals } from '@/lib/quotes/service';
import { parseIntakeSchema } from '@/lib/quotes/schema';
import { quoteStatusLabel, quoteStatusTone } from '@/lib/status-tone';
import { AprobacionesClient, type PendingQuoteView } from './aprobaciones-client';
import { HistorialClient } from './historial-client';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function CotizacionesPage() {
  const user = await requireCurrentUser();

  const [pending, recent, ruleSets] = await Promise.all([
    pendingApprovals(user.workspace.id),
    prisma.quote.findMany({
      where: { workspaceId: user.workspace.id, status: { notIn: ['PENDING_HUMAN_REVIEW'] } },
      include: { contact: { select: { firstName: true, lastName: true } } },
      orderBy: { createdAt: 'desc' },
      take: 40,
    }),
    prisma.pricingRuleSet.findMany({
      where: { workspaceId: user.workspace.id },
      select: {
        id: true,
        serviceKey: true,
        name: true,
        intakeSchema: true,
        status: true,
        version: true,
      },
    }),
  ]);

  const ruleSetById = new Map(ruleSets.map((set) => [set.id, set]));

  const queue: PendingQuoteView[] = pending.map(({ request, quote }) => {
    const set = ruleSetById.get(quote!.ruleSetId);
    const intake = parseIntakeSchema(set?.intakeSchema);
    const inputs = quote!.inputs as Record<string, unknown>;

    return {
      quoteId: quote!.id,
      number: quote!.number,
      version: quote!.version,
      contactName: quote!.contact
        ? `${quote!.contact.firstName} ${quote!.contact.lastName}`.trim()
        : 'Sin contacto',
      serviceName: set?.name ?? quote!.serviceKey,
      total: quote!.total,
      currency: quote!.currency,
      createdAt: quote!.createdAt.toISOString(),
      requestedNote: request.requestedNote,
      lines: quote!.lines.map((line) => ({
        label: line.label,
        detail: line.detail,
        amount: line.amount,
      })),
      inputs: (intake?.fields ?? [])
        .filter((field) => inputs[field.key] !== undefined)
        .map((field) => ({
          label: field.label,
          value: `${inputs[field.key]}${field.unit ? ` ${field.unit}` : ''}`,
        })),
      previousTotal: quote!.parent?.total ?? null,
    };
  });

  const published = ruleSets.filter((set) => set.status === 'PUBLISHED');

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Header
        title="Cotizaciones"
        subtitle="Cola de revision: nada se envia al cliente sin aprobacion humana"
      />
      <div className="flex-1 space-y-6 overflow-y-auto p-6">
        {published.length === 0 && (
          <p className="rounded-xl bg-solar/20 p-4 text-sm text-warning-ink">
            No hay servicios cotizables configurados. Sin precios publicados, el CRM deriva la
            solicitud a una persona en vez de inventar un valor.{' '}
            <Link href="/configuracion#servicios-precios" className="font-semibold underline">
              Configurar servicios y precios
            </Link>
          </p>
        )}

        <section>
          <Eyebrow className="mb-2">Esperando revision ({queue.length})</Eyebrow>
          <AprobacionesClient quotes={queue} canApprove={canApproveQuotes(user.role)} />
        </section>

        {recent.length > 0 && (
          <section>
            <Eyebrow className="mb-2">Historial</Eyebrow>
            <HistorialClient
              quotes={recent.map((quote) => ({
                id: quote.id,
                number: quote.number,
                version: quote.version,
                contactName: quote.contact
                  ? `${quote.contact.firstName} ${quote.contact.lastName}`.trim()
                  : 'Sin contacto',
                status: quote.status,
                statusLabel: quoteStatusLabel[quote.status] ?? quote.status,
                statusTone: quoteStatusTone[quote.status] ?? 'neutral',
                total: quote.total,
                createdAt: quote.createdAt.toISOString(),
                validUntil: quote.validUntil?.toISOString() ?? null,
              }))}
              canManage={canApproveQuotes(user.role)}
            />
          </section>
        )}
      </div>
    </div>
  );
}
