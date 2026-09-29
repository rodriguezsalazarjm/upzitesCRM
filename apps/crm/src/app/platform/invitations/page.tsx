import Link from 'next/link';
import { ActionForm } from '@/components/platform/action-form';
import { DataTable, Empty, PlatformPage, Section, fmtDate } from '@/components/platform/ui';
import { listPendingInvitations, listPlatformWorkspaces } from '@/lib/platform/clients';
import { platformEmailConfigured } from '@/lib/platform/transactional-email';

export const dynamic = 'force-dynamic';

export default async function InvitationsPage() {
  const [pending, workspaces] = await Promise.all([listPendingInvitations(), listPlatformWorkspaces()]);
  const emailReady = platformEmailConfigured();
  return (
    <PlatformPage
      title="Invitaciones"
      subtitle={
        emailReady
          ? 'Se envían por el email transaccional de la plataforma (no consumen la cuota de email del cliente).'
          : 'Email de plataforma sin configurar: copia el enlace y envíalo por tu cuenta.'
      }
    >
      <Section title="Nueva invitación" description="El enlace se muestra una sola vez. Tokens de un solo uso, vencen en 7 días.">
        <ActionForm
          endpoint="/api/platform/invitations"
          submitLabel="Invitar"
          fields={[
            { name: 'workspaceId', label: 'Workspace', type: 'select', required: true, defaultValue: workspaces[0]?.id ?? '', options: workspaces.map((w) => ({ value: w.id, label: `${w.name}${w.isInternal ? ' (interno)' : ''}` })) },
            { name: 'email', label: 'Email', type: 'email', required: true },
            { name: 'role', label: 'Rol', type: 'select', defaultValue: 'MEMBER', options: ['MEMBER', 'ADMIN', 'OWNER'].map((r) => ({ value: r, label: r })) },
          ]}
        />
      </Section>
      <Section title={`Pendientes (${pending.length})`}>
        {pending.length === 0 ? (
          <Empty>Sin invitaciones pendientes.</Empty>
        ) : (
          <DataTable head={['Email', 'Rol', 'Workspace', 'Vence', 'Email enviado', '']}>
            {pending.map((i) => (
              <tr key={i.id}>
                <td className="py-2 pr-4">{i.email}</td>
                <td className="py-2 pr-4">{i.role}</td>
                <td className="py-2 pr-4"><Link className="hover:underline" href={`/platform/workspaces/${i.workspace.id}`}>{i.workspace.name}</Link></td>
                <td className="py-2 pr-4">{fmtDate(i.expiresAt)}{i.expiresAt < new Date() ? ' (vencida)' : ''}</td>
                <td className="py-2 pr-4">{i.lastSentAt ? fmtDate(i.lastSentAt) : 'No'}</td>
                <td className="py-2 pr-4">
                  <div className="flex gap-2">
                    <ActionForm compact endpoint={`/api/platform/invitations/${i.id}`} body={{ action: 'resend', workspaceId: i.workspace.id }} submitLabel="Reenviar" variant="outline" fields={[]} />
                    <ActionForm compact endpoint={`/api/platform/invitations/${i.id}`} body={{ action: 'revoke', workspaceId: i.workspace.id }} submitLabel="Revocar" variant="destructive" confirm="¿Revocar la invitación?" fields={[]} />
                  </div>
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </Section>
    </PlatformPage>
  );
}
