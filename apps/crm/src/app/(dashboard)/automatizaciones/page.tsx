import { Activity, AlertTriangle, Power, Workflow } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { StatCard } from '@/components/ui/stat-card';
import { FlowsSection, type FlowView } from '@/components/automations/flows-section';
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

  const flowViews: FlowView[] = flows.map((flow) => {
    const version = flow.versions[0];
    return {
      id: flow.id,
      name: flow.name,
      description: flow.description,
      status: flow.status,
      channelScope: flow.channelScope,
      version: version
        ? {
            version: version.version,
            status: version.status,
            runsStarted: version.runsStarted,
            runsCompleted: version.runsCompleted,
            runsFailed: version.runsFailed,
            messagesSent: version.messagesSent,
          }
        : null,
      totalRuns: flow._count.runs,
    };
  });

  const activeRules = ruleViews.filter((rule) => rule.isActive).length;
  const publishedFlows = flowViews.filter((flow) => flow.status === 'PUBLISHED').length;
  const totalRuns =
    ruleViews.reduce((sum, rule) => sum + rule.runCount, 0) + flowViews.reduce((sum, flow) => sum + flow.totalRuns, 0);
  const failedRuns = flowViews.reduce((sum, flow) => sum + (flow.version?.runsFailed ?? 0), 0);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Header
        title="Automatizaciones"
        subtitle="Reglas que corren solas: cuando pasa algo, el CRM actua"
      />
      <div className="min-h-0 flex-1 space-y-8 overflow-y-auto px-4 pb-8 pt-2 sm:px-8">
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <StatCard
            size="sm"
            label="Reglas activas"
            value={`${activeRules}/${ruleViews.length}`}
            icon={Power}
            accent={activeRules > 0 ? 'lime' : undefined}
          />
          <StatCard
            size="sm"
            label="Flujos publicados"
            value={publishedFlows}
            hint={`de ${flowViews.length}`}
            icon={Workflow}
          />
          <StatCard size="sm" label="Ejecuciones" value={totalRuns} icon={Activity} />
          <StatCard
            size="sm"
            tone={failedRuns > 0 ? 'dark' : 'default'}
            label="Fallidas"
            value={failedRuns}
            icon={AlertTriangle}
            accent={failedRuns > 0 ? 'tomato' : undefined}
          />
        </div>

        <AutomatizacionesClient
          rules={ruleViews}
          presets={presets}
          canManage={canManageChannels(user.role)}
        />

        <FlowsSection flows={flowViews} />
      </div>
    </div>
  );
}
