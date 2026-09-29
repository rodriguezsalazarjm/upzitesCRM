import { notFound } from 'next/navigation';
import { PlatformRole } from '../../../../generated/prisma/enums';
import { ActionForm } from '@/components/platform/action-form';
import { DataTable, PlatformPage, Section, fmtDate } from '@/components/platform/ui';
import { currentPlatformActor } from '@/lib/platform/access';
import { listOperators } from '@/lib/platform/roles';

export const dynamic = 'force-dynamic';

/** Roles de plataforma (solo SUPER_ADMIN). El CLI queda para bootstrap y recuperacion. */
export default async function RolesPage() {
  const actor = await currentPlatformActor(PlatformRole.SUPER_ADMIN);
  if (!actor) notFound();
  const operators = await listOperators();
  const roleOptions = [PlatformRole.USER, PlatformRole.PLATFORM_ADMIN, PlatformRole.SUPER_ADMIN].map((r) => ({ value: r, label: r }));
  return (
    <PlatformPage title="Roles de plataforma" subtitle="USER, PLATFORM_ADMIN o SUPER_ADMIN. Nunca se puede quitar al último SUPER_ADMIN. Todo queda en la auditoría.">
      <Section title="Cambiar rol">
        <ActionForm
          endpoint="/api/platform/roles"
          submitLabel="Aplicar"
          confirm="¿Cambiar el rol de plataforma de esta cuenta?"
          fields={[
            { name: 'email', label: 'Email de la cuenta', type: 'email', required: true },
            { name: 'role', label: 'Rol', type: 'select', defaultValue: PlatformRole.PLATFORM_ADMIN, options: roleOptions },
            { name: 'reason', label: 'Motivo (obligatorio)', type: 'text', required: true },
          ]}
        />
      </Section>
      <Section title={`Operadores (${operators.length})`}>
        <DataTable head={['Nombre', 'Email', 'Rol', 'Actualizado']}>
          {operators.map((o) => (
            <tr key={o.id}>
              <td className="py-2 pr-4">{o.name}</td>
              <td className="py-2 pr-4 text-soft">{o.email}</td>
              <td className="py-2 pr-4 font-semibold">{o.platformRole}</td>
              <td className="py-2 pr-4">{fmtDate(o.updatedAt)}</td>
            </tr>
          ))}
        </DataTable>
      </Section>
    </PlatformPage>
  );
}
