import { Receipt } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { requireCurrentUser } from '@/lib/auth';
import { formatCurrency } from '@/lib/mock-data';
import { prisma } from '@/lib/prisma';
import { deliveryStatusLabel, deliveryStatusTone, orderStatusLabel, orderStatusTone, paymentStatusLabel, paymentStatusTone } from '@/lib/status-tone';

export const dynamic = 'force-dynamic';

export default async function PedidosPage() {
  const user = await requireCurrentUser();

  const orders = await prisma.customerOrder.findMany({
    where: { workspaceId: user.workspace.id },
    include: {
      lines: true,
      contact: { select: { firstName: true, lastName: true } },
      deliveries: { select: { id: true, status: true, downloadCount: true } },
      payments: { orderBy: { createdAt: 'desc' }, take: 1, select: { status: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Header title="Pedidos" subtitle="Compras, pagos y entregas digitales" />
      <div className="flex-1 overflow-y-auto p-6">
        <Card className="overflow-hidden">
          <Table density="compact">
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead className="hidden sm:table-cell">Pedido</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="hidden md:table-cell">Pago</TableHead>
                <TableHead className="hidden lg:table-cell">Entrega</TableHead>
                <TableHead align="right">Total</TableHead>
                <TableHead className="hidden xl:table-cell">Fecha</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((order) => {
                const payment = order.payments[0];
                const deliveryStatus = order.deliveries.length
                  ? order.deliveries.some((d) => d.status === 'ACCESSED')
                    ? 'ACCESSED'
                    : order.deliveries[0].status
                  : null;
                const downloads = order.deliveries.reduce((sum, delivery) => sum + delivery.downloadCount, 0);

                return (
                  <TableRow key={order.id}>
                    <TableCell>
                      <p className="truncate font-semibold text-carbon">
                        {order.contact
                          ? `${order.contact.firstName} ${order.contact.lastName}`
                          : (order.customerName ?? 'Sin contacto')}
                      </p>
                      <p className="truncate text-xs text-soft">
                        {order.lines.map((line) => `${line.quantity}× ${line.name}`).join(', ')}
                      </p>
                    </TableCell>
                    <TableCell className="hidden text-graphite sm:table-cell">
                      {order.id.slice(-8).toUpperCase()}
                    </TableCell>
                    <TableCell>
                      <StatusBadge tone={orderStatusTone[order.status] ?? 'neutral'}>
                        {orderStatusLabel[order.status] ?? order.status}
                      </StatusBadge>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {payment ? (
                        <StatusBadge tone={paymentStatusTone[payment.status] ?? 'neutral'}>
                          {paymentStatusLabel[payment.status] ?? payment.status}
                        </StatusBadge>
                      ) : (
                        <span className="text-xs text-soft">—</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {deliveryStatus ? (
                        <StatusBadge tone={deliveryStatusTone[deliveryStatus] ?? 'neutral'}>
                          {deliveryStatusLabel[deliveryStatus] ?? deliveryStatus}
                        </StatusBadge>
                      ) : (
                        <span className="text-xs text-soft">—</span>
                      )}
                      {downloads > 0 && <p className="mt-0.5 text-[10px] text-soft">{downloads} descarga(s)</p>}
                    </TableCell>
                    <TableCell numeric>{formatCurrency(order.total)}</TableCell>
                    <TableCell muted className="hidden xl:table-cell">
                      {order.createdAt.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </TableCell>
                  </TableRow>
                );
              })}
              {orders.length === 0 && (
                <TableEmpty colSpan={7} icon={Receipt} title="Sin pedidos todavia" />
              )}
            </TableBody>
          </Table>
        </Card>
      </div>
    </div>
  );
}
