import { notFound } from 'next/navigation';
import { PlatformRole } from '../../../../generated/prisma/enums';
import { ActionForm } from '@/components/platform/action-form';
import { DataTable, PlatformPage, Section, fmtDate } from '@/components/platform/ui';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatMoney } from '@/lib/billing/money';
import { PLAN_CATALOG, PLAN_CODES } from '@/lib/billing/plan-catalog';
import { currentPlatformActor } from '@/lib/platform/access';
import { listPriceHistory } from '@/lib/platform/clients';

export const dynamic = 'force-dynamic';

/**
 * Price Book (solo SUPER_ADMIN). Publicar cierra la version vigente y crea otra;
 * los precios historicos nunca se editan (los pagos apuntan a su version).
 */
export default async function PricesPage() {
  const actor = await currentPlatformActor(PlatformRole.SUPER_ADMIN);
  if (!actor) notFound();
  const history = await listPriceHistory();
  const now = new Date();
  const inForce = (p: (typeof history)[number]) => p.active && p.validFrom <= now && (!p.validUntil || p.validUntil > now);

  return (
    <PlatformPage title="Price Book" subtitle="Precios por plan, moneda e intervalo. Cambiar un precio no altera lo ya cobrado ni los acuerdos manuales.">
      <Section title="Publicar nuevo precio" description="Monto en unidades normales (CLP 49990 / USD 49.99).">
        <ActionForm
          endpoint="/api/platform/prices"
          submitLabel="Publicar versión"
          confirm="¿Publicar este precio? La versión vigente se cierra (queda en el historial)."
          fields={[
            { name: 'planCode', label: 'Plan', type: 'select', defaultValue: 'START', options: PLAN_CODES.filter((c) => c !== 'FREE').map((c) => ({ value: c, label: PLAN_CATALOG[c].name })) },
            { name: 'currency', label: 'Moneda', type: 'select', defaultValue: 'CLP', options: [{ value: 'CLP', label: 'CLP' }, { value: 'USD', label: 'USD' }] },
            { name: 'interval', label: 'Intervalo', type: 'select', defaultValue: 'MONTH', options: [{ value: 'MONTH', label: 'Mensual' }, { value: 'YEAR', label: 'Anual' }] },
            { name: 'amount', path: 'amountMinor', label: 'Monto', type: 'money', required: true },
            { name: 'validFrom', label: 'Vigente desde (vacío = ahora)', type: 'date' },
          ]}
        />
      </Section>
      <Section title="Historial de versiones">
        <DataTable head={['Plan', 'Moneda', 'Intervalo', 'Monto', 'Desde', 'Hasta', 'Estado']}>
          {history.map((p) => (
            <tr key={p.id}>
              <td className="py-2 pr-4">{p.planCode}</td>
              <td className="py-2 pr-4">{p.currency}</td>
              <td className="py-2 pr-4">{p.interval}</td>
              <td className="py-2 pr-4">{formatMoney(p.amountMinor, p.currency)}</td>
              <td className="py-2 pr-4">{fmtDate(p.validFrom)}</td>
              <td className="py-2 pr-4">{fmtDate(p.validUntil)}</td>
              <td className="py-2 pr-4">
                {inForce(p) ? <StatusBadge tone="success">Vigente</StatusBadge> : p.active && p.validFrom > now ? <StatusBadge tone="info">Programado</StatusBadge> : <StatusBadge tone="draft">Histórico</StatusBadge>}
              </td>
            </tr>
          ))}
        </DataTable>
      </Section>
    </PlatformPage>
  );
}
