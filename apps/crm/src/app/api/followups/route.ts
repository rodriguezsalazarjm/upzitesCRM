import { followUpRoute } from '@/lib/followups/http';
import { strategyInputSchema } from '@/lib/followups/rules';
import { createStrategy, listStrategies } from '@/lib/followups/service';
import { parseBody } from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function GET() {
  return followUpRoute((actor) => listStrategies(actor.workspaceId));
}

/** Crea una estrategia. Nace en borrador: activarla es un acto aparte. */
export async function POST(request: Request) {
  const parsed = await parseBody(request, strategyInputSchema);
  if (!parsed.ok) return parsed.response;
  return followUpRoute((actor) => createStrategy(actor, parsed.data));
}
