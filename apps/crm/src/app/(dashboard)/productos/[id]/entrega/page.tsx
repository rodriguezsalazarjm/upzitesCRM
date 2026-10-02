import { notFound } from 'next/navigation';
import { PlanLockedNotice } from '@/components/billing/plan-locked-notice';
import { DeliveryAssetsManager } from '@/components/products/delivery-assets-manager';
import { StudioPageHeader } from '@/components/products/studio-page-header';
import { requireCurrentUser } from '@/lib/auth';
import { canManageWorkspaceSettings } from '@/lib/workspace-roles';
import { deliveryStorageStatus } from '@/lib/storage';
import { listProductAssets } from '@/lib/commerce/digital-assets/service';
import { ProductStudioError } from '@/lib/commerce/product-studio/service';

export const dynamic = 'force-dynamic';

/**
 * Productos → [Producto] → Entrega digital (Punto 3).
 *
 * Que recibe el comprador cuando se aprueba el pago: archivos privados y
 * enlaces, en orden, activables, con vista previa. Todo desde aqui, sin tocar
 * metadata, base ni almacenamiento a mano.
 */
export default async function ProductDeliveryPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireCurrentUser();
  const { id } = await params;
  const loaded = await listProductAssets(user.workspace.id, id).catch((error) => {
    if (error instanceof ProductStudioError && error.code === 'NOT_FOUND') notFound();
    throw error;
  });
  const { product, assets } = loaded;
  const storage = deliveryStorageStatus();
  if (!storage.configured) console.error('delivery_storage_not_configured', { reason: storage.reason });
  const readOnlyReason = product.connectionId
    ? 'Este producto se sincroniza desde Shopify: su entrega no se administra aquí.'
    : product.status === 'ARCHIVED'
      ? 'El producto está archivado. Restáuralo para editar su entrega.'
      : null;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <StudioPageHeader eyebrow="Entrega digital" title={product.name} back={{ href: `/productos/${encodeURIComponent(product.id)}`, label: 'Volver al producto' }} />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-10 pt-2 sm:px-8">
        <div className="space-y-4">
          <PlanLockedNotice workspaceId={user.workspace.id} feature="commerce.products" />
          <DeliveryAssetsManager
            productId={product.id}
            productType={product.type}
            assets={assets.map((asset) => ({ ...asset, updatedAt: asset.updatedAt.toISOString() }))}
            editable={canManageWorkspaceSettings(user.role)}
            readOnlyReason={readOnlyReason}
            storageProblem={storage.configured ? null : 'La subida de archivos todavía no está habilitada en este entorno. Mientras tanto puedes agregar enlaces.'}
          />
        </div>
      </div>
    </div>
  );
}
