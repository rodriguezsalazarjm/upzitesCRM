import Link from 'next/link';
import { Plus } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { TutorialHint } from '@/components/tutorials/tutorial-hint';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Eyebrow } from '@/components/ui/eyebrow';
import { requireCurrentUser } from '@/lib/auth';
import { PlanLockedNotice } from '@/components/billing/plan-locked-notice';
import { STRATEGY_STATUS, formatWhen } from '@/components/followups/labels';
import { SendHoursCard } from '@/components/followups/send-hours-card';
import { StrategyActions } from '@/components/followups/strategy-actions';
import { listStrategies } from '@/lib/followups/service';
import { FOLLOW_UP_TRIGGERS, TRIGGER_LABEL } from '@/lib/followups/rules';
import { campaignMetrics } from '@/lib/marketing/campaigns';
import { DEFAULT_POLICY, getPolicy } from '@/lib/marketing/policy';
import { canManageMarketing } from '@/lib/marketing/roles';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const CAMPAIGN_STATUS: Record<string, { label: string; variant: 'success' | 'warning' | 'outline' }> = {
  DRAFT: { label: 'Borrador', variant: 'outline' },
  SCHEDULED: { label: 'Programada', variant: 'warning' },
  SENDING: { label: 'Enviando', variant: 'warning' },
  SENT: { label: 'Enviada', variant: 'success' },
  PAUSED: { label: 'Pausada', variant: 'outline' },
  CANCELED: { label: 'Cancelada', variant: 'outline' },
};

