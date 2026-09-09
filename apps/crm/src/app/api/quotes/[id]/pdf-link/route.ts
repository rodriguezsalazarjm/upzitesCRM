import { NextResponse } from 'next/server';
import { QuoteStatus } from '../../../../../../generated/prisma/client';
import { requireCurrentUser } from '@/lib/auth';
import { recordAudit } from '@/lib/domain/audit';
import { prisma } from '@/lib/prisma';
import { canApproveQuotes, generateQuoteToken, hashQuoteToken } from '@/lib/quotes/service';

/**
 * Regenera el enlace del PDF de una cotizacion ya aprobada.
 *
 * Existe porque el token se muestra una sola vez al aprobar y solo se guarda su
 * hash: sin esto, cerrar la pestana en el momento equivocado dejaba la
 * cotizacion sin forma de enviarse.
 *
 * El token anterior deja de servir. Es una accion humana y auditada, igual que
 * el reenvio de una entrega digital.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireCurrentUser();

  if (!canApproveQuotes(user.role)) {
    return NextResponse.json(
      { message: 'Solo el owner o un admin puede regenerar el enlace.' },
      { status: 403 },
    );
  }

  const quote = await prisma.quote.findFirst({
    where: { id, workspaceId: user.workspace.id },
    select: { id: true, status: true, number: true, version: true },
  });

  if (!quote) return NextResponse.json({ message: 'Cotizacion no encontrada' }, { status: 404 });

  // Solo lo aprobado tiene PDF: un borrador o una rechazada no deben poder
  // circular como si fueran definitivas.
  const shareable: QuoteStatus[] = [QuoteStatus.APPROVED, QuoteStatus.SENT, QuoteStatus.ACCEPTED];

  if (!shareable.includes(quote.status)) {
    return NextResponse.json(
      { message: 'Solo una cotizacion aprobada tiene PDF.', code: 'INVALID_STATE' },
      { status: 409 },
    );
  }

  const token = generateQuoteToken();

  await prisma.quote.update({
    where: { id: quote.id },
    data: { pdfTokenHash: hashQuoteToken(token) },
  });

  await recordAudit({
    workspaceId: user.workspace.id,
    actorId: user.id,
    action: 'quote.pdf_link_regenerated',
    entity: 'Quote',
    entityId: quote.id,
    metadata: { number: quote.number, version: quote.version },
  });

  const baseUrl = (process.env.NEXT_PUBLIC_CRM_BASE_URL ?? 'http://localhost:3001').replace(/\/+$/, '');
  return NextResponse.json({ data: { pdfUrl: `${baseUrl}/q/${token}` } });
}
