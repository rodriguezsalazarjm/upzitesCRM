import { followUpRoute } from '@/lib/followups/http';
import { strategyInputSchema } from '@/lib/followups/rules';
import { getStrategy, updateStrategy } from '@/lib/followups/service';
import { parseBody } from '@/lib/http';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  return followUpRoute((actor) => getStrategy(actor.workspaceId, id));
}

/** Edita una estrategia en borrador o pausada (una activa se pausa primero). */
export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const parsed = await parseBody(request, strategyInputSchema);
  if (!parsed.ok) return parsed.response;
  return followUpRoute((actor) => updateStrategy(actor, id, parsed.data));
}
