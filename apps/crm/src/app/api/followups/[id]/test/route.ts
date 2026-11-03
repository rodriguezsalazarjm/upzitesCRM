import { z } from 'zod';
import { followUpRoute } from '@/lib/followups/http';
import { testEnroll } from '@/lib/followups/service';
import { parseBody } from '@/lib/http';

export const dynamic = 'force-dynamic';

const schema = z.object({ contactId: z.string().min(1).max(64) }).strict();

/** Inscribe un contacto en una estrategia en modo prueba (nada sale a ningun canal). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = await parseBody(request, schema);
  if (!parsed.ok) return parsed.response;
  return followUpRoute((actor) => testEnroll(actor, id, parsed.data.contactId));
}
