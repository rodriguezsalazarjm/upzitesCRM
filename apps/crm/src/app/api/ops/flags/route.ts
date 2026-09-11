import { NextResponse } from 'next/server';
import { z } from 'zod';
import { UserRole } from '../../../../../generated/prisma/client';
import { requireCurrentUser } from '@/lib/auth';
import { parseBody } from '@/lib/http';
import { FEATURES, flagStates, isFeatureKey, setFlag } from '@/lib/ops/flags';

export const dynamic = 'force-dynamic';

const updateSchema = z.object({
  key: z.string().refine(isFeatureKey, { message: `Funcion desconocida. Validas: ${FEATURES.join(', ')}` }),
  enabled: z.boolean(),
  note: z.string().max(300).optional(),
});

export async function GET() {
  const user = await requireCurrentUser();
  return NextResponse.json({ data: await flagStates(user.workspace.id) });
}

/**
 * Enciende o apaga una funcion para este workspace.
 *
 * Solo el owner: apagar la IA o las campanas es una decision operativa con
 * consecuencias visibles para los clientes del cliente.
 *
 * Desde aqui NO se tocan los interruptores globales. Un corte global lo hace
 * quien opera la plataforma, no un cliente: si un workspace pudiera reencender
 * algo que se apago globalmente por un incidente, el corte no serviria de nada.
 */
export async function POST(request: Request) {
  const user = await requireCurrentUser();

  if (user.role !== UserRole.OWNER) {
    return NextResponse.json(
      { message: 'Solo el owner puede apagar o encender funciones.' },
      { status: 403 },
    );
  }

  const parsed = await parseBody(request, updateSchema);
  if (!parsed.ok) return parsed.response;

  const key = parsed.data.key;
  if (!isFeatureKey(key)) {
    return NextResponse.json({ message: 'Funcion desconocida' }, { status: 400 });
  }

  await setFlag({
    key,
    enabled: parsed.data.enabled,
    workspaceId: user.workspace.id,
    note: parsed.data.note ?? null,
    actorId: user.id,
  });

  return NextResponse.json({ data: await flagStates(user.workspace.id) });
}
