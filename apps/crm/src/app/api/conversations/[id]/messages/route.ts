import { NextResponse } from 'next/server';
import { z } from 'zod';
import { MessageSenderType } from '../../../../../../generated/prisma/client';
import { requireCurrentUser } from '@/lib/auth';
import { parseBody } from '@/lib/http';
import { OutboundError, processOutbox, queueOutboundMessage } from '@/lib/whatsapp/outbound';

const sendSchema = z.object({
  text: z.string().min(1).max(4096),
});

/**
 * Envia un mensaje como humano desde la bandeja.
 *
 * El mensaje se persiste como QUEUED y se despacha por el outbox. Si el envio
 * falla, queda FAILED y visible en la bandeja con boton de reintento, en vez de
 * desaparecer.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireCurrentUser();

  const parsed = await parseBody(request, sendSchema);
  if (!parsed.ok) return parsed.response;

  try {
    const message = await queueOutboundMessage({
      workspaceId: user.workspace.id,
      conversationId: id,
      text: parsed.data.text,
      senderType: MessageSenderType.USER,
      senderUserId: user.id,
    });

    // Despacho inmediato para que el operador vea el estado al instante. La
    // Fase 3 lo mueve a la cola; el outbox ya garantiza que no se pierda.
    await processOutbox(5);

    return NextResponse.json({ data: { id: message.id } }, { status: 201 });
  } catch (error) {
    if (error instanceof OutboundError) {
      const status = error.code === 'NOT_FOUND' ? 404 : 409;
      return NextResponse.json({ message: error.message, code: error.code }, { status });
    }
    throw error;
  }
}
