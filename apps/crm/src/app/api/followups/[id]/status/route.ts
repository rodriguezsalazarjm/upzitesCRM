import { followUpRoute } from '@/lib/followups/http';
import { statusActionSchema } from '@/lib/followups/rules';
import { setStrategyStatus } from '@/lib/followups/service';
import { parseBody } from '@/lib/http';

export const dynamic = 'force-dynamic';

/** Activar (publish), pausar (pause) o desactivar (archive). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = await parseBody(request, statusActionSchema);
  if (!parsed.ok) return parsed.response;
  return followUpRoute((actor) => setStrategyStatus(actor, id, parsed.data.action));
}
