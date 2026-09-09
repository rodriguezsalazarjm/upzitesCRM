import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireCurrentUser } from '@/lib/auth';
import { parseBody } from '@/lib/http';
import { prisma } from '@/lib/prisma';
import { createQuote, QuoteError } from '@/lib/quotes/service';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  serviceKey: z.string().min(1),
  inputs: z.record(z.unknown()),
  contactId: z.string().optional(),
  opportunityId: z.string().optional(),
  conversationId: z.string().optional(),
  parentQuoteId: z.string().optional(),
});

export async function GET(request: Request) {
  const user = await requireCurrentUser();
  const { searchParams } = new URL(request.url);

  const quotes = await prisma.quote.findMany({
    where: {
      workspaceId: user.workspace.id,
      status: (searchParams.get('status') as never) ?? undefined,
    },
    include: {
      lines: { orderBy: { position: 'asc' } },
      contact: { select: { firstName: true, lastName: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  // El token del PDF nunca sale por la API.
  return NextResponse.json({
    data: quotes.map(({ pdfTokenHash, ...quote }) => ({ ...quote, hasPdf: Boolean(pdfTokenHash) })),
  });
}

export async function POST(request: Request) {
  const user = await requireCurrentUser();
  const parsed = await parseBody(request, createSchema);
  if (!parsed.ok) return parsed.response;

  try {
    if (parsed.data.contactId) {
      const contact = await prisma.contact.findFirst({
        where: { id: parsed.data.contactId, workspaceId: user.workspace.id },
        select: { id: true },
      });
      if (!contact) return NextResponse.json({ message: 'Contacto no encontrado' }, { status: 404 });
    }

    const quote = await createQuote({
      workspaceId: user.workspace.id,
      serviceKey: parsed.data.serviceKey,
      inputs: parsed.data.inputs,
      contactId: parsed.data.contactId,
      opportunityId: parsed.data.opportunityId,
      conversationId: parsed.data.conversationId,
      parentQuoteId: parsed.data.parentQuoteId,
      actorId: user.id,
    });

    return NextResponse.json({ data: quote }, { status: 201 });
  } catch (error) {
    if (error instanceof QuoteError) {
      const status = error.code === 'NOT_FOUND' ? 404 : error.code === 'MISSING_DATA' ? 422 : 409;
      return NextResponse.json(
        { message: error.message, code: error.code, details: error.details },
        { status },
      );
    }
    throw error;
  }
}
