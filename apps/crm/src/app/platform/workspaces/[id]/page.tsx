import { notFound } from 'next/navigation';
import { ActionForm, type Field } from '@/components/platform/action-form';
import { SupportButton } from '@/components/platform/support-button';
import { DataTable, Empty, PlatformPage, Section, StateBadge, fmtDate } from '@/components/platform/ui';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatMoney, toMajorUnits } from '@/lib/billing/money';
import { PLAN_CATALOG, PLAN_CODES } from '@/lib/billing/plan-catalog';
import { getCurrentPrice } from '@/lib/billing/price-book';
import { currentPlatformActor, isSuperAdmin } from '@/lib/platform/access';
import { getPlatformWorkspace } from '@/lib/platform/clients';
import { BUSINESS_TYPE_LABEL, COMMERCE_SUBTYPE_LABEL, canonicalBusiness } from '@/lib/workspace-profile/business';
import { presetId, resolvePreset } from '@/lib/workspace-presets';

export const dynamic = 'force-dynamic';

const planOptions = PLAN_CODES.map((c) => ({ value: c, label: PLAN_CATALOG[c].name }));
const paidPlanOptions = planOptions.filter((o) => o.value !== 'FREE');
const currencyOptions = [{ value: 'CLP', label: 'CLP' }, { value: 'USD', label: 'USD' }];
const roleOptions = [{ value: 'MEMBER', label: 'MEMBER' }, { value: 'ADMIN', label: 'ADMIN' }, { value: 'OWNER', label: 'OWNER' }];

