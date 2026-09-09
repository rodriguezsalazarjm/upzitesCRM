import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireCurrentUser } from '@/lib/auth';
import { parseBody } from '@/lib/http';
import { QuoteError, rejectQuote } from '@/lib/quotes/service';

const schema = z.object({
  comment: z.string().min(1),
  changesRequested: z.boolean().default(false),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireCurrentUser();

  const parsed = await parseBody(request, schema);
  if (!parsed.ok) return parsed.response;

  try {
    await rejectQuote({
      workspaceId: user.workspace.id,
      quoteId: id,
      reviewer: { id: user.id, role: user.role },
      comment: parsed.data.comment,
      changesRequested: parsed.data.changesRequested,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof QuoteError) {
      const status = error.code === 'FORBIDDEN' ? 403 : error.code === 'NOT_FOUND' ? 404 : 409;
      return NextResponse.json({ message: error.message, code: error.code }, { status });
    }
    throw error;
  }
}
