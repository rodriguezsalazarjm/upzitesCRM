import { notFound } from 'next/navigation';
import { currentPlatformActor } from '@/lib/platform/access';
import Link from 'next/link';
import { DataTable, Empty, PlatformPage, Section, StateBadge, fmtDate } from '@/components/platform/ui';
import { StatusBadge } from '@/components/ui/status-badge';
import { listPlatformWorkspaces } from '@/lib/platform/clients';

export const dynamic = 'force-dynamic';

export default async function WorkspacesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  // El layout no basta: Next renderiza la pagina en paralelo y su payload saldria en el 404.
  if (!(await currentPlatformActor())) notFound();
  const { q } = await searchParams;
  const workspaces = await listPlatformWorkspaces({ query: q });
  return (
    <PlatformPage title="Workspaces" subtitle="Todos los workspaces, comerciales e internos. Solo datos de plataforma: sin contactos ni conversaciones.">
      <form className="flex gap-2">
        <input name="q" defaultValue={q ?? ''} placeholder="Buscar por nombre" className="h-10 w-full max-w-sm rounded-lg border border-mist bg-paper px-3 text-sm" />
        <button className="h-10 rounded-lg bg-carbon px-4 text-sm font-semibold text-canvas">Buscar</button>
      </form>
      <Section title={`Workspaces (${workspaces.length})`}>
        {workspaces.length === 0 ? (
          <Empty>Sin resultados.</Empty>
        ) : (
          <DataTable head={['Negocio', 'Tipo', 'OWNER', 'Miembros', 'Plan efectivo', 'Estado', 'Alta']}>
            {workspaces.map((w) => (
              <tr key={w.id}>
                <td className="py-2 pr-4"><Link href={`/platform/workspaces/${w.id}`} className="font-medium text-carbon hover:underline">{w.name}</Link></td>
                <td className="py-2 pr-4">{w.isInternal ? <StatusBadge tone="ink">Interno</StatusBadge> : <StatusBadge tone="info">Cliente</StatusBadge>}</td>
                <td className="py-2 pr-4 text-soft">{w.owner?.email ?? '—'}</td>
                <td className="py-2 pr-4">{w.members}</td>
                <td className="py-2 pr-4">{w.subscription.effectivePlan}</td>
                <td className="py-2 pr-4"><StateBadge state={w.subscription.state} /></td>
                <td className="py-2 pr-4">{fmtDate(w.createdAt)}</td>
              </tr>
            ))}
          </DataTable>
        )}
      </Section>
    </PlatformPage>
  );
}
