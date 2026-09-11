import { Header } from '@/components/layout/header';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { requireCurrentUser } from '@/lib/auth';
import { campaignMetrics, journeyMetrics } from '@/lib/marketing/campaigns';
import { getPolicy } from '@/lib/marketing/policy';
import { canManageMarketing } from '@/lib/marketing/roles';
import { prisma } from '@/lib/prisma';
import { JourneysClient, type JourneyView } from './journeys-client';

export const dynamic = 'force-dynamic';

const JOURNEY_STATUS: Record<string, { label: string; variant: 'success' | 'warning' | 'outline' }> = {
  DRAFT: { label: 'Borrador', variant: 'outline' },
  PUBLISHED: { label: 'Activo', variant: 'success' },
  PAUSED: { label: 'Pausado', variant: 'warning' },
  ARCHIVED: { label: 'Archivado', variant: 'outline' },
};

const CAMPAIGN_STATUS: Record<string, { label: string; variant: 'success' | 'warning' | 'outline' }> = {
  DRAFT: { label: 'Borrador', variant: 'outline' },
  SCHEDULED: { label: 'Programada', variant: 'warning' },
  SENDING: { label: 'Enviando', variant: 'warning' },
  SENT: { label: 'Enviada', variant: 'success' },
  PAUSED: { label: 'Pausada', variant: 'outline' },
  CANCELED: { label: 'Cancelada', variant: 'outline' },
};

function formatMinute(minute: number) {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}

export default async function RecuperacionPage() {
  const user = await requireCurrentUser();
  const workspaceId = user.workspace.id;

  const [journeys, segments, campaigns, policy, domains, suppressed] = await Promise.all([
    prisma.journey.findMany({
      where: { workspaceId },
      orderBy: { name: 'asc' },
      include: { _count: { select: { steps: true } } },
    }),
    prisma.segment.findMany({
      where: { workspaceId },
      orderBy: [{ source: 'asc' }, { name: 'asc' }],
    }),
    prisma.campaign.findMany({ where: { workspaceId }, orderBy: { createdAt: 'desc' }, take: 10 }),
    getPolicy(workspaceId),
    prisma.emailDomain.findMany({ where: { workspaceId } }),
    prisma.suppressionEntry.count({ where: { workspaceId } }),
  ]);

  const [journeyStats, campaignStats] = await Promise.all([
    Promise.all(journeys.map((journey) => journeyMetrics(workspaceId, journey.id))),
    Promise.all(campaigns.map((campaign) => campaignMetrics(workspaceId, campaign.id))),
  ]);

  const statsById = new Map(journeyStats.filter(Boolean).map((stat) => [stat!.id, stat!]));

  const journeyViews: JourneyView[] = journeys.map((journey) => {
    const stats = statsById.get(journey.id);
    return {
      id: journey.id,
      name: journey.name,
      description: journey.description,
      trigger: journey.trigger,
      status: journey.status,
      statusLabel: JOURNEY_STATUS[journey.status]?.label ?? journey.status,
      statusVariant: JOURNEY_STATUS[journey.status]?.variant ?? 'outline',
      steps: journey._count.steps,
      active: stats?.active ?? 0,
      completed: stats?.completed ?? 0,
      exited: stats?.exited ?? 0,
      recoveryRate: stats?.recoveryRate ?? 0,
    };
  });

  const verifiedDomain = domains.find((domain) => domain.status === 'VERIFIED');

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Header
        title="Recuperacion"
        subtitle="Journeys, segmentos y campanas: seguimiento con consentimiento y limites"
      />

      <div className="flex-1 space-y-6 overflow-y-auto p-6">
        {!verifiedDomain && (
          <Card className="border-0 bg-blue-50 shadow-sm">
            <CardContent className="p-5">
              <p className="text-sm font-semibold text-slate-900">
                Sin dominio de envio verificado
              </p>
              <p className="mt-1 text-xs text-slate-600">
                Las campanas de email no salen hasta que el dominio este verificado. Registralo en{' '}
                <code>POST /api/email/domains</code> y publica los registros DNS que devuelve. Los
                journeys de WhatsApp funcionan igual.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Los limites primero: son la razon por la que se puede confiar en lo
            que viene abajo. */}
        <section>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
            Limites de contacto
          </p>
          <Card className="border-0 shadow-sm">
            <CardContent className="grid grid-cols-2 gap-4 p-5 md:grid-cols-5">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-slate-400">Sin envios</p>
                <p className="text-sm font-bold text-slate-900">
                  {formatMinute(policy.quietStartMinute)} a {formatMinute(policy.quietEndMinute)}
                </p>
                <p className="text-[11px] text-slate-500">{policy.timezone}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-slate-400">WhatsApp</p>
                <p className="text-sm font-bold text-slate-900">{policy.maxWhatsappPerDay} / dia</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-slate-400">Email</p>
                <p className="text-sm font-bold text-slate-900">{policy.maxEmailPerWeek} / semana</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-slate-400">Multicanal</p>
                <p className="text-sm font-bold text-slate-900">
                  {policy.allowSameDayMultichannel ? 'Permitido' : 'Bloqueado'}
                </p>
                <p className="text-[11px] text-slate-500">el mismo dia</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-slate-400">Suprimidos</p>
                <p className="text-sm font-bold text-slate-900">{suppressed}</p>
                <p className="text-[11px] text-slate-500">nunca reciben nada</p>
              </div>
            </CardContent>
          </Card>
        </section>

        <section>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
            Journeys ({journeys.length})
          </p>
          <JourneysClient journeys={journeyViews} canManage={canManageMarketing(user.role)} />
        </section>

        <section>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
            Segmentos ({segments.length})
          </p>
          <Card className="border-0 shadow-sm">
            <CardContent className="divide-y p-0">
              {segments.map((segment) => (
                <div key={segment.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-slate-800">{segment.name}</p>
                    <p className="truncate text-[11px] text-slate-500">{segment.description}</p>
                  </div>
                  {segment.source === 'PRESET' && <Badge variant="outline">De fabrica</Badge>}
                  <span className="w-20 text-right text-xs font-bold text-slate-900">
                    {segment.estimatedCount}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>

        {campaignStats.filter(Boolean).length > 0 && (
          <section>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
              Campanas
            </p>
            <Card className="border-0 shadow-sm">
              <CardContent className="divide-y p-0">
                {campaignStats.filter(Boolean).map((campaign) => (
                  <div key={campaign!.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-slate-800">{campaign!.name}</p>
                      <p className="text-[11px] text-slate-500">
                        {campaign!.sent} enviados · {campaign!.skipped} omitidos ·{' '}
                        {campaign!.openRate}% apertura · {campaign!.unsubscribed} bajas
                      </p>
                    </div>
                    <Badge variant={CAMPAIGN_STATUS[campaign!.status]?.variant ?? 'outline'}>
                      {CAMPAIGN_STATUS[campaign!.status]?.label ?? campaign!.status}
                    </Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          </section>
        )}
      </div>
    </div>
  );
}
