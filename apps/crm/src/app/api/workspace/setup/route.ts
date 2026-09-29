import { NextResponse } from 'next/server';
import { requireCurrentUser } from '@/lib/auth';
import { completeOnboarding, ProfileError } from '@/lib/workspace-profile/service';

export const dynamic = 'force-dynamic';

/**
 * Primer setup del negocio (P0-E): guarda el perfil, aplica el preset
 * recomendado y marca el onboarding. Solo OWNER/ADMIN. El workspace es el
 * activo de la sesion verificada; el cuerpo no puede elegir otro.
 */
export async function POST(request: Request) {
  const user = await requireCurrentUser();
  const body = await request.json().catch(() => null);
  try {
    const profile = await completeOnboarding({ userId: user.id, workspaceId: user.workspace.id, role: user.role }, body);
    return NextResponse.json({ data: { presetKey: profile.presetKey, presetVersion: profile.presetVersion } });
  } catch (error) {
    if (error instanceof ProfileError) {
      return NextResponse.json({ message: error.message, code: error.code }, { status: error.code === 'FORBIDDEN' ? 403 : 400 });
    }
    throw error;
  }
}
