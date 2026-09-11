import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireCurrentUser } from '@/lib/auth';
import { parseBody } from '@/lib/http';
import { enroll } from '@/lib/marketing/journeys';
import { canManageMarketing } from '@/lib/marketing/roles';

export const dynamic = 'force-dynamic';

const schema = z.object({ contactId: z.string().min(1) });

/** Inscripcion manual desde la interfaz. El barrido cubre el resto. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireCurrentUser();

  if (!canManageMarketing(user.role)) {
    return NextResponse.json(
      { message: 'Solo el owner o un admin puede inscribir contactos.' },
      { status: 403 },
    );
  }

  const parsed = await parseBody(request, schema);
  if (!parsed.ok) return parsed.response;

  const result = await enroll({
    workspaceId: user.workspace.id,
    journeyId: id,
    contactId: parsed.data.contactId,
    reason: `inscripcion manual de ${user.email}`,
  });

  if (!result.enrolled) {
    // No inscribir casi nunca es un error del servidor: es que ya estaba, que
    // el journey no esta publicado o que el contacto no califica.
    const status = result.reason === 'NOT_FOUND' || result.reason === 'CONTACT_NOT_FOUND' ? 404 : 409;
    return NextResponse.json({ message: result.reason, code: result.reason }, { status });
  }

  return NextResponse.json({ data: result }, { status: 201 });
}
