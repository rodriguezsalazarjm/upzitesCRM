import { NextResponse } from 'next/server';
import { requireCurrentUser } from '@/lib/auth';
import { parseBody } from '@/lib/http';
import { canManageMarketing } from '@/lib/marketing/roles';
import { ContentAiError, generateContentSuggestions, generateInputSchema } from '@/lib/social/ai-content';

export const dynamic = 'force-dynamic';

/** P23: sugerencias de contenido con IA. No guarda nada: el usuario elige qué guardar. */
export async function POST(request: Request) {
  const user = await requireCurrentUser();
  if (!canManageMarketing(user.role)) return NextResponse.json({ message: 'Solo el owner o un admin puede crear contenido.' }, { status: 403 });
  const parsed = await parseBody(request, generateInputSchema);
  if (!parsed.ok) return parsed.response;
  try {
    return NextResponse.json({ data: await generateContentSuggestions(user.workspace.id, parsed.data) });
  } catch (error) {
    if (error instanceof ContentAiError) return NextResponse.json({ message: error.message }, { status: 422 });
    throw error;
  }
}
