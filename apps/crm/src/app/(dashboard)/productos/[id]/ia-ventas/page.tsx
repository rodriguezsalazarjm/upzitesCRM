import { notFound } from 'next/navigation';
import { SalesBrainEditor } from '@/components/products/sales-brain-editor';
import { StudioPageHeader } from '@/components/products/studio-page-header';
import { requireCurrentUser } from '@/lib/auth';
import { getStudioProduct, ProductStudioError } from '@/lib/commerce/product-studio/service';
import { EMPTY_PRODUCT_SALES_BRAIN, getProductSalesBrain, ProductSalesBrainError } from '@/lib/product-sales-brain/service';
import { canManageWorkspaceSettings } from '@/lib/workspace-roles';

export const dynamic = 'force-dynamic';

export default async function ProductSalesBrainPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireCurrentUser();
  const { id } = await params;
  const [product, brain] = await Promise.all([
    getStudioProduct(user.workspace.id, id).catch((error) => { if (error instanceof ProductStudioError && error.code === 'NOT_FOUND') notFound(); throw error; }),
    getProductSalesBrain(user.workspace.id, id).catch((error) => { if (error instanceof ProductSalesBrainError && error.code === 'NOT_FOUND') notFound(); throw error; }),
  ]);
  const initial = brain ? {
    productWhat: brain.productWhat ?? '', idealFor: brain.idealFor ?? '', problems: brain.problems ?? '', benefits: brain.benefits ?? '', differentiators: brain.differentiators ?? '', targetAudience: brain.targetAudience ?? '', buyerPersona: brain.buyerPersona ?? '', faqs: brain.faqs, objections: brain.objections, socialProof: brain.socialProof ?? '', guarantee: brain.guarantee ?? '', policies: brain.policies ?? '', salesTone: brain.salesTone ?? '', prohibitedClaims: brain.prohibitedClaims ?? '', askWhen: brain.askWhen ?? '', offerWhen: brain.offerWhen ?? '', checkoutWhen: brain.checkoutWhen ?? '', insistWhen: brain.insistWhen ?? '', stopWhen: brain.stopWhen ?? '', handoffWhen: brain.handoffWhen ?? '', specialInstructions: brain.specialInstructions ?? '',
  } : EMPTY_PRODUCT_SALES_BRAIN;
  return <div className="flex h-full flex-col overflow-hidden"><StudioPageHeader eyebrow="IA de ventas" title={product.name} back={{ href: `/productos/${encodeURIComponent(id)}`, label: 'Volver al producto' }} /><div className="min-h-0 flex-1 overflow-y-auto px-4 pb-10 pt-2 sm:px-8"><SalesBrainEditor productId={id} initial={initial} initialStatus={brain?.status ?? 'EMPTY'} canEdit={canManageWorkspaceSettings(user.role)} /></div></div>;
}
