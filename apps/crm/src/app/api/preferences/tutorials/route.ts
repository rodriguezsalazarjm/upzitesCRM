import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireCurrentUser } from '@/lib/auth';
import { parseBody } from '@/lib/http';
import { dismissTutorial, resetTutorials } from '@/lib/preferences';
import { TUTORIAL_KEYS } from '@/lib/tutorials';

export const dynamic = 'force-dynamic';

const schema = z.union([z.object({ dismiss: z.enum(TUTORIAL_KEYS) }).strict(), z.object({ reset: z.literal(true) }).strict()]);

/** Descartar un consejo o "Volver a mostrar consejos" (solo esta persona, este workspace). */
export async function POST(request: Request) {
  const user = await requireCurrentUser();
  const parsed = await parseBody(request, schema);
  if (!parsed.ok) return parsed.response;
  const scope = { userId: user.id, workspaceId: user.workspace.id };
  const data = 'dismiss' in parsed.data ? await dismissTutorial(scope, parsed.data.dismiss) : await resetTutorials(scope);
  return NextResponse.json({ data: { dismissedTutorials: data.dismissedTutorials } });
}
