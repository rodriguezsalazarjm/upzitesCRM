import { NextResponse } from 'next/server';
import { requireCurrentUser } from '@/lib/auth';
import { OutboundError, processOutbox, retryMessage } from '@/lib/whatsapp/outbound';

/** Reintenta un mensaje fallido desde la bandeja. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string; messageId: string }> },
) {
  const { messageId } = await params;
  const user = await requireCurrentUser();

  try {
    await retryMessage({ workspaceId: user.workspace.id, messageId, actorId: user.id });
    await processOutbox(5);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof OutboundError) {
      return NextResponse.json({ message: error.message }, { status: 404 });
    }
    throw error;
  }
}
