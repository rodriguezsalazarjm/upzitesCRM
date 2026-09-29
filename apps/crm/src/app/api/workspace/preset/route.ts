import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireCurrentUser } from '@/lib/auth';
import { parseBody } from '@/lib/http';
import { applyRecommendedPreset, ProfileError } from '@/lib/workspace-profile/service';

export const dynamic = 'force-dynamic';

const schema = z.object({ resetMyLayout: z.boolean().default(true) }).strict();

/**
 * "Aplicar navegacion recomendada para este tipo de negocio" (P0-E). Accion
 * explicita y separada de guardar el perfil. Solo OWNER/ADMIN.
 */
export async function POST(request: Request) {
  const user = await requireCurrentUser();
  const parsed = await parseBody(request, schema);
  if (!parsed.ok) return parsed.response;
  try {
    const profile = await applyRecommendedPreset(
      { userId: user.id, workspaceId: user.workspace.id, role: user.role },
      { resetMyLayout: parsed.data.resetMyLayout },
    );
    return NextResponse.json({ data: { presetKey: profile.presetKey, presetVersion: profile.presetVersion } });
  } catch (error) {
    if (error instanceof ProfileError) {
      return NextResponse.json({ message: error.message, code: error.code }, { status: error.code === 'FORBIDDEN' ? 403 : 400 });
    }
    throw error;
  }
}
