import Link from 'next/link';
import { Lock } from 'lucide-react';
import { PLAN_CATALOG } from '@/lib/billing/plan-catalog';
import { FEATURE_LABEL, getWorkspaceEntitlements, type FeatureKey } from '@/lib/entitlements';
import { requiredPlanForFeature } from '@/lib/entitlements/resolve';

/**
 * Funcion no incluida en el PLAN (P0-C, D6): se muestra bloqueada, no se
 * oculta. Lo que ya existe (pedidos, productos, agentes de un plan anterior)
 * sigue visible debajo; crear o activar lo bloquea el servidor.
 *
 * Solo mira el plan. Los permisos por ROL y la relevancia por tipo de negocio
 * (P0-E) son otras capas.
 */
export async function PlanLockedNotice({ workspaceId, feature }: { workspaceId: string; feature: FeatureKey }) {
  const entitlements = await getWorkspaceEntitlements(workspaceId);
  if (entitlements.can(feature)) return null;
  const required = requiredPlanForFeature(feature);
  const planName = required ? PLAN_CATALOG[required].name : null;

  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-line bg-ivory px-4 py-3 text-sm text-carbon"
    >
      <Lock className="h-4 w-4 shrink-0" aria-hidden />
      <p className="min-w-0 flex-1">
        <span className="font-semibold">{FEATURE_LABEL[feature]}</span>
        {planName ? ` está disponible en ${planName}.` : ' no está disponible en tu plan.'} Lo que ya tienes sigue
        visible; para crear o activar, cambia de plan.
      </p>
      <Link href="/billing" className="font-semibold underline underline-offset-2">
        Ver planes
      </Link>
    </div>
  );
}
