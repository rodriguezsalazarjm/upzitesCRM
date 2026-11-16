import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Eyebrow } from '@/components/ui/eyebrow';
import { ACTION_LABEL, NODE_LABEL } from '@/components/automations/flow-node-meta';
import { TRIGGERS } from '@/lib/automations/catalog';
import type { FlowNode } from '@/lib/automations/schema';

/**
 * P12 — ejecuciones legibles: metricas por version, versiones y la traza paso a
 * paso que el motor ya guarda en `state.timeline`. El JSON crudo queda en
 * "Datos técnicos" para soporte.
 */

const RUN_STATUS: Record<string, { label: string; tone: 'success' | 'warning' | 'danger' | 'info' | 'outline' }> = {
  RUNNING: { label: 'En curso', tone: 'info' },
  WAITING: { label: 'Esperando', tone: 'warning' },
  COMPLETED: { label: 'Completada', tone: 'success' },
  FAILED: { label: 'Falló', tone: 'danger' },
  CANCELLED: { label: 'Cancelada', tone: 'outline' },
};
const STEP_RESULT: Record<string, string> = { CONTINUE: 'ok', WAIT: 'en espera', END: 'fin', HANDOFF: 'pasó a una persona', ERROR: 'error' };
const VERSION_STATUS: Record<string, string> = { DRAFT: 'Borrador', PUBLISHED: 'Publicada', ARCHIVED: 'Archivada' };

type Version = {
  id: string; version: number; status: string; nodes: unknown; updatedAt: Date;
  runsStarted: number; runsCompleted: number; runsFailed: number; messagesSent: number; checkoutsCreated: number; handoffs: number;
};
type Run = {
  id: string; status: string; channel: string | null; startedAt: Date; endedAt: Date | null; waitingUntil: Date | null; error: string | null; state: unknown;
  flowVersionId: string; contact: { firstName: string; lastName: string | null } | null; flowVersion: { trigger: unknown };
};

const when = (date: Date | null) => (date ? date.toLocaleString('es-CL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');

function stepLabel(nodes: FlowNode[], nodeId: string, type: string) {
  const node = nodes.find((item) => item.id === nodeId);
  if (node?.type === 'ACTION') return ACTION_LABEL[node.action] ?? node.action;
  if (node?.type === 'MESSAGE') return `${NODE_LABEL.MESSAGE}: “${node.text.slice(0, 60)}”`;
  return NODE_LABEL[type as keyof typeof NODE_LABEL] ?? type;
}

export function FlowRuns({ versions, runs }: { versions: Version[]; runs: Run[] }) {
  const sum = (key: 'runsStarted' | 'runsCompleted' | 'runsFailed' | 'messagesSent' | 'checkoutsCreated' | 'handoffs') => versions.reduce((n, v) => n + v[key], 0);
  const metrics = [
    ['Ejecuciones', sum('runsStarted')], ['Completadas', sum('runsCompleted')], ['Fallidas', sum('runsFailed')],
    ['Mensajes enviados', sum('messagesSent')], ['Checkouts creados', sum('checkoutsCreated')], ['Derivadas a persona', sum('handoffs')],
  ] as const;
  const nodesOf = new Map(versions.map((v) => [v.id, (Array.isArray(v.nodes) ? v.nodes : []) as FlowNode[]]));

  return (
    <section className="mt-8 space-y-5">
      <div className="space-y-2">
        <Eyebrow>Resultados</Eyebrow>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {metrics.map(([label, value]) => (
            <Card key={label} className="p-3"><p className="text-[11px] text-soft">{label}</p><p className="text-lg font-semibold text-carbon">{value}</p></Card>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Eyebrow>Versiones</Eyebrow>
        <Card className="divide-y divide-mist">
          {versions.map((v) => (
            <div key={v.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-xs">
              <span className="font-semibold text-carbon">v{v.version} · {VERSION_STATUS[v.status] ?? v.status}</span>
              <span className="text-graphite">{v.runsStarted} ejecuciones · {v.runsFailed} fallidas · editada {when(v.updatedAt)}</span>
            </div>
          ))}
        </Card>
      </div>

      <div className="space-y-2">
        <Eyebrow>Ejecuciones recientes</Eyebrow>
        {runs.length === 0 && <Card className="p-4 text-sm text-graphite">Aún no hay ejecuciones. Publica el flujo y espera un evento del canal.</Card>}
        {runs.map((run) => {
          const status = RUN_STATUS[run.status] ?? { label: run.status, tone: 'outline' as const };
          const trigger = TRIGGERS.find((t) => t.type === (run.flowVersion.trigger as { type?: string }).type)?.label ?? (run.flowVersion.trigger as { type?: string }).type;
          const timeline = (((run.state as { timeline?: unknown })?.timeline ?? []) as { nodeId: string; type: string; result: string; at: string }[]);
          const nodes = nodesOf.get(run.flowVersionId) ?? [];
          return (
            <details key={run.id} className="rounded-2xl border border-mist bg-paper p-4">
              <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm text-carbon">
                <Badge variant={status.tone}>{status.label}</Badge>
                <span className="font-semibold">{run.contact ? `${run.contact.firstName} ${run.contact.lastName ?? ''}` : 'Sin contacto'}</span>
                <span className="text-xs text-graphite">{trigger} · {run.channel ?? '—'} · {when(run.startedAt)}</span>
              </summary>
              <div className="mt-3 space-y-3 text-xs">
                <ol className="space-y-1">
                  {timeline.map((step, index) => (
                    <li key={`${step.nodeId}-${index}`} className={step.result === 'ERROR' ? 'text-danger-ink' : 'text-graphite'}>
                      {index + 1}. {stepLabel(nodes, step.nodeId, step.type)} — {STEP_RESULT[step.result] ?? step.result} · {when(new Date(step.at))}
                    </li>
                  ))}
                  {timeline.length === 0 && <li className="text-soft">Sin pasos registrados.</li>}
                </ol>
                {run.error && <p className="text-danger-ink">Motivo: {run.error}</p>}
                {run.waitingUntil && run.status === 'WAITING' && <p className="text-graphite">Sigue el {when(run.waitingUntil)}.</p>}
                <details>
                  <summary className="cursor-pointer text-soft">Datos técnicos</summary>
                  <p className="mt-2 text-soft">Run {run.id}</p>
                  <pre className="mt-1 max-h-72 overflow-auto rounded-xl bg-ivory p-3">{JSON.stringify(run.state, null, 2)}</pre>
                </details>
              </div>
            </details>
          );
        })}
      </div>
    </section>
  );
}
