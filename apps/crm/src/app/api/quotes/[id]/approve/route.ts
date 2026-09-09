import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireCurrentUser } from '@/lib/auth';
import { parseBody } from '@/lib/http';
import { approveQuote, QuoteError } from '@/lib/quotes/service';

const schema = z.object({ comment: z.string().optional() });

/**
 * Aprueba una cotizacion y devuelve el enlace del PDF.
 *
 * El token se muestra UNA vez, en esta respuesta: despues solo queda su hash.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireCurrentUser();

  const parsed = await parseBody(request, schema);
  if (!parsed.ok) return parsed.response;

  try {
    const { token } = await approveQuote({
      workspaceId: user.workspace.id,
      quoteId: id,
      reviewer: { id: user.id, role: user.role },
      comment: parsed.data.comment,
    });

    const baseUrl = (process.env.NEXT_PUBLIC_CRM_BASE_URL ?? 'http://localhost:3001').replace(/\/+$/, '');
    return NextResponse.json({ data: { pdfUrl: `${baseUrl}/q/${token}` } });
  } catch (error) {
    if (error instanceof QuoteError) {
      const status = error.code === 'FORBIDDEN' ? 403 : error.code === 'NOT_FOUND' ? 404 : 409;
      return NextResponse.json({ message: error.message, code: error.code }, { status });
    }
    throw error;
  }
}
