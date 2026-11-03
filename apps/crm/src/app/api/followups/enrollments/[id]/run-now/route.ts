import { followUpRoute } from '@/lib/followups/http';
import { runEnrollmentNow } from '@/lib/followups/service';

export const dynamic = 'force-dynamic';

/** Adelanta el siguiente paso de una inscripcion de prueba. Una real se rechaza. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return followUpRoute((actor) => runEnrollmentNow(actor, id));
}
