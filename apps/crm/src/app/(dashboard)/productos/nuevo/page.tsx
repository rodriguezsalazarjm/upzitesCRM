import { notFound } from 'next/navigation';
import { PlanLockedNotice } from '@/components/billing/plan-locked-notice';
import { ProductEditor } from '@/components/products/product-editor';
import { StudioPageHeader } from '@/components/products/studio-page-header';
import { requireCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { canManageWorkspaceSettings } from '@/lib/workspace-roles';
import { wizardSalesMode } from '@/lib/workspace-profile/business';
import { BusinessType } from '../../../../../generated/prisma/client';

export const dynamic = 'force-dynamic';

/** Crear producto: se guarda como borrador y se sigue editando en /productos/[id]. */
export default async function NewProductPage() {
  const user = await requireCurrentUser();
  if (!canManageWorkspaceSettings(user.role)) notFound();

  const profile = await prisma.workspaceProfile.findUnique({ where: { workspaceId: user.workspace.id }, select: { businessType: true, commerceSubtype: true } });
  const mode = wizardSalesMode(profile);
  const type = mode === BusinessType.INFOPRODUCT ? 'DIGITAL' : mode === BusinessType.SERVICES ? 'SERVICE' : 'PHYSICAL';

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <StudioPageHeader eyebrow="Nuevo producto" title="Crear producto" />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-10 pt-2 sm:px-8">
        <div className="mx-auto max-w-3xl space-y-4">
          <PlanLockedNotice workspaceId={user.workspace.id} feature="commerce.products" />
          <p className="text-sm text-soft">Se guarda como borrador: nadie puede comprarlo hasta que lo publiques. La portada y las ofertas se configuran después de crearlo.</p>
          <ProductEditor
            product={{ id: null, name: '', description: '', type, currency: 'CLP', basePrice: 0, sku: null, options: [] }}
            canEdit
          />
        </div>
      </div>
    </div>
  );
}
