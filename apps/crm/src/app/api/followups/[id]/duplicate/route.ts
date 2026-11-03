import { followUpRoute } from '@/lib/followups/http';
import { duplicateStrategy } from '@/lib/followups/service';

export const dynamic = 'force-dynamic';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return followUpRoute((actor) => duplicateStrategy(actor, id));
}
