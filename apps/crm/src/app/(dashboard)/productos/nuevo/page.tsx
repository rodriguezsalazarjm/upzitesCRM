import { notFound } from 'next/navigation';
import { PlanLockedNotice } from '@/components/billing/plan-locked-notice';
import { ProductEditor } from '@/components/products/product-editor';
import { StudioPageHeader } from '@/components/products/studio-page-header';
import { requireCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { canManageWorkspaceSettings } from '@/lib/workspace-roles';
import { wizardSalesMode } from '@/lib/workspace-profile/business';
import { listBumpOptions } from '@/lib/commerce/product-studio/service';
import { BusinessType } from '../../../../../generated/prisma/client';

export const dynamic = 'force-dynamic';

/** Crear producto: se guarda como borrador y se sigue editando en /productos/[id]. */
export default async function NewProductPage() {
  const user = await requireCurrentUser();
  if (!canManageWorkspaceSettings(user.role)) notFound();

  const [profile, bumpOptions] = await Promise.all([
    prisma.workspaceProfile.findUnique({ where: { workspaceId: user.workspace.id }, select: { businessType: true, commerceSubtype: true } }),
    listBumpOptions(user.workspace.id, null),
  ]);
  const mode = wizardSalesMode(profile);
  const type = mode === BusinessType.INFOPRODUCT ? 'DIGITAL' : mode === BusinessType.SERVICES ? 'SERVICE' : 'PHYSICAL';

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <StudioPageHeader eyebrow="Nuevo producto" title="Crear producto" />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-10 pt-2 sm:px-8">
        <div className="mx-auto max-w-3xl space-y-4">
          <PlanLockedNotice workspaceId={user.workspace.id} feature="commerce.products" />
          <p className="text-sm text-soft">Se guarda como borrador: nadie puede comprarlo hasta que lo publiques. La portada se sube después de crearlo.</p>
          <ProductEditor
            product={{ id: null, name: '', description: '', type, currency: 'CLP', basePrice: 0, sku: null, options: [], bumpVariantId: null }}
            bumpOptions={bumpOptions}
            canEdit
          />
        </div>
      </div>
    </div>
  );
}
