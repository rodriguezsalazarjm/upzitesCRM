import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Eyebrow } from '@/components/ui/eyebrow';
import { EnrollmentHistory } from '@/components/followups/enrollment-history';
import { STRATEGY_STATUS } from '@/components/followups/labels';
import { StrategyActions } from '@/components/followups/strategy-actions';
import { StrategyEditor, type StrategyDraft } from '@/components/followups/strategy-editor';
import { TestEnroll } from '@/components/followups/test-enroll';
import { requireCurrentUser } from '@/lib/auth';
import { ACTION_LABEL, FOLLOW_UP_TRIGGERS, TRIGGER_LABEL, formatDelay, stepScheduleLabel, type FollowUpTrigger } from '@/lib/followups/rules';
import { FollowUpError, getStrategy } from '@/lib/followups/service';
import { canManageMarketing } from '@/lib/marketing/roles';
import { prisma } from '@/lib/prisma';
import { templateOptions } from '@/lib/whatsapp/template-options';
import { TEMPLATE_STATUS_LABEL } from '@/lib/whatsapp/template-rules';

export const dynamic = 'force-dynamic';

const EDITABLE_ACTIONS = ['SEND_WHATSAPP', 'SEND_INSTAGRAM', 'CREATE_TASK'];

export default async function StrategyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ editar?: string }>;
}) {
  const [{ id }, { editar }] = await Promise.all([params, searchParams]);
  const user = await requireCurrentUser();
  const workspaceId = user.workspace.id;
  const canManage = canManageMarketing(user.role);

  const strategy = await getStrategy(workspaceId, id).catch((error) => {
    if (error instanceof FollowUpError && error.status === 404) return null;
    throw error;
  });
  if (!strategy) notFound();

  const editable =
    (FOLLOW_UP_TRIGGERS as readonly string[]).includes(strategy.trigger) &&
    strategy.steps.every((step) => EDITABLE_ACTIONS.includes(step.action));
  const editing = canManage && editable && editar === '1' && (strategy.status === 'DRAFT' || strategy.status === 'PAUSED');

  const [products, contacts, templates] = await Promise.all([
    editing ? prisma.product.findMany({ where: { workspaceId }, orderBy: { name: 'asc' }, select: { id: true, name: true } }) : [],
    canManage && strategy.simulate
      ? prisma.contact.findMany({
          where: { workspaceId, journeyEnrollments: { none: { journeyId: id } } },
          orderBy: { updatedAt: 'desc' },
          take: 50,
          select: { id: true, firstName: true, lastName: true },
        })
      : [],
    editing ? templateOptions(workspaceId) : [],
  ]);

  const status = STRATEGY_STATUS[strategy.status] ?? { label: strategy.status, tone: 'outline' as const };
  const stats = strategy.stats;
  const metrics = [
    { label: 'Iniciados', value: stats.started },
    { label: 'En curso', value: stats.active },
    { label: 'Programados', value: stats.scheduled },
    { label: 'Enviados', value: stats.sent },
    { label: 'Respondieron', value: stats.replied },
    { label: 'Compras vinculadas', value: stats.purchases },
    { label: 'Cancelados o detenidos', value: stats.canceled },
    { label: 'Errores y bloqueos', value: stats.errors },
  ];

  const draft: StrategyDraft = {
    name: strategy.name,
    description: strategy.description ?? '',
    trigger: strategy.trigger as FollowUpTrigger,
    productId: strategy.productId,
    maxMessages: strategy.maxMessages,
    minGapHours: strategy.minGapHours,
    simulate: strategy.simulate,
    steps: strategy.steps.map((step) => ({
      label: step.label,
      action: step.action as StrategyDraft['steps'][number]['action'],
      delayHours: step.delayHours,
      messageMode: step.messageMode,
      body: step.body ?? '',
      aiGoal: step.aiGoal ?? '',
      whatsappTemplateId: step.whatsappTemplateId ?? null,
    })),
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Header title={strategy.name} subtitle={TRIGGER_LABEL[strategy.trigger] ?? strategy.trigger} />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="mx-auto max-w-5xl space-y-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="space-y-2">
              <Button variant="ghost" size="sm" asChild className="-ml-3">
                <Link href="/recuperacion">
                  <ArrowLeft strokeWidth={1.75} /> Volver a recuperación
                </Link>
              </Button>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={status.tone}>{status.label}</Badge>
                {strategy.simulate ? <Badge variant="ai">Modo prueba: no se envía nada</Badge> : <Badge variant="outline">Envíos reales</Badge>}
                {strategy.product && <Badge variant="neutral">{strategy.product.name}</Badge>}
                {strategy.planLimitedAt && <Badge variant="warning">Limitada por el plan</Badge>}
              </div>
              {strategy.description && <p className="text-sm text-graphite">{strategy.description}</p>}
            </div>
            {canManage && <StrategyActions id={strategy.id} status={strategy.status} simulate={strategy.simulate} editable={editable} />}
          </div>

          {editing ? (
            <StrategyEditor strategyId={strategy.id} initial={draft} products={products} workspaceName={user.workspace.name} templates={templates} />
          ) : (
            <>
              <section>
                <Eyebrow className="mb-2">Resultados con envíos reales</Eyebrow>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {metrics.map((metric) => (
                    <Card key={metric.label} className="p-4">
                      <p className="text-[11px] text-soft">{metric.label}</p>
                      <p className="text-xl font-bold text-carbon">{metric.value}</p>
                    </Card>
                  ))}
                </div>
                {stats.simulatedStarted > 0 && (
                  <p className="mt-2 text-[11px] text-soft">
                    Actividad de prueba, aparte: {stats.simulatedStarted} inscripciones y {stats.simulatedMessages} mensajes simulados.
                  </p>
                )}
                <p className="mt-1 text-[11px] text-soft">
                  Una compra solo se vincula si un pago confirmado detuvo la secuencia después de que esta enviara al menos un mensaje.
                </p>
              </section>

              <section>
                <Eyebrow className="mb-2">
                  Pasos · máx. {strategy.maxMessages} mensajes · {strategy.minGapHours > 0 ? `separación mínima de ${formatDelay(strategy.minGapHours)}` : 'sin separación mínima'}
                </Eyebrow>
                <Card className="divide-y divide-line">
                  {strategy.steps.map((step, index) => (
                    <div key={step.id} className="flex gap-3 px-4 py-3 sm:gap-4">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-carbon text-[11px] font-bold text-canvas">
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-carbon">
                          {step.label} · {ACTION_LABEL[step.action] ?? step.action}
                          {step.messageMode === 'AI' && ' · IA'}
                        </p>
                        <p className="text-[11px] text-soft">{stepScheduleLabel(index, step.delayHours, strategy.trigger)}</p>
                        {step.messageMode === 'AI' && step.aiGoal && <p className="mt-1 text-[11px] text-graphite">Objetivo: {step.aiGoal}</p>}
                        {step.body && <p className="mt-1 whitespace-pre-wrap text-xs text-graphite">{step.body}</p>}
                        {step.action === 'SEND_WHATSAPP' && (
                          <p className="mt-1 text-[11px] text-soft" data-step-template>
                            Fuera de la ventana de 24 h:{' '}
                            {step.whatsappTemplate
                              ? `plantilla ${step.whatsappTemplate.name} (${step.whatsappTemplate.language}) · ${TEMPLATE_STATUS_LABEL[step.whatsappTemplate.status]}`
                              : 'sin plantilla, el paso se bloquea'}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </Card>
                {!editable && (
                  <p className="mt-2 text-[11px] text-soft">
                    Este journey usa pasos o disparadores del motor anterior: se puede activar, pausar o duplicar, pero no editar aquí.
                  </p>
                )}
              </section>

              {canManage && strategy.simulate && strategy.status === 'PUBLISHED' && (
                <section>
                  <Eyebrow className="mb-2">Probar con un contacto</Eyebrow>
                  <Card className="p-4">
                    <TestEnroll
                      strategyId={strategy.id}
                      contacts={contacts.map((contact) => ({ id: contact.id, name: `${contact.firstName} ${contact.lastName}`.trim() }))}
                    />
                    <p className="mt-2 text-[11px] text-soft">
                      En prueba puedes adelantar cada paso con “Ejecutar paso ahora”. Horario, límites, ventana de 24 h y condiciones de parada se aplican igual.
                    </p>
                  </Card>
                </section>
              )}

              <section>
                <Eyebrow className="mb-2">Historial ({strategy.enrollments.length})</Eyebrow>
                <Card>
                  <EnrollmentHistory rows={strategy.enrollments} canManage={canManage} emptyText="Todavía nadie entró a esta estrategia." />
                </Card>
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