export default async function RecuperacionPage() {
  const user = await requireCurrentUser();
  const workspaceId = user.workspace.id;

  const canManage = canManageMarketing(user.role);
  const [strategies, segments, campaigns, policy, domains, suppressed] = await Promise.all([
    listStrategies(workspaceId),
    prisma.segment.findMany({
      where: { workspaceId },
      orderBy: [{ source: 'asc' }, { name: 'asc' }],
    }),
    prisma.campaign.findMany({ where: { workspaceId }, orderBy: { createdAt: 'desc' }, take: 10 }),
    getPolicy(workspaceId),
    prisma.emailDomain.findMany({ where: { workspaceId } }),
    prisma.suppressionEntry.count({ where: { workspaceId } }),
  ]);

  const campaignStats = await Promise.all(campaigns.map((campaign) => campaignMetrics(workspaceId, campaign.id)));
  const editableTriggers = FOLLOW_UP_TRIGGERS as readonly string[];

  const verifiedDomain = domains.find((domain) => domain.status === 'VERIFIED');

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Header
        title="Recuperación"
        subtitle="Seguimientos comerciales, segmentos y campañas, con consentimiento y límites"
      />

      <div className="flex-1 space-y-6 overflow-y-auto p-4 sm:p-6">
        <TutorialHint tutorialKey="recovery.first_visit" />
        <PlanLockedNotice workspaceId={user.workspace.id} feature="campaigns.journeys" />
        <PlanLockedNotice workspaceId={user.workspace.id} feature="recovery" />
        {!verifiedDomain && (
          <p className="rounded-xl bg-solar/20 p-4 text-sm text-warning-ink">
            Sin dominio de envio verificado. Las campanas de email no salen hasta que el dominio
            este verificado. Registralo en <code>POST /api/email/domains</code> y publica los
            registros DNS que devuelve. Los journeys de WhatsApp funcionan igual.
          </p>
        )}

        {/* El horario primero: es la razon por la que se puede confiar en lo
            que viene abajo. */}
        <section>
          <SendHoursCard
            canManage={canManage}
            policy={{
              timezone: policy.timezone,
              quietStartMinute: policy.quietStartMinute,
              quietEndMinute: policy.quietEndMinute,
              sendDays: policy.sendDays ?? DEFAULT_POLICY.sendDays,
              outOfHoursBehavior: policy.outOfHoursBehavior ?? 'POSTPONE',
              maxWhatsappPerDay: policy.maxWhatsappPerDay,
              maxConsecutiveNoReply: policy.maxConsecutiveNoReply,
            }}
          />
          <p className="mt-2 text-[11px] text-soft">
            Email: {policy.maxEmailPerWeek} por semana · multicanal el mismo día {policy.allowSameDayMultichannel ? 'permitido' : 'bloqueado'} · {suppressed} suprimidos que nunca reciben nada
          </p>
        </section>

        <section>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <Eyebrow>Estrategias de seguimiento ({strategies.length})</Eyebrow>
            {canManage && (
              <Button size="sm" asChild>
                <Link href="/recuperacion/nueva">
                  <Plus /> Nueva estrategia
                </Link>
              </Button>
            )}
          </div>
          {strategies.length === 0 ? (
            <Card className="p-8 text-center">
              <p className="text-sm font-medium text-graphite">Todavía no hay estrategias</p>
              <p className="mt-1 text-xs text-soft">Crea una para escribirle solo a quien consultó y no compró, no respondió o dejó un pago pendiente.</p>
            </Card>
          ) : (
            <Card className="divide-y divide-line">
              {strategies.map((strategy) => {
                const status = STRATEGY_STATUS[strategy.status] ?? { label: strategy.status, tone: 'outline' as const };
                return (
                  <div key={strategy.id} className="flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/recuperacion/${strategy.id}`} className="text-sm font-semibold text-carbon hover:underline">
                          {strategy.name}
                        </Link>
                        <Badge variant={status.tone}>{status.label}</Badge>
                        {strategy.simulate && <Badge variant="ai">Prueba</Badge>}
                      </div>
                      <p className="mt-0.5 text-[11px] text-soft">
                        {TRIGGER_LABEL[strategy.trigger] ?? strategy.trigger}
                        {strategy.product && ` · ${strategy.product.name}`} · {strategy.steps.length} pasos · máx. {strategy.maxMessages} mensajes
                      </p>
                      <p className="mt-0.5 text-[11px] text-graphite">
                        {strategy.stats.active} en curso · {strategy.stats.sent} enviados · {strategy.stats.replied} respondieron · {strategy.stats.purchases} compras
                        {strategy.stats.simulatedMessages > 0 && ` · ${strategy.stats.simulatedMessages} simulados`}
                        {' · '}próximo {formatWhen(strategy.nextRunAt)} · último {formatWhen(strategy.lastRunAt)}
                      </p>
                    </div>
                    {canManage && <StrategyActions compact id={strategy.id} status={strategy.status} simulate={strategy.simulate} editable={editableTriggers.includes(strategy.trigger)} />}
                  </div>
                );
              })}
            </Card>
          )}
        </section>

        <section>
          <Eyebrow className="mb-2">Segmentos ({segments.length})</Eyebrow>
          <Card className="divide-y divide-line">
            {segments.map((segment) => (
              <div key={segment.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-carbon">{segment.name}</p>
                  <p className="truncate text-[11px] text-soft">{segment.description}</p>
                </div>
                {segment.source === 'PRESET' && <Badge variant="outline">De fabrica</Badge>}
                <span className="w-20 text-right text-xs font-bold text-carbon">
                  {segment.estimatedCount}
                </span>
              </div>
            ))}
          </Card>
        </section>

        {campaignStats.filter(Boolean).length > 0 && (
          <section>
            <Eyebrow className="mb-2">Campanas</Eyebrow>
            <Card className="divide-y divide-line">
              {campaignStats.filter(Boolean).map((campaign) => (
                <div key={campaign!.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-carbon">{campaign!.name}</p>
                    <p className="text-[11px] text-soft">
                      {campaign!.sent} enviados · {campaign!.skipped} omitidos ·{' '}
                      {campaign!.openRate}% apertura · {campaign!.unsubscribed} bajas
                    </p>
                  </div>
                  <Badge variant={CAMPAIGN_STATUS[campaign!.status]?.variant ?? 'outline'}>
                    {CAMPAIGN_STATUS[campaign!.status]?.label ?? campaign!.status}
                  </Badge>
                </div>
              ))}
            </Card>
          </section>
        )}
      </div>
    </div>
  );
}
