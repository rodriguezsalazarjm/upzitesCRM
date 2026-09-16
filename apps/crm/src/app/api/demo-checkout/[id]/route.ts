import { requireCurrentUser } from '@/lib/auth';
import { canManageChannels } from '@/lib/conversations';
import { prisma } from '@/lib/prisma';
import { isLocalDemo } from '@/lib/testing/local-mode';
import { processOrderPayment } from '@/lib/commerce/payment-webhook';
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isLocalDemo()) return new Response(null, { status: 404 });
  const user = await requireCurrentUser(); if (!canManageChannels(user.role)) return Response.json({ message: 'Sin permiso.' }, { status: 403 });
  const { id } = await params;
  const order = await prisma.customerOrder.findFirst({ where: { id, workspaceId: user.workspace.id } });
  if (!order || !(order.metadata as { fake?: boolean } | null)?.fake) return new Response(null, { status: 404 });
  const data = await processOrderPayment({ orderId: order.id, externalPaymentId: `fake-payment:${order.id}`, status: 'APPROVED', rawStatus: 'approved', amount: order.total, currency: order.currency, baseUrl: 'http://localhost:3101' });
  return Response.json({ data });
}
