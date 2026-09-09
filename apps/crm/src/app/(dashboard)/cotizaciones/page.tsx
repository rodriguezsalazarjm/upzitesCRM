import { Header } from '@/components/layout/header';
import { Card, CardContent } from '@/components/ui/card';
import { requireCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { canApproveQuotes, pendingApprovals } from '@/lib/quotes/service';
import { parseIntakeSchema } from '@/lib/quotes/schema';
import { AprobacionesClient, type PendingQuoteView } from './aprobaciones-client';
import { HistorialClient } from './historial-client';

export const dynamic = 'force-dynamic';

const STATUS: Record<string, { label: string; variant: 'success' | 'warning' | 'outline' }> = {
  DRAFT: { label: 'Borrador', variant: 'outline' },
  CALCULATED: { label: 'Calculada', variant: 'warning' },
  PENDING_HUMAN_REVIEW: { label: 'En revision', variant: 'warning' },
  APPROVED: { label: 'Aprobada', variant: 'success' },
  SENT: { label: 'Enviada', variant: 'success' },
  ACCEPTED: { label: 'Aceptada', variant: 'success' },
  REJECTED: { label: 'Rechazada', variant: 'outline' },
  EXPIRED: { label: 'Vencida', variant: 'outline' },
};

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
      select: { id: true, serviceKey: true, name: true, intakeSchema: true, status: true, version: true },
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
          <Card className="border-0 bg-blue-50 shadow-sm">
            <CardContent className="p-5">
              <p className="text-sm font-semibold text-slate-900">
                No hay servicios cotizables configurados
              </p>
              <p className="mt-1 text-xs text-slate-600">
                Sin reglas de precio publicadas, el agente reconoce que no puede cotizar y deriva
                a una persona. Configura un servicio en <code>POST /api/pricing-rule-sets</code> y
                publicalo.
              </p>
            </CardContent>
          </Card>
        )}

        <section>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
            Esperando revision ({queue.length})
          </p>
          <AprobacionesClient quotes={queue} canApprove={canApproveQuotes(user.role)} />
        </section>

        {recent.length > 0 && (
          <section>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
              Historial
            </p>
            <HistorialClient
              quotes={recent.map((quote) => ({
                id: quote.id,
                number: quote.number,
                version: quote.version,
                contactName: quote.contact
                  ? `${quote.contact.firstName} ${quote.contact.lastName}`.trim()
                  : 'Sin contacto',
                status: quote.status,
                statusLabel: STATUS[quote.status]?.label ?? quote.status,
                statusVariant: STATUS[quote.status]?.variant ?? 'outline',
                total: quote.total,
              }))}
              canManage={canApproveQuotes(user.role)}
            />
          </section>
        )}
      </div>
    </div>
  );
}
