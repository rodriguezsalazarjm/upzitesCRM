import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireCurrentUser } from '@/lib/auth';
import { parseBody } from '@/lib/http';
import { ActivationError, activateWorkspace, suspendWorkspace } from '@/lib/onboarding/activation';

export const dynamic = 'force-dynamic';

/**
 * Activa el workspace.
 *
 * Los requisitos se comprueban aqui, no en el cliente. El wizard muestra lo que
 * falta; este endpoint es el que se niega si falta algo, porque es el unico
 * punto por el que la activacion puede pasar.
 */
export async function POST() {
  const user = await requireCurrentUser();

  try {
    const activation = await activateWorkspace({
      workspaceId: user.workspace.id,
      actorId: user.id,
      role: user.role,
    });

    return NextResponse.json({ data: activation });
  } catch (error) {
    if (error instanceof ActivationError) {
      return NextResponse.json(
        { message: error.message, code: error.code, blockers: error.blockers },
        { status: error.code === 'FORBIDDEN' ? 403 : 409 },
      );
    }
    throw error;
  }
}

const suspendSchema = z.object({ note: z.string().min(1).max(500) });

/**
 * Suspende el workspace. Es el freno de mano: la IA y la recuperacion se
 * detienen, el equipo sigue usando el CRM y no se borra nada.
 */
export async function DELETE(request: Request) {
  const user = await requireCurrentUser();

  const parsed = await parseBody(request, suspendSchema);
  if (!parsed.ok) return parsed.response;

  try {
    const activation = await suspendWorkspace({
      workspaceId: user.workspace.id,
      actorId: user.id,
      role: user.role,
      note: parsed.data.note,
    });

    return NextResponse.json({ data: activation });
  } catch (error) {
    if (error instanceof ActivationError) {
      return NextResponse.json({ message: error.message, code: error.code }, { status: 403 });
    }
    throw error;
  }
}
