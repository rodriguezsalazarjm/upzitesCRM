import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ActionForm, type Field } from '@/components/platform/action-form';
import { DataTable, Empty, PlatformPage, Section, StateBadge, fmtDate } from '@/components/platform/ui';
import { PLAN_CATALOG, PLAN_CODES } from '@/lib/billing/plan-catalog';
import { currentPlatformActor, isSuperAdmin } from '@/lib/platform/access';
import { listPlatformWorkspaces } from '@/lib/platform/clients';

export const dynamic = 'force-dynamic';

export default async function ClientsPage() {
  const actor = await currentPlatformActor();
  if (!actor) notFound();
  const superAdmin = isSuperAdmin(actor);
  const clients = await listPlatformWorkspaces({ internal: false });

  const sources = [
    { value: 'FREE', label: 'FREE (sin pago)' },
    { value: 'MANUAL', label: 'MANUAL (pago recibido)' },
    { value: 'TRIAL', label: 'TRIAL' },
    ...(superAdmin ? [{ value: 'COMP', label: 'COMP (cortesía, SUPER_ADMIN)' }] : []),
  ];
  const fields: Field[] = [
    { name: 'workspaceName', label: 'Nombre del negocio', type: 'text', required: true },
    { name: 'ownerName', label: 'Nombre del OWNER', type: 'text' },
    { name: 'ownerEmail', label: 'Email del OWNER', type: 'email', hint: 'Recibe una invitación. No se crea contraseña.' },
    { name: 'planCode', label: 'Plan', type: 'select', defaultValue: 'FREE', options: PLAN_CODES.map((c) => ({ value: c, label: PLAN_CATALOG[c].name })) },
    { name: 'billingSource', label: 'Medio de pago', type: 'select', defaultValue: 'FREE', options: sources },
    { name: 'currency', label: 'Moneda', type: 'select', defaultValue: 'CLP', options: [{ value: 'CLP', label: 'CLP' }, { value: 'USD', label: 'USD' }], showIf: { field: 'billingSource', in: ['MANUAL'] } },
    { name: 'periodMonths', label: 'Meses pagados', type: 'number', defaultValue: 1, showIf: { field: 'billingSource', in: ['MANUAL'] } },
    { name: 'amount', path: 'payment.amountMinor', label: 'Monto pagado (vacío = Price Book)', type: 'money', showIf: { field: 'billingSource', in: ['MANUAL'] } },
    { name: 'paidAt', path: 'payment.paidAt', label: 'Fecha de pago', type: 'date', showIf: { field: 'billingSource', in: ['MANUAL'] } },
    { name: 'reference', path: 'payment.reference', label: 'Referencia (transferencia/factura)', type: 'text', showIf: { field: 'billingSource', in: ['MANUAL'] } },
    { name: 'notes', path: 'payment.notes', label: 'Notas (obligatorio si el monto difiere)', type: 'textarea', showIf: { field: 'billingSource', in: ['MANUAL'] } },
    { name: 'trialDays', label: 'Días de prueba', type: 'number', defaultValue: 14, showIf: { field: 'billingSource', in: ['TRIAL'] } },
    { name: 'reason', label: 'Motivo (obligatorio para COMP)', type: 'text', showIf: { field: 'billingSource', in: ['COMP'] } },
    ...(superAdmin
      ? ([
          { name: 'isInternal', label: 'Negocio interno (propio de Upzites; fuera de métricas SaaS)', type: 'checkbox' },
          { name: 'addActorAsOwner', label: 'Soy el OWNER de este negocio interno (queda auditado)', type: 'checkbox' },
        ] satisfies Field[])
      : []),
  ];

  return (
    <PlatformPage title="Clientes SaaS" subtitle="Workspaces comerciales. Crear un cliente envía una invitación al OWNER; nunca se crea su contraseña.">
      <Section title="Nuevo cliente" description="Si el pago MANUAL aún no llega, créalo en FREE y registra la transferencia al recibirla.">
        <ActionForm endpoint="/api/platform/clients" fields={fields} submitLabel="Crear cliente" idempotent />
      </Section>
      <Section title={`Clientes (${clients.length})`}>
        {clients.length === 0 ? (
          <Empty>Todavía no hay clientes.</Empty>
        ) : (
          <DataTable head={['Negocio', 'OWNER', 'Plan', 'Medio', 'Estado', 'Vence', 'Alta']}>
            {clients.map((c) => (
              <tr key={c.id}>
                <td className="py-2 pr-4"><Link href={`/platform/workspaces/${c.id}`} className="font-medium text-carbon hover:underline">{c.name}</Link></td>
                <td className="py-2 pr-4 text-soft">{c.owner?.email ?? 'Invitación pendiente'}</td>
                <td className="py-2 pr-4">{c.subscription.configuredPlan ?? c.subscription.legacyPlanKey ?? 'FREE'}</td>
                <td className="py-2 pr-4">{c.subscription.billingSource}</td>
                <td className="py-2 pr-4"><StateBadge state={c.subscription.state} /></td>
                <td className="py-2 pr-4">{fmtDate(c.subscription.periodEnd)}</td>
                <td className="py-2 pr-4">{fmtDate(c.createdAt)}</td>
              </tr>
            ))}
          </DataTable>
        )}
      </Section>
    </PlatformPage>
  );
}
