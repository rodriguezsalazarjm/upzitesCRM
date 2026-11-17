import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { respondPublicQuote } from '@/lib/quote-studio/public';

export const dynamic = 'force-dynamic';

/** El cliente acepta o rechaza (con comentario) desde el enlace. El token es la autorización. */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  try {
    const result = await respondPublicQuote(token, await request.json().catch(() => ({})));
    return NextResponse.json(result.ok ? { data: result } : { message: result.message }, { status: result.ok ? 200 : 409 });
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ message: 'Respuesta inválida.' }, { status: 422 });
    throw error;
  }
}
