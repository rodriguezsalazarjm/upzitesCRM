import { NextResponse } from 'next/server';
import { requireCurrentUser } from '@/lib/auth';
import { acceptQuote, QuoteError } from '@/lib/quotes/service';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireCurrentUser();

  try {
    await acceptQuote({ workspaceId: user.workspace.id, quoteId: id, actorId: user.id });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof QuoteError) {
      const status = error.code === 'NOT_FOUND' ? 404 : 409;
      return NextResponse.json({ message: error.message, code: error.code }, { status });
    }
    throw error;
  }
}
