import Link from 'next/link';
import { DataTable, Empty, PlatformPage, Section } from '@/components/platform/ui';
import { listPlatformAudit } from '@/lib/platform/clients';

export const dynamic = 'force-dynamic';

export default async function AuditPage() {
  const rows = await listPlatformAudit(200);
  return (
    <PlatformPage title="Auditoría de plataforma" subtitle="Últimos 200 eventos: roles, billing, invitaciones, soporte, Price Book.">
      <Section title="Eventos">
        {rows.length === 0 ? (
          <Empty>Sin eventos.</Empty>
        ) : (
          <DataTable head={['Fecha', 'Acción', 'Workspace', 'Actor', 'Detalle']}>
            {rows.map((r) => (
              <tr key={r.id} className="align-top">
                <td className="py-2 pr-4 text-xs text-soft">{r.createdAt.toLocaleString('es-CL')}</td>
                <td className="py-2 pr-4 font-medium">{r.action}</td>
                <td className="py-2 pr-4 text-xs">
                  {r.targetWorkspaceId ? <Link className="hover:underline" href={`/platform/workspaces/${r.targetWorkspaceId}`}>{r.targetWorkspaceId.slice(0, 10)}…</Link> : '—'}
                </td>
                <td className="py-2 pr-4 text-xs text-soft">{r.actorUserId ? `${r.actorUserId.slice(0, 10)}…` : 'CLI/sistema'}</td>
                <td className="max-w-[360px] py-2 pr-4 font-mono text-[11px] text-graphite">
                  <span className="line-clamp-3 break-all">{r.metadata ? JSON.stringify(r.metadata) : ''}</span>
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </Section>
    </PlatformPage>
  );
}
