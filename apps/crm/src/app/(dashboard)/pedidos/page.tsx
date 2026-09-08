import { Receipt } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { requireCurrentUser } from '@/lib/auth';
import { formatCurrency } from '@/lib/mock-data';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const STATUS: Record<string, { label: string; variant: 'success' | 'warning' | 'outline' }> = {
  DRAFT: { label: 'Borrador', variant: 'outline' },
  PENDING_PAYMENT: { label: 'Esperando pago', variant: 'warning' },
  CONFIRMED: { label: 'Pagado', variant: 'success' },
  PROCESSING: { label: 'En proceso', variant: 'warning' },
  FULFILLED: { label: 'Entregado', variant: 'success' },
  CANCELLED: { label: 'Cancelado', variant: 'outline' },
  REFUNDED: { label: 'Devuelto', variant: 'outline' },
};

export default async function PedidosPage() {
  const user = await requireCurrentUser();

  const orders = await prisma.customerOrder.findMany({
    where: { workspaceId: user.workspace.id },
    include: {
      lines: true,
      contact: { select: { firstName: true, lastName: true } },
      deliveries: { select: { id: true, status: true, downloadCount: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Header title="Pedidos" subtitle="Compras, pagos y entregas digitales" />
      <div className="flex-1 space-y-3 overflow-y-auto p-6">
        {orders.length === 0 && (
          <Card className="border-0 shadow-sm">
            <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
              <Receipt className="h-8 w-8 text-slate-300" />
              <p className="text-sm font-medium text-slate-700">Sin pedidos todavia</p>
            </CardContent>
          </Card>
        )}

        {orders.map((order) => {
          const status = STATUS[order.status] ?? { label: order.status, variant: 'outline' as const };
          const downloads = order.deliveries.reduce((sum, delivery) => sum + delivery.downloadCount, 0);

          return (
            <Card key={order.id} className="border-0 shadow-sm">
              <CardContent className="flex items-center gap-4 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-slate-900">
                      {order.contact
                        ? `${order.contact.firstName} ${order.contact.lastName}`
                        : (order.customerName ?? 'Sin contacto')}
                    </p>
                    <Badge variant={status.variant}>{status.label}</Badge>
                  </div>

                  <p className="mt-0.5 truncate text-xs text-slate-500">
                    {order.lines.map((line) => `${line.quantity}× ${line.name}`).join(', ')}
                  </p>

                  {order.deliveries.length > 0 && (
                    <p className="mt-0.5 text-[10px] text-slate-400">
                      {order.deliveries.length} acceso(s) · {downloads} descarga(s)
                    </p>
                  )}
                </div>

                <div className="shrink-0 text-right">
                  <p className="text-sm font-bold text-slate-900">{formatCurrency(order.total)}</p>
                  <p className="text-[10px] text-slate-400">
                    {order.createdAt.toLocaleDateString('es-CL')}
                  </p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
