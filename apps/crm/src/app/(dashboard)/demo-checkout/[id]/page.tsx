import { notFound } from 'next/navigation';
import { requireCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isLocalDemo } from '@/lib/testing/local-mode';
import { DemoPayment } from './payment';
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  if (!isLocalDemo()) notFound();
  const user = await requireCurrentUser(); const { id } = await params;
  const order = await prisma.customerOrder.findFirst({ where: { id, workspaceId: user.workspace.id }, include: { lines: true } });
  if (!order || !(order.metadata as { fake?: boolean } | null)?.fake) notFound();
  return <div className="space-y-4 p-8"><h1 className="text-2xl font-bold">Checkout demo · sin cobro real</h1>{order.lines.map(l => <p key={l.id}>{l.name} · {l.quantity} × {l.unitPrice} {order.currency}</p>)}<p>Total del catálogo: {order.total} {order.currency}</p><p>Estado: {order.status}</p><DemoPayment id={id} /></div>;
}
