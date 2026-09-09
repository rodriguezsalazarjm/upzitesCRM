import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireCurrentUser } from '@/lib/auth';
import { parseBody } from '@/lib/http';
import { prisma } from '@/lib/prisma';
import { requestReview } from '@/lib/quotes/service';

const schema = z.object({ note: z.string().optional() });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireCurrentUser();

  const parsed = await parseBody(request, schema);
  if (!parsed.ok) return parsed.response;

  const quote = await prisma.quote.findFirst({
    where: { id, workspaceId: user.workspace.id },
    select: { id: true },
  });

  if (!quote) return NextResponse.json({ message: 'Cotizacion no encontrada' }, { status: 404 });

  const approval = await requestReview({
    workspaceId: user.workspace.id,
    quoteId: id,
    requestedById: user.id,
    note: parsed.data.note,
  });

  return NextResponse.json({ data: { approvalId: approval.id } });
}
