import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireCurrentUser } from '@/lib/auth';
import { parseBody } from '@/lib/http';
import { CampaignError, sendCampaignTest } from '@/lib/marketing/campaigns';
import { canManageMarketing } from '@/lib/marketing/roles';

export const dynamic = 'force-dynamic';

const schema = z.object({ contactId: z.string().min(1) });

/**
 * Envia una copia de prueba a un contacto del workspace.
 *
 * A un contacto y no a una direccion suelta a proposito: asi la prueba pasa por
 * el mismo camino que el envio real, incluido el consentimiento. Una prueba que
 * se salta las comprobaciones no prueba lo que va a pasar.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireCurrentUser();

  if (!canManageMarketing(user.role)) {
    return NextResponse.json(
      { message: 'Solo el owner o un admin puede enviar pruebas.' },
      { status: 403 },
    );
  }

  const parsed = await parseBody(request, schema);
  if (!parsed.ok) return parsed.response;

  try {
    const result = await sendCampaignTest({
      workspaceId: user.workspace.id,
      campaignId: id,
      contactId: parsed.data.contactId,
      actorId: user.id,
    });

    return NextResponse.json({ data: result });
  } catch (error) {
    if (error instanceof CampaignError) {
      return NextResponse.json(
        { message: error.message, code: error.code },
        { status: error.code === 'NOT_FOUND' ? 404 : 409 },
      );
    }
    throw error;
  }
}
