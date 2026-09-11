import { NextResponse } from 'next/server';
import { requireCurrentUser } from '@/lib/auth';
import { getOnboardingState } from '@/lib/onboarding/steps';

export const dynamic = 'force-dynamic';

/**
 * Estado del wizard.
 *
 * Se calcula en cada peticion mirando el estado real del workspace. Cuesta unas
 * consultas; a cambio, lo que muestra es cierto incluso si el cliente
 * desconecto WhatsApp hace cinco minutos.
 */
export async function GET() {
  const user = await requireCurrentUser();
  const state = await getOnboardingState(user.workspace.id);

  return NextResponse.json({ data: state });
}
