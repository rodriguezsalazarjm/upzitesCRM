import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireCurrentUser } from '@/lib/auth';
import { openAlerts, scanWorkspaceHealth } from '@/lib/billing/alerts';
import { parseBody } from '@/lib/http';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/** Avisos abiertos. `?scan=1` revisa antes de responder. */
export async function GET(request: Request) {
  const user = await requireCurrentUser();

  if (new URL(request.url).searchParams.get('scan') === '1') {
    await scanWorkspaceHealth(user.workspace.id);
  }

  return NextResponse.json({ data: await openAlerts(user.workspace.id) });
}

const ackSchema = z.object({ alertId: z.string().min(1) });

/**
 * Marca un aviso como visto.
 *
 * No lo resuelve: el problema sigue ahi hasta que el barrido compruebe que se
 * arreglo. Confirmar solo dice "ya lo vi", que es distinto de "ya lo arregle".
 */
export async function POST(request: Request) {
  const user = await requireCurrentUser();

  const parsed = await parseBody(request, ackSchema);
  if (!parsed.ok) return parsed.response;

  const updated = await prisma.workspaceAlert.updateMany({
    where: { id: parsed.data.alertId, workspaceId: user.workspace.id },
    data: { acknowledgedAt: new Date(), acknowledgedById: user.id },
  });

  if (updated.count === 0) {
    return NextResponse.json({ message: 'Aviso no encontrado' }, { status: 404 });
  }

  return NextResponse.json({ data: { acknowledged: true } });
}
