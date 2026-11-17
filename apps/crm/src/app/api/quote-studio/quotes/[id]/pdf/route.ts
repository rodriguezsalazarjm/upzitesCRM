import { NextResponse } from 'next/server';
import { requireCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { snapshotPdf } from '@/lib/quote-studio/public';
import { buildRenderDoc } from '@/lib/quote-studio/service';

export const dynamic = 'force-dynamic';

/** PDF de la versión actual (la que se edita), generado en el servidor. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireCurrentUser();
  const { id } = await params;
  const quote = await prisma.salesQuote.findFirst({ where: { id, workspaceId: user.workspace.id } });
  if (!quote) return NextResponse.json({ message: 'Cotización no encontrada.' }, { status: 404 });
  const pdf = snapshotPdf(await buildRenderDoc(user.workspace.id, quote));
  return new NextResponse(pdf as unknown as BodyInit, {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${quote.number}-v${quote.version}.pdf"`, 'Cache-Control': 'private, no-store' },
  });
}
