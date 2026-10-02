import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Bot, PackageCheck } from 'lucide-react';
import { deliverySummary } from '@/lib/commerce/digital-assets/service';
import { PlanLockedNotice } from '@/components/billing/plan-locked-notice';
import { CheckoutLinkCard } from '@/components/products/checkout-link-card';
import { CoverUploader } from '@/components/products/cover-uploader';
import { ProductActions } from '@/components/products/product-actions';
import { ProductEditor } from '@/components/products/product-editor';
import { StudioPageHeader } from '@/components/products/studio-page-header';
import { SettingsCard } from '@/components/ui/settings-card';
import { StatusBadge } from '@/components/ui/status-badge';
import { requireCurrentUser } from '@/lib/auth';
import { canManageWorkspaceSettings } from '@/lib/workspace-roles';
import { getStudioProduct, listBumpOptions, ProductStudioError, type StudioProductView } from '@/lib/commerce/product-studio/service';
import { BUMP_ISSUE_TEXT, STATUS_LABEL, STUDIO_CURRENCIES, formatMinor, type StudioCurrency, type StudioProductType } from '@/lib/commerce/product-studio/rules';

export const dynamic = 'force-dynamic';

const STATUS_TONE = { ACTIVE: 'success', DRAFT: 'draft', ARCHIVED: 'neutral' } as const;

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-ivory px-3 py-3">
      <dt className="text-xs text-soft">{label}</dt>
      <dd className="tabular mt-1 text-lg font-bold text-carbon">{value}</dd>
    </div>
  );
}

function MetricsCard({ metrics }: { metrics: StudioProductView['metrics'] }) {
  return (
    <SettingsCard title="Métricas" description="Solo cuentan pedidos pagados o en curso. Cancelados, reembolsados y pagos que no coinciden con el pedido quedan fuera.">
      <dl className="grid grid-cols-2 gap-2">
        <Metric label="Pedidos iniciados" value={metrics.ordersStarted} />
        <Metric label="Ventas confirmadas" value={metrics.salesConfirmed} />
        <Metric label="Unidades vendidas" value={metrics.unitsSold} />
        <Metric
          label="Ingresos confirmados"
          value={metrics.revenue.length === 0 ? '—' : metrics.revenue.map((item) => <span key={item.currency} className="block">{formatMinor(item.amount, item.currency)}</span>)}
        />
      </dl>
      {metrics.simulatedSales > 0 && (
        <p className="mt-3 text-xs leading-5 text-soft">
          Incluye {metrics.simulatedSales} venta{metrics.simulatedSales === 1 ? '' : 's'} simulada{metrics.simulatedSales === 1 ? '' : 's'} del modo demostración (sin cobro real).
        </p>
      )}
    </SettingsCard>
  );
}

/** Acceso a Entrega digital: cuanto contenido activo hay y si falta. */
function DeliveryCard({ productId, productType, summary }: { productId: string; productType: string; summary: { active: number; total: number } }) {
  const missing = productType === 'DIGITAL' && summary.active === 0;
  return (
    <SettingsCard
      icon={PackageCheck}
      title="Entrega digital"
      description={
        summary.total === 0
          ? productType === 'DIGITAL'
            ? 'Qué recibe el comprador al pagar: archivos y enlaces.'
            : 'Opcional: materiales digitales que se entregan al pagar.'
          : `${summary.active} contenido${summary.active === 1 ? '' : 's'} activo${summary.active === 1 ? '' : 's'} de ${summary.total}.`
      }
    >
      {missing && <p className="mb-3 rounded-lg bg-solar/30 px-3 py-2 text-xs text-warning-ink">Sin contenido activo: el comprador no recibiría nada.</p>}
      <Link
        href={`/productos/${encodeURIComponent(productId)}/entrega`}
        className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-mist bg-paper px-4 text-sm font-semibold text-carbon hover:border-carbon focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-electric"
      >
        Configurar entrega digital
      </Link>
    </SettingsCard>
  );
}

