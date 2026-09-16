import Link from 'next/link';
import { Header } from '@/components/layout/header';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChannelBadge } from '@/components/channels/channel-badge';
import { requireCurrentUser } from '@/lib/auth';
import { canManageChannels } from '@/lib/conversations';
import { AUTOMATION_PRESETS } from '@/lib/automation/presets';
import { parseActions, parseConditions, isGroup, type Condition, type ConditionGroup } from '@/lib/automation/schema';
import { prisma } from '@/lib/prisma';
import { AutomatizacionesClient, type PresetView, type RuleView } from './automatizaciones-client';

export const dynamic = 'force-dynamic';

const OPERATOR_LABEL: Record<string, string> = {
  eq: 'es',
  neq: 'no es',
  in: 'esta en',
  not_in: 'no esta en',
  gt: 'mayor que',
  gte: 'mayor o igual a',
  lt: 'menor que',
  lte: 'menor o igual a',
  contains: 'contiene',
  is_empty: 'esta vacio',
  is_not_empty: 'tiene valor',
};

/** Traduce las condiciones a frases legibles para la tarjeta de la regla. */
function summarizeConditions(group: ConditionGroup | null): string[] {
  if (!group) return ['condiciones invalidas'];

  const describe = (node: Condition | ConditionGroup): string => {
    if (isGroup(node)) {
      const inner = node.rules.map(describe);
      return inner.length === 0 ? '' : `(${inner.join(node.match === 'ALL' ? ' y ' : ' o ')})`;
    }
    const operator = OPERATOR_LABEL[node.operator] ?? node.operator;
    const value = Array.isArray(node.value) ? node.value.join(', ') : node.value;
    return value === undefined ? `${node.field} ${operator}` : `${node.field} ${operator} ${value}`;
  };

  return group.rules.map(describe).filter(Boolean);
}

function summarizeActions(actions: ReturnType<typeof parseActions>): string[] {
  if (!actions) return ['acciones invalidas'];

  return actions.map((action) => {
    switch (action.type) {
      case 'CREATE_TASK':
        return `Crear tarea "${action.title}"`;
      case 'SEND_MESSAGE':
        return 'Enviar mensaje';
      case 'SCHEDULE_ACTION':
        return `Programar ${action.actionType} en ${action.delayHours} h`;
      case 'CANCEL_ACTIONS':
        return 'Cancelar acciones pendientes';
      case 'ADD_TAG':
        return `Etiquetar "${action.tag}"`;
      case 'REMOVE_TAG':
        return `Quitar etiqueta "${action.tag}"`;
      case 'MOVE_OPPORTUNITY':
        return `Mover a ${action.stageKey}`;
      case 'SET_LIFECYCLE':
        return `Marcar como ${action.status}`;
      case 'ASSIGN_CONVERSATION':
        return 'Asignar conversacion';
      case 'RECALCULATE_SCORE':
        return 'Recalcular score';
      case 'CREATE_INSIGHT':
        return 'Crear insight';
      case 'RUN_AGENT':
        return 'Ejecutar agente (Fase 4)';
      default:
        return 'Accion';
    }
  });
}

export default async function AutomatizacionesPage() {
  const user = await requireCurrentUser();

  const rules = await prisma.automationRule.findMany({
    where: { workspaceId: user.workspace.id },
    orderBy: { createdAt: 'asc' },
  });

  const flows = await prisma.automationFlow.findMany({
    where: { workspaceId: user.workspace.id },
    orderBy: { createdAt: 'desc' },
    include: {
      versions: { orderBy: { version: 'desc' }, take: 1 },
      _count: { select: { runs: true } },
    },
  });

  const ruleViews: RuleView[] = rules.map((rule) => ({
    id: rule.id,
    name: rule.name,
    description: rule.description,
    trigger: rule.trigger,
    isActive: rule.isActive,
    actionSummary: summarizeActions(parseActions(rule.actions)),
    conditionSummary: summarizeConditions(parseConditions(rule.conditions)),
    dedupeMinutes: rule.dedupeMinutes,
    runCount: rule.runCount,
    lastRunAt: rule.lastRunAt?.toISOString() ?? null,
  }));

  const existingNames = new Set(rules.map((rule) => rule.name));
  const presets: PresetView[] = AUTOMATION_PRESETS.map((preset) => ({
    key: preset.key,
    name: preset.name,
    description: preset.description,
    trigger: preset.trigger,
    alreadyAdded: existingNames.has(preset.name),
  }));

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Header
        title="Automatizaciones"
        subtitle="Reglas que corren solas: cuando pasa algo, el CRM actua"
      />
      <div className="flex-1 overflow-y-auto p-6 space-y-8">
        <AutomatizacionesClient
          rules={ruleViews}
          presets={presets}
          canManage={canManageChannels(user.role)}
        />

        <section>
          <div className="mb-4 flex items-center justify-between"><h2 className="text-xl font-semibold">Mis automatizaciones</h2><Link href="/automatizaciones/nueva" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white">Nueva automatización / Plantillas</Link></div>
          <div className="mb-3">
            <h2 className="text-sm font-semibold text-slate-900">Flujos multicanal (Beta)</h2>
            <p className="text-xs text-slate-500">
              Crea, configura y publica flujos desde el editor visual.
            </p>
          </div>
          {flows.length === 0 ? (
            <Card className="border-0 border-dashed shadow-sm">
              <CardContent className="p-6 text-center text-xs text-slate-500">
                Todavía no hay flujos multicanal creados en este workspace.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {flows.map((flow) => {
                const version = flow.versions[0];
                return (
                  <Card key={flow.id} className="border-0 shadow-sm">
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between gap-3">
                        <CardTitle className="text-sm"><Link href={`/automatizaciones/${flow.id}`} className="text-indigo-700">{flow.name} → Abrir Builder</Link></CardTitle>
                        <Badge variant={flow.status === 'PUBLISHED' ? 'success' : flow.status === 'DRAFT' ? 'outline' : 'warning'}>
                          {flow.status === 'PUBLISHED' ? 'Publicado' : flow.status === 'DRAFT' ? 'Borrador' : 'Archivado'}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2 text-xs text-slate-500">
                      {flow.description && <p>{flow.description}</p>}
                      <div className="flex flex-wrap gap-1.5">
                        {flow.channelScope.length === 0 ? (
                          <Badge variant="outline" className="text-[10px]">Cualquier canal</Badge>
                        ) : (
                          flow.channelScope.map((channel) => <ChannelBadge key={channel} channel={channel} />)
                        )}
                      </div>
                      <p>Versión: {version ? `v${version.version} (${version.status === 'PUBLISHED' ? 'publicada' : 'borrador'})` : 'sin versiones'}</p>
                      {version && (
                        <p>
                          Runs: {version.runsStarted} iniciados · {version.runsCompleted} completados ·{' '}
                          {version.runsFailed} fallidos · {version.messagesSent} mensajes enviados
                        </p>
                      )}
                      <p>Ejecuciones totales registradas: {flow._count.runs}</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
