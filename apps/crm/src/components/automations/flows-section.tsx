import Link from 'next/link';
import { Plus, Workflow } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { SectionHeading } from '@/components/ui/eyebrow';
import { StatusBadge } from '@/components/ui/status-badge';
import { ChannelBadge } from '@/components/channels/channel-badge';
import { AutomationRow, RunHealth } from '@/components/automations/automation-row';
import type { Channel } from '../../../generated/prisma/client';

export type FlowView = {
  id: string;
  name: string;
  description: string | null;
  status: 'PUBLISHED' | 'DRAFT' | 'ARCHIVED' | string;
  channelScope: Channel[];
  version: {
    version: number;
    status: string;
    runsStarted: number;
    runsCompleted: number;
    runsFailed: number;
    messagesSent: number;
  } | null;
  totalRuns: number;
};

const FLOW_STATUS = {
  PUBLISHED: { tone: 'success', label: 'Publicado' },
  DRAFT: { tone: 'draft', label: 'Borrador' },
  ARCHIVED: { tone: 'neutral', label: 'Archivado' },
} as const;

/** Listado de flujos multicanal. Solo presentación: los datos llegan ya resueltos. */
export function FlowsSection({ flows }: { flows: FlowView[] }) {
  return (
    <section className="space-y-4">
      <SectionHeading
        eyebrow="Flujos multicanal (Beta)"
        title="Mis automatizaciones"
        action={
          <Button asChild>
            <Link href="/automatizaciones/nueva">
              <Plus strokeWidth={2} />
              Nueva automatización / Plantillas
            </Link>
          </Button>
        }
      />
      <p className="-mt-2 text-[13px] text-ash">Crea, configura y publica flujos desde el editor visual.</p>

      {flows.length === 0 ? (
        <EmptyState
          icon={Workflow}
          title="Sin flujos multicanal"
          description="Todavía no hay flujos multicanal creados en este workspace."
        />
      ) : (
        <Card>
          <ul className="divide-y divide-line">
            {flows.map((flow) => {
              const status = FLOW_STATUS[flow.status as keyof typeof FLOW_STATUS] ?? FLOW_STATUS.ARCHIVED;
              const version = flow.version;
              return (
                <AutomationRow
                  key={flow.id}
                  icon={Workflow}
                  title={
                    <Link href={`/automatizaciones/${flow.id}`} className="underline-offset-4 hover:underline">
                      {flow.name}
                    </Link>
                  }
                  description={flow.description}
                  status={
                    <>
                      <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                      {version && version.runsFailed > 0 && (
                        <StatusBadge tone="danger">
                          {version.runsFailed} {version.runsFailed === 1 ? 'fallo' : 'fallos'}
                        </StatusBadge>
                      )}
                    </>
                  }
                  chips={
                    flow.channelScope.length === 0 ? (
                      <StatusBadge tone="neutral">Cualquier canal</StatusBadge>
                    ) : (
                      flow.channelScope.map((channel) => <ChannelBadge key={channel} channel={channel} />)
                    )
                  }
                  meta={
                    <>
                      <span>
                        Versión:{' '}
                        {version
                          ? `v${version.version} (${version.status === 'PUBLISHED' ? 'publicada' : 'borrador'})`
                          : 'sin versiones'}
                      </span>
                      {version && (
                        <RunHealth
                          started={version.runsStarted}
                          completed={version.runsCompleted}
                          failed={version.runsFailed}
                        />
                      )}
                      {version && <span className="tabular">{version.messagesSent} mensajes enviados</span>}
                      <span className="tabular">Ejecuciones totales registradas: {flow.totalRuns}</span>
                    </>
                  }
                  actions={
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/automatizaciones/${flow.id}`} aria-label={`Abrir Builder de ${flow.name}`}>
                        Abrir Builder
                      </Link>
                    </Button>
                  }
                />
              );
            })}
          </ul>
        </Card>
      )}
    </section>
  );
}
