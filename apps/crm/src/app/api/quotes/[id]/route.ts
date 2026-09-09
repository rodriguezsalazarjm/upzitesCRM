import { NextResponse } from 'next/server';
import { requireCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireCurrentUser();

  const quote = await prisma.quote.findFirst({
    where: { id, workspaceId: user.workspace.id },
    include: {
      lines: { orderBy: { position: 'asc' } },
      contact: { select: { firstName: true, lastName: true, phone: true } },
      ruleSet: { select: { name: true, serviceKey: true, version: true } },
      parent: { select: { id: true, version: true, total: true } },
      revisions: { select: { id: true, version: true, total: true, status: true } },
    },
  });

  if (!quote) return NextResponse.json({ message: 'Cotizacion no encontrada' }, { status: 404 });

  const { pdfTokenHash, ...safe } = quote;
  return NextResponse.json({ data: { ...safe, hasPdf: Boolean(pdfTokenHash) } });
}
