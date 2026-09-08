import { NextResponse } from 'next/server';
import { releaseConversationToAi } from '@/lib/conversations';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await releaseConversationToAi(id);

  if (!result) {
    return NextResponse.json({ message: 'Conversacion no encontrada' }, { status: 404 });
  }

  return NextResponse.json({ data: result });
}