function SalesBrainCard({ productId }: { productId: string }) {
  return (
    <SettingsCard icon={Bot} title="IA de ventas" description="Entrena el cerebro comercial específico de este producto y pruébalo con un lead.">
      <Link href={`/productos/${encodeURIComponent(productId)}/ia-ventas`} className="inline-flex h-10 w-full items-center justify-center rounded-lg border border-mist bg-paper px-4 text-sm font-semibold text-carbon hover:border-carbon focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-electric">
        Configurar entrenamiento comercial
      </Link>
    </SettingsCard>
  );
}

/** Editor de un producto del Product Sales Studio. */
export default async function ProductStudioPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ creado?: string; duplicado?: string }> }) {
  const user = await requireCurrentUser();
  const { id } = await params;
  const flags = await searchParams;
  const product = await getStudioProduct(user.workspace.id, id).catch((error) => {
    if (error instanceof ProductStudioError && error.code === 'NOT_FOUND') notFound();
    throw error;
  });
  const [bumpOptions, delivery] = await Promise.all([listBumpOptions(user.workspace.id, product.id), deliverySummary(user.workspace.id, product.id)]);
  const canEdit = canManageWorkspaceSettings(user.role);
  const readOnlyReason = product.syncedFromShopify
    ? 'Este producto se sincroniza desde Shopify: sus datos se editan en Shopify.'
    : product.status === 'ARCHIVED'
      ? 'El producto está archivado. Restáuralo para editarlo.'
      : null;
  const currency = ((STUDIO_CURRENCIES as readonly string[]).includes(product.currency) ? product.currency : 'CLP') as StudioCurrency;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <StudioPageHeader
        eyebrow="Producto"
        title={product.name}
        badge={<StatusBadge tone={STATUS_TONE[product.status]}>{STATUS_LABEL[product.status]}</StatusBadge>}
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-10 pt-2 sm:px-8">
        <div className="space-y-4">
          <PlanLockedNotice workspaceId={user.workspace.id} feature="commerce.products" />
          {(flags.creado || flags.duplicado) && (
            <p role="status" className="rounded-lg bg-lime/25 px-3 py-2 text-sm text-success-ink">
              {flags.creado ? 'Producto creado como borrador. Revisa la vista previa y publícalo cuando esté listo.' : 'Copia creada como borrador. Las ventas y métricas del original no se copian.'}
            </p>
          )}
          <ProductActions
            productId={product.id}
            productName={product.name}
            status={product.status}
            canEdit={canEdit}
            publishBlockers={product.publishBlockers}
            usedAsBumpBy={product.usedAsBumpBy.map((item) => item.name)}
          />
          {product.usedAsBumpBy.length > 0 && (
            <p className="text-xs text-soft">Se ofrece como producto adicional en: {product.usedAsBumpBy.map((item) => item.name).join(', ')}.</p>
          )}
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
            <ProductEditor
              product={{
                id: product.id,
                name: product.name,
                description: product.description,
                type: product.type as StudioProductType,
                currency,
                basePrice: product.basePrice,
                sku: product.sku,
                options: product.options,
                bumpVariantId: product.bump?.variantId ?? null,
              }}
              bumpOptions={bumpOptions}
              canEdit={canEdit}
              readOnlyReason={readOnlyReason}
              bumpWarning={product.bump?.issue ? BUMP_ISSUE_TEXT[product.bump.issue] : null}
            />
            <div className="space-y-4">
              <SalesBrainCard productId={product.id} />
              <CheckoutLinkCard productId={product.id} status={product.status} checkoutUrl={product.checkoutUrl} />
              <DeliveryCard productId={product.id} productType={product.type} summary={delivery} />
              <CoverUploader productId={product.id} coverVersion={product.cover?.version ?? null} editable={canEdit && !readOnlyReason} />
              <MetricsCard metrics={product.metrics} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
