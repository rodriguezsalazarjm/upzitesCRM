import { NextResponse } from 'next/server';
import { z } from 'zod';
import { parseBody } from '@/lib/http';
import { enforce } from '@/lib/ops/rate-limit';
import { readSessionCookie, setSessionCookie } from '@/lib/session';
import { switchWorkspace } from '@/lib/workspace-switch';

const switchSchema = z.object({ workspaceId: z.string().min(1) });

/**
 * Cambia el workspace activo de la sesion. Solo a workspaces con membership
 * ACTIVE: sin ella la respuesta es 404 (tambien para un SUPER_ADMIN; el acceso
 * cross-tenant va por /api/platform/support-sessions).
 */
export async function POST(request: Request) {
  const limited = await enforce('workspaceSwitch', request);
  if (limited) return limited;

  const session = await readSessionCookie();
  if (!session) return NextResponse.json({ message: 'Inicia sesion.' }, { status: 401 });

  const parsed = await parseBody(request, switchSchema);
  if (!parsed.ok) return parsed.response;

  const result = await switchWorkspace({
    userId: session.userId,
    workspaceId: parsed.data.workspaceId,
    currentSupportSessionId: session.supportSessionId,
  });
  if (!result.ok) return NextResponse.json({ message: 'Workspace no encontrado.' }, { status: 404 });

  // Reemitir conserva la version de la sesion verificada (nunca la refresca).
  await setSessionCookie({ ...result.session, sessionVersion: session.sessionVersion });
  return NextResponse.json({ data: { workspace: result.workspace } });
}
