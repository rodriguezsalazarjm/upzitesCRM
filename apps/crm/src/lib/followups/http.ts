import { NextResponse } from 'next/server';
import { requireCurrentUser } from '../auth';
import { EntitlementError } from '../entitlements';
import { entitlementResponse } from '../entitlements/http';
import { FollowUpError, type Actor } from './service';

/** Envoltorio comun de las rutas de seguimiento: sesion, errores tipados y JSON. */
export async function followUpRoute(run: (actor: Actor) => Promise<unknown>) {
  const user = await requireCurrentUser();
  try {
    const data = await run({ id: user.id, role: user.role, workspaceId: user.workspace.id });
    return NextResponse.json({ data });
  } catch (error) {
    if (error instanceof FollowUpError) return NextResponse.json({ message: error.message, code: error.code }, { status: error.status });
    if (error instanceof EntitlementError) return entitlementResponse(error);
    throw error;
  }
}
