import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireCurrentUser } from '@/lib/auth';
import { parseBody } from '@/lib/http';
import { prisma } from '@/lib/prisma';
import { createOrder, OrderError } from '@/lib/commerce/orders';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  contactId: z.string().optional(),
  conversationId: z.string().optional(),
  customerEmail: z.string().email().optional(),
  customerName: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(z.object({ variantId: z.string().min(1), quantity: z.number().int().min(1).max(99) })).min(1),
});

export async function GET() {
  const user = await requireCurrentUser();

  const orders = await prisma.customerOrder.findMany({
    where: { workspaceId: user.workspace.id },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: {
      lines: true,
      contact: { select: { firstName: true, lastName: true } },
      payments: { select: { status: true, amount: true }, orderBy: { createdAt: 'desc' }, take: 1 },
    },
  });

  return NextResponse.json({ data: orders });
}

export async function POST(request: Request) {
  const user = await requireCurrentUser();
  const parsed = await parseBody(request, createSchema);
  if (!parsed.ok) return parsed.response;

  try {
    // El contacto se valida contra el workspace: un id ajeno no crea el pedido.
    if (parsed.data.contactId) {
      const contact = await prisma.contact.findFirst({
        where: { id: parsed.data.contactId, workspaceId: user.workspace.id },
        select: { id: true },
      });
      if (!contact) {
        return NextResponse.json({ message: 'Contacto no encontrado' }, { status: 404 });
      }
    }

    const order = await createOrder({
      workspaceId: user.workspace.id,
      contactId: parsed.data.contactId,
      conversationId: parsed.data.conversationId,
      customerEmail: parsed.data.customerEmail,
      customerName: parsed.data.customerName,
      notes: parsed.data.notes,
      items: parsed.data.items,
      actorId: user.id,
    });

    return NextResponse.json({ data: order }, { status: 201 });
  } catch (error) {
    if (error instanceof OrderError) {
      const status = error.code === 'NOT_FOUND' ? 404 : 409;
      return NextResponse.json({ message: error.message, code: error.code }, { status });
    }
    throw error;
  }
}
