import { NextResponse } from 'next/server';
import { z } from 'zod';
import { assignConversation } from '@/lib/conversations';
import { parseBody } from '@/lib/http';

const assignSchema = z.object({
  assigneeId: z.string().min(1),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = await parseBody(request, assignSchema);
  if (!parsed.ok) return parsed.response;

  const result = await assignConversation(id, parsed.data.assigneeId);

  if (!result) {
    return NextResponse.json(
      { message: 'Conversacion o usuario no encontrado en este workspace' },
      { status: 404 },
    );
  }

  return NextResponse.json({ data: result });
}
