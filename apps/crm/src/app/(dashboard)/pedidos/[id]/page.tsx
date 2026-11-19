import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, PackageCheck } from 'lucide-react';
import { SaleTrail } from '@/components/analytics/sale-trail';
import { DeliveryActions } from '@/components/orders/delivery-actions';
import { loadSaleTrail } from '@/lib/analytics/funnel';
import { SettingsCard } from '@/components/ui/settings-card';
import { StatusBadge } from '@/components/ui/status-badge';
import { requireCurrentUser } from '@/lib/auth';
import { canManageChannels } from '@/lib/conversations';
import { orderDeliveryView } from '@/lib/commerce/delivery-admin';
import { FORMAT_LABEL, formatOf } from '@/lib/commerce/digital-assets/rules';
import { formatMinor } from '@/lib/commerce/product-studio/rules';
import { deliveryStatusLabel, deliveryStatusTone, orderStatusLabel, orderStatusTone, paymentStatusLabel, paymentStatusTone } from '@/lib/status-tone';

export const dynamic = 'force-dynamic';

function when(date: Date | null) {
  return date ? date.toLocaleString('es-CL', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
      <dt className="w-40 shrink-0 text-xs text-soft">{label}</dt>
      <dd className="min-w-0 text-sm text-carbon [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

/** Detalle de un pedido: pago y entrega digital con su historial (Punto 3). */
export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireCurrentUser();
  const { id } = await params;
  const view = await orderDeliveryView(user.workspace.id, id);
  if (!view) notFound();
  const { order } = view;
  const manager = canManageChannels(user.role);
  const payment = order.payments[0];
  const trail = await loadSaleTrail(user.workspace.id, order.id);
  const buyer = order.contact ? `${order.contact.firstName} ${order.contact.lastName ?? ''}`.trim() : (order.customerName ?? 'Sin contacto');

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="shrink-0 py-5 pl-16 pr-4 sm:px-8 sm:pb-4 sm:pt-7 md:pl-8">
        <Link href="/pedidos" className="inline-flex items-center gap-1.5 text-xs font-semibold text-soft hover:text-carbon">
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Pedidos
        </Link>
        <p className="type-eyebrow mt-3 text-soft">Pedido {order.id.slice(-8).toUpperCase()}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="min-w-0 break-words text-[28px] font-bold leading-tight tracking-tight text-carbon sm:text-[36px]">{buyer}</h1>
          <StatusBadge tone={orderStatusTone[order.status] ?? 'neutral'}>{orderStatusLabel[order.status] ?? order.status}</StatusBadge>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-10 pt-2 sm:px-8">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
          <div className="space-y-4">
            {view.deliveries.length === 0 ? (
              <SettingsCard icon={PackageCheck} title="Entrega digital" description="Este pedido no tiene una entrega digital.">
                <p className="text-sm text-graphite">
                  {view.noContentSold
                    ? 'Se pagó un producto digital que no tenía contenido configurado. Agrega su contenido en Productos → Entrega digital y envíale el acceso al cliente.'
                    : order.status === 'CONFIRMED' || order.status === 'FULFILLED'
                      ? 'Los productos de este pedido no tienen contenido digital para entregar.'
                      : 'La entrega se crea automáticamente cuando se aprueba el pago.'}
                </p>
              </SettingsCard>
            ) : (
              view.deliveries.map((delivery) => (
                <SettingsCard
                  key={delivery.id}
                  icon={PackageCheck}
                  title="Entrega digital"
                  description={`${delivery.items.length} contenido(s) en un enlace seguro.`}
                  actions={<StatusBadge tone={deliveryStatusTone[delivery.status] ?? 'neutral'}>{deliveryStatusLabel[delivery.status] ?? delivery.status}</StatusBadge>}
                >
                  <div className="space-y-5">
                    <dl className="space-y-2">
                      <Row label="Creada">{when(delivery.createdAt)}</Row>
                      <Row label="Intentos de envío">{delivery.attempts}</Row>
                      <Row label="Último intento">{when(delivery.lastAttemptAt)}</Row>
                      {delivery.lastError && delivery.status !== 'REVOKED' && <Row label="Motivo">{delivery.lastError}</Row>}
                      <Row label="Último acceso del comprador">{when(delivery.lastAccessAt)}</Row>
                      {delivery.revokedAt && <Row label="Revocada">{when(delivery.revokedAt)}</Row>}
                      {delivery.expiresAt && !delivery.revokedAt && <Row label="Vigente hasta">{when(delivery.expiresAt)}</Row>}
                    </dl>

                    <div>
                      <h3 className="text-sm font-bold text-carbon">Contenido incluido</h3>
                      <p className="mt-0.5 text-xs text-soft">Copia tomada al momento del pago: los cambios posteriores del producto no la modifican.</p>
                      <ol className="mt-2 divide-y divide-line rounded-xl border border-line">
                        {delivery.items.map((item, index) => {
                          const format = formatOf(item);
                          return (
                            <li key={item.id} className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2">
                              <span className="min-w-0 text-sm text-carbon [overflow-wrap:anywhere]">
                                {index + 1}. {item.name}
                                <span className="text-xs text-soft"> · {format ? FORMAT_LABEL[format] : 'Contenido'} · {item.productName}</span>
                              </span>
                              <span className="text-xs text-soft">{item.downloadCount} acceso(s)</span>
                            </li>
                          );
                        })}
                      </ol>
                    </div>

                    {manager && (
                      <div>
                        {delivery.url && (
                          <p className="mb-3 break-all rounded-lg bg-ivory px-3 py-2 text-xs text-graphite">
                            <span className="font-semibold text-carbon">Enlace del comprador: </span>
                            {delivery.url}
                          </p>
                        )}
                        <DeliveryActions orderId={order.id} deliveryId={delivery.id} url={delivery.url} revoked={delivery.status === 'REVOKED'} />
                      </div>
                    )}

                    <div>
                      <h3 className="text-sm font-bold text-carbon">Historial</h3>
                      {delivery.events.length === 0 ? (
                        <p className="mt-1 text-xs text-soft">Sin eventos registrados.</p>
                      ) : (
                        <ol className="mt-2 space-y-2" aria-label="Historial de la entrega">
                          {delivery.events.map((event) => (
                            <li key={event.id} className="border-l-2 border-line pl-3">
                              <p className="text-sm font-semibold text-carbon">
                                {event.label}
                                {event.actor ? <span className="font-normal text-soft"> · {event.actor}</span> : null}
                              </p>
                              <p className="text-xs text-soft">{when(event.at)}</p>
                              {event.detail && <p className="mt-0.5 text-xs text-graphite">{event.detail}</p>}
                            </li>
                          ))}
                        </ol>
                      )}
                    </div>
                  </div>
                </SettingsCard>
              ))
            )}
          </div>

          <div className="space-y-4">
          <SettingsCard title="Resumen">
            <dl className="space-y-2">
              <Row label="Total">{formatMinor(order.total, order.currency)}</Row>
              <Row label="Pago">
                {payment ? <StatusBadge tone={paymentStatusTone[payment.status] ?? 'neutral'}>{paymentStatusLabel[payment.status] ?? payment.status}</StatusBadge> : '—'}
              </Row>
              <Row label="Fecha">{when(order.createdAt)}</Row>
              <Row label="Origen">{order.campaignRoute ? `Campaña: ${order.campaignRoute.name}` : (order.attribution as { adId?: string } | null)?.adId ? `Anuncio ${(order.attribution as { adId: string }).adId} (sin regla)` : order.conversationId ? 'Conversación sin atribución' : 'Directo'}{order.conversationId && <> · <Link href={`/inbox/${order.conversationId}`} className="text-electric underline">ver conversación</Link></>}</Row>
              {order.contact?.email || order.customerEmail ? <Row label="Email">{order.contact?.email ?? order.customerEmail}</Row> : null}
            </dl>
            <ul className="mt-4 space-y-1 border-t border-line pt-3">
              {order.lines.map((line) => (
                <li key={line.id} className="flex justify-between gap-2 text-sm">
                  <span className="min-w-0 text-carbon [overflow-wrap:anywhere]">
                    {line.quantity}× {line.name}
                  </span>
                  <span className="tabular shrink-0 text-graphite">{formatMinor(line.total, order.currency)}</span>
                </li>
              ))}
            </ul>
          </SettingsCard>
          {trail && (
            <SettingsCard title="Recorrido de la venta" description="De la fuente al pago.">
              <SaleTrail steps={trail.steps} />
            </SettingsCard>
          )}
          </div>
        </div>
      </div>
    </div>
  );
}
