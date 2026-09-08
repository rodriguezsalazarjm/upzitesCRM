import { NextResponse } from 'next/server';
import { getConversationDetail } from '@/lib/conversations';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const conversation = await getConversationDetail(id);

  // 404 sin distinguir "no existe" de "es de otro workspace": no filtrar
  // informacion sobre datos ajenos.
  if (!conversation) {
    return NextResponse.json({ message: 'Conversacion no encontrada' }, { status: 404 });
  }

  return NextResponse.json({ data: conversation });
}
