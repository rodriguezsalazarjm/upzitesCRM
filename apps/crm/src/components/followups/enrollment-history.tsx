import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { EXIT_REASON_LABEL } from '@/lib/followups/rules';
import { ENROLLMENT_STATUS, RUN_STATUS, formatWhen } from './labels';
import { EnrollmentActions } from './strategy-actions';

export type EnrollmentRow = {
  id: string;
  status: string;
  simulated: boolean;
  enteredAt: Date;
  triggeredAt: Date | null;
  nextRunAt: Date | null;
  exitedAt: Date | null;
  exitReason: string | null;
  lastError: string | null;
  messagesSent: number;
  currentPosition: number;
  contact?: { id: string; firstName: string; lastName: string } | null;
  journey?: { id: string; name: string } | null;
  opportunity?: { id: string; title: string } | null;
  purchaseOrder?: { id: string; total: number; currency: string } | null;
  runs: { id: string; position: number; label: string; status: string; channel: string | null; text: string | null; aiGenerated: boolean; reason: string | null; executedAt: Date }[];
};

/**
 * Historial de seguimientos: una tarjeta por inscripcion con la linea de tiempo
 * de cada paso (enviado, simulado, bloqueado, fallido) y el motivo de parada.
 */
export function EnrollmentHistory({ rows, canManage, emptyText }: { rows: EnrollmentRow[]; canManage: boolean; emptyText: string }) {
  if (rows.length === 0) return <p className="px-4 py-6 text-center text-xs text-soft">{emptyText}</p>;

  return (
    <ul className="divide-y divide-line">
      {rows.map((row) => {
        const status = ENROLLMENT_STATUS[row.status] ?? { label: row.status, tone: 'outline' as const };
        const stop = row.exitReason ? EXIT_REASON_LABEL[row.exitReason] ?? row.exitReason : null;
        return (
          <li key={row.id} className="space-y-2 px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-carbon">
                  {row.contact ? (
                    <Link href={`/contactos/${row.contact.id}`} className="hover:underline">
                      {`${row.contact.firstName} ${row.contact.lastName}`.trim()}
                    </Link>
                  ) : row.journey ? (
                    <Link href={`/recuperacion/${row.journey.id}`} className="hover:underline">
                      {row.journey.name}
                    </Link>
                  ) : null}
                </p>
                <p className="text-[11px] text-soft">
                  Inició {formatWhen(row.triggeredAt ?? row.enteredAt)} · {row.messagesSent} mensaje{row.messagesSent === 1 ? '' : 's'}
                  {row.opportunity && ` · oportunidad: ${row.opportunity.title}`}
                  {row.status === 'ACTIVE' && row.nextRunAt && ` · próximo paso ${formatWhen(row.nextRunAt)}`}
                  {stop && ` · ${stop}`}
                  {row.purchaseOrder && ' · compra vinculada'}
                </p>
              </div>
              {row.simulated && <Badge variant="ai">Prueba</Badge>}
              <Badge variant={status.tone}>{status.label}</Badge>
              {canManage && row.status === 'ACTIVE' && <EnrollmentActions id={row.id} simulated={row.simulated} />}
            </div>
            {row.lastError && row.status === 'ACTIVE' && <p className="text-[11px] text-warning-ink">Último aviso: {row.lastError}</p>}
            {row.runs.length > 0 && (
              <ol className="space-y-1.5 border-l border-mist pl-3">
                {row.runs.map((run) => {
                  const tone = RUN_STATUS[run.status] ?? { label: run.status, tone: 'outline' as const };
                  return (
                    <li key={run.id} className="text-[11px] text-graphite">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-semibold text-carbon">
                          {run.position}. {run.label}
                        </span>
                        <Badge variant={tone.tone}>{tone.label}</Badge>
                        {run.aiGenerated && <Badge variant="ai">IA</Badge>}
                        {run.channel && <span className="text-soft">{run.channel === 'INSTAGRAM' ? 'Instagram' : 'WhatsApp'}</span>}
                        <span className="text-soft">{formatWhen(run.executedAt)}</span>
                      </div>
                      {run.text && <p className="mt-0.5 whitespace-pre-wrap text-graphite">“{run.text}”</p>}
                      {run.reason && <p className="mt-0.5 text-soft">{run.reason}</p>}
                    </li>
                  );
                })}
              </ol>
            )}
          </li>
        );
      })}
    </ul>
  );
}