export default async function WorkspaceDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await currentPlatformActor();
  if (!actor) notFound();
  const workspace = await getPlatformWorkspace(id);
  if (!workspace) notFound();
  const superAdmin = isSuperAdmin(actor);
  const life = workspace.lifecycle;
  const currency = life.currency ?? 'CLP';
  const planForPayment = life.configuredPlan && life.configuredPlan !== 'FREE' ? life.configuredPlan : 'PRO';
  const priceBook = await getCurrentPrice({ planCode: planForPayment, currency });
  const endpoint = `/api/platform/workspaces/${workspace.id}`;
  const pendingInvites = workspace.invitations.filter((i) => !i.acceptedAt && !i.revokedAt);
  const owner = workspace.memberships.find((m) => m.role === 'OWNER' && m.status === 'ACTIVE');
  const business = canonicalBusiness(workspace.profile);
  const preset = resolvePreset(workspace.profile);

  const paymentFields: Field[] = [
    { name: 'planCode', label: 'Plan', type: 'select', defaultValue: planForPayment, options: paidPlanOptions },
    { name: 'currency', label: 'Moneda', type: 'select', defaultValue: currency, options: currencyOptions },
    {
      name: 'amount',
      path: 'amountMinor',
      label: 'Monto pagado',
      type: 'money',
      defaultValue: priceBook ? toMajorUnits(priceBook.amountMinor, priceBook.currency) : '',
      hint: priceBook
        ? `Price Book vigente (${planForPayment} ${currency}): ${formatMoney(priceBook.amountMinor, priceBook.currency)}. Un monto distinto queda auditado como manual_price_override y no modifica el Price Book.`
        : 'Sin precio vigente para esta combinación.',
    },
    { name: 'paidAt', label: 'Pagado el', type: 'date' },
    { name: 'periodStart', label: 'Periodo desde (opcional)', type: 'date' },
    { name: 'periodEnd', label: 'Periodo hasta (opcional)', type: 'date' },
    { name: 'reference', label: 'Referencia', type: 'text' },
    { name: 'notes', label: 'Notas (obligatorio si el monto difiere)', type: 'textarea' },
  ];

  return (
    <PlatformPage
      title={workspace.name}
      subtitle={`${workspace.isInternal ? 'Negocio interno' : 'Cliente SaaS'} · creado ${fmtDate(workspace.createdAt)}`}
      action={workspace.isInternal ? <StatusBadge tone="ink">Interno (fuera de MRR)</StatusBadge> : <StatusBadge tone="info">Cliente</StatusBadge>}
    >
      <Section title="Suscripción">
        <dl className="grid gap-3 text-sm sm:grid-cols-3 lg:grid-cols-6">
          <div><dt className="text-xs text-soft">Plan configurado</dt><dd className="font-semibold">{life.configuredPlan ?? life.legacyPlanKey ?? 'FREE'}</dd></div>
          <div><dt className="text-xs text-soft">Plan efectivo</dt><dd className="font-semibold">{life.effectivePlan}</dd></div>
          <div><dt className="text-xs text-soft">Medio</dt><dd className="font-semibold">{life.billingSource}</dd></div>
          <div><dt className="text-xs text-soft">Estado</dt><dd><StateBadge state={life.state} /></dd></div>
          <div><dt className="text-xs text-soft">Periodo</dt><dd>{fmtDate(life.periodStart)} → {fmtDate(life.periodEnd)}</dd></div>
          <div><dt className="text-xs text-soft">Gracia hasta</dt><dd>{fmtDate(life.graceEndsAt)}</dd></div>
          <div><dt className="text-xs text-soft">Precio acordado</dt><dd>{life.price ? formatMoney(life.price.amountMinor, life.price.currency) : '—'}</dd></div>
          <div><dt className="text-xs text-soft">OWNER</dt><dd>{owner ? owner.user.email : 'Pendiente de aceptar invitación'}</dd></div>
        </dl>
      </Section>

      <Section title="Perfil de negocio" description="Solo lectura. Se configura dentro del workspace; para ajustes profundos usa una sesión de soporte.">
        <dl className="grid gap-3 text-sm sm:grid-cols-4">
          <div><dt className="text-xs text-soft">Business type</dt><dd className="font-semibold">{BUSINESS_TYPE_LABEL[business.businessType]}</dd></div>
          <div><dt className="text-xs text-soft">Commerce subtype</dt><dd className="font-semibold">{business.commerceSubtype ? COMMERCE_SUBTYPE_LABEL[business.commerceSubtype] : '—'}</dd></div>
          <div><dt className="text-xs text-soft">Preset</dt><dd className="font-semibold">{presetId(preset.preset)}{preset.applied ? '' : ' (deducido)'}</dd></div>
          <div><dt className="text-xs text-soft">Onboarding</dt><dd>{workspace.profile?.onboardingCompletedAt ? fmtDate(workspace.profile.onboardingCompletedAt) : 'Pendiente'}</dd></div>
        </dl>
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Registrar transferencia (pago manual)" description="Doble envío = un solo pago y una sola renovación (idempotente).">
          <ActionForm endpoint={endpoint} body={{ action: 'manual_payment' }} fields={paymentFields} submitLabel="Registrar pago" idempotent />
        </Section>
        <Section title="Renovar manual" description="Un periodo más del plan configurado. Monto vacío = Price Book.">
          <ActionForm
            endpoint={endpoint}
            body={{ action: 'renew', currency }}
            idempotent
            submitLabel="Renovar"
            fields={[
              { name: 'amount', path: 'amountMinor', label: 'Monto pagado (vacío = Price Book)', type: 'money' },
              { name: 'paidAt', label: 'Pagado el', type: 'date' },
              { name: 'periods', label: 'Periodos', type: 'number', defaultValue: 1 },
              { name: 'reference', label: 'Referencia', type: 'text' },
              { name: 'notes', label: 'Notas', type: 'textarea' },
            ]}
          />
        </Section>
        <Section title="Cambiar plan" description="Conserva medio de pago y periodo; el precio pasa al del Price Book del plan nuevo.">
          <ActionForm
            endpoint={endpoint}
            body={{ action: 'change_plan' }}
            submitLabel="Cambiar plan"
            fields={[
              { name: 'planCode', label: 'Plan', type: 'select', defaultValue: life.configuredPlan ?? 'FREE', options: planOptions },
              { name: 'reason', label: 'Motivo', type: 'text' },
            ]}
          />
        </Section>
        <Section title="Estado">
          {life.state === 'SUSPENDED' ? (
            <ActionForm endpoint={endpoint} body={{ action: 'resume' }} submitLabel="Reactivar" fields={[{ name: 'reason', label: 'Motivo', type: 'text' }]} />
          ) : (
            <ActionForm
              endpoint={endpoint}
              body={{ action: 'suspend' }}
              submitLabel="Suspender"
              variant="destructive"
              confirm="¿Suspender este workspace? Bloquea todo el acceso y el consumo (no borra nada)."
              fields={[{ name: 'reason', label: 'Motivo (obligatorio)', type: 'text', required: true }]}
            />
          )}
        </Section>
        {superAdmin && (
          <Section title="COMP (cortesía)" description="Solo SUPER_ADMIN. Sin fecha = no vence. No es MRR.">
            <ActionForm
              endpoint={endpoint}
              body={{ action: 'comp' }}
              submitLabel="Asignar COMP"
              fields={[
                { name: 'planCode', label: 'Plan', type: 'select', defaultValue: 'SCALE', options: paidPlanOptions },
                { name: 'periodEnd', label: 'Hasta (opcional)', type: 'date' },
                { name: 'reason', label: 'Motivo (obligatorio)', type: 'text', required: true },
              ]}
            />
          </Section>
        )}
        {superAdmin && (
          <Section title="Negocio interno" description="Solo SUPER_ADMIN. Un interno queda fuera de todas las métricas SaaS.">
            <ActionForm
              endpoint={endpoint}
              body={{ action: 'set_internal', isInternal: !workspace.isInternal }}
              submitLabel={workspace.isInternal ? 'Marcar como cliente' : 'Marcar como interno'}
              fields={[{ name: 'reason', label: 'Motivo (obligatorio)', type: 'text', required: true }]}
            />
          </Section>
        )}
      </div>

      <Section title={`Miembros (${workspace.memberships.length})`}>
        <DataTable head={['Nombre', 'Email', 'Rol', 'Estado', 'Desde']}>
          {workspace.memberships.map((m) => (
            <tr key={m.id}>
              <td className="py-2 pr-4">{m.user.name}</td>
              <td className="py-2 pr-4 text-soft">{m.user.email}</td>
              <td className="py-2 pr-4">{m.role}</td>
              <td className="py-2 pr-4">{m.planLimitedAt ? <StatusBadge tone="warning">Limitado por plan</StatusBadge> : m.status}</td>
              <td className="py-2 pr-4">{fmtDate(m.createdAt)}</td>
            </tr>
          ))}
        </DataTable>
        <div className="mt-4 border-t border-line pt-4">
          <p className="mb-2 text-xs font-semibold text-graphite">Invitar miembro</p>
          <ActionForm
            endpoint="/api/platform/invitations"
            body={{ workspaceId: workspace.id }}
            submitLabel="Invitar"
            fields={[
              { name: 'email', label: 'Email', type: 'email', required: true },
              { name: 'role', label: 'Rol', type: 'select', defaultValue: 'MEMBER', options: roleOptions },
            ]}
          />
        </div>
      </Section>

      <Section title="Invitaciones pendientes" description="El enlace solo se muestra al crear o reenviar. Reenviar invalida el anterior.">
        {pendingInvites.length === 0 ? (
          <Empty>Sin invitaciones pendientes.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {pendingInvites.map((i) => (
              <li key={i.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                <div className="text-sm">
                  <p className="font-medium text-carbon">{i.email} · {i.role}</p>
                  <p className="text-xs text-soft">
                    Vence {fmtDate(i.expiresAt)} {i.expiresAt < new Date() ? '(vencida)' : ''} · {i.lastSentAt ? `enviada ${fmtDate(i.lastSentAt)}` : 'no enviada por email'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <ActionForm compact endpoint={`/api/platform/invitations/${i.id}`} body={{ action: 'resend', workspaceId: workspace.id }} submitLabel="Reenviar / regenerar" variant="outline" fields={[]} />
                  <ActionForm compact endpoint={`/api/platform/invitations/${i.id}`} body={{ action: 'revoke', workspaceId: workspace.id }} submitLabel="Revocar" variant="destructive" confirm="¿Revocar la invitación?" fields={[]} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Pagos SaaS">
        {workspace.subscriptionPayments.length === 0 ? (
          <Empty>Sin pagos.</Empty>
        ) : (
          <DataTable head={['Pagado', 'Plan', 'Medio', 'Monto', 'Periodo', 'Referencia']}>
            {workspace.subscriptionPayments.map((p) => (
              <tr key={p.id}>
                <td className="py-2 pr-4">{fmtDate(p.paidAt)}</td>
                <td className="py-2 pr-4">{p.planCode ?? 'Legacy'}</td>
                <td className="py-2 pr-4">{p.source}</td>
                <td className="py-2 pr-4">{formatMoney(p.amountMinor, p.currency)}</td>
                <td className="py-2 pr-4">{fmtDate(p.periodStart)} → {fmtDate(p.periodEnd)}</td>
                <td className="py-2 pr-4 text-soft">{p.reference ?? '—'}</td>
              </tr>
            ))}
          </DataTable>
        )}
      </Section>

      <Section title="Soporte" description="Acceso explícito, READ_ONLY y auditado. Para escribir hay que elevar con motivo desde el banner.">
        <SupportButton workspaceId={workspace.id} />
      </Section>

      <Section title="Auditoría de plataforma">
        {workspace.audit.length === 0 ? (
          <Empty>Sin eventos.</Empty>
        ) : (
          <ul className="space-y-1 text-xs">
            {workspace.audit.map((a) => (
              <li key={a.id} className="flex gap-3">
                <span className="w-32 shrink-0 text-soft">{a.createdAt.toLocaleString('es-CL')}</span>
                <span className="font-medium text-carbon">{a.action}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </PlatformPage>
  );
}
