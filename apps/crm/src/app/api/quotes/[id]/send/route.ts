import { NextResponse } from 'next/server';
import { MessageSenderType } from '../../../../../../generated/prisma/client';
import { requireCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { markQuoteSent, QuoteError } from '@/lib/quotes/service';
import { queueOutboundMessage } from '@/lib/whatsapp/outbound';

/**
 * Envia la cotizacion aprobada por WhatsApp.
 *
 * El enlace del PDF no se guarda en claro, asi que se pide el token que devolvio
 * la aprobacion. Si no se tiene, se reaprueba para regenerarlo.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireCurrentUser();

  const body = (await request.json().catch(() => ({}))) as { pdfUrl?: string };

  const quote = await prisma.quote.findFirst({
    where: { id, workspaceId: user.workspace.id },
    include: { contact: { select: { id: true, firstName: true } } },
  });

  if (!quote) return NextResponse.json({ message: 'Cotizacion no encontrada' }, { status: 404 });

  try {
    await markQuoteSent({ workspaceId: user.workspace.id, quoteId: id, actorId: user.id });
  } catch (error) {
    if (error instanceof QuoteError) {
      return NextResponse.json({ message: error.message, code: error.code }, { status: 409 });
    }
    throw error;
  }

  // Si hay conversacion abierta, se manda por ahi. Si no, queda marcada como
  // enviada para que la envie una persona por el canal que corresponda.
  let messageQueued = false;

  if (quote.conversationId && body.pdfUrl) {
    const conversation = await prisma.conversation.findFirst({
      where: { id: quote.conversationId, workspaceId: user.workspace.id },
      select: { id: true },
    });

    if (conversation) {
      const total = quote.total.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
      await queueOutboundMessage({
        workspaceId: user.workspace.id,
        conversationId: conversation.id,
        text:
          `Hola${quote.contact?.firstName ? ` ${quote.contact.firstName}` : ''}, te dejo la cotizacion ` +
          `${quote.number}: $${total} ${quote.currency}.\n${body.pdfUrl}`,
        senderType: MessageSenderType.USER,
        senderUserId: user.id,
      });
      messageQueued = true;
    }
  }

  return NextResponse.json({ data: { sent: true, messageQueued } });
}
